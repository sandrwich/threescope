import type { RotatorDriver, RotatorPosition, RotatorConnectOptions, OnLogCallback } from './protocol';

/**
 * rotctld protocol over WebSocket (via websockify or similar TCP-to-WS bridge).
 *
 * Command reference:
 *   P 135.0 45.0\n  — set position
 *   p\n              — get position (response: two lines with floats)
 *   S\n              — stop rotation
 *
 * Response: RPRT 0 (success) or RPRT -N (error).
 */
export class RotctldDriver implements RotatorDriver {
  readonly name = 'rotctld';
  private ws: WebSocket | null = null;
  private _connected = false;
  private responseQueue: ((data: string) => void)[] = [];
  private messageBuffer = '';
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();
  onDisconnect: (() => void) | null = null;
  onLog: OnLogCallback | null = null;

  get connected() { return this._connected; }

  isSupported(): boolean {
    return typeof WebSocket !== 'undefined';
  }

  async connect(options: RotatorConnectOptions): Promise<void> {
    const url = options.wsUrl ?? 'ws://localhost:4540';
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
        // Reject any pending responses
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

  async setPosition(az: number, el: number): Promise<void> {
    const response = await this.sendCommand(`P ${az.toFixed(1)} ${el.toFixed(1)}\n`);
    checkRprt(response);
  }

  async getPosition(): Promise<RotatorPosition | null> {
    let response: string;
    try {
      response = await this.sendCommand('p\n');
    } catch {
      return null; // timeout
    }
    if (!response) return null;
    // Check for error response
    if (response.includes('RPRT -')) return null;
    // rotctld returns two lines: azimuth\nelevation
    const lines = response.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length >= 2) {
      const az = parseFloat(lines[0]);
      const el = parseFloat(lines[1]);
      if (isNaN(az) || isNaN(el)) return null;
      return { az, el };
    }
    return null;
  }

  async stop(): Promise<void> {
    const response = await this.sendCommand('S\n');
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
        if (data) {
          const error = classifyRprt(data);
          this.onLog?.({ timestamp: performance.now(), direction: 'rx', text: data, error });
        }
        resolve(data);
      };

      this.responseQueue.push(handler);
      this.ws.send(this.encoder.encode(cmd));
      this.onLog?.({ timestamp: performance.now(), direction: 'tx', text: cmd });
    });
  }

  async sendRaw(cmd: string): Promise<string> {
    return this.sendCommand(cmd.endsWith('\n') ? cmd : cmd + '\n');
  }

  /**
   * Drain complete responses from the message buffer.
   * @see checkRprt for error handling of RPRT responses.
   * rotctld responses end with RPRT N\n, or for `p` command, two float lines.
   * We treat each \n-terminated chunk as a potential response boundary.
   */
  private drainResponses(): void {
    // Accumulate until we see RPRT or have enough lines
    while (this.messageBuffer.includes('\n') && this.responseQueue.length > 0) {
      const rprtIdx = this.messageBuffer.indexOf('RPRT');
      if (rprtIdx >= 0) {
        const endIdx = this.messageBuffer.indexOf('\n', rprtIdx);
        if (endIdx >= 0) {
          const response = this.messageBuffer.substring(0, endIdx);
          this.messageBuffer = this.messageBuffer.substring(endIdx + 1);
          const handler = this.responseQueue.shift();
          handler?.(response);
          continue;
        }
      }

      // For `p` command: two float lines without RPRT
      const lines = this.messageBuffer.split('\n');
      if (lines.length >= 3) {
        // Two data lines + possibly empty trailing
        const response = lines[0] + '\n' + lines[1];
        this.messageBuffer = lines.slice(2).join('\n');
        const handler = this.responseQueue.shift();
        handler?.(response);
        continue;
      }

      break;
    }
  }
}

/**
 * Hamlib error codes → human-readable descriptions.
 * @see https://github.com/Hamlib/Hamlib/blob/master/include/hamlib/rig.h — rig_errcode_e
 */
const RPRT_ERRORS: Record<string, string> = {
  '-1': 'Invalid parameter (check az/el limits)',
  '-2': 'Invalid configuration',
  '-3': 'Out of memory',
  '-4': 'Not implemented',
  '-5': 'Communication timed out',
  '-6': 'I/O error',
  '-7': 'Internal error',
  '-8': 'Protocol error',
  '-9': 'Command rejected',
  '-10': 'Argument truncated',
  '-11': 'Not available',
  '-12': 'Target not available',
  '-13': 'Bus error',
  '-14': 'Bus busy / collision',
  '-15': 'Invalid parameter (null)',
  '-16': 'Invalid VFO',
  '-17': 'Argument out of range',
  '-18': 'Deprecated function',
  '-19': 'Security error',
  '-20': 'Rotator not powered on',
  '-21': 'Limit exceeded',
  '-22': 'Access denied',
};

/** Return human-readable error for RPRT -N responses, or undefined if OK. */
function classifyRprt(response: string): string | undefined {
  const match = response.match(/RPRT\s+(-\d+)/);
  if (match) return RPRT_ERRORS[match[1]] ?? `Unknown error ${match[1]}`;
  return undefined;
}

/** Throw if rotctld returned an error code (RPRT -N). */
function checkRprt(response: string): void {
  const match = response.match(/RPRT\s+(-\d+)/);
  if (match) {
    const desc = RPRT_ERRORS[match[1]] ?? `unknown error ${match[1]}`;
    throw new Error(desc);
  }
}
