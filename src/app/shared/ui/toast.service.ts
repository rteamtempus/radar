import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  kind: 'error' | 'success';
  text: string;
}

/** Lightweight toasts, rendered by the host in app.html. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private nextId = 0;

  error(text: string) {
    this.show(text, 'error');
  }

  success(text: string) {
    this.show(text, 'success');
  }

  show(text: string, kind: Toast['kind'] = 'error') {
    const id = this.nextId++;
    this.toasts.update((t) => [...t, { id, kind, text }]);
    setTimeout(() => this.dismiss(id), 4500);
  }

  dismiss(id: number) {
    this.toasts.update((t) => t.filter((x) => x.id !== id));
  }
}
