import { ApplicationRef, Injectable, inject, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter, first } from 'rxjs';

/**
 * Watches the service worker for freshly deployed versions and exposes
 * `updateReady` for the "update available" pill in the app shell — saves
 * users from ever needing to clear the PWA cache by hand.
 */
@Injectable({ providedIn: 'root' })
export class UpdateService {
  private swUpdate = inject(SwUpdate);
  private appRef = inject(ApplicationRef);

  readonly updateReady = signal(false);

  constructor() {
    // Disabled in dev mode and on browsers without service worker support.
    if (!this.swUpdate.isEnabled) return;

    this.swUpdate.versionUpdates
      .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
      .subscribe(() => this.updateReady.set(true));

    // Installed PWAs can sit open for days, so polling on load alone isn't
    // enough: check once the app settles, every 15 minutes after that, and
    // whenever the tab/app comes back into the foreground.
    this.appRef.isStable.pipe(first(Boolean)).subscribe(() => {
      this.check();
      setInterval(() => this.check(), 15 * 60 * 1000);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.check();
    });
  }

  private check() {
    this.swUpdate.checkForUpdate().catch(() => {});
  }

  async applyUpdate() {
    try {
      await this.swUpdate.activateUpdate();
    } finally {
      document.location.reload();
    }
  }
}
