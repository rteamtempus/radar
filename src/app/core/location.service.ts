import { Injectable, signal } from '@angular/core';

export interface LatLng {
  lat: number;
  lng: number;
}

const CACHE_MS = 10 * 60 * 1000;

/** Browser geolocation with a short cache; null when denied/unavailable. */
@Injectable({ providedIn: 'root' })
export class LocationService {
  readonly denied = signal(false);
  private cached: { pos: LatLng; at: number } | null = null;

  async get(): Promise<LatLng | null> {
    if (this.cached && Date.now() - this.cached.at < CACHE_MS) return this.cached.pos;
    if (!('geolocation' in navigator)) return null;
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          const pos = { lat: p.coords.latitude, lng: p.coords.longitude };
          this.cached = { pos, at: Date.now() };
          this.denied.set(false);
          resolve(pos);
        },
        () => {
          this.denied.set(true);
          resolve(null);
        },
        { timeout: 8000, maximumAge: 5 * 60 * 1000 },
      );
    });
  }
}
