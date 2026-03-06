// Re-export SerialTransport from shared location for backward compatibility
export { SerialTransport } from '../serial/transport';

/** Connection mode for the rotator. */
export type RotatorMode = 'serial' | 'network';

/** Serial protocol variants. */
export type SerialProtocol = 'gs232' | 'easycomm';

/** Current rotator position as reported by readback. */
export interface RotatorPosition {
  az: number;
  el: number;
}

export interface RotatorConnectOptions {
  baudRate?: number;
  wsUrl?: string;
}

/** Abstract interface all protocol drivers implement. */
export interface RotatorDriver {
  readonly name: string;
  readonly connected: boolean;
  isSupported(): boolean;
  connect(options: RotatorConnectOptions): Promise<void>;
  disconnect(): Promise<void>;
  setPosition(az: number, el: number): Promise<void>;
  getPosition(): Promise<RotatorPosition | null>;
  stop(): Promise<void>;
  onDisconnect: (() => void) | null;
}
