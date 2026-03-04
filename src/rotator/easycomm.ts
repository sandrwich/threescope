import type { RotatorDriver, RotatorPosition, RotatorConnectOptions } from './protocol';
import { SerialTransport } from './protocol';

/**
 * EasyComm II rotator protocol over Web Serial.
 *
 * Command reference:
 *   AZ135.0 EL45.0\r  — set position
 *   AZ EL\r            — query position (response: AZ135.0 EL45.0)
 *   SA SE\r             — stop azimuth and elevation
 */
export class EasyCommDriver implements RotatorDriver {
  readonly name = 'EasyComm II';
  private transport = new SerialTransport();

  get connected() { return this.transport.connected; }

  set onDisconnect(cb: (() => void) | null) { this.transport.onDisconnect = cb; }
  get onDisconnect() { return this.transport.onDisconnect; }

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
    const azVal = Math.max(0, Math.min(360, az)).toFixed(1);
    const elVal = Math.max(0, Math.min(90, el)).toFixed(1);
    await this.transport.sendOnly(`AZ${azVal} EL${elVal}\r`);
  }

  async getPosition(): Promise<RotatorPosition | null> {
    const response = await this.transport.sendCommand('AZ EL\r');
    return parseEasyCommResponse(response);
  }

  async stop(): Promise<void> {
    await this.transport.sendOnly('SA SE\r');
  }
}

/** Parse EasyComm position response: AZ135.0 EL45.0 */
function parseEasyCommResponse(response: string): RotatorPosition | null {
  const match = response.match(/AZ\s*(\d+\.?\d*)\s*EL\s*(\d+\.?\d*)/i);
  if (match) {
    return { az: parseFloat(match[1]), el: parseFloat(match[2]) };
  }
  return null;
}
