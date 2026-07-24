import { Component, input } from '@angular/core';
import { ServiceRef } from '../../features/library/library.service';

interface BadgeStyle {
  t: string;
  bg: string;
  fg: string;
}

const STYLES: Record<string, BadgeStyle> = {
  netflix: { t: 'N', bg: '#e50914', fg: '#fff' },
  hulu: { t: 'h', bg: '#1ce783', fg: '#04170e' },
  'prime-video': { t: 'p', bg: '#00a8e1', fg: '#fff' },
  max: { t: 'M', bg: '#b57bff', fg: '#fff' },
  'disney-plus': { t: 'D', bg: '#113ccf', fg: '#fff' },
  'apple-tv-plus': { t: 'tv', bg: '#e6e6e6', fg: '#111' },
  'paramount-plus': { t: 'P+', bg: '#0064ff', fg: '#fff' },
  peacock: { t: 'Pk', bg: '#2b241c', fg: '#f5ede2' },
};

@Component({
  selector: 'pp-service-badges',
  template: `
    @for (s of services(); track s.slug) {
      <span
        class="flex size-6.5 items-center justify-center rounded-lg text-[11px] font-extrabold"
        [style.background]="style(s).bg"
        [style.color]="style(s).fg"
        [title]="s.name"
        >{{ style(s).t }}</span
      >
    }
  `,
  host: { class: 'flex gap-1.5' },
})
export class ServiceBadges {
  readonly services = input<ServiceRef[]>([]);

  protected style(s: ServiceRef): BadgeStyle {
    return STYLES[s.slug] ?? { t: s.name.slice(0, 2), bg: '#2b241c', fg: '#f5ede2' };
  }
}
