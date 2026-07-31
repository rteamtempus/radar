import { Component, effect, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
import { NotificationsService } from './core/notifications.service';
import { PlatformService } from './core/platform/platform.service';
import { UpdateService } from './core/update.service';
import { NotificationBadge } from './shared/ui/notification-badge';
import { ToastService } from './shared/ui/toast.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NotificationBadge],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly auth = inject(AuthService);
  protected readonly updates = inject(UpdateService);
  protected readonly toast = inject(ToastService);
  protected readonly notifications = inject(NotificationsService);
  private readonly platform = inject(PlatformService);

  constructor() {
    this.platform.init();
    this.platform.registerBackButton(['/radar', '/explore', '/party', '/friends', '/profile', '/login']);

    // The Me tab shows the badge from anywhere, so the inbox loads on sign-in
    // rather than waiting for a visit to the You page.
    effect(() => {
      if (this.auth.user()) void this.notifications.load();
      else this.notifications.reset();
    });
  }
}
