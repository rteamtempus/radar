import { Component, input } from '@angular/core';
import { ReleaseNote } from '../../core/release-notes';

/** One release, rendered from the structured data in release-notes.generated.ts. */
@Component({
  selector: 'pp-release-note-card',
  template: `
    <div class="rounded-2xl border border-line bg-surface p-5">
      <div class="flex items-baseline gap-2">
        <span class="rounded-full bg-coral/15 px-2.5 py-1 text-[11px] font-bold text-coral">
          v{{ note().version }}
        </span>
        <span class="text-[11px] font-bold text-muted">{{ prettyDate(note().date) }}</span>
      </div>
      <h3 class="font-display mt-2 text-xl font-semibold">{{ note().title }}</h3>
      <p class="mt-1 text-sm leading-relaxed text-muted-2">{{ note().summary }}</p>

      @for (section of note().sections; track section.heading) {
        <p class="mt-4 text-xs font-bold tracking-wide uppercase" [class]="headingClass(section.heading)">
          {{ section.heading }}
        </p>
        <ul class="mt-2 flex flex-col gap-2">
          @for (item of section.items; track $index) {
            <li class="flex gap-2 text-sm leading-relaxed">
              <span class="mt-1.5 size-1.5 flex-none rounded-full" [class]="dotClass(section.heading)"></span>
              <span class="text-muted-2">
                @if (item.lead) {
                  <span class="font-bold text-cream">{{ item.lead }}</span>
                  <span> — </span>
                }
                {{ item.text }}
              </span>
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class ReleaseNoteCard {
  readonly note = input.required<ReleaseNote>();

  protected prettyDate(iso: string): string {
    // Parsed as UTC noon so the date never slips a day in western timezones.
    return new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  protected headingClass(heading: string): string {
    return heading === 'Fixed'
      ? 'text-green'
      : heading === 'Removed'
        ? 'text-muted'
        : heading === 'Changed'
          ? 'text-violet'
          : 'text-gold';
  }

  protected dotClass(heading: string): string {
    return heading === 'Fixed'
      ? 'bg-green'
      : heading === 'Removed'
        ? 'bg-muted'
        : heading === 'Changed'
          ? 'bg-violet'
          : 'bg-gold';
  }
}
