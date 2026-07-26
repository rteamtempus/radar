import { Injectable, computed, inject, signal } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { AuthService } from '../../core/auth.service';
import { PlatformService } from '../../core/platform/platform.service';
import { getSupabase } from '../../core/supabase.client';
import { ToastService } from '../../shared/ui/toast.service';
import { ServiceRef } from '../library/library.service';
import { computeSurvivors, tallyWinner } from './party-logic';

export type PartyStatus = 'gathering' | 'swiping' | 'voting' | 'decided' | 'completed' | 'cancelled';
export type SwipeDirection = 'left' | 'right' | 'super';

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
  decided_at: string | null;
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

export interface CandidateActivity {
  id: string;
  title: string;
  image_url: string | null;
  duration_min: number | null;
  type: 'movie' | 'tv_show';
  metadata: { release_year?: number | null; tmdb_vote?: number | null };
  activity_availability?: { service: ServiceRef }[];
}

export interface PartyCandidate {
  id: string;
  activity_id: string;
  final_score: number | null;
  ai_blurb: string | null;
  presented_order: number | null;
  created_at: string;
  activity: CandidateActivity;
}

export interface PartySwipe {
  candidate_id: string;
  member_id: string;
  direction: SwipeDirection;
}

export interface PartyVote {
  candidate_id: string;
  member_id: string;
  points: number;
}

// Join codes: unambiguous alphabet (no 0/O/1/I).
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const VOTES_PER_MEMBER = 3;
const MAX_POINTS_PER_CANDIDATE = 2;
const OUTCOME_DELAY_MS = 12 * 60 * 60 * 1000;

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
  private toast = inject(ToastService);
  private platform = inject(PlatformService);
  private channel: RealtimeChannel | undefined;
  private resumeCleanup: (() => void) | undefined;

  readonly party = signal<PartyRow | null>(null);
  readonly members = signal<PartyMember[]>([]);
  readonly checkins = signal<MoodCheckin[]>([]);
  readonly vibes = signal<VibeTag[]>([]);
  readonly candidates = signal<PartyCandidate[]>([]); // latest batch only
  readonly swipes = signal<PartySwipe[]>([]);
  readonly votes = signal<PartyVote[]>([]);
  readonly vetoedCandidateIds = signal<ReadonlySet<string>>(new Set());
  readonly myVetoUsed = signal(false);

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

  /** Candidates I haven't swiped yet, in presented order — the live deck. */
  readonly myDeck = computed(() => {
    const me = this.myMember();
    if (!me) return [];
    const swiped = new Set(
      this.swipes()
        .filter((s) => s.member_id === me.id)
        .map((s) => s.candidate_id),
    );
    return this.candidates().filter((c) => !swiped.has(c.id));
  });

  /** member_id → finished all cards? */
  readonly finishedCount = computed(() => {
    const total = this.candidates().length;
    if (!total) return 0;
    return this.members().filter(
      (m) => this.swipes().filter((s) => s.member_id === m.id).length >= total,
    ).length;
  });

  readonly survivors = computed(() => {
    const ids = computeSurvivors(
      this.candidates().map((c) => ({ id: c.id, finalScore: c.final_score ?? 0 })),
      this.swipes().map((s) => ({
        candidateId: s.candidate_id,
        memberId: s.member_id,
        direction: s.direction,
      })),
      this.vetoedCandidateIds(),
      this.members().length,
    );
    const byId = new Map(this.candidates().map((c) => [c.id, c]));
    return ids.map((id) => byId.get(id)).filter((c): c is PartyCandidate => !!c);
  });

  readonly voteTotals = computed(() => {
    const totals: Record<string, number> = {};
    for (const v of this.votes()) totals[v.candidate_id] = (totals[v.candidate_id] ?? 0) + v.points;
    return totals;
  });

  readonly myPointsByCandidate = computed(() => {
    const me = this.myMember();
    const mine: Record<string, number> = {};
    if (!me) return mine;
    for (const v of this.votes()) if (v.member_id === me.id) mine[v.candidate_id] = v.points;
    return mine;
  });

  readonly myVotesLeft = computed(
    () => VOTES_PER_MEMBER - Object.values(this.myPointsByCandidate()).reduce((a, b) => a + b, 0),
  );

  readonly allVoted = computed(
    () =>
      this.members().length > 0 &&
      this.members().every(
        (m) =>
          this.votes()
            .filter((v) => v.member_id === m.id)
            .reduce((a, v) => a + v.points, 0) >= VOTES_PER_MEMBER,
      ),
  );

  readonly winnerCandidate = computed(() => {
    const winId = this.party()?.decided_activity_id;
    return this.candidates().find((c) => c.activity_id === winId) ?? null;
  });

  // ---------------------------------------------------------------- lifecycle

  async createParty(opts: {
    activityType: 'movie' | 'tv_show' | null;
    maxDurationMin: number | null;
    mustBeStreamableByAll: boolean;
  }): Promise<string> {
    const userId = this.auth.user()?.id;
    if (!userId) throw new Error('Not signed in');
    const supabase = getSupabase();

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
          decision_config: {
            votes_per_member: VOTES_PER_MEMBER,
            vetoes_per_member: 1,
            candidate_count: 12,
          },
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
      this.loadCandidates(partyId),
    ]);

    this.channel = getSupabase()
      .channel(`party:${partyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parties', filter: `id=eq.${partyId}` }, () =>
        this.loadParty(partyId),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'party_members', filter: `party_id=eq.${partyId}` },
        () => this.loadMembers(partyId),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'party_mood_checkins' }, () =>
        this.loadCheckins(partyId),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'party_candidates', filter: `party_id=eq.${partyId}` },
        () => this.loadCandidates(partyId),
      )
      // swipes/votes/vetoes carry no party_id column; RLS already limits events
      // to parties I'm in, and reloads are cheap at party scale.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'party_swipes' }, () =>
        this.loadSwipes(partyId),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'party_votes' }, () =>
        this.loadVotes(partyId),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'party_vetoes' }, () =>
        this.loadVetoes(partyId),
      )
      .subscribe();

    // iOS suspends WebSockets in the background — on foreground, re-pull
    // everything instead of trusting the channel caught it all.
    this.resumeCleanup = this.platform.onResume(() => {
      if (this.party()?.id !== partyId) return;
      this.loadParty(partyId);
      this.loadMembers(partyId);
      this.loadCheckins(partyId);
      this.loadCandidates(partyId);
    });
  }

  close(): void {
    this.resumeCleanup?.();
    this.resumeCleanup = undefined;
    this.channel?.unsubscribe();
    this.channel = undefined;
    this.party.set(null);
    this.members.set([]);
    this.checkins.set([]);
    this.candidates.set([]);
    this.swipes.set([]);
    this.votes.set([]);
    this.vetoedCandidateIds.set(new Set());
    this.myVetoUsed.set(false);
  }

  // ------------------------------------------------------------------ actions

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
    const context = (error as { context?: Response }).context;
    if (context) {
      const body = await context.json().catch(() => null);
      return { error: body?.error ?? error.message };
    }
    return { error: error.message };
  }

  async swipe(candidateId: string, direction: SwipeDirection): Promise<void> {
    const me = this.myMember();
    if (!me) return;
    // Optimistic: the deck advances instantly; realtime confirms.
    this.swipes.update((s) => [
      ...s.filter((x) => !(x.candidate_id === candidateId && x.member_id === me.id)),
      { candidate_id: candidateId, member_id: me.id, direction },
    ]);
    const { error } = await getSupabase()
      .from('party_swipes')
      .upsert(
        { candidate_id: candidateId, member_id: me.id, direction },
        { onConflict: 'candidate_id,member_id' },
      );
    if (error) {
      this.toast.error('Swipe didn’t save — check your connection.');
      await this.loadSwipes(this.party()!.id); // roll back the optimistic update
    }
  }

  /** Anonymous hard veto (max 1/member/party) — also counts as a left swipe. */
  async veto(candidateId: string): Promise<void> {
    const me = this.myMember();
    if (!me || this.myVetoUsed()) return;
    this.myVetoUsed.set(true);
    this.vetoedCandidateIds.update((s) => new Set([...s, candidateId]));
    await getSupabase()
      .from('party_vetoes')
      .upsert({ candidate_id: candidateId, member_id: me.id }, { ignoreDuplicates: true });
    await this.swipe(candidateId, 'left');
  }

  async addVote(candidateId: string): Promise<void> {
    const me = this.myMember();
    if (!me || this.myVotesLeft() <= 0) return;
    const current = this.myPointsByCandidate()[candidateId] ?? 0;
    if (current >= MAX_POINTS_PER_CANDIDATE) return;
    const { error } = await getSupabase()
      .from('party_votes')
      .upsert(
        { candidate_id: candidateId, member_id: me.id, points: current + 1 },
        { onConflict: 'candidate_id,member_id' },
      );
    if (error) this.toast.error('Vote didn’t save — try again.');
    await this.loadVotes(this.party()!.id);
  }

  async removeVote(candidateId: string): Promise<void> {
    const me = this.myMember();
    if (!me) return;
    const current = this.myPointsByCandidate()[candidateId] ?? 0;
    if (!current) return;
    const supabase = getSupabase();
    if (current <= 1) {
      await supabase
        .from('party_votes')
        .delete()
        .eq('candidate_id', candidateId)
        .eq('member_id', me.id);
    } else {
      await supabase
        .from('party_votes')
        .update({ points: current - 1 })
        .eq('candidate_id', candidateId)
        .eq('member_id', me.id);
    }
    await this.loadVotes(this.party()!.id);
  }

  /** Host: swiping → voting. */
  async advanceToVoting(): Promise<void> {
    const partyId = this.party()?.id;
    if (!partyId) return;
    await getSupabase().from('parties').update({ status: 'voting' }).eq('id', partyId);
    await this.loadParty(partyId);
  }

  /** Host: tally survivors' votes and crown the winner. */
  async revealWinner(): Promise<void> {
    const partyId = this.party()?.id;
    if (!partyId) return;
    const survivors = this.survivors();
    const { winnerId } = tallyWinner(
      survivors.map((c) => c.id),
      this.votes().map((v) => ({
        candidateId: v.candidate_id,
        memberId: v.member_id,
        points: v.points,
      })),
      Object.fromEntries(survivors.map((c) => [c.id, c.final_score ?? 0])),
    );
    const winner = this.candidates().find((c) => c.id === winnerId);
    if (!winner) return;
    await getSupabase()
      .from('parties')
      .update({
        status: 'decided',
        decided_activity_id: winner.activity_id,
        decided_at: new Date().toISOString(),
      })
      .eq('id', partyId);
    await this.loadParty(partyId);
  }

  // ----------------------------------------------------------------- outcome

  /** The most recent decided party (>12h old) still awaiting its pulse answer. */
  async pendingOutcome(): Promise<{
    partyId: string;
    activity: { title: string; image_url: string | null } | null;
  } | null> {
    const cutoff = new Date(Date.now() - OUTCOME_DELAY_MS).toISOString();
    const { data } = await getSupabase()
      .from('parties')
      .select(
        'id, decided_at, activity:activities!parties_decided_activity_id_fkey(title, image_url), party_outcomes(party_id)',
      )
      .eq('status', 'decided')
      .lt('decided_at', cutoff)
      .order('decided_at', { ascending: false })
      .limit(5);
    const pending = (data ?? []).find(
      (p) => !(p.party_outcomes as unknown[] | null)?.length,
    );
    return pending
      ? {
          partyId: pending.id,
          activity: pending.activity as unknown as { title: string; image_url: string | null },
        }
      : null;
  }

  async recordOutcome(partyId: string, result: { rating: number } | { bailed: true }): Promise<void> {
    const supabase = getSupabase();
    await supabase.from('party_outcomes').insert({
      party_id: partyId,
      did_it: !('bailed' in result),
      group_rating: 'rating' in result ? result.rating : null,
    });
    await supabase.from('parties').update({ status: 'completed' }).eq('id', partyId);
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

  // ------------------------------------------------------------------- loads

  private async loadParty(partyId: string) {
    const { data } = await getSupabase()
      .from('parties')
      .select(
        'id, host_id, status, activity_type, constraints, join_code, decided_activity_id, decided_at',
      )
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

  private async loadCandidates(partyId: string) {
    const { data } = await getSupabase()
      .from('party_candidates')
      .select(
        'id, activity_id, final_score, ai_blurb, presented_order, created_at, ' +
          'activity:activities(id, title, image_url, duration_min, type, metadata, ' +
          'activity_availability(service:streaming_services(slug, name)))',
      )
      .eq('party_id', partyId)
      .order('created_at', { ascending: false })
      .order('presented_order');
    const all = (data ?? []) as unknown as PartyCandidate[];
    // Regeneration appends batches; the deck is only the newest one (same created_at).
    const latest = all[0]?.created_at;
    const batch = all.filter((c) => c.created_at === latest);
    this.candidates.set(batch);
    await Promise.all([this.loadSwipes(partyId), this.loadVotes(partyId), this.loadVetoes(partyId)]);
  }

  private candidateIds(): string[] {
    return this.candidates().map((c) => c.id);
  }

  private async loadSwipes(partyId: string) {
    if (this.party()?.id !== partyId && this.candidates().length === 0) return;
    const ids = this.candidateIds();
    if (!ids.length) return;
    const { data } = await getSupabase()
      .from('party_swipes')
      .select('candidate_id, member_id, direction')
      .in('candidate_id', ids);
    this.swipes.set((data ?? []) as PartySwipe[]);
  }

  private async loadVotes(partyId: string) {
    if (this.party()?.id !== partyId && this.candidates().length === 0) return;
    const ids = this.candidateIds();
    if (!ids.length) return;
    const { data } = await getSupabase()
      .from('party_votes')
      .select('candidate_id, member_id, points')
      .in('candidate_id', ids);
    this.votes.set((data ?? []) as PartyVote[]);
  }

  private async loadVetoes(partyId: string) {
    if (this.party()?.id !== partyId && this.candidates().length === 0) return;
    const ids = this.candidateIds();
    if (!ids.length) return;
    const { data } = await getSupabase()
      .from('party_vetoes')
      .select('candidate_id, member_id')
      .in('candidate_id', ids);
    const rows = (data ?? []) as { candidate_id: string; member_id: string }[];
    this.vetoedCandidateIds.set(new Set(rows.map((r) => r.candidate_id)));
    const me = this.myMember();
    if (me) this.myVetoUsed.set(rows.some((r) => r.member_id === me.id));
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
