import { getCurrentRealTimeEpoch, normalizeEpoch, epochToGmst, epochToDatetimeStr } from '../astro/epoch';

export class TimeSystem {
  currentEpoch: number;
  timeMultiplier = 1.0;
  paused = false;

  constructor() {
    this.currentEpoch = getCurrentRealTimeEpoch();
  }

  update(dtSeconds: number) {
    if (!this.paused) {
      this.currentEpoch += (dtSeconds * this.timeMultiplier) / 86400.0;
      this.currentEpoch = normalizeEpoch(this.currentEpoch);
    }
  }

  resetToNow() {
    this.currentEpoch = getCurrentRealTimeEpoch();
  }

  getGmstDeg(): number {
    return epochToGmst(this.currentEpoch);
  }

  getDatetimeStr(): string {
    return epochToDatetimeStr(this.currentEpoch);
  }
}
