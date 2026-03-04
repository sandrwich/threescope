/** Connection mode for the rotator. */
export type RotatorMode = 'serial' | 'network';

/** Serial protocol variants. */
export type SerialProtocol = 'gs232' | 'easycomm';

/** Current rotator position as reported by readback. */
export interface RotatorPosition {
  az: number;
  el: number;
}

export interface RotatorConnectOptions {
  baudRate?: number;
  wsUrl?: string;
}

/** Abstract interface all protocol drivers implement. */
export interface RotatorDriver {
  readonly name: string;
  readonly connected: boolean;
  isSupported(): boolean;
  connect(options: RotatorConnectOptions): Promise<void>;
  disconnect(): Promise<void>;
  setPosition(az: number, el: number): Promise<void>;
  getPosition(): Promise<RotatorPosition>;
  stop(): Promise<void>;
  onDisconnect: (() => void) | null;
}

/**
 * Shared serial port transport with buffered read, async command queue,
 * and disconnect detection. Used by GS-232 and EasyComm drivers.
 */
export class SerialTransport {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private readBuffer = '';
  private _connected = false;
  private readLoopRunning = false;
  private responseResolve: ((line: string) => void) | null = null;
  private commandLock: Promise<void> = Promise.resolve();

  onDisconnect: (() => void) | null = null;

  get connected() { return this._connected; }

  isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  async open(baudRate: number): Promise<void> {
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate, dataBits: 8, stopBits: 1, parity: 'none' });
    this.port = port;
    this.writer = port.writable!.getWriter();
    this.reader = port.readable!.getReader();
    this._connected = true;
    this.readBuffer = '';
    this.startReadLoop();
  }

  async close(): Promise<void> {
    this._connected = false;
    this.readLoopRunning = false;
    if (this.reader) {
      try { await this.reader.cancel(); } catch {}
      this.reader = null;
    }
    if (this.writer) {
      try { this.writer.releaseLock(); } catch {}
      this.writer = null;
    }
    if (this.port) {
      try { await this.port.close(); } catch {}
      this.port = null;
    }
    this.readBuffer = '';
    this.responseResolve = null;
  }

  /** Send a line and wait for a response line (with timeout). Half-duplex safe via command queue. */
  async sendCommand(line: string, timeoutMs = 2000): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      // Queue behind any pending command
      this.commandLock = this.commandLock.then(async () => {
        if (!this._connected || !this.writer) {
          resolve('');
          return;
        }
        try {
          // Drain any leftover data
          this.readBuffer = '';

          const encoder = new TextEncoder();
          await this.writer.write(encoder.encode(line));

          const result = await this.readLine(timeoutMs);
          resolve(result);
        } catch (e) {
          resolve('');
        }
      });
    });
  }

  /** Send a line without waiting for response. */
  async sendOnly(line: string): Promise<void> {
    this.commandLock = this.commandLock.then(async () => {
      if (!this._connected || !this.writer) return;
      const encoder = new TextEncoder();
      await this.writer.write(encoder.encode(line));
    });
    await this.commandLock;
  }

  private readLine(timeoutMs: number): Promise<string> {
    return new Promise<string>((resolve) => {
      // Check if we already have a complete line in the buffer
      const idx = this.readBuffer.indexOf('\n');
      if (idx >= 0) {
        const line = this.readBuffer.substring(0, idx).replace(/\r$/, '');
        this.readBuffer = this.readBuffer.substring(idx + 1);
        resolve(line);
        return;
      }

      const timer = setTimeout(() => {
        this.responseResolve = null;
        resolve('');
      }, timeoutMs);

      this.responseResolve = (line: string) => {
        clearTimeout(timer);
        resolve(line);
      };
    });
  }

  private startReadLoop(): void {
    if (this.readLoopRunning) return;
    this.readLoopRunning = true;
    const loop = async () => {
      const decoder = new TextDecoder();
      while (this.readLoopRunning && this.reader) {
        try {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (value) {
            this.readBuffer += decoder.decode(value, { stream: true });
            // Check for complete lines
            let idx: number;
            while ((idx = this.readBuffer.indexOf('\n')) >= 0) {
              const line = this.readBuffer.substring(0, idx).replace(/\r$/, '');
              this.readBuffer = this.readBuffer.substring(idx + 1);
              if (this.responseResolve) {
                const r = this.responseResolve;
                this.responseResolve = null;
                r(line);
              }
            }
          }
        } catch {
          break;
        }
      }
      this.readLoopRunning = false;
      if (this._connected) {
        this._connected = false;
        this.onDisconnect?.();
      }
    };
    loop();
  }
}
