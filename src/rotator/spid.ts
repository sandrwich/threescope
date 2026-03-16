import type { RotatorDriver, RotatorPosition, RotatorConnectOptions } from './protocol';
import { BinarySerialTransport } from '../serial/transport';

/**
 * SPID Rot2Prog / MD-01 rotator protocol driver.
 *
 * Binary 13-byte command frames, 12-byte response frames.
 * Supports Rot2Prog and MD-01/MD-02 controllers (az+el).
 * Frame: starts 0x57 ('W'), ends 0x20 (' ').
 */
export class SpidDriver implements RotatorDriver {
  readonly name = 'SPID';
  private transport = new BinarySerialTransport();
  private azResolution = 0;
  private elResolution = 0;

  get connected() { return this.transport.connected; }

  set onDisconnect(cb: (() => void) | null) { this.transport.onDisconnect = cb; }
  get onDisconnect() { return this.transport.onDisconnect; }
  set onLog(cb: import('../serial/console-types').OnLogCallback | null) { this.transport.onLog = cb; }
  get onLog() { return this.transport.onLog; }

  isSupported(): boolean {
    return this.transport.isSupported();
  }

  async connect(options: RotatorConnectOptions): Promise<void> {
    await this.transport.open(options.baudRate ?? 600);
    // Query position to learn pulse resolution
    const pos = await this.getPosition();
    if (!pos) throw new Error('No response from SPID controller — check baud rate');
  }

  async disconnect(): Promise<void> {
    await this.transport.close();
    this.azResolution = 0;
    this.elResolution = 0;
  }

  async setPosition(az: number, el: number): Promise<void> {
    if (this.azResolution === 0 || this.elResolution === 0) {
      // Need resolution first
      await this.getPosition();
      if (this.azResolution === 0) this.azResolution = 1;
      if (this.elResolution === 0) this.elResolution = 1;
    }
    const uAz = Math.round(this.azResolution * (360 + az));
    const uEl = Math.round(this.elResolution * (360 + el));
    const cmd = new Uint8Array(13);
    cmd[0] = 0x57;  // start
    cmd[1] = 0x30 + Math.floor(uAz / 1000);
    cmd[2] = 0x30 + Math.floor(uAz / 100) % 10;
    cmd[3] = 0x30 + Math.floor(uAz / 10) % 10;
    cmd[4] = 0x30 + uAz % 10;
    cmd[5] = this.azResolution;
    cmd[6] = 0x30 + Math.floor(uEl / 1000);
    cmd[7] = 0x30 + Math.floor(uEl / 100) % 10;
    cmd[8] = 0x30 + Math.floor(uEl / 10) % 10;
    cmd[9] = 0x30 + uEl % 10;
    cmd[10] = this.elResolution;
    cmd[11] = 0x2F;  // set position command
    cmd[12] = 0x20;  // end
    // Rot2Prog has no response; MD-01 returns a position frame
    await this.transport.sendAndReceive(cmd, 0x20, 3000).catch(() => {});
  }

  async getPosition(): Promise<RotatorPosition | null> {
    const cmd = new Uint8Array(13);
    cmd[0] = 0x57;
    cmd.fill(0x00, 1, 11);
    cmd[11] = 0x1F;  // get position command
    cmd[12] = 0x20;
    const resp = await this.transport.sendAndReceive(cmd, 0x20, 3000);
    if (resp.length < 12 || resp[0] !== 0x57) return null;
    // Store resolution for future set commands
    if (resp[5] > 0) this.azResolution = resp[5];
    if (resp[10] > 0) this.elResolution = resp[10];
    const az = resp[1] * 100 + resp[2] * 10 + resp[3] + resp[4] / 10.0 - 360;
    const el = resp[6] * 100 + resp[7] * 10 + resp[8] + resp[9] / 10.0 - 360;
    return { az, el };
  }

  async stop(): Promise<void> {
    const cmd = new Uint8Array(13);
    cmd[0] = 0x57;
    cmd.fill(0x00, 1, 11);
    cmd[11] = 0x0F;  // stop command
    cmd[12] = 0x20;
    await this.transport.sendAndReceive(cmd, 0x20, 3000).catch(() => {});
  }
}
