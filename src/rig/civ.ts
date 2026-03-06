import type { RigDriver, RigConnectOptions } from './protocol';
import { BinarySerialTransport } from '../serial/transport';

/**
 * Icom CI-V binary protocol over serial.
 *
 * Frame format: [FE FE] [toAddr] [fromAddr] [cmd] [subcmd?] [data...] [FD]
 * - FE FE = preamble
 * - toAddr = radio's CI-V address (default 0x94 for IC-7300)
 * - fromAddr = controller address (always 0xE0)
 * - FD = end of message
 *
 * Frequency is 5 BCD bytes, LSB first (10 digits of Hz).
 * Response: radio echoes command, then sends reply with FB (ok) or FA (error).
 *
 * Common CI-V addresses:
 *   IC-705  = 0xA4    IC-7300 = 0x94
 *   IC-9700 = 0xA2    IC-7100 = 0x88
 *   IC-7610 = 0x98    IC-R8600 = 0x96
 */
const PREAMBLE = 0xFE;
const EOM = 0xFD;
const CONTROLLER_ADDR = 0xE0;
const CMD_READ_FREQ = 0x03;
const CMD_SET_FREQ = 0x05;
const CMD_SET_MODE = 0x06;
const ACK = 0xFB;
const NAK = 0xFA;

/** Encode Hz as 5 BCD bytes, LSB first (Icom CI-V format). */
function hzToBcd(hz: number): Uint8Array {
  const s = Math.round(hz).toString().padStart(10, '0');
  const bcd = new Uint8Array(5);
  // s = "0145800000" (10 digits) → BCD pairs from right to left
  for (let i = 0; i < 5; i++) {
    const hi = parseInt(s[9 - 2 * i - 1], 10);
    const lo = parseInt(s[9 - 2 * i], 10);
    bcd[i] = (hi << 4) | lo;
  }
  return bcd;
}

/** Decode 5 BCD bytes (LSB first) to Hz. */
function bcdToHz(bcd: Uint8Array, offset: number): number {
  let hz = 0;
  let mult = 1;
  for (let i = 0; i < 5; i++) {
    const b = bcd[offset + i];
    hz += ((b >> 4) * 10 + (b & 0x0F)) * mult;
    mult *= 100;
  }
  return hz;
}

const MODE_CODES: Record<string, number> = {
  LSB: 0x00, USB: 0x01, AM: 0x02, CW: 0x03, FM: 0x05, 'CW-R': 0x07, 'RTTY': 0x04,
};

export class CivDriver implements RigDriver {
  readonly name = 'Icom CI-V';
  private transport = new BinarySerialTransport();
  private civAddress: number = 0x94;

  get connected() { return this.transport.connected; }

  set onDisconnect(cb: (() => void) | null) { this.transport.onDisconnect = cb; }
  get onDisconnect() { return this.transport.onDisconnect; }

  isSupported(): boolean {
    return this.transport.isSupported();
  }

  async connect(options: RigConnectOptions): Promise<void> {
    if (options.civAddress !== undefined) this.civAddress = options.civAddress;
    await this.transport.open(options.baudRate ?? 19200);
  }

  async disconnect(): Promise<void> {
    await this.transport.close();
  }

  async setFrequency(hz: number): Promise<void> {
    const bcd = hzToBcd(hz);
    const frame = new Uint8Array([
      PREAMBLE, PREAMBLE, this.civAddress, CONTROLLER_ADDR,
      CMD_SET_FREQ, ...bcd, EOM,
    ]);
    const response = await this.transport.sendAndReceive(frame, EOM);
    if (response.length === 0) return;
    if (this.isEcho(response, frame)) {
      const ack = await this.readResponse();
      this.checkAck(ack);
    } else if (this.isForUs(response)) {
      this.checkAck(response);
    } else {
      // Unsolicited frame — try to read the real response
      const ack = await this.readResponse();
      this.checkAck(ack);
    }
  }

  async getFrequency(): Promise<number | null> {
    const frame = new Uint8Array([
      PREAMBLE, PREAMBLE, this.civAddress, CONTROLLER_ADDR,
      CMD_READ_FREQ, EOM,
    ]);
    const response = await this.transport.sendAndReceive(frame, EOM);
    if (response.length === 0) return null;

    // Skip echo and unsolicited frames
    let data = response;
    if (this.isEcho(response, frame)) {
      data = await this.readResponse();
    } else if (!this.isForUs(response)) {
      data = await this.readResponse();
    }
    if (data.length === 0) return null;

    // Response: FE FE E0 <addr> <cmd> <5 BCD bytes> FD
    const cmdIdx = this.findCmd(data, CMD_READ_FREQ) ?? this.findCmd(data, CMD_SET_FREQ);
    if (cmdIdx === null || cmdIdx + 6 > data.length) return null;
    return bcdToHz(data, cmdIdx + 1);
  }

  async setMode(mode: string): Promise<void> {
    const code = MODE_CODES[mode.toUpperCase()];
    if (code === undefined) return;
    const frame = new Uint8Array([
      PREAMBLE, PREAMBLE, this.civAddress, CONTROLLER_ADDR,
      CMD_SET_MODE, code, EOM,  // omit filter byte — radio uses its default
    ]);
    const response = await this.transport.sendAndReceive(frame, EOM);
    if (response.length === 0) return;
    if (this.isEcho(response, frame)) {
      const ack = await this.readResponse();
      this.checkAck(ack);
    } else if (this.isForUs(response)) {
      this.checkAck(response);
    } else {
      const ack = await this.readResponse();
      this.checkAck(ack);
    }
  }

  /** Check if frame is addressed to us (from radio to controller). */
  private isForUs(frame: Uint8Array): boolean {
    return frame.length >= 4
      && frame[0] === PREAMBLE && frame[1] === PREAMBLE
      && frame[2] === CONTROLLER_ADDR
      && frame[3] === this.civAddress;
  }

  /** Read next frame addressed to us, skipping unsolicited transceive broadcasts. */
  private async readResponse(): Promise<Uint8Array> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const frame = await this.transport.sendAndReceive(new Uint8Array(0), EOM);
      if (frame.length === 0) return frame;
      if (this.isForUs(frame)) return frame;
      // Not for us — unsolicited transceive broadcast, skip and try again
    }
    return new Uint8Array(0);
  }

  private isEcho(response: Uint8Array, sent: Uint8Array): boolean {
    if (response.length !== sent.length) return false;
    for (let i = 0; i < sent.length; i++) {
      if (response[i] !== sent[i]) return false;
    }
    return true;
  }

  private checkAck(frame: Uint8Array): void {
    if (frame.length === 0) return;
    for (let i = 0; i < frame.length; i++) {
      if (frame[i] === NAK) throw new Error('CI-V: command rejected (NAK)');
    }
  }

  private findCmd(frame: Uint8Array, cmd: number): number | null {
    for (let i = 4; i < frame.length; i++) {
      if (frame[i] === cmd) return i;
    }
    return null;
  }
}
