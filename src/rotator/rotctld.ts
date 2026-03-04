import type { RotatorDriver, RotatorPosition, RotatorConnectOptions } from './protocol';

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
  onDisconnect: (() => void) | null = null;

  get connected() { return this._connected; }

  isSupported(): boolean {
    return typeof WebSocket !== 'undefined';
  }

  async connect(options: RotatorConnectOptions): Promise<void> {
    const url = options.wsUrl ?? 'ws://localhost:4533';
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url);
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
        this.messageBuffer += e.data;
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
    await this.sendCommand(`P ${az.toFixed(1)} ${el.toFixed(1)}\n`);
  }

  async getPosition(): Promise<RotatorPosition> {
    const response = await this.sendCommand('p\n');
    // rotctld returns two lines: azimuth\nelevation
    const lines = response.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length >= 2) {
      return { az: parseFloat(lines[0]) || 0, el: parseFloat(lines[1]) || 0 };
    }
    return { az: 0, el: 0 };
  }

  async stop(): Promise<void> {
    await this.sendCommand('S\n');
  }

  private sendCommand(cmd: string): Promise<string> {
    return new Promise<string>((resolve) => {
      if (!this.ws || !this._connected) {
        resolve('');
        return;
      }

      const timeout = setTimeout(() => {
        const idx = this.responseQueue.indexOf(handler);
        if (idx >= 0) this.responseQueue.splice(idx, 1);
        resolve('');
      }, 2000);

      const handler = (data: string) => {
        clearTimeout(timeout);
        resolve(data);
      };

      this.responseQueue.push(handler);
      this.ws.send(cmd);
    });
  }

  /**
   * Drain complete responses from the message buffer.
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
