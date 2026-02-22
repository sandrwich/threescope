export interface ObserverLocation {
  name: string;
  lat: number;    // degrees, -90 to 90
  lon: number;    // degrees, -180 to 180
  alt: number;    // meters above sea level
}

const STORAGE_KEY = 'threescope_observer';

class ObserverStore {
  location = $state<ObserverLocation>({
    name: '',
    lat: 51.4769,
    lon: -0.0005,
    alt: 46,
  });

  isSet = $state(true);

  onLocationChange: ((loc: ObserverLocation) => void) | null = null;

  load() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        this.location = { ...this.location, ...parsed };
        this.isSet = true;
      } catch { /* use default */ }
    }
  }

  setLocation(loc: Partial<ObserverLocation>) {
    this.location = { ...this.location, ...loc };
    this.isSet = true;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.location));
    this.onLocationChange?.(this.location);
  }

  setFromLatLon(lat: number, lon: number, alt?: number) {
    this.setLocation({ lat, lon, alt: alt ?? 0, name: '' });
  }

  /** Format location as a display string (for UI, not the name field) */
  get displayName(): string {
    if (this.location.name) return this.location.name;
    const ns = this.location.lat >= 0 ? 'N' : 'S';
    const ew = this.location.lon >= 0 ? 'E' : 'W';
    return `${Math.abs(this.location.lat).toFixed(2)}\u00B0${ns}, ${Math.abs(this.location.lon).toFixed(2)}\u00B0${ew}`;
  }
}

export const observerStore = new ObserverStore();
