import type { RigDriver, RigConnectOptions } from './protocol';
import { SerialTransport } from '../serial/transport';

/**
 * Modern Yaesu CAT protocol over serial (FT-991A, FT-710, FTDX101, etc.).
 * Same `;` terminator as Kenwood but 9-digit frequency format and different mode codes.
 *
 * Commands:
 *   FA145800000;  — set VFO A frequency (9 digits, Hz — some models accept 8)
 *   FA;           — query VFO A frequency
 *   MD01;         — set mode (1=LSB, 2=USB, 3=CW-U, 4=FM, 5=AM, 6=RTTY, 7=CW-L)
 */
const MODE_CODES: Record<string, string> = {
  LSB: '1', USB: '2', CW: '3', 'CW-U': '3', FM: '4', AM: '5',
  RTTY: '6', 'CW-L': '7', 'DATA-LSB': '8', 'RTTY-USB': '9',
  'DATA-FM': 'A', 'FM-N': 'B', 'DATA-USB': 'C', 'AM-N': 'D',
};

export class YaesuDriver implements RigDriver {
  readonly name = 'Yaesu';
  private transport = new SerialTransport(';');

  get connected() { return this.transport.connected; }

  set onDisconnect(cb: (() => void) | null) { this.transport.onDisconnect = cb; }
  get onDisconnect() { return this.transport.onDisconnect; }

  isSupported(): boolean {
    return this.transport.isSupported();
  }

  async connect(options: RigConnectOptions): Promise<void> {
    await this.transport.open(options.baudRate ?? 38400);
    // Disable auto-information mode to prevent unsolicited status messages
    await this.transport.sendOnly('AI0;');
  }

  async disconnect(): Promise<void> {
    await this.transport.close();
  }

  async setFrequency(hz: number): Promise<void> {
    const freq = Math.round(hz).toString().padStart(9, '0');
    await this.transport.sendOnly(`FA${freq};`);
  }

  async getFrequency(): Promise<number | null> {
    const response = await this.transport.sendCommand('FA;');
    const match = response.match(/FA(\d+)/);
    if (!match) return null;
    const hz = parseInt(match[1], 10);
    return isNaN(hz) ? null : hz;
  }

  async setMode(mode: string): Promise<void> {
    const code = MODE_CODES[mode.toUpperCase()];
    if (!code) return;
    await this.transport.sendOnly(`MD0${code};`);
  }
}
