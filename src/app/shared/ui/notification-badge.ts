import { Component, input } from '@angular/core';

/**
 * The unread count bubble. Renders nothing at zero, so it can sit inside any
 * `relative` parent unconditionally. Used on the You-page bell and the Me tab.
 */
@Component({
  selector: 'pp-notification-badge',
  template: `
    @if (count() > 0) {
      <span
        class="pointer-events-none absolute -top-1 -right-1.5 flex min-w-4 items-center justify-center rounded-full bg-coral px-1 text-[10px] leading-4 font-bold text-ink"
        [attr.aria-label]="count() + ' unread notifications'"
      >
        {{ count() > 9 ? '9+' : count() }}
      </span>
    }
  `,
})
export class NotificationBadge {
  readonly count = input<number>(0);
}
