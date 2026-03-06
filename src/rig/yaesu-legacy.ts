import type { RigDriver, RigConnectOptions } from './protocol';
import { BinarySerialTransport } from '../serial/transport';

/**
 * Legacy Yaesu CAT protocol (FT-817, FT-857, FT-897, etc.).
 * Fixed 5-byte commands: [4 data bytes] [opcode].
 * BCD frequency encoding, MSB first (opposite of CI-V).
 * Requires 2 stop bits on the serial port.
 *
 * Commands:
 *   opcode 0x01 — set frequency (4 BCD bytes = 8 digits of 10Hz units)
 *   opcode 0x03 — read frequency + mode (response: 5 bytes)
 *   opcode 0x07 — set mode
 */
const OP_SET_FREQ = 0x01;
const OP_READ_FREQ = 0x03;
const OP_SET_MODE = 0x07;

/** Encode Hz as 4 BCD bytes, MSB first (legacy Yaesu format). */
function hzToBcd(hz: number): Uint8Array {
  // Legacy Yaesu uses 10 Hz resolution: freq in units of 10 Hz → 8 BCD digits
  const units = Math.round(hz / 10);
  const s = units.toString().padStart(8, '0');
  const bcd = new Uint8Array(4);
  for (let i = 0; i < 4; i++) {
    const hi = parseInt(s[2 * i], 10);
    const lo = parseInt(s[2 * i + 1], 10);
    bcd[i] = (hi << 4) | lo;
  }
  return bcd;
}

/** Decode 4 BCD bytes (MSB first) to Hz. */
function bcdToHz(bcd: Uint8Array, offset: number): number {
  let units = 0;
  for (let i = 0; i < 4; i++) {
    const b = bcd[offset + i];
    units = units * 100 + (b >> 4) * 10 + (b & 0x0F);
  }
  return units * 10; // back to Hz
}

const MODE_CODES: Record<string, number> = {
  LSB: 0x00, USB: 0x01, CW: 0x02, 'CW-R': 0x03,
  AM: 0x04, FM: 0x08, DIG: 0x0A, PKT: 0x0C,
  // WFM (0x06) omitted — cannot be set via opcode 0x07 on FT-817, risks crash
};

export class YaesuLegacyDriver implements RigDriver {
  readonly name = 'Yaesu (legacy)';
  private transport = new BinarySerialTransport();

  get connected() { return this.transport.connected; }

  set onDisconnect(cb: (() => void) | null) { this.transport.onDisconnect = cb; }
  get onDisconnect() { return this.transport.onDisconnect; }

  isSupported(): boolean {
    return this.transport.isSupported();
  }

  async connect(options: RigConnectOptions): Promise<void> {
    await this.transport.open(options.baudRate ?? 9600, 2); // 2 stop bits
  }

  async disconnect(): Promise<void> {
    await this.transport.close();
  }

  async setFrequency(hz: number): Promise<void> {
    const bcd = hzToBcd(hz);
    const cmd = new Uint8Array([bcd[0], bcd[1], bcd[2], bcd[3], OP_SET_FREQ]);
    // Read 1-byte ACK: 0x00 = success, 0xF0 = already active (both OK)
    const ack = await this.transport.sendAndReceiveBytes(cmd, 1, 2000);
    if (ack.length > 0 && ack[0] !== 0x00 && ack[0] !== 0xF0) throw new Error('Yaesu: set frequency failed');
  }

  async getFrequency(): Promise<number | null> {
    const cmd = new Uint8Array([0x00, 0x00, 0x00, 0x00, OP_READ_FREQ]);
    // Legacy Yaesu responds with exactly 5 bytes (4 freq + 1 mode), no sentinel
    const response = await this.transport.sendAndReceiveBytes(cmd, 5, 2000);
    if (response.length < 5) return null;
    return bcdToHz(response, 0);
  }

  async setMode(mode: string): Promise<void> {
    const code = MODE_CODES[mode.toUpperCase()];
    if (code === undefined) return;
    const cmd = new Uint8Array([code, 0x00, 0x00, 0x00, OP_SET_MODE]);
    // Read 1-byte ACK: 0x00 = success, 0xF0 = already active (both OK)
    const ack = await this.transport.sendAndReceiveBytes(cmd, 1, 2000);
    if (ack.length > 0 && ack[0] !== 0x00 && ack[0] !== 0xF0) throw new Error('Yaesu: set mode failed');
  }
}
