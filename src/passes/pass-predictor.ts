import type { PassRequest, PassResponse, PassPartial, SatellitePass, PassProgress } from './pass-types';

export class PassPredictor {
  private worker: Worker | null = null;
  private computing = false;

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
          this.onResult?.(e.data.passes);
        } else if (e.data.type === 'partial') {
          this.onPartial?.(e.data.passes);
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
