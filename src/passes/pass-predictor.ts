import type { PassRequest, PassResponse, PassPartial, SatellitePass, PassProgress } from './pass-types';

export class PassPredictor {
  private worker: Worker | null = null;
  private computing = false;
  private partialPasses: SatellitePass[] = [];

  onResult: ((passes: SatellitePass[]) => void) | null = null;
  onPartial: ((passes: SatellitePass[]) => void) | null = null;
  onProgress: ((percent: number) => void) | null = null;

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(
        new URL('./pass-worker.ts', import.meta.url),
        { type: 'module' },
      );
      this.worker.onmessage = (e: MessageEvent<PassResponse | PassPartial | PassProgress>) => {
        if (e.data.type === 'result') {
          this.computing = false;
          this.partialPasses = [];
          this.onResult?.(e.data.passes);
        } else if (e.data.type === 'partial') {
          // Worker sends deltas — merge and sort on main thread
          this.partialPasses.push(...e.data.passes);
          this.partialPasses.sort((a, b) => a.aosEpoch - b.aosEpoch);
          this.onPartial?.(this.partialPasses);
        } else if (e.data.type === 'progress') {
          this.onProgress?.(e.data.percent);
        }
      };
      this.worker.onerror = () => {
        this.computing = false;
      };
    }
    return this.worker;
  }

  compute(request: PassRequest) {
    // Terminate stale computation if still running
    if (this.computing && this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.computing = true;
    this.partialPasses = [];
    this.ensureWorker().postMessage(request);
  }

  isComputing(): boolean {
    return this.computing;
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
  }
}
