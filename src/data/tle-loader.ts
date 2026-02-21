import type { Satellite } from '../types';
import { parseTLE } from '../astro/propagator';
import { getCelestrakUrl } from './tle-sources';

const CACHE_KEY_PREFIX = 'tlescope_tle_';
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface FetchResult {
  satellites: Satellite[];
  source: 'cache' | 'network' | 'stale-cache';
  cacheAge?: number; // ms since cache was saved
}

export async function fetchTLEData(
  group: string,
  onStatus?: (msg: string) => void
): Promise<FetchResult> {
  // Try localStorage cache first
  const cacheAge = getCacheAge(group);
  if (cacheAge !== null && cacheAge < CACHE_MAX_AGE_MS) {
    onStatus?.('Loading cached data...');
    const cached = loadFromCache(group)!;
    return { satellites: parseTLEText(cached), source: 'cache', cacheAge };
  }

  onStatus?.('Fetching from CelesTrak...');
  const url = getCelestrakUrl(group);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    saveToCache(group, text);
    return { satellites: parseTLEText(text), source: 'network' };
  } catch (e) {
    // On failure, try stale cache (ignore age)
    const stale = loadFromCache(group, true);
    if (stale) {
      const age = getCacheAge(group);
      onStatus?.('CelesTrak unavailable, using cached data');
      console.warn(`CelesTrak fetch failed, using stale cache for "${group}"`);
      return { satellites: parseTLEText(stale), source: 'stale-cache', cacheAge: age ?? undefined };
    }
    onStatus?.('CelesTrak unavailable, no cached data');
    throw new Error(`Failed to fetch TLE data: ${e}`);
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

function getCacheAge(group: string): number | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + group);
    if (!raw) return null;
    const { ts } = JSON.parse(raw);
    return Date.now() - ts;
  } catch {
    return null;
  }
}

function saveToCache(group: string, data: string) {
  try {
    localStorage.setItem(CACHE_KEY_PREFIX + group, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
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
