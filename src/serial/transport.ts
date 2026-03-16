/**
 * Shared serial transports for text and binary protocols.
 * Used by both rotator (GS-232, EasyComm) and rig (Kenwood, Yaesu, CI-V) drivers.
 */

import { formatHex, type OnLogCallback } from './console-types';

/** Standard baud rates for serial connections. */
export const BAUD_RATES = [600, 1200, 4800, 9600, 19200, 38400, 57600, 115200, 460800] as const;

/**
 * Text-based serial transport with buffered read, async command queue,
 * and disconnect detection. Configurable line delimiter for different protocols.
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
  private delimiter: string;

  onDisconnect: (() => void) | null = null;
  onLog: OnLogCallback | null = null;
  /** Optional protocol-level error classifier for RX responses. */
  classifyResponse: ((text: string) => string | null) | null = null;

  constructor(delimiter = '\n') {
    this.delimiter = delimiter;
  }

  get connected() { return this._connected; }

  isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  async open(baudRate: number, stopBits: 1 | 2 = 1): Promise<void> {
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate, dataBits: 8, stopBits, parity: 'none' });
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
      this.commandLock = this.commandLock.then(async () => {
        if (!this._connected || !this.writer) {
          resolve('');
          return;
        }
        try {
          if (line) {
            this.readBuffer = '';
            const encoder = new TextEncoder();
            await this.writer.write(encoder.encode(line));
            this.onLog?.({ timestamp: performance.now(), direction: 'tx', text: line });
          }
          const result = await this.readLine(timeoutMs);
          if (result) {
            const error = this.classifyResponse?.(result) ?? undefined;
            this.onLog?.({ timestamp: performance.now(), direction: 'rx', text: result, error });
          }
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
      this.onLog?.({ timestamp: performance.now(), direction: 'tx', text: line });
    });
    await this.commandLock;
  }

  private readLine(timeoutMs: number): Promise<string> {
    return new Promise<string>((resolve) => {
      const idx = this.readBuffer.indexOf(this.delimiter);
      if (idx >= 0) {
        const line = this.readBuffer.substring(0, idx).replace(/\r$/, '');
        this.readBuffer = this.readBuffer.substring(idx + this.delimiter.length);
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
            let idx: number;
            while ((idx = this.readBuffer.indexOf(this.delimiter)) >= 0) {
              const line = this.readBuffer.substring(0, idx).replace(/\r$/, '');
              this.readBuffer = this.readBuffer.substring(idx + this.delimiter.length);
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

/**
 * Binary serial transport for frame-based protocols (Icom CI-V, legacy Yaesu).
 * Reads raw bytes and frames by sentinel byte. Same command queue pattern as text transport.
 */
export class BinarySerialTransport {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private readBuffer: number[] = [];
  private _connected = false;
  private readLoopRunning = false;
  private activeSentinel = 0;
  private expectedByteCount = 0;
  private frameResolve: ((frame: Uint8Array) => void) | null = null;
  private commandLock: Promise<void> = Promise.resolve();

  onDisconnect: (() => void) | null = null;
  onLog: OnLogCallback | null = null;
  /** Optional protocol-level error classifier for binary RX responses. */
  classifyResponse: ((data: Uint8Array) => string | null) | null = null;

  get connected() { return this._connected; }

  isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  async open(baudRate: number, stopBits: 1 | 2 = 1): Promise<void> {
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate, dataBits: 8, stopBits, parity: 'none' });
    this.port = port;
    this.writer = port.writable!.getWriter();
    this.reader = port.readable!.getReader();
    this._connected = true;
    this.readBuffer = [];
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
    this.readBuffer = [];
    this.frameResolve = null;
  }

  /** Send bytes without waiting for response. */
  async sendBytes(data: Uint8Array): Promise<void> {
    this.commandLock = this.commandLock.then(async () => {
      if (!this._connected || !this.writer) return;
      await this.writer.write(data);
      this.onLog?.({ timestamp: performance.now(), direction: 'tx', text: formatHex(data), bytes: data });
    });
    await this.commandLock;
  }

  /** Send bytes and wait for a response frame ending with sentinel byte. */
  async sendAndReceive(data: Uint8Array, sentinel: number, timeoutMs = 2000): Promise<Uint8Array> {
    return new Promise<Uint8Array>((resolve) => {
      this.commandLock = this.commandLock.then(async () => {
        if (!this._connected || !this.writer) {
          resolve(new Uint8Array(0));
          return;
        }
        try {
          if (data.length > 0) this.readBuffer = [];
          if (data.length > 0) {
            await this.writer.write(data);
            this.onLog?.({ timestamp: performance.now(), direction: 'tx', text: formatHex(data), bytes: data });
          }
          const result = await this.readFrame(sentinel, timeoutMs);
          if (result.length > 0) {
            const error = this.classifyResponse?.(result) ?? undefined;
            this.onLog?.({ timestamp: performance.now(), direction: 'rx', text: formatHex(result), bytes: result, error });
          }
          resolve(result);
        } catch {
          resolve(new Uint8Array(0));
        }
      });
    });
  }

  /** Send bytes and wait for exactly `count` response bytes. */
  async sendAndReceiveBytes(data: Uint8Array, count: number, timeoutMs = 2000): Promise<Uint8Array> {
    return new Promise<Uint8Array>((resolve) => {
      this.commandLock = this.commandLock.then(async () => {
        if (!this._connected || !this.writer) {
          resolve(new Uint8Array(0));
          return;
        }
        try {
          this.readBuffer = [];
          await this.writer.write(data);
          this.onLog?.({ timestamp: performance.now(), direction: 'tx', text: formatHex(data), bytes: data });
          const result = await this.readExactly(count, timeoutMs);
          if (result.length > 0) {
            const error = this.classifyResponse?.(result) ?? undefined;
            this.onLog?.({ timestamp: performance.now(), direction: 'rx', text: formatHex(result), bytes: result, error });
          }
          resolve(result);
        } catch {
          resolve(new Uint8Array(0));
        }
      });
    });
  }

  /** Read exactly `count` bytes or timeout. For fixed-length protocols (legacy Yaesu). */
  private readExactly(count: number, timeoutMs: number): Promise<Uint8Array> {
    return new Promise<Uint8Array>((resolve) => {
      if (this.readBuffer.length >= count) {
        const frame = new Uint8Array(this.readBuffer.splice(0, count));
        resolve(frame);
        return;
      }

      const timer = setTimeout(() => {
        this.frameResolve = null;
        this.expectedByteCount = 0;
        resolve(new Uint8Array(0));
      }, timeoutMs);

      this.expectedByteCount = count;
      this.frameResolve = (frame: Uint8Array) => {
        clearTimeout(timer);
        this.expectedByteCount = 0;
        resolve(frame);
      };
    });
  }

  /** Read bytes until sentinel byte found or timeout. */
  private readFrame(sentinel: number, timeoutMs: number): Promise<Uint8Array> {
    this.activeSentinel = sentinel;

    return new Promise<Uint8Array>((resolve) => {
      const idx = this.readBuffer.indexOf(sentinel);
      if (idx >= 0) {
        const frame = new Uint8Array(this.readBuffer.splice(0, idx + 1));
        resolve(frame);
        return;
      }

      const timer = setTimeout(() => {
        this.frameResolve = null;
        resolve(new Uint8Array(0));
      }, timeoutMs);

      this.frameResolve = (frame: Uint8Array) => {
        clearTimeout(timer);
        resolve(frame);
      };
    });
  }

  private startReadLoop(): void {
    if (this.readLoopRunning) return;
    this.readLoopRunning = true;
    const loop = async () => {
      while (this.readLoopRunning && this.reader) {
        try {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (value) {
            for (let i = 0; i < value.length; i++) {
              this.readBuffer.push(value[i]);
            }
            if (this.frameResolve) {
              if (this.expectedByteCount > 0) {
                // Fixed-length read mode
                if (this.readBuffer.length >= this.expectedByteCount) {
                  const frame = new Uint8Array(this.readBuffer.splice(0, this.expectedByteCount));
                  const r = this.frameResolve;
                  this.frameResolve = null;
                  r(frame);
                }
              } else {
                // Sentinel-based read mode
                const idx = this.readBuffer.indexOf(this.activeSentinel);
                if (idx >= 0) {
                  const frame = new Uint8Array(this.readBuffer.splice(0, idx + 1));
                  const r = this.frameResolve;
                  this.frameResolve = null;
                  r(frame);
                }
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
