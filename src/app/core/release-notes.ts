// Release notes ship WITH the build: docs/release-notes/*.md are compiled by
// scripts/build-release-notes.mjs into release-notes.generated.ts. There is no
// release_notes table — publishing a note costs zero writes, and the only DB
// state is profiles.last_seen_release_seq (the highest note the user has
// opened). See docs/release-notes/README.md.
import { Injectable, computed, signal } from '@angular/core';
import { getSupabase, isSupabaseConfigured } from './supabase.client';
import { LATEST_RELEASE_SEQ, RELEASE_NOTES } from './release-notes.generated';

/** One bullet: `- **lead** — text` (lead is null for a plain bullet). */
export interface ReleaseNoteItem {
  readonly lead: string | null;
  readonly text: string;
}

export interface ReleaseNoteSection {
  /** 'Added' | 'Changed' | 'Fixed' | 'Removed' */
  readonly heading: string;
  readonly items: readonly ReleaseNoteItem[];
}

export interface ReleaseNote {
  /** Monotonic; the NNNN filename prefix. Compared against last_seen_release_seq. */
  readonly seq: number;
  readonly version: string;
  /** YYYY-MM-DD */
  readonly date: string;
  readonly title: string;
  readonly summary: string;
  readonly sections: readonly ReleaseNoteSection[];
}

export { LATEST_RELEASE_SEQ, RELEASE_NOTES };

@Injectable({ providedIn: 'root' })
export class ReleaseNotesService {
  /** Newest first. Every note that has ever shipped. */
  readonly all = RELEASE_NOTES;
  readonly latestSeq = LATEST_RELEASE_SEQ;

  /** null until the profile loads; -1 means "not signed in / unknown". */
  private readonly lastSeenSeq = signal<number | null>(null);

  /** Notes the user hasn't opened yet, newest first. */
  readonly unseen = computed(() => {
    const seen = this.lastSeenSeq();
    if (seen === null) return [];
    return this.all.filter((n) => n.seq > seen);
  });

  readonly hasUnseen = computed(() => this.unseen().length > 0);

  /**
   * Reads the user's watermark. A brand-new account (null in the DB) is
   * stamped straight to the current build: "what's new since you were last
   * here" means nothing on day one. Accounts that existed before this feature
   * were backfilled to 0 by migration 0012, so they see the whole history once.
   */
  async load(userId: string): Promise<void> {
    if (!isSupabaseConfigured()) {
      this.lastSeenSeq.set(this.latestSeq);
      return;
    }
    const { data } = await getSupabase()
      .from('profiles')
      .select('last_seen_release_seq')
      .eq('id', userId)
      .maybeSingle();

    if (!data) {
      this.lastSeenSeq.set(this.latestSeq);
      return;
    }
    if (data.last_seen_release_seq === null) {
      this.lastSeenSeq.set(this.latestSeq);
      void this.persist(userId, this.latestSeq);
      return;
    }
    this.lastSeenSeq.set(data.last_seen_release_seq);
  }

  /** Called when the user opens the What's-new modal: everything is now read. */
  async markAllSeen(userId: string): Promise<void> {
    if (this.lastSeenSeq() === this.latestSeq) return;
    this.lastSeenSeq.set(this.latestSeq);
    await this.persist(userId, this.latestSeq);
  }

  reset(): void {
    this.lastSeenSeq.set(null);
  }

  private async persist(userId: string, seq: number): Promise<void> {
    if (!isSupabaseConfigured()) return;
    await getSupabase().from('profiles').update({ last_seen_release_seq: seq }).eq('id', userId);
  }
}
