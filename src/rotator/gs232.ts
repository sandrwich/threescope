import type { RotatorDriver, RotatorPosition, RotatorConnectOptions } from './protocol';
import { SerialTransport } from './protocol';

/**
 * GS-232A/B rotator protocol driver.
 *
 * Command reference:
 *   W{az:03d} {el:03d}\r  — set position (GS-232B format)
 *   C2\r                   — query position
 *   S\r                    — stop rotation
 *
 * Response formats (both supported):
 *   +0135+045              — numeric format
 *   AZ=135.0  EL=045.0     — verbose format
 */
export class GS232Driver implements RotatorDriver {
  readonly name = 'GS-232';
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
    const azStr = Math.round(Math.max(0, az)).toString().padStart(3, '0');
    const elStr = Math.round(Math.max(0, Math.min(90, el))).toString().padStart(3, '0');
    await this.transport.sendOnly(`W${azStr} ${elStr}\r`);
  }

  async getPosition(): Promise<RotatorPosition | null> {
    const response = await this.transport.sendCommand('C2\r');
    return parseGS232Response(response);
  }

  async stop(): Promise<void> {
    await this.transport.sendOnly('S\r');
  }

  async sendRaw(cmd: string): Promise<string> {
    return this.transport.sendCommand(cmd);
  }
}

/** Parse GS-232 position response — handles both +AAAA+EEEE and AZ=xxx EL=xxx formats. */
function parseGS232Response(response: string): RotatorPosition | null {
  // Format 1: +0135+045 or +0135.0+045.0
  const numMatch = response.match(/\+(\d+\.?\d*)\+(\d+\.?\d*)/);
  if (numMatch) {
    return { az: parseFloat(numMatch[1]), el: parseFloat(numMatch[2]) };
  }

  // Format 2: AZ=135.0  EL=045.0 (or AZ=135 EL=045)
  const verboseMatch = response.match(/AZ[=:]?\s*(\d+\.?\d*)\s+EL[=:]?\s*(\d+\.?\d*)/i);
  if (verboseMatch) {
    return { az: parseFloat(verboseMatch[1]), el: parseFloat(verboseMatch[2]) };
  }

  return null;
}
