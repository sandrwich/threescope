import type { RigDriver, RigConnectOptions } from './protocol';
import { SerialTransport } from '../serial/transport';

/**
 * Kenwood/Elecraft CAT protocol over serial.
 * Uses `;` as command terminator. 11-digit frequency format.
 *
 * Commands:
 *   FA00145800000;  — set VFO A frequency (11 digits, Hz)
 *   FA;             — query VFO A frequency
 *   MD1;            — set mode (1=LSB, 2=USB, 3=CW, 4=FM, 5=AM, 6=FSK, 7=CW-R)
 */
const MODE_CODES: Record<string, string> = {
  LSB: '1', USB: '2', CW: '3', FM: '4', AM: '5', FSK: '6', 'CW-R': '7',
};

export class KenwoodDriver implements RigDriver {
  readonly name = 'Kenwood';
  private transport = new SerialTransport(';');

  get connected() { return this.transport.connected; }

  set onDisconnect(cb: (() => void) | null) { this.transport.onDisconnect = cb; }
  get onDisconnect() { return this.transport.onDisconnect; }

  isSupported(): boolean {
    return this.transport.isSupported();
  }

  async connect(options: RigConnectOptions): Promise<void> {
    await this.transport.open(options.baudRate ?? 9600);
    // Disable auto-information mode to prevent unsolicited status messages
    await this.transport.sendOnly('AI0;');
  }

  async disconnect(): Promise<void> {
    await this.transport.close();
  }

  async setFrequency(hz: number): Promise<void> {
    const freq = Math.round(hz).toString().padStart(11, '0');
    await this.transport.sendOnly(`FA${freq};`);
  }

  async getFrequency(): Promise<number | null> {
    let response = await this.transport.sendCommand('FA;');
    // If radio echoes the query back, read the actual response
    if (response === 'FA') {
      response = await this.transport.sendCommand('');
    }
    const match = response.match(/FA(\d+)/);
    if (!match) return null;
    const hz = parseInt(match[1], 10);
    return isNaN(hz) ? null : hz;
  }

  async setMode(mode: string): Promise<void> {
    const code = MODE_CODES[mode.toUpperCase()];
    if (!code) return;
    await this.transport.sendOnly(`MD${code};`);
  }
}
