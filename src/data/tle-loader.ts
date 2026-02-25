import type { Satellite } from '../types';
import { parseTLE } from '../astro/propagator';
import { getCelestrakUrl } from './tle-sources';

const CACHE_KEY_PREFIX = 'tlescope_tle_';
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const RATELIMIT_KEY = 'tlescope_ratelimited';
const RATELIMIT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

export interface FetchResult {
  satellites: Satellite[];
  source: 'cache' | 'network' | 'stale-cache';
  cacheAge?: number; // ms since cache was saved
  rateLimited?: boolean;
}

export function isRateLimited(): boolean {
  try {
    const ts = localStorage.getItem(RATELIMIT_KEY);
    if (!ts) return false;
    return Date.now() - Number(ts) < RATELIMIT_COOLDOWN_MS;
  } catch {
    return false;
  }
}

export function clearRateLimit() {
  try { localStorage.removeItem(RATELIMIT_KEY); } catch {}
}

function setRateLimited() {
  try { localStorage.setItem(RATELIMIT_KEY, String(Date.now())); } catch {}
}

export async function fetchTLEData(
  group: string,
  onStatus?: (msg: string) => void,
  forceRetry = false,
): Promise<FetchResult> {
  // Try localStorage cache first (skip if forcing refresh)
  const cacheAge = getCacheAge(group);
  if (!forceRetry && cacheAge !== null && cacheAge < CACHE_MAX_AGE_MS) {
    onStatus?.('Loading cached data...');
    const cached = loadFromCache(group)!;
    return { satellites: parseTLEText(cached), source: 'cache', cacheAge };
  }

  // Skip network if rate limited (unless manual retry)
  if (!forceRetry && isRateLimited()) {
    const stale = loadFromCache(group, true);
    if (stale) {
      const age = getCacheAge(group);
      onStatus?.('Rate limited, using cached data');
      return { satellites: parseTLEText(stale), source: 'stale-cache', cacheAge: age ?? undefined, rateLimited: true };
    }
    throw Object.assign(new Error('Rate limited by CelesTrak'), { rateLimited: true });
  }

  onStatus?.('Fetching from CelesTrak...');
  const url = getCelestrakUrl(group);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (resp.status === 403) {
      setRateLimited();
      throw Object.assign(new Error('HTTP 403 — rate limited'), { rateLimited: true });
    }
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    clearRateLimit();
    const satellites = parseTLEText(text);
    saveToCache(group, text, satellites.length);
    return { satellites, source: 'network' };
  } catch (e) {
    // On failure, try stale cache (ignore age)
    const stale = loadFromCache(group, true);
    if (stale) {
      const age = getCacheAge(group);
      onStatus?.('CelesTrak unavailable, using cached data');
      console.warn(`CelesTrak fetch failed, using stale cache for "${group}"`);
      return {
        satellites: parseTLEText(stale), source: 'stale-cache', cacheAge: age ?? undefined,
        rateLimited: (e as any)?.rateLimited === true,
      };
    }
    onStatus?.('CelesTrak unavailable, no cached data');
    throw e;
  }
}

function loadFromCache(group: string, ignoreAge = false): string | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + group);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (!ignoreAge && Date.now() - ts > CACHE_MAX_AGE_MS) return null;
    return data;
  } catch {
    return null;
  }
}

export function getCacheAge(group: string): number | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + group);
    if (!raw) return null;
    const { ts } = JSON.parse(raw);
    return Date.now() - ts;
  } catch {
    return null;
  }
}

function saveToCache(group: string, data: string, count?: number) {
  try {
    localStorage.setItem(CACHE_KEY_PREFIX + group, JSON.stringify({ ts: Date.now(), data, count }));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

/** Read cached TLE text from localStorage. Returns null if not cached. */
function readCachedText(cacheKey: string, isJsonWrapped: boolean): string | null {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return null;
    return isJsonWrapped ? (JSON.parse(raw) as { data: string }).data : raw;
  } catch {
    return null;
  }
}

/** Check if a NORAD ID exists in a cached TLE text (string search, no parsing). */
export function cachedTleHasNorad(cacheKey: string, noradId: number, isJsonWrapped = true): boolean {
  const text = readCachedText(cacheKey, isJsonWrapped);
  if (!text) return false;
  const padded = String(noradId).padStart(5, '0');
  const needle = '1 ' + padded;
  return text.includes('\n' + needle) || text.startsWith(needle);
}

/** Get satellite count from a cached TLE source. Uses stored count if available, falls back to text scan. */
export function cachedTleSatCount(cacheKey: string, isJsonWrapped = true): number {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return 0;
    if (isJsonWrapped) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.count === 'number') return parsed.count;
      // Fallback: scan text for old cache entries without count
      return countTleLines(parsed.data);
    }
    return countTleLines(raw);
  } catch {
    return 0;
  }
}

function countTleLines(text: string): number {
  let count = text.startsWith('1 ') ? 1 : 0;
  let pos = 0;
  while ((pos = text.indexOf('\n1 ', pos)) !== -1) {
    count++;
    pos += 3;
  }
  return count;
}

export function parseTLEText(text: string): Satellite[] {
  const lines = text.split('\n').map(l => l.trimEnd()).filter(l => l.length > 0);
  const satellites: Satellite[] = [];

  let i = 0;
  while (i + 2 < lines.length) {
    // Try to detect 3-line format (name + line1 + line2) or 2-line format (line1 + line2)
    if (lines[i + 1].startsWith('1 ') && lines[i + 2].startsWith('2 ')) {
      // 3-line: name, line1, line2
      const sat = parseTLE(lines[i], lines[i + 1], lines[i + 2]);
      if (sat) satellites.push(sat);
      i += 3;
    } else if (lines[i].startsWith('1 ') && lines[i + 1].startsWith('2 ')) {
      // 2-line: line1, line2 (no name)
      const noradId = lines[i].substring(2, 7).trim();
      const sat = parseTLE(noradId, lines[i], lines[i + 1]);
      if (sat) satellites.push(sat);
      i += 2;
    } else {
      i++;
    }
  }

  return satellites;
}
