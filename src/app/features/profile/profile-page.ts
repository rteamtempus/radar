import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { SubscriptionsService } from '../../core/subscriptions.service';
import { ServiceBadges } from '../../shared/ui/service-badges';
import { ToastService } from '../../shared/ui/toast.service';
import { ImportService } from './import.service';
import { HistoryItem, parseNetflixHistory } from './netflix-csv';
import { TasteService } from './taste.service';

@Component({
  selector: 'pp-profile-page',
  imports: [FormsModule, ServiceBadges],
  template: `
    <div class="mx-auto flex max-w-md flex-col gap-6 px-5 py-6">
      <h1 class="font-display text-3xl font-semibold">You</h1>

      <div class="rounded-2xl border border-line bg-surface p-5">
        <p class="text-xs font-bold tracking-wide text-muted uppercase">Display name</p>
        <div class="mt-2 flex gap-2">
          <input
            type="text"
            maxlength="30"
            [(ngModel)]="name"
            class="min-w-0 flex-1 rounded-xl border border-line bg-bg-warm px-3 py-2.5 font-bold text-cream focus:border-coral focus:outline-none"
          />
          <button
            (click)="saveName()"
            [disabled]="!name.trim() || saved()"
            class="rounded-xl bg-coral px-4 py-2.5 text-sm font-bold text-ink disabled:opacity-60"
          >
            {{ saved() ? '✓' : 'Save' }}
          </button>
        </div>
        <p class="mt-3 text-xs text-muted">Signed in as {{ auth.user()?.email }}</p>
      </div>

      <div class="rounded-2xl border border-line bg-surface p-5">
        <p class="text-xs font-bold tracking-wide text-muted uppercase">My streaming services</p>
        <div class="mt-3 grid grid-cols-2 gap-2.5">
          @for (s of subs.services(); track s.id) {
            <button
              (click)="subs.toggle(s.id)"
              class="flex items-center gap-2.5 rounded-xl border-2 p-2.5 text-left"
              [class]="
                subs.mine().has(s.id) ? 'border-green bg-green/10' : 'border-line opacity-60'
              "
            >
              <pp-service-badges [services]="[s]" />
              <span class="min-w-0 flex-1 truncate text-xs font-bold">{{ s.name }}</span>
            </button>
          }
        </div>
      </div>

      <div class="rounded-2xl border border-line bg-surface p-5">
        <p class="text-xs font-bold tracking-wide text-muted uppercase">My taste</p>
        <p class="mt-2 text-xs text-muted-2">
          Tap to cycle: neutral → <span class="text-green">love</span> →
          <span class="text-coral">avoid</span>. Parties use this immediately.
        </p>
        <div class="mt-3 flex flex-wrap gap-2">
          @for (t of taste.tags(); track t.id) {
            <button
              (click)="taste.cycle(t)"
              class="rounded-full border-2 px-3.5 py-1.5 text-xs font-bold"
              [class]="
                t.state === 'love'
                  ? 'border-green bg-green/15 text-green'
                  : t.state === 'avoid'
                    ? 'border-coral bg-coral/15 text-coral line-through'
                    : 'border-line text-muted-2'
              "
            >
              @if (t.state === 'love') {
                ♥
              } @else if (t.state === 'avoid') {
                🚫
              }
              {{ t.label }}
            </button>
          }
        </div>
      </div>

      <div class="rounded-2xl border border-line bg-surface p-5">
        <p class="text-xs font-bold tracking-wide text-muted uppercase">Netflix watch history</p>
        <p class="mt-2 text-xs leading-relaxed text-muted-2">
          Netflix → Account → your profile → <span class="text-cream">Viewing activity</span> →
          "Download all". Import the CSV to mark everything you've watched — parties stop
          suggesting things you've seen, and your taste profile gets much smarter.
        </p>

        @if (importer.running()) {
          @if (importer.progress(); as p) {
            <div class="mt-4">
              <div class="flex justify-between text-xs font-bold text-muted-2">
                <span>Importing… {{ p.done }} of {{ p.total }}</span>
                <span class="text-green">{{ p.matched }} matched</span>
              </div>
              <div class="mt-1.5 h-2 rounded-full bg-surface-2">
                <div
                  class="h-full rounded-full bg-gradient-to-r from-coral to-gold transition-all"
                  [style.width.%]="p.total ? (p.done / p.total) * 100 : 0"
                ></div>
              </div>
              <p class="mt-2 text-xs text-muted">Keep this screen open — a couple of minutes for big histories.</p>
            </div>
          }
        } @else if (pendingItems(); as items) {
          <div class="mt-4 rounded-xl border border-gold/40 bg-gold/10 p-3.5">
            <p class="text-sm font-bold">
              Found {{ items.length }} titles
              <span class="font-normal text-muted-2">({{ seriesCount() }} shows · {{ items.length - seriesCount() }} movies)</span>
            </p>
            @if (droppedCount() > 0) {
              <p class="mt-1 text-xs text-muted-2">
                Big history! Importing the {{ items.length }} most recent; {{ droppedCount() }} older titles skipped.
              </p>
            }
            <div class="mt-3 flex gap-2">
              <button
                (click)="startImport()"
                class="flex-1 rounded-xl bg-coral px-4 py-2.5 text-sm font-bold text-ink"
              >
                Import →
              </button>
              <button
                (click)="pendingItems.set(null)"
                class="rounded-xl border border-line px-4 py-2.5 text-sm font-bold text-muted-2"
              >
                Cancel
              </button>
            </div>
          </div>
        } @else {
          <label
            class="mt-4 block cursor-pointer rounded-xl border-2 border-dashed border-line p-4 text-center text-sm font-bold text-muted-2"
          >
            📂 Choose NetflixViewingHistory.csv
            <input type="file" accept=".csv,text/csv" class="hidden" (change)="onFile($event)" />
          </label>
          @if (lastSummary()) {
            <p class="mt-3 text-xs text-muted-2">{{ lastSummary() }}</p>
          }
        }
      </div>

      <button
        (click)="signOut()"
        class="rounded-2xl border border-line bg-surface px-4 py-3.5 font-bold text-coral"
      >
        Sign out
      </button>
    </div>
  `,
})
export class ProfilePage {
  protected readonly auth = inject(AuthService);
  protected readonly subs = inject(SubscriptionsService);
  protected readonly importer = inject(ImportService);
  protected readonly taste = inject(TasteService);
  private toast = inject(ToastService);
  private router = inject(Router);

  protected name = '';
  protected readonly saved = signal(false);

  protected readonly pendingItems = signal<HistoryItem[] | null>(null);
  protected readonly droppedCount = signal(0);
  protected readonly lastSummary = signal('');
  protected readonly seriesCount = computed(
    () => this.pendingItems()?.filter((i) => i.isSeries).length ?? 0,
  );

  protected async onFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const parsed = parseNetflixHistory(await file.text());
      if (!parsed.length) throw new Error('No titles found in that file.');
      const { items, dropped } = this.importer.capped(parsed);
      this.pendingItems.set(items);
      this.droppedCount.set(dropped);
    } catch (e) {
      this.toast.error(e instanceof Error ? e.message : 'Could not read that file.');
    }
  }

  protected async startImport() {
    const items = this.pendingItems();
    if (!items) return;
    this.pendingItems.set(null);
    try {
      const result = await this.importer.run(items);
      const skipped = result.unmatched.length;
      this.lastSummary.set(
        `Imported ${result.matched} titles ✓` +
          (skipped
            ? ` · ${skipped} couldn't be matched (${result.unmatched.slice(0, 3).join(', ')}${skipped > 3 ? '…' : ''})`
            : ''),
      );
      this.toast.success(`Watch history imported — ${result.matched} titles added.`);
    } catch (e) {
      this.toast.error(e instanceof Error ? e.message : 'Import failed — try again.');
    }
  }

  constructor() {
    this.subs.load();
    this.taste.load();
    this.auth.getOrCreateProfile().then((p) => {
      if (p && !this.name) this.name = p.display_name;
    });
  }

  protected async saveName() {
    await this.auth.updateDisplayName(this.name.trim());
    this.saved.set(true);
    setTimeout(() => this.saved.set(false), 1500);
  }

  protected async signOut() {
    await this.auth.signOut();
    this.router.navigateByUrl('/login');
  }
}
