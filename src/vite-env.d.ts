/// <reference types="vite/client" />
/// <reference types="svelte" />

declare module '*.glsl?raw' {
  const value: string;
  export default value;
}

declare const __COMMIT_HASH__: string;
declare const __COMMIT_DATE__: string;
/** Build-time forced texture quality: 'lite', 'full', or '' (user choice). */
declare const __FORCED_TEXTURE_QUALITY__: '' | 'lite' | 'full';
/** Build-time override for satvisor-data mirror base URL (no trailing slash). Empty = default GitHub mirror. */
declare const __DATA_MIRROR__: string;
/** Build-time override for CelesTrak base URL (no trailing slash). Empty = default https://celestrak.org */
declare const __CELESTRAK_BASE__: string;
/** Build-time override for SatNOGS base URL (no trailing slash). Empty = default https://db.satnogs.org */
declare const __SATNOGS_BASE__: string;
/** Build-time flag to enable Buttplug/toys feedback target. Default true. Set VITE_FEEDBACK_TOYS=false to disable. */
declare const __FEEDBACK_TOYS__: boolean;
/** TLE cache max age in hours before refetch. Default 1. */
declare const __TLE_CACHE_MAX_AGE_H__: number;
/** TLE cache evict age in hours — entries older than this are deleted on startup. Default 24. Set 0 to disable. */
declare const __TLE_CACHE_EVICT_AGE_H__: number;

// Web Serial API types (not yet in default lib DOM)
interface SerialPortOpenOptions {
  baudRate: number;
  dataBits?: number;
  stopBits?: number;
  parity?: 'none' | 'even' | 'odd';
  bufferSize?: number;
  flowControl?: 'none' | 'hardware';
}

interface SerialPort {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  open(options: SerialPortOpenOptions): Promise<void>;
  close(): Promise<void>;
  getInfo(): { usbVendorId?: number; usbProductId?: number };
}

interface SerialPortRequestOptions {
  filters?: { usbVendorId?: number; usbProductId?: number }[];
}

interface Serial extends EventTarget {
  requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>;
  getPorts(): Promise<SerialPort[]>;
}

interface Navigator {
  readonly serial: Serial;
}
