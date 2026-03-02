/**
 * Beam / antenna aiming store.
 * Central state for the radar reticle, 3D cone, and future tracking outputs.
 */

const DEG2RAD = Math.PI / 180;
const PREFIX = 'threescope_beam_';

/** Snapshot of beam tracking state for external consumers. */
export interface BeamTrackingState {
  aimAz: number;
  aimEl: number;
  beamWidth: number;
  locked: boolean;
  lockedNoradId: number | null;
  lockedSatName: string;
  trackAz: number | null;
  trackEl: number | null;
  trackRange: number | null;
  timestamp: number;
}

/** Angular distance between two sky directions (degrees). */
export function angularDistance(az1: number, el1: number, az2: number, el2: number): number {
  const sa1 = Math.sin(el1 * DEG2RAD), ca1 = Math.cos(el1 * DEG2RAD);
  const sa2 = Math.sin(el2 * DEG2RAD), ca2 = Math.cos(el2 * DEG2RAD);
  const daz = (az1 - az2) * DEG2RAD;
  const cos = sa1 * sa2 + ca1 * ca2 * Math.cos(daz);
  return Math.acos(Math.min(1, Math.max(-1, cos))) / DEG2RAD;
}

/** Check if a point is inside the beam cone. */
export function isInsideBeam(az: number, el: number, beamAz: number, beamEl: number, beamWidth: number): boolean {
  return angularDistance(az, el, beamAz, beamEl) <= beamWidth / 2;
}

class BeamStore {
  // Beam aim direction
  aimAz = $state(0);
  aimEl = $state(45);
  beamWidth = $state(3);

  // Lock-to-selected tracking
  locked = $state(false);
  lockedNoradId = $state<number | null>(null);
  lockedSatName = $state('');

  // Live tracking output (updated each radar cycle when locked)
  trackAz = $state<number | null>(null);
  trackEl = $state<number | null>(null);
  trackRange = $state<number | null>(null);

  // Locked satellite sky path (AOS → current → LOS)
  lockPath = $state<{ az: number; el: number }[]>([]);

  // 3D cone visibility
  coneVisible = $state(false);

  // Callback for external integrations (Hamlib, WebSocket, etc.)
  onTrackingUpdate: ((state: BeamTrackingState) => void) | null = null;

  setAim(az: number, el: number) {
    az = ((az % 360) + 360) % 360;
    el = Math.max(0, Math.min(90, el));
    this.aimAz = az;
    this.aimEl = el;
    this.save();
  }

  setBeamWidth(w: number) {
    this.beamWidth = Math.max(0.01, w);
    this.save();
  }

  lockToSatellite(noradId: number, name: string) {
    this.locked = true;
    this.lockedNoradId = noradId;
    this.lockedSatName = name;
  }

  setConeVisible(v: boolean) {
    this.coneVisible = v;
    localStorage.setItem(PREFIX + 'coneVisible', String(v));
  }

  unlock() {
    this.locked = false;
    this.lockedNoradId = null;
    this.lockedSatName = '';
    this.trackAz = null;
    this.trackEl = null;
    this.trackRange = null;
    this.lockPath = [];
  }

  updateTracking(az: number, el: number, rangeKm: number) {
    this.trackAz = az;
    this.trackEl = el;
    this.trackRange = rangeKm;
    this.onTrackingUpdate?.(this.getTrackingSnapshot());
  }

  handleSatBelowHorizon() {
    this.trackAz = null;
    this.trackEl = null;
    this.trackRange = null;
    this.lockPath = [];
    this.onTrackingUpdate?.(this.getTrackingSnapshot());
  }

  getTrackingSnapshot(): BeamTrackingState {
    return {
      aimAz: this.aimAz,
      aimEl: this.aimEl,
      beamWidth: this.beamWidth,
      locked: this.locked,
      lockedNoradId: this.lockedNoradId,
      lockedSatName: this.lockedSatName,
      trackAz: this.trackAz,
      trackEl: this.trackEl,
      trackRange: this.trackRange,
      timestamp: Date.now(),
    };
  }

  load() {
    const g = (k: string) => localStorage.getItem(PREFIX + k);
    const az = g('aimAz'); if (az !== null) this.aimAz = Number(az);
    const el = g('aimEl'); if (el !== null) this.aimEl = Number(el);
    const bw = g('beamWidth'); if (bw !== null) this.beamWidth = Number(bw);
    const cv = g('coneVisible'); if (cv !== null) this.coneVisible = cv === 'true';
  }

  private save() {
    localStorage.setItem(PREFIX + 'aimAz', String(this.aimAz));
    localStorage.setItem(PREFIX + 'aimEl', String(this.aimEl));
    localStorage.setItem(PREFIX + 'beamWidth', String(this.beamWidth));
    localStorage.setItem(PREFIX + 'coneVisible', String(this.coneVisible));
  }
}

export const beamStore = new BeamStore();
