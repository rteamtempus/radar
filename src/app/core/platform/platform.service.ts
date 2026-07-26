import { Injectable } from '@angular/core';
import { App as CapApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Share } from '@capacitor/share';
import { StatusBar, Style } from '@capacitor/status-bar';

/**
 * The ONLY place that talks to Capacitor. Feature code never imports
 * `@capacitor/*` directly (native-port handoff, Phase 2/7) — everything goes
 * through this service, with graceful web fallbacks.
 */
@Injectable({ providedIn: 'root' })
export class PlatformService {
  readonly isNative = Capacitor.isNativePlatform();
  readonly platform = Capacitor.getPlatform() as 'ios' | 'android' | 'web';

  /** Call once at app boot. */
  async init(): Promise<void> {
    if (!this.isNative) return;
    try {
      await StatusBar.setStyle({ style: Style.Dark });
      if (this.platform === 'android') {
        await StatusBar.setBackgroundColor({ color: '#100c09' });
      }
    } catch {
      /* status bar is cosmetic — never block boot */
    }
  }

  /** Open an external URL: in-app browser tab on native, new tab on web. */
  async openExternal(url: string, event?: Event): Promise<void> {
    event?.preventDefault();
    if (this.isNative) await Browser.open({ url });
    else window.open(url, '_blank', 'noopener');
  }

  /** Native share sheet ?? Web Share API ?? clipboard copy. Returns what happened. */
  async share(data: { title?: string; text?: string; url?: string }): Promise<'shared' | 'copied'> {
    if (this.isNative) {
      await Share.share(data);
      return 'shared';
    }
    if (navigator.share) {
      await navigator.share(data);
      return 'shared';
    }
    await navigator.clipboard.writeText(data.url ?? data.text ?? '');
    return 'copied';
  }

  /** Haptic feedback — no-op on web. */
  async haptic(kind: 'light' | 'success' | 'warning'): Promise<void> {
    if (!this.isNative) return;
    try {
      if (kind === 'light') await Haptics.impact({ style: ImpactStyle.Light });
      else {
        await Haptics.notification({
          type: kind === 'success' ? NotificationType.Success : NotificationType.Warning,
        });
      }
    } catch {
      /* haptics are garnish */
    }
  }

  /**
   * Runs the callback when the native app returns to the foreground (iOS
   * suspends WebSockets in the background, so realtime consumers must
   * re-fetch). No-op on web. Returns an unsubscribe function.
   */
  onResume(callback: () => void): () => void {
    if (!this.isNative) return () => undefined;
    const handle = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) callback();
    });
    return () => {
      handle.then((h) => h.remove());
    };
  }

  /**
   * Android hardware back button: pop router history; at a root screen,
   * background the app instead of exiting blindly.
   */
  registerBackButton(rootPaths: string[]): void {
    if (this.platform !== 'android') return;
    CapApp.addListener('backButton', ({ canGoBack }) => {
      const atRoot = rootPaths.includes(location.pathname);
      if (atRoot || !canGoBack) CapApp.minimizeApp();
      else history.back();
    });
  }
}
