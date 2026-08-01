import { Component, computed, inject, signal } from '@angular/core';
import { SlotCollage } from '../../shared/ui/slot-collage';
import { MAX_SLOTS_PER_MEMBER, PartyService, QuestSlotOption } from './party.service';

/**
 * The gathering stage: pick the slots the deck is built from. Cards are a
 * slimmed-down version of the Radar slot card (collage + count + owner) so you
 * can tell what you're choosing, and tapping one opens a peek sheet listing
 * everything inside — WITHOUT leaving the quest.
 *
 * Anyone in the quest can contribute any member's slots (see migration 0013
 * for the visibility rules); the cap of 3 is per person and enforced server
 * side too.
 */
@Component({
  selector: 'pp-quest-slot-picker',
  imports: [SlotCollage],
  template: `
    <!-- what the room has chosen so far, live -->
    <div class="rounded-2xl border border-line bg-surface p-4">
      <div class="flex items-baseline justify-between">
        <p class="text-xs font-bold tracking-wide text-muted uppercase">In the pot</p>
        @if (party.picks().length) {
          <p class="text-xs font-bold text-gold">{{ party.pooledCount() }} to swipe</p>
        }
      </div>
      @if (party.picks().length) {
        <div class="mt-2.5 flex flex-wrap gap-2">
          @for (p of party.picks(); track p.slot_id) {
            <span
              class="flex items-center gap-1.5 rounded-full border border-violet/40 bg-violet/15 py-1.5 pr-2 pl-3 text-xs font-bold text-violet"
            >
              {{ p.slot_emoji }} {{ p.slot_name }}
              <span class="font-normal opacity-70">· {{ p.item_count }}</span>
              @if (isMine(p.member_id)) {
                <button (click)="party.unpickSlot(p.slot_id)" aria-label="Remove" class="px-1 text-sm">✕</button>
              }
            </span>
          }
        </div>
      } @else {
        <p class="mt-2 text-xs text-muted-2">
          Nothing yet. Pick a slot or two below — everyone sees them land here.
        </p>
      }
    </div>

    <p class="mt-6 text-xs font-bold tracking-wide text-muted uppercase">
      Slots on the table
      <span class="text-muted-2">
        · you've picked {{ party.myPicks().length }}/{{ maxPerMember }}
      </span>
    </p>

    @if (party.optionsLoading()) {
      <div class="mt-3 grid grid-cols-2 gap-3">
        @for (s of [1, 2, 3, 4]; track s) {
          <div class="h-40 animate-pulse rounded-2xl bg-surface"></div>
        }
      </div>
    } @else if (!party.slotOptions().length) {
      <p class="mt-3 rounded-2xl border border-line bg-surface p-5 text-center text-sm text-muted-2">
        Nobody in this quest has a {{ domainLabel() }} slot with anything in it yet. Add a few
        things to your radar and come back.
      </p>
    } @else {
      <div class="mt-3 grid grid-cols-2 gap-3">
        @for (s of party.slotOptions(); track s.id) {
          <div
            class="overflow-hidden rounded-2xl border-2 bg-surface"
            [class]="isPicked(s.id) ? 'border-violet' : 'border-line'"
          >
            <button (click)="peek.set(s)" class="block w-full text-left" [attr.aria-label]="'Peek inside ' + s.name">
              <pp-slot-collage class="aspect-square w-full p-2" [images]="covers(s)" [emoji]="s.emoji" />
            </button>
            <div class="px-3 pb-3">
              <p class="truncate text-sm font-bold">{{ s.emoji }} {{ s.name }}</p>
              <p class="mt-0.5 truncate text-[11px] text-muted">
                {{ s.item_count }} ·
                @if (s.saved) {
                  saved by {{ s.via_name }}
                } @else {
                  {{ s.via_name }}
                }
              </p>
              <button
                (click)="toggle(s)"
                [disabled]="disabledFor(s)"
                class="mt-2 w-full rounded-xl py-2 text-xs font-bold disabled:opacity-40"
                [class]="
                  isPicked(s.id)
                    ? 'bg-violet/20 text-violet'
                    : 'bg-gradient-to-br from-coral to-gold text-ink'
                "
              >
                {{ pickLabel(s) }}
              </button>
            </div>
          </div>
        }
      </div>
    }

    <!-- peek sheet: everything in the slot, without leaving the quest -->
    @if (peek(); as s) {
      <div class="fixed inset-0 z-40 flex flex-col justify-end bg-bg/85 backdrop-blur-sm" (click)="peek.set(null)">
        <div
          class="mx-auto flex max-h-[80vh] w-full max-w-md flex-col rounded-t-3xl border-t border-line bg-surface"
          (click)="$event.stopPropagation()"
        >
          <div class="flex items-start gap-3 border-b border-line p-5">
            <div class="min-w-0 flex-1">
              <h3 class="font-display truncate text-xl font-semibold">{{ s.emoji }} {{ s.name }}</h3>
              <p class="mt-0.5 text-xs text-muted">
                {{ s.item_count }} things ·
                @if (s.saved) {
                  {{ s.owner_name }}'s slot, saved by {{ s.via_name }}
                } @else {
                  {{ s.owner_name }}
                }
              </p>
            </div>
            <button (click)="peek.set(null)" aria-label="Close" class="flex size-8 flex-none items-center justify-center rounded-full border border-line text-muted-2">
              ✕
            </button>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto p-5 pt-3">
            @for (item of s.items; track item.activity_id) {
              <div class="flex items-center gap-3 py-2">
                @if (item.image_url) {
                  <img [src]="item.image_url" alt="" class="h-14 w-10 flex-none rounded-lg object-cover" />
                } @else {
                  <div class="h-14 w-10 flex-none rounded-lg bg-surface-2"></div>
                }
                <p class="min-w-0 flex-1 truncate text-sm font-bold">{{ item.title }}</p>
              </div>
            }
          </div>

          <div class="border-t border-line p-5">
            <button
              (click)="toggle(s); peek.set(null)"
              [disabled]="disabledFor(s)"
              class="w-full rounded-2xl py-3.5 font-display text-lg font-semibold disabled:opacity-40"
              [class]="
                isPicked(s.id) ? 'border-2 border-violet text-violet' : 'bg-gradient-to-br from-coral to-gold text-ink'
              "
            >
              {{ pickLabel(s) }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class QuestSlotPicker {
  protected readonly party = inject(PartyService);
  protected readonly maxPerMember = MAX_SLOTS_PER_MEMBER;
  protected readonly peek = signal<QuestSlotOption | null>(null);

  protected readonly domainLabel = computed(() => this.party.party()?.domain ?? 'watch');

  protected covers(s: QuestSlotOption): (string | null)[] {
    return s.items.slice(0, 4).map((i) => i.image_url);
  }

  protected isPicked(slotId: string): boolean {
    return this.party.pickedSlotIds().has(slotId);
  }

  protected isMine(memberId: string): boolean {
    return memberId === this.party.myMember()?.id;
  }

  /** Someone else's pick can't be removed by you, and 3 is the cap. */
  protected disabledFor(s: QuestSlotOption): boolean {
    const pick = this.party.picks().find((p) => p.slot_id === s.id);
    if (pick) return !this.isMine(pick.member_id);
    return !this.party.canPickMore();
  }

  protected pickLabel(s: QuestSlotOption): string {
    const pick = this.party.picks().find((p) => p.slot_id === s.id);
    if (pick) return this.isMine(pick.member_id) ? '✓ Picked — tap to drop' : 'Already in the pot';
    return this.party.canPickMore() ? '+ Add to the quest' : 'That’s your 3';
  }

  protected toggle(s: QuestSlotOption) {
    if (this.isPicked(s.id)) void this.party.unpickSlot(s.id);
    else void this.party.pickSlot(s.id);
  }
}
