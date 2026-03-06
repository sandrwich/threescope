import type { RigDriver, RigConnectOptions } from './protocol';

/**
 * Hamlib rigctld protocol over WebSocket (via websockify or similar TCP-to-WS bridge).
 * Also compatible with GQRX (port 7356) and SDR++ rigctld server.
 *
 * Commands:
 *   F {hz}\n     — set frequency
 *   f\n          — get frequency (response: Hz on one line)
 *   M {mode} 0\n — set mode
 */
export class RigctldDriver implements RigDriver {
  readonly name = 'rigctld';
  private ws: WebSocket | null = null;
  private _connected = false;
  private responseQueue: ((data: string) => void)[] = [];
  private messageBuffer = '';
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();
  onDisconnect: (() => void) | null = null;

  get connected() { return this._connected; }

  isSupported(): boolean {
    return typeof WebSocket !== 'undefined';
  }

  async connect(options: RigConnectOptions): Promise<void> {
    const url = options.wsUrl ?? 'ws://localhost:4541';
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url, ['binary']);
      ws.binaryType = 'arraybuffer';
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Connection timed out'));
      }, 5000);

      ws.onopen = () => {
        clearTimeout(timeout);
        this.ws = ws;
        this._connected = true;
        resolve();
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('WebSocket connection failed'));
      };

      ws.onclose = () => {
        const wasConnected = this._connected;
        this._connected = false;
        this.ws = null;
        for (const r of this.responseQueue) r('');
        this.responseQueue = [];
        this.messageBuffer = '';
        if (wasConnected) this.onDisconnect?.();
      };

      ws.onmessage = (e) => {
        this.messageBuffer += e.data instanceof ArrayBuffer
          ? this.decoder.decode(e.data)
          : e.data;
        this.drainResponses();
      };
    });
  }

  async disconnect(): Promise<void> {
    this._connected = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.responseQueue = [];
    this.messageBuffer = '';
  }

  async setFrequency(hz: number): Promise<void> {
    const response = await this.sendCommand(`F ${Math.round(hz)}\n`);
    checkRprt(response);
  }

  async getFrequency(): Promise<number | null> {
    let response: string;
    try {
      response = await this.sendCommand('f\n');
    } catch {
      return null;
    }
    if (!response || response.includes('RPRT -')) return null;
    const hz = parseInt(response.trim(), 10);
    return isNaN(hz) ? null : hz;
  }

  async setMode(mode: string): Promise<void> {
    const response = await this.sendCommand(`M ${mode} 0\n`);
    checkRprt(response);
  }

  private sendCommand(cmd: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      if (!this.ws || !this._connected) {
        resolve('');
        return;
      }

      const timeout = setTimeout(() => {
        const idx = this.responseQueue.indexOf(handler);
        if (idx >= 0) this.responseQueue.splice(idx, 1);
        reject(new Error('Response timeout'));
      }, 2000);

      const handler = (data: string) => {
        clearTimeout(timeout);
        resolve(data);
      };

      this.responseQueue.push(handler);
      this.ws.send(this.encoder.encode(cmd));
    });
  }

  private drainResponses(): void {
    while (this.responseQueue.length > 0) {
      const nlIdx = this.messageBuffer.indexOf('\n');
      if (nlIdx < 0) break;
      const line = this.messageBuffer.substring(0, nlIdx);
      this.messageBuffer = this.messageBuffer.substring(nlIdx + 1);
      const handler = this.responseQueue.shift();
      handler?.(line);
    }
  }
}

const RPRT_ERRORS: Record<string, string> = {
  '-1': 'Invalid parameter',
  '-2': 'Invalid configuration',
  '-3': 'Out of memory',
  '-4': 'Not implemented',
  '-5': 'Communication timed out',
  '-6': 'I/O error',
  '-7': 'Internal error',
  '-8': 'Protocol error',
  '-9': 'Command rejected',
  '-10': 'Data truncated',
  '-11': 'Not available',
  '-12': 'VFO not targetable',
  '-13': 'Bus error',
  '-14': 'Bus collision',
  '-15': 'Invalid argument',
  '-16': 'Invalid VFO',
  '-17': 'Argument out of domain',
  '-18': 'Function deprecated',
  '-19': 'Security error',
  '-20': 'Rig not powered on',
  '-21': 'Limit exceeded',
  '-22': 'Access denied',
};

function checkRprt(response: string): void {
  const match = response.match(/RPRT\s+(-?\d+)/);
  if (!match) throw new Error('No RPRT in response');
  const code = parseInt(match[1], 10);
  if (code < 0) {
    const desc = RPRT_ERRORS[match[1]] ?? `unknown error ${match[1]}`;
    throw new Error(desc);
  }
}
