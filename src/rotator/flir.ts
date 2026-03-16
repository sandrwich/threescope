import type { RotatorDriver, RotatorPosition, RotatorConnectOptions } from './protocol';
import { SerialTransport } from './protocol';

/**
 * FLIR PTU (Pan-Tilt Unit) protocol driver.
 *
 * Text-based, LF-terminated. Position encoded as arcsecond-based
 * pulse counts with resolution queried at connect.
 *
 * Supports PTU-D48, PTU-D100, PTU-D300 and other FLIR PTU models.
 * 9600 baud, 8N1.
 */
export class FlirDriver implements RotatorDriver {
  readonly name = 'FLIR PTU';
  private transport = new SerialTransport('\n');
  private panRes = 92.5714;   // arcseconds per position (default D48)
  private tiltRes = 46.2857;

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
    // Disable echo and verbose mode
    await this.transport.sendOnly('ED\n');
    const ftResp = await this.transport.sendCommand('FT\n');
    if (!ftResp.startsWith('*')) throw new Error('FLIR PTU not responding — check connection');
    // Query pan/tilt resolution (arcseconds per position)
    const prResp = await this.transport.sendCommand('PR\n');
    const prMatch = prResp.match(/\*\s*(-?\d+\.?\d*)/);
    if (prMatch) this.panRes = parseFloat(prMatch[1]);
    const trResp = await this.transport.sendCommand('TR\n');
    const trMatch = trResp.match(/\*\s*(-?\d+\.?\d*)/);
    if (trMatch) this.tiltRes = parseFloat(trMatch[1]);
  }

  async disconnect(): Promise<void> {
    await this.transport.close();
  }

  async setPosition(az: number, el: number): Promise<void> {
    const panPos = Math.round((az * 3600) / this.panRes);
    const tiltPos = Math.round(-((90 - el) * 3600) / this.tiltRes);
    await this.transport.sendCommand(`PP${panPos} TP${tiltPos}\n`);
  }

  async getPosition(): Promise<RotatorPosition | null> {
    const ppResp = await this.transport.sendCommand('PP\n');
    const tpResp = await this.transport.sendCommand('TP\n');
    const ppMatch = ppResp.match(/\*\s*(-?\d+)/);
    const tpMatch = tpResp.match(/\*\s*(-?\d+)/);
    if (!ppMatch || !tpMatch) return null;
    const az = (parseInt(ppMatch[1]) * this.panRes) / 3600;
    const el = 90 + (parseInt(tpMatch[1]) * this.tiltRes) / 3600;
    return { az, el };
  }

  async stop(): Promise<void> {
    await this.transport.sendOnly('H\n');
  }

  async sendRaw(cmd: string): Promise<string> {
    return this.transport.sendCommand(cmd);
  }
}
