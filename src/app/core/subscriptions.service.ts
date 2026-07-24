import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { getSupabase } from './supabase.client';

export interface StreamingService {
  id: string;
  slug: string;
  name: string;
}

/** The "what do I subscribe to" feature — checkboxes, no account linking. */
@Injectable({ providedIn: 'root' })
export class SubscriptionsService {
  private auth = inject(AuthService);

  readonly services = signal<StreamingService[]>([]);
  readonly mine = signal<ReadonlySet<string>>(new Set()); // service ids
  readonly mySlugs = computed(() => {
    const mine = this.mine();
    return this.services()
      .filter((s) => mine.has(s.id))
      .map((s) => s.slug);
  });
  private loaded = false;

  async load(force = false): Promise<void> {
    if (this.loaded && !force) return;
    const supabase = getSupabase();
    const [services, subs] = await Promise.all([
      supabase.from('streaming_services').select('id, slug, name').order('name'),
      supabase.from('user_subscriptions').select('service_id').eq('is_active', true),
    ]);
    this.services.set((services.data ?? []) as StreamingService[]);
    this.mine.set(new Set((subs.data ?? []).map((s) => s.service_id)));
    this.loaded = true;
  }

  async toggle(serviceId: string): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId) return;
    const next = new Set(this.mine());
    const active = !next.has(serviceId);
    if (active) next.add(serviceId);
    else next.delete(serviceId);
    this.mine.set(next); // optimistic
    const { error } = await getSupabase()
      .from('user_subscriptions')
      .upsert(
        { user_id: userId, service_id: serviceId, is_active: active },
        { onConflict: 'user_id,service_id' },
      );
    if (error) await this.load(true); // roll back to server truth
  }
}
