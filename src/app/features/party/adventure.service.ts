// Adventures: an itinerary of quests with one roster and one join code —
// movie marathons, date nights, weekend trips. Every mutation goes through a
// SECURITY DEFINER RPC (migration 0013) because they touch other people's
// party_members rows.
import { Injectable, computed, inject, signal } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { Domain } from '../../core/domain.service';
import { getSupabase } from '../../core/supabase.client';
import { ToastService } from '../../shared/ui/toast.service';
import { PartyStatus } from './party.service';

export type AdventureStatus = 'planning' | 'completed' | 'cancelled';

export interface AdventureSummary {
  id: string;
  name: string;
  emoji: string | null;
  status: AdventureStatus;
  join_code: string | null;
  owner_id: string;
  finished_at: string | null;
}

export interface AdventureQuest {
  id: string;
  status: PartyStatus;
  domain: Domain;
  title: string | null;
  position: number;
  scheduled_at: string | null;
  scheduled_end: string | null;
  decided_activity_id: string | null;
  activity: { title: string; image_url: string | null } | null;
}

export interface AdventureMember {
  user_id: string;
  role: string;
  profile: { display_name: string } | null;
}

/** Quests grouped under a day heading; `day` is null for the maybe bucket. */
export interface AdventureDay {
  day: string | null;
  label: string;
  quests: AdventureQuest[];
}

@Injectable({ providedIn: 'root' })
export class AdventureService {
  private toast = inject(ToastService);
  private channel: RealtimeChannel | undefined;

  readonly adventure = signal<AdventureSummary | null>(null);
  readonly quests = signal<AdventureQuest[]>([]);
  readonly members = signal<AdventureMember[]>([]);

  /** Scheduled quests grouped by local day, earliest first. */
  readonly days = computed<AdventureDay[]>(() => {
    const scheduled = this.quests()
      .filter((q) => q.scheduled_at)
      .sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''));
    const byDay = new Map<string, AdventureQuest[]>();
    for (const q of scheduled) {
      const key = new Date(q.scheduled_at!).toDateString();
      byDay.set(key, [...(byDay.get(key) ?? []), q]);
    }
    return [...byDay.entries()].map(([day, quests]) => ({
      day,
      label: new Date(day).toLocaleDateString(undefined, {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
      }),
      quests,
    }));
  });

  /** No date yet — the "maybe" bucket, kept in manual order. */
  readonly unscheduled = computed(() =>
    this.quests()
      .filter((q) => !q.scheduled_at)
      .sort((a, b) => a.position - b.position),
  );

  readonly decided = computed(() =>
    this.quests().filter((q) => q.decided_activity_id && q.activity),
  );

  async myAdventures(): Promise<AdventureSummary[]> {
    const { data } = await getSupabase()
      .from('adventures')
      .select('id, name, emoji, status, join_code, owner_id, finished_at')
      .eq('status', 'planning')
      .order('created_at', { ascending: false });
    return (data ?? []) as AdventureSummary[];
  }

  async open(adventureId: string): Promise<void> {
    this.close();
    await this.loadAll(adventureId);
    this.channel = getSupabase()
      .channel(`adventure:${adventureId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'parties', filter: `adventure_id=eq.${adventureId}` },
        () => this.loadQuests(adventureId),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'adventures', filter: `id=eq.${adventureId}` },
        () => this.loadAdventure(adventureId),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'adventure_members',
          filter: `adventure_id=eq.${adventureId}`,
        },
        () => this.loadMembers(adventureId),
      )
      .subscribe();
  }

  close(): void {
    this.channel?.unsubscribe();
    this.channel = undefined;
    this.adventure.set(null);
    this.quests.set([]);
    this.members.set([]);
  }

  // ------------------------------------------------------------------ actions

  /** "Make it an adventure!" — promotes a quest and its roster. */
  async createFromParty(partyId: string, name: string): Promise<string | null> {
    const { data, error } = await getSupabase().rpc('adventure_create_from_party', {
      p_party_id: partyId,
      p_name: name,
    });
    if (error) {
      this.toast.error(error.message);
      return null;
    }
    return data as unknown as string;
  }

  async joinByCode(code: string): Promise<string> {
    const { data, error } = await getSupabase().rpc('adventure_join_by_code', {
      p_code: code.trim().toUpperCase(),
    });
    if (error) throw new Error(error.message);
    return data as unknown as string;
  }

  async addQuest(adventureId: string, domain: Domain, title: string): Promise<string | null> {
    const { data, error } = await getSupabase().rpc('adventure_add_quest', {
      p_adventure_id: adventureId,
      p_domain: domain,
      p_title: title,
    });
    if (error) {
      this.toast.error(error.message);
      return null;
    }
    await this.loadQuests(adventureId);
    return data as unknown as string;
  }

  /** Move an unscheduled quest up or down the maybe list. */
  async move(adventureId: string, questId: string, dir: -1 | 1): Promise<void> {
    const list = [...this.unscheduled()];
    const i = list.findIndex((q) => q.id === questId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    // Optimistic reorder so the arrow feels instant.
    this.quests.update((qs) =>
      qs.map((q) => {
        const idx = list.findIndex((l) => l.id === q.id);
        return idx >= 0 ? { ...q, position: idx } : q;
      }),
    );
    const { error } = await getSupabase().rpc('adventure_reorder', {
      p_adventure_id: adventureId,
      p_party_ids: list.map((q) => q.id),
    });
    if (error) this.toast.error('Could not reorder — try again.');
    await this.loadQuests(adventureId);
  }

  /** `start` null clears the date, dropping the quest back into the maybe bucket. */
  async schedule(
    adventureId: string,
    questId: string,
    start: string | null,
    end: string | null,
  ): Promise<void> {
    // The generated types don't mark RPC args nullable, but passing null is
    // exactly how a quest is un-scheduled back into the maybe bucket.
    const { error } = await getSupabase().rpc('adventure_schedule_quest', {
      p_party_id: questId,
      p_start: start as string,
      p_end: end as string,
    });
    if (error) this.toast.error(error.message);
    await this.loadQuests(adventureId);
  }

  async removeQuest(adventureId: string, questId: string): Promise<void> {
    const { error } = await getSupabase().rpc('adventure_remove_quest', { p_party_id: questId });
    if (error) this.toast.error(error.message);
    await this.loadQuests(adventureId);
  }

  async finish(adventureId: string, status: 'completed' | 'cancelled'): Promise<boolean> {
    const { error } = await getSupabase().rpc('adventure_finish', {
      p_adventure_id: adventureId,
      p_status: status,
    });
    if (error) {
      this.toast.error(error.message);
      return false;
    }
    await this.loadAll(adventureId);
    return true;
  }

  // -------------------------------------------------------------------- loads

  private async loadAll(adventureId: string) {
    await Promise.all([
      this.loadAdventure(adventureId),
      this.loadQuests(adventureId),
      this.loadMembers(adventureId),
    ]);
  }

  private async loadAdventure(adventureId: string) {
    const { data } = await getSupabase()
      .from('adventures')
      .select('id, name, emoji, status, join_code, owner_id, finished_at')
      .eq('id', adventureId)
      .maybeSingle();
    if (data) this.adventure.set(data as AdventureSummary);
  }

  private async loadQuests(adventureId: string) {
    const { data } = await getSupabase()
      .from('parties')
      .select(
        'id, status, domain, title, position, scheduled_at, scheduled_end, decided_activity_id, ' +
          'activity:activities!parties_decided_activity_id_fkey(title, image_url)',
      )
      .eq('adventure_id', adventureId)
      .order('position');
    this.quests.set((data ?? []) as unknown as AdventureQuest[]);
  }

  private async loadMembers(adventureId: string) {
    const { data } = await getSupabase()
      .from('adventure_members')
      .select('user_id, role, profile:profiles(display_name)')
      .eq('adventure_id', adventureId)
      .order('joined_at');
    this.members.set((data ?? []) as unknown as AdventureMember[]);
  }
}
