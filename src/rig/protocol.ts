/** Standard radio operating modes sent to rigs via setMode(). */
export const RADIO_MODES = ['FM', 'USB', 'LSB', 'CW', 'AM'] as const;

/** Map SatNOGS signal mode names to radio operating modes. */
const SATNOGS_TO_RADIO: Record<string, string> = {
  FM: 'FM', AFSK: 'FM', APT: 'FM', LRPT: 'FM', NFM: 'FM',
  USB: 'USB', BPSK: 'USB', SSTV: 'USB', FSK: 'USB', GFSK: 'USB',
  LSB: 'LSB', CW: 'CW', AM: 'AM',
};

/** Convert a SatNOGS mode string to a radio mode, or '' if unknown. */
export function satnogsModeToRadio(satnogsMode: string | null): string {
  if (!satnogsMode) return '';
  return SATNOGS_TO_RADIO[satnogsMode.toUpperCase()] ?? '';
}

/** Connection mode for the rig. */
export type RigMode = 'serial' | 'network';

/** Serial protocol variants for rig control. */
export type RigSerialProtocol = 'kenwood' | 'yaesu' | 'yaesu-legacy' | 'civ';

export interface RigConnectOptions {
  baudRate?: number;
  wsUrl?: string;
  civAddress?: number;
}

/** Abstract interface all rig protocol drivers implement. */
export interface RigDriver {
  readonly name: string;
  readonly connected: boolean;
  isSupported(): boolean;
  connect(options: RigConnectOptions): Promise<void>;
  disconnect(): Promise<void>;
  setFrequency(hz: number): Promise<void>;
  getFrequency(): Promise<number | null>;
  setMode?(mode: string): Promise<void>;
  onDisconnect: (() => void) | null;
}
