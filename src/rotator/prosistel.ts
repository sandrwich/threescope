import type { RotatorDriver, RotatorPosition, RotatorConnectOptions } from './protocol';
import { SerialTransport } from './protocol';

/**
 * Prosistel rotator protocol driver.
 *
 * Text-based with STX (0x02) framing, CR-terminated.
 * Supports D series (multiplier 1) and Combi-Track (multiplier 10).
 *
 * Set: "\x02AG180\r" (D) or "\x02AG1800\r" (Combi-Track)
 * Get: "\x02A?\r" -> "\x02A,?,290,R\r"
 * Stop: "\x02AG997\r" (D) or "\x02AG9777\r" (Combi-Track)
 */
export class ProsistelDriver implements RotatorDriver {
  readonly name = 'Prosistel';
  private transport = new SerialTransport('\r');
  private azId = 'A';
  private elId = 'E';
  private multiplier = 1;
  private stopAngle = 997;
  private combiTrack: boolean;

  constructor(combiTrack = false) {
    this.combiTrack = combiTrack;
    if (combiTrack) {
      this.elId = 'B';
      this.multiplier = 10;
      this.stopAngle = 9777;
    }
  }

  get connected() { return this.transport.connected; }

  set onDisconnect(cb: (() => void) | null) { this.transport.onDisconnect = cb; }
  get onDisconnect() { return this.transport.onDisconnect; }
  set onLog(cb: import('../serial/console-types').OnLogCallback | null) { this.transport.onLog = cb; }
  get onLog() { return this.transport.onLog; }

  isSupported(): boolean {
    return this.transport.isSupported();
  }

  async connect(options: RotatorConnectOptions): Promise<void> {
    await this.transport.open(options.baudRate ?? 9600);
    // Disable continuous position monitor (must read response to avoid buffer pollution)
    await this.transport.sendCommand(`\x02${this.azId}S\r`);
    await this.transport.sendCommand(`\x02${this.elId}S\r`);
  }

  async disconnect(): Promise<void> {
    await this.transport.close();
  }

  async setPosition(az: number, el: number): Promise<void> {
    const azVal = Math.round(az * this.multiplier);
    const elVal = Math.round(Math.max(0, el) * this.multiplier);
    await this.transport.sendCommand(`\x02${this.azId}G${azVal}\r`);
    await this.transport.sendCommand(`\x02${this.elId}G${elVal}\r`);
  }

  async getPosition(): Promise<RotatorPosition | null> {
    const azResp = await this.transport.sendCommand(`\x02${this.azId}?\r`);
    const elResp = await this.transport.sendCommand(`\x02${this.elId}?\r`);
    const az = parseProsistelResponse(azResp, this.multiplier);
    const el = parseProsistelResponse(elResp, this.multiplier);
    if (az === null || el === null) return null;
    return { az, el };
  }

  async stop(): Promise<void> {
    await this.transport.sendCommand(`\x02${this.azId}G${this.stopAngle}\r`);
    await this.transport.sendCommand(`\x02${this.elId}G${this.stopAngle}\r`);
  }

  async sendRaw(cmd: string): Promise<string> {
    return this.transport.sendCommand(cmd);
  }
}

/** Parse Prosistel position response: "\x02A,?,290,R" -> 290 */
function parseProsistelResponse(response: string, multiplier: number): number | null {
  // Format: \x02<id>,?,<value>,R or <id>,?,<value>,R (STX may be stripped by transport)
  const match = response.match(/,\?\s*,\s*(-?\d+\.?\d*)\s*,/);
  if (match) return parseFloat(match[1]) / multiplier;
  return null;
}
