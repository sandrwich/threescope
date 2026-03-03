/**
 * Runtime catalog data loader.
 * Fetches satnogs + stdmag from satvisor-data mirror, caches in localStorage.
 */
import { getMirrorCatalogUrl } from './tle-sources';

const CACHE_PREFIX = 'threescope_catalog_';
const CACHE_TS_SUFFIX = '_ts';
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const REFRESH_AGE_MS = 24 * 60 * 60 * 1000; // 1 day — background refresh

// ── localStorage helpers (no double-serialization) ──

function cacheRead(name: string): { text: string; age: number } | null {
  try {
    const text = localStorage.getItem(CACHE_PREFIX + name);
    if (!text) return null;
    const ts = Number(localStorage.getItem(CACHE_PREFIX + name + CACHE_TS_SUFFIX));
    if (!ts) return { text, age: Infinity };
    const age = Date.now() - ts;
    return { text, age };
  } catch { return null; }
}

function cacheWrite(name: string, text: string) {
  try {
    localStorage.setItem(CACHE_PREFIX + name, text);
    localStorage.setItem(CACHE_PREFIX + name + CACHE_TS_SUFFIX, String(Date.now()));
  } catch { /* localStorage full */ }
}

// ── stdmag (visual magnitudes) ──

let _stdmagMap: Map<number, number> | null = null;
let _stdmagPromise: Promise<Map<number, number>> | null = null;
let _onStdmagRefresh: (() => void) | null = null;

/** Register a callback invoked when stdmag data is refreshed in the background. */
export function onStdmagRefresh(cb: () => void) {
  _onStdmagRefresh = cb;
}

/** Get the stdmag map (synchronous — returns null if not yet loaded). */
export function getStdmagMap(): Map<number, number> | null {
  return _stdmagMap;
}

/** Look up stdmag for a NORAD ID. Returns null if data not loaded or unknown. */
export function getStdmag(noradId: number): number | null {
  return _stdmagMap?.get(noradId) ?? null;
}

function parseStdmag(json: string): Map<number, number> {
  const raw = JSON.parse(json) as Record<string, number>;
  const map = new Map<number, number>();
  for (const [k, v] of Object.entries(raw)) {
    map.set(Number(k), v);
  }
  return map;
}

/** Load stdmag data: localStorage cache → mirror fetch → cache. */
export async function loadStdmag(): Promise<Map<number, number>> {
  if (_stdmagMap) return _stdmagMap;
  if (_stdmagPromise) return _stdmagPromise;

  _stdmagPromise = (async () => {
    // Try localStorage cache
    const cached = cacheRead('stdmag');
    if (cached && cached.age < CACHE_MAX_AGE_MS) {
      try {
        _stdmagMap = parseStdmag(cached.text);
        // Refresh in background if older than 1 day
        if (cached.age > REFRESH_AGE_MS) {
          fetchAndCacheStdmag().catch(() => {});
        }
        return _stdmagMap;
      } catch { /* corrupt cache */ }
    }

    // Fetch from mirror
    return fetchAndCacheStdmag();
  })();

  return _stdmagPromise;
}

async function fetchAndCacheStdmag(): Promise<Map<number, number>> {
  try {
    const resp = await fetch(getMirrorCatalogUrl('stdmag'));
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    _stdmagMap = parseStdmag(text);
    cacheWrite('stdmag', text);
    _onStdmagRefresh?.();
    return _stdmagMap;
  } catch {
    // If fetch fails and we have no data, return empty map
    if (!_stdmagMap) _stdmagMap = new Map();
    return _stdmagMap;
  }
}

/**
 * Apply stdmag values to satellites that were parsed before data was available.
 * Call after loadStdmag() resolves.
 */
export function applyStdmag(satellites: { noradId: number; stdMag: number | null }[]) {
  if (!_stdmagMap) return;
  for (const sat of satellites) {
    if (sat.stdMag === null) {
      sat.stdMag = _stdmagMap.get(sat.noradId) ?? null;
    }
  }
}

// ── satnogs (satellite metadata + transmitters) ──

type RawSatnogsData = Record<string, { sat?: (string | null)[]; tx: (string | number | null)[][] }>;

let _satnogsData: RawSatnogsData | null = null;
let _satnogsPromise: Promise<RawSatnogsData> | null = null;

/** Get satnogs data (synchronous — returns null if not yet loaded). */
export function getSatnogsRaw(): RawSatnogsData | null {
  return _satnogsData;
}

/** Load satnogs data: localStorage cache → mirror fetch → cache. */
export async function loadSatnogs(): Promise<RawSatnogsData> {
  if (_satnogsData) return _satnogsData;
  if (_satnogsPromise) return _satnogsPromise;

  _satnogsPromise = (async () => {
    const cached = cacheRead('satnogs');
    if (cached && cached.age < CACHE_MAX_AGE_MS) {
      try {
        _satnogsData = JSON.parse(cached.text) as RawSatnogsData;
        if (cached.age > REFRESH_AGE_MS) {
          fetchAndCacheSatnogs().catch(() => {});
        }
        return _satnogsData;
      } catch { /* corrupt cache */ }
    }

    return fetchAndCacheSatnogs();
  })();

  return _satnogsPromise;
}

async function fetchAndCacheSatnogs(): Promise<RawSatnogsData> {
  try {
    const resp = await fetch(getMirrorCatalogUrl('satnogs'));
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    _satnogsData = JSON.parse(text) as RawSatnogsData;
    cacheWrite('satnogs', text);
    return _satnogsData;
  } catch {
    if (!_satnogsData) _satnogsData = {};
    return _satnogsData;
  }
}
