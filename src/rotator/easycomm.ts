import type { RotatorDriver, RotatorPosition, RotatorConnectOptions } from './protocol';
import { SerialTransport } from './protocol';

/**
 * EasyComm rotator protocol driver (compatible with II and III).
 *
 * Command reference:
 *   AZ135.0 EL45.0\n  — set position
 *   AZ EL\n            — query position (response: AZ135.0 EL45.0)
 *   SA SE\n             — stop azimuth and elevation
 */
export class EasyCommDriver implements RotatorDriver {
  readonly name = 'EasyComm';
  private transport = new SerialTransport();

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
    // Az clamping is handled by rotatorStore (supports extended range for meridian flip)
    const azVal = az.toFixed(1);
    const elVal = Math.max(0, Math.min(90, el)).toFixed(1);
    await this.transport.sendOnly(`AZ${azVal} EL${elVal}\n`);
  }

  async getPosition(): Promise<RotatorPosition | null> {
    const response = await this.transport.sendCommand('AZ EL\n');
    return parseEasyCommResponse(response);
  }

  async stop(): Promise<void> {
    await this.transport.sendOnly('SA SE\n');
  }

  async sendRaw(cmd: string): Promise<string> {
    return this.transport.sendCommand(cmd);
  }
}

/** Parse EasyComm position response: AZ135.0 EL45.0 (supports negative values for extended-range rotators) */
function parseEasyCommResponse(response: string): RotatorPosition | null {
  const match = response.match(/AZ\s*(-?\d+\.?\d*)\s*EL\s*(-?\d+\.?\d*)/i);
  if (match) {
    return { az: parseFloat(match[1]), el: parseFloat(match[2]) };
  }
  return null;
}
