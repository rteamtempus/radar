import { Injectable, computed, inject, signal } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { AuthService } from '../../core/auth.service';
import { getSupabase } from '../../core/supabase.client';

export type PartyStatus = 'gathering' | 'swiping' | 'voting' | 'decided' | 'completed' | 'cancelled';

export interface PartyConstraints {
  max_duration_min?: number | null;
  must_be_streamable_by_all?: boolean;
}

export interface PartyRow {
  id: string;
  host_id: string;
  status: PartyStatus;
  activity_type: 'movie' | 'tv_show' | null;
  constraints: PartyConstraints;
  join_code: string | null;
  decided_activity_id: string | null;
}

export interface PartyMember {
  id: string;
  user_id: string | null;
  role: string;
  profile: { display_name: string; avatar_url: string | null } | null;
}

export interface MoodCheckin {
  id: string;
  member_id: string;
  energy: number | null;
  mood_tags: string[];
  free_text: string | null;
}

export interface VibeTag {
  id: string;
  slug: string;
  label: string;
}

// Join codes: unambiguous alphabet (no 0/O/1/I).
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

function generateJoinCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

/**
 * State for the party currently on screen. `open(id)` loads everything and
 * subscribes to the party's realtime channel; Postgres Changes on the party
 * tables re-pull the affected slice, so every member's screen follows the
 * party state machine (handoff §6.3).
 */
@Injectable({ providedIn: 'root' })
export class PartyService {
  private auth = inject(AuthService);
  private channel: RealtimeChannel | undefined;

  readonly party = signal<PartyRow | null>(null);
  readonly members = signal<PartyMember[]>([]);
  readonly checkins = signal<MoodCheckin[]>([]);
  readonly vibes = signal<VibeTag[]>([]);

  readonly isHost = computed(() => !!this.party() && this.party()!.host_id === this.auth.user()?.id);
  readonly myMember = computed(() =>
    this.members().find((m) => m.user_id === this.auth.user()?.id),
  );
  readonly myCheckin = computed(() =>
    this.checkins().find((c) => c.member_id === this.myMember()?.id),
  );
  readonly readyCount = computed(
    () => this.members().filter((m) => this.checkins().some((c) => c.member_id === m.id)).length,
  );

  async createParty(opts: {
    activityType: 'movie' | 'tv_show' | null;
    maxDurationMin: number | null;
    mustBeStreamableByAll: boolean;
  }): Promise<string> {
    const userId = this.auth.user()?.id;
    if (!userId) throw new Error('Not signed in');
    const supabase = getSupabase();

    // Retry once on the (unlikely) join-code collision.
    for (let attempt = 0; ; attempt++) {
      const { data, error } = await supabase
        .from('parties')
        .insert({
          host_id: userId,
          activity_type: opts.activityType,
          join_code: generateJoinCode(),
          constraints: {
            max_duration_min: opts.maxDurationMin,
            must_be_streamable_by_all: opts.mustBeStreamableByAll,
          },
          decision_config: { votes_per_member: 3, vetoes_per_member: 1, candidate_count: 12 },
        })
        .select('id')
        .single();
      if (!error) {
        await supabase
          .from('party_members')
          .insert({ party_id: data.id, user_id: userId, role: 'host' });
        return data.id;
      }
      if (attempt >= 1 || error.code !== '23505') throw new Error(error.message);
    }
  }

  async joinParty(code: string): Promise<string> {
    const { data, error } = await getSupabase().rpc('join_party', {
      p_code: code.trim().toUpperCase(),
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  async open(partyId: string): Promise<void> {
    this.close();
    await Promise.all([
      this.loadParty(partyId),
      this.loadMembers(partyId),
      this.loadCheckins(partyId),
      this.loadVibes(),
    ]);

    const supabase = getSupabase();
    this.channel = supabase
      .channel(`party:${partyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'parties', filter: `id=eq.${partyId}` },
        () => this.loadParty(partyId),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'party_members', filter: `party_id=eq.${partyId}` },
        () => this.loadMembers(partyId),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'party_mood_checkins' },
        // member_id filter isn't expressible here; checkin volume is tiny.
        () => this.loadCheckins(partyId),
      )
      .subscribe();
  }

  close(): void {
    this.channel?.unsubscribe();
    this.channel = undefined;
    this.party.set(null);
    this.members.set([]);
    this.checkins.set([]);
  }

  async submitMood(energy: number, moodTagIds: string[], freeText: string): Promise<void> {
    const member = this.myMember();
    const partyId = this.party()?.id;
    if (!member || !partyId) return;
    const { error } = await getSupabase().from('party_mood_checkins').insert({
      member_id: member.id,
      energy,
      mood_tags: moodTagIds,
      free_text: freeText.trim() || null,
    });
    if (error) throw new Error(error.message);
    await this.loadCheckins(partyId);
  }

  /** Host-only: kick off candidate generation (edge function flips status → swiping). */
  async generateCandidates(): Promise<{ error?: string }> {
    const partyId = this.party()?.id;
    if (!partyId) return { error: 'No party open' };
    const { error } = await getSupabase().functions.invoke('generate-candidates', {
      body: { party_id: partyId },
    });
    if (!error) return {};
    // Surface the function's {error} body when present.
    const context = (error as { context?: Response }).context;
    if (context) {
      const body = await context.json().catch(() => null);
      return { error: body?.error ?? error.message };
    }
    return { error: error.message };
  }

  /** My parties that are still in flight (rejoin from the start page). */
  async myActiveParties(): Promise<{ id: string; status: PartyStatus; join_code: string | null }[]> {
    const { data } = await getSupabase()
      .from('party_members')
      .select('party:parties!inner(id, status, join_code, created_at)')
      .not('party.status', 'in', '(completed,cancelled)')
      .order('created_at', { ascending: false, referencedTable: 'party' });
    return ((data ?? []) as unknown as { party: { id: string; status: PartyStatus; join_code: string | null } }[]).map(
      (r) => r.party,
    );
  }

  private async loadParty(partyId: string) {
    const { data } = await getSupabase()
      .from('parties')
      .select('id, host_id, status, activity_type, constraints, join_code, decided_activity_id')
      .eq('id', partyId)
      .maybeSingle();
    if (data) this.party.set(data as unknown as PartyRow);
  }

  private async loadMembers(partyId: string) {
    const { data } = await getSupabase()
      .from('party_members')
      .select('id, user_id, role, profile:profiles(display_name, avatar_url)')
      .eq('party_id', partyId)
      .order('joined_at');
    this.members.set((data ?? []) as unknown as PartyMember[]);
  }

  private async loadCheckins(partyId: string) {
    const { data } = await getSupabase()
      .from('party_mood_checkins')
      .select('id, member_id, energy, mood_tags, free_text, member:party_members!inner(party_id)')
      .eq('member.party_id', partyId);
    this.checkins.set((data ?? []) as unknown as MoodCheckin[]);
  }

  private async loadVibes() {
    if (this.vibes().length) return;
    const { data } = await getSupabase()
      .from('tags')
      .select('id, slug, label')
      .eq('kind', 'vibe')
      .order('label');
    this.vibes.set((data ?? []) as VibeTag[]);
  }
}
