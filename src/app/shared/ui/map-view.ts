import {
  Component,
  ElementRef,
  OnDestroy,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';
import type * as Leaflet from 'leaflet';

export interface MapMarker {
  lat: number;
  lng: number;
  label: string;
  /** Router path to navigate to on tap (optional). */
  link?: string[];
}

/**
 * Map view (LOCATION-ANALYSIS idea 12): Leaflet + OpenStreetMap raster tiles.
 * DELIBERATELY not Google — $0, no key, no billing surface; the OSM tile
 * policy just requires attribution (kept) and modest volume (we're a POC).
 * Leaflet is lazy-imported so non-map users never download it.
 * Circle markers, not icon markers — Leaflet's default icons are image
 * assets that 404 under bundlers without extra config.
 */
@Component({
  selector: 'pp-map-view',
  template: `<div #host class="h-64 w-full overflow-hidden rounded-2xl border border-line"></div>`,
})
export class MapView implements OnDestroy {
  readonly markers = input.required<MapMarker[]>();
  readonly markerTapped = output<MapMarker>();

  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private map: Leaflet.Map | null = null;
  private layer: Leaflet.LayerGroup | null = null;
  private L: typeof Leaflet | null = null;

  private readonly render = effect(() => {
    const markers = this.markers();
    const el = this.host().nativeElement;
    void this.draw(el, markers);
  });

  private async draw(el: HTMLDivElement, markers: MapMarker[]): Promise<void> {
    if (!this.L) this.L = await import('leaflet');
    const L = this.L;
    if (!this.map) {
      this.map = L.map(el, { zoomControl: true, attributionControl: true });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(this.map);
    }
    this.layer?.remove();
    this.layer = L.layerGroup().addTo(this.map);
    const points: Leaflet.LatLngExpression[] = [];
    for (const m of markers) {
      points.push([m.lat, m.lng]);
      L.circleMarker([m.lat, m.lng], {
        radius: 9,
        color: '#ff7a5c', // coral
        weight: 2,
        fillColor: '#ffb45c', // gold
        fillOpacity: 0.85,
      })
        .bindTooltip(m.label, { direction: 'top', offset: L.point(0, -8) })
        .on('click', () => this.markerTapped.emit(m))
        .addTo(this.layer);
    }
    if (points.length) {
      this.map.fitBounds(L.latLngBounds(points).pad(0.25), { maxZoom: 15 });
    }
    // The container mounts inside conditionally-rendered blocks — poke Leaflet
    // once layout settles or the tiles render blank.
    setTimeout(() => this.map?.invalidateSize(), 50);
  }

  ngOnDestroy() {
    this.map?.remove();
    this.map = null;
  }
}
