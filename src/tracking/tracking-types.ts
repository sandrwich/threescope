/**
 * Tracking output interface for antenna rotator integration.
 */
export interface TrackingOutput {
  readonly name: string;
  readonly connected: boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** Send a position update. Called each tracking cycle (~12Hz). */
  sendPosition(az: number, el: number): void;
}

/** Hamlib rotctld connection config. Protocol: "P az el\n" → "RPRT 0\n". */
export interface HamlibConfig {
  host: string;   // default: "localhost"
  port: number;   // default: 4533
}

/** EASYCOMM protocol config. Protocol: "AZxxx.x ELxxx.x\n" over TCP/serial. */
export interface EasycommConfig {
  host: string;
  port: number;
  version: 'I' | 'II' | 'III';
}

/** WebSocket API config. Sends JSON: { az, el, beamWidth, satName, noradId, range, timestamp }. */
export interface WebSocketConfig {
  url: string;
  reconnect: boolean;
  intervalMs: number;  // rate limit (default: 100ms = 10Hz)
}
