import type { RotatorDriver, RotatorPosition, RotatorConnectOptions } from './protocol';
import { SerialTransport } from './protocol';

/**
 * M2 RC2800 rotator protocol driver.
 *
 * Text-based, CR-terminated. Supports new protocol (RC2800)
 * and old protocol (RC2800P / early models).
 *
 * Set: "A<az>\r" / "E<el>\r"
 * Get: "A\r" -> "A P=180.0 S=9 MV\r" or "A=180.0 S=9 S\r"
 * Stop: "A\r" "S\r" "E\r" "S\r"
 */
export class RC2800Driver implements RotatorDriver {
  readonly name = 'RC2800';
  private transport = new SerialTransport('\r');

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
  }

  async disconnect(): Promise<void> {
    await this.transport.close();
  }

  async setPosition(az: number, el: number): Promise<void> {
    const azVal = Math.round(az);
    const elVal = Math.round(Math.max(0, Math.min(90, el)));
    // Send az and el as separate commands
    await this.transport.sendCommand(`A${azVal}\r`);
    await this.transport.sendCommand(`E${elVal}\r`);
  }

  async getPosition(): Promise<RotatorPosition | null> {
    const azResp = await this.transport.sendCommand('A\r');
    const elResp = await this.transport.sendCommand('E\r');
    const az = parseRC2800Axis(azResp, 'A');
    const el = parseRC2800Axis(elResp, 'E');
    if (az === null || el === null) return null;
    return { az, el };
  }

  async stop(): Promise<void> {
    await this.transport.sendCommand('A\r');
    await this.transport.sendCommand('S\r');
    await this.transport.sendCommand('E\r');
    await this.transport.sendCommand('S\r');
  }

  async sendRaw(cmd: string): Promise<string> {
    return this.transport.sendCommand(cmd);
  }
}

/**
 * Parse RC2800 axis response.
 * Handles both new ("A P= 98.1 S=9 MV") and old ("A=180.0 S=9 S") formats.
 */
function parseRC2800Axis(response: string, axis: string): number | null {
  // New protocol: "A P= 180.0 S=9 MV" or "E P= 45.0 S=9 S"
  const newMatch = response.match(new RegExp(`${axis}\\s*P\\s*=\\s*(-?\\d+\\.?\\d*)`, 'i'));
  if (newMatch) return parseFloat(newMatch[1]);
  // Old protocol: "A=180.0 S=9 MV" or "E=43.7 S=9 S"
  const oldMatch = response.match(new RegExp(`${axis}\\s*=\\s*(-?\\d+\\.?\\d*)`, 'i'));
  if (oldMatch) return parseFloat(oldMatch[1]);
  return null;
}
