import { Injectable, signal } from '@angular/core';
import { getSupabase } from './supabase.client';

export interface LatLng {
  lat: number;
  lng: number;
}

/** A city picked from Places autocomplete — the ONLY way locations enter
 * Radar (docs/LOCATION-ANALYSIS.md): `{name, place_id, lat, lng}`, city
 * granularity. Never a raw GPS fix, never free text. */
export interface CityPick {
  name: string;
  place_id: string;
  lat: number;
  lng: number;
}

export interface CitySuggestion {
  place_id: string;
  main: string;
  secondary: string;
}

const CACHE_MS = 10 * 60 * 1000;
const CUSTOM_KEY = 'pp-custom-location'; // sessionStorage: survives reload, not forever
const RECENTS_KEY = 'pp-recent-cities'; // localStorage: quick picks in the city picker

/**
 * Location with an explicit precedence rule (G9): custom pick > GPS > home
 * city. `custom` is the Explore override ("show me Tokyo"); GPS is the
 * browser position; home comes from the profile. `effective()` resolves in
 * that order and the UI always shows which one is active.
 */
@Injectable({ providedIn: 'root' })
export class LocationService {
  readonly denied = signal(false);
  private cached: { pos: LatLng; at: number } | null = null;

  /** Explore's custom-location override; null = "near me". */
  readonly custom = signal<CityPick | null>(readJson<CityPick>(sessionStorage, CUSTOM_KEY));
  /** Home city from the profile (city granularity). Loaded lazily. */
  readonly home = signal<CityPick | null>(null);
  readonly recents = signal<CityPick[]>(readJson<CityPick[]>(localStorage, RECENTS_KEY) ?? []);
  private homeLoaded = false;

  setCustom(pick: CityPick | null): void {
    this.custom.set(pick);
    if (pick) {
      sessionStorage.setItem(CUSTOM_KEY, JSON.stringify(pick));
      this.remember(pick);
    } else {
      sessionStorage.removeItem(CUSTOM_KEY);
    }
  }

  private remember(pick: CityPick): void {
    const next = [pick, ...this.recents().filter((r) => r.place_id !== pick.place_id)].slice(0, 4);
    this.recents.set(next);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  }

  async loadHome(): Promise<CityPick | null> {
    if (this.homeLoaded) return this.home();
    this.homeLoaded = true;
    const { data } = await getSupabase().auth.getUser();
    if (!data.user) return null;
    const { data: row } = await getSupabase()
      .from('profiles')
      .select('home_location')
      .eq('id', data.user.id)
      .maybeSingle();
    const home = (row?.home_location ?? null) as CityPick | null;
    if (home?.lat != null && home?.lng != null) this.home.set(home);
    return this.home();
  }

  /** Refresh the cached home after the profile page saves a new one. */
  setHome(pick: CityPick | null): void {
    this.homeLoaded = true;
    this.home.set(pick);
  }

  /** Precedence: custom pick > GPS > home city. Null when none available. */
  async effective(): Promise<LatLng | null> {
    const custom = this.custom();
    if (custom) return { lat: custom.lat, lng: custom.lng };
    const gps = await this.get();
    if (gps) return gps;
    const home = await this.loadHome();
    return home ? { lat: home.lat, lng: home.lng } : null;
  }

  /** Label for the active location source — the UI must always show this. */
  effectiveLabel(): string {
    const custom = this.custom();
    if (custom) return custom.name;
    return 'Near me';
  }

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

  // ---- city picker backend (places-autocomplete edge fn) -------------------

  async suggestCities(input: string, sessionToken: string): Promise<CitySuggestion[]> {
    const { data, error } = await getSupabase().functions.invoke<{
      suggestions: CitySuggestion[];
    }>('places-autocomplete', { body: { input, session_token: sessionToken } });
    if (error) throw error;
    return data?.suggestions ?? [];
  }

  async resolveCity(placeId: string, sessionToken: string): Promise<CityPick> {
    const { data, error } = await getSupabase().functions.invoke<CityPick>('places-autocomplete', {
      body: { place_id: placeId, session_token: sessionToken },
    });
    if (error || !data) throw error ?? new Error('resolve failed');
    return data;
  }
}

function readJson<T>(store: Storage, key: string): T | null {
  try {
    const raw = store.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
