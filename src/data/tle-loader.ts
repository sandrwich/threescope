import { Vector3 } from 'three';
import type { Satellite } from '../types';
import { parseTLE, parseOMM } from '../astro/propagator';
import { getMirrorUrl, getCelestrakUrl, getSourceByGroup } from './tle-sources';
import { applyStdmag } from './catalog';

const CACHE_KEY_PREFIX = 'tlescope_tle_';
const CACHE_MAX_AGE_MS = __TLE_CACHE_MAX_AGE_H__ * 60 * 60 * 1000;
const CACHE_EVICT_AGE_MS = __TLE_CACHE_EVICT_AGE_H__ * 60 * 60 * 1000;
const RATELIMIT_KEY = 'tlescope_ratelimited';
const RATELIMIT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

export interface FetchResult {
  satellites: Satellite[];
  source: 'cache' | 'mirror' | 'network' | 'stale-cache';
  cacheAge?: number; // ms since cache was saved
  rateLimited?: boolean;
}

// ── Rate limiting ──

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

// ── Format auto-detection ──

/** Detect if text is OMM JSON (starts with '[') or TLE text. */
function isOMMJson(text: string): boolean {
  return text.trimStart()[0] === '[';
}

// ── Unified parsing (auto-detects JSON vs TLE) ──

/** Parse OMM JSON array directly via satellite.js json2satrec. */
function parseOMMJson(text: string): Satellite[] {
  const records: Record<string, unknown>[] = JSON.parse(text);
  const satellites: Satellite[] = [];
  for (const omm of records) {
    const sat = parseOMM(omm);
    if (sat) satellites.push(sat);
  }
  return satellites;
}

/** Parse satellite data from either OMM JSON or TLE text. */
export function parseSatelliteData(text: string): Satellite[] {
  return isOMMJson(text) ? parseOMMJson(text) : parseTLEText(text);
}

// ── TLE text parsing ──

export function parseTLEText(text: string): Satellite[] {
  const lines = text.split('\n').map(l => l.trimEnd()).filter(l => l.length > 0);
  const satellites: Satellite[] = [];

  let i = 0;
  while (i + 2 < lines.length) {
    if (lines[i + 1].startsWith('1 ') && lines[i + 2].startsWith('2 ')) {
      const sat = parseTLE(lines[i], lines[i + 1], lines[i + 2]);
      if (sat) satellites.push(sat);
      i += 3;
    } else if (lines[i].startsWith('1 ') && lines[i + 1].startsWith('2 ')) {
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

// ── Parallel parsing via Web Workers ──

const PARALLEL_THRESHOLD = 3000;
let workerPool: Worker[] | null = null;
let workersReady = 0;
let nextMsgId = 0;
const pendingWorkerCalls = new Map<number, (results: any[]) => void>();

function getWorkerPool(): Worker[] {
  if (workerPool) return workerPool;
  const count = Math.min(navigator.hardwareConcurrency || 4, 8);
  workerPool = [];
  for (let i = 0; i < count; i++) {
    const w = new Worker(
      new URL('./tle-parse-worker.ts', import.meta.url),
      { type: 'module' },
    );
    w.onmessage = (e: MessageEvent<{ ready?: boolean; results?: any[]; id?: number }>) => {
      if (e.data.ready) {
        workersReady++;
        return;
      }
      const resolve = pendingWorkerCalls.get(e.data.id!);
      if (resolve) {
        pendingWorkerCalls.delete(e.data.id!);
        resolve(e.data.results!);
      }
    };
    workerPool.push(w);
  }
  return workerPool;
}

/** Pre-create workers so module compilation overlaps with texture downloads. */
export function warmupTLEWorkers() {
  try { getWorkerPool(); } catch { /* workers unavailable */ }
}

/** Extract [name, line1, line2] triplets from TLE text without running twoline2satrec. */
function extractTLEEntries(text: string): [string, string, string][] {
  const lines = text.split('\n').map(l => l.trimEnd()).filter(l => l.length > 0);
  const entries: [string, string, string][] = [];
  let i = 0;
  while (i + 2 < lines.length) {
    if (lines[i + 1].startsWith('1 ') && lines[i + 2].startsWith('2 ')) {
      entries.push([lines[i], lines[i + 1], lines[i + 2]]);
      i += 3;
    } else if (lines[i].startsWith('1 ') && lines[i + 1].startsWith('2 ')) {
      entries.push([lines[i].substring(2, 7).trim(), lines[i], lines[i + 1]]);
      i += 2;
    } else {
      i++;
    }
  }
  return entries;
}

/** Count satellites in data text (auto-detects format). */
function countSatellites(text: string): number {
  if (isOMMJson(text)) {
    // Quick count without full parse — count array elements
    try {
      return JSON.parse(text).length;
    } catch {
      return 0;
    }
  }
  return countTleLines(text);
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

/** Parse satellite data, dispatching to web workers for large datasets (>3000 sats). */
export async function parseSatelliteDataParallel(text: string): Promise<Satellite[]> {
  const json = isOMMJson(text);

  // For JSON, parse once upfront to avoid double JSON.parse (count + extract)
  // For TLE, use cheap line scan for count, extract only if above threshold
  let items: unknown[] | null = null;
  let satCount: number;
  if (json) {
    try { items = JSON.parse(text); } catch { return []; }
    satCount = items!.length;
  } else {
    satCount = countTleLines(text);
  }

  if (satCount < PARALLEL_THRESHOLD || workersReady < 2) {
    // Sync path — reuse already-parsed JSON items if available
    if (json && items) {
      const satellites: Satellite[] = [];
      for (const omm of items as Record<string, unknown>[]) {
        const sat = parseOMM(omm);
        if (sat) satellites.push(sat);
      }
      return satellites;
    }
    return parseSatelliteData(text);
  }

  try {
    const pool = getWorkerPool();
    const useCount = Math.min(workersReady, pool.length);

    // For OMM JSON, items already parsed; for TLE, extract [name, line1, line2] triplets
    if (!items) items = extractTLEEntries(text);
    const chunkSize = Math.ceil(items.length / useCount);

    const promises: Promise<any[]>[] = [];
    for (let i = 0; i < useCount; i++) {
      const chunk = items.slice(i * chunkSize, (i + 1) * chunkSize);
      if (chunk.length === 0) break;
      promises.push(new Promise<any[]>((resolve) => {
        const id = nextMsgId++;
        pendingWorkerCalls.set(id, resolve);
        // Worker accepts either { entries, id } (TLE) or { ommRecords, id } (JSON)
        if (json) {
          pool[i].postMessage({ ommRecords: chunk, id });
        } else {
          pool[i].postMessage({ entries: chunk, id });
        }
      }));
    }

    const results = await Promise.all(promises);

    const satellites: Satellite[] = [];
    for (const chunk of results) {
      for (const raw of chunk) {
        raw.currentPos = new Vector3();
        satellites.push(raw as Satellite);
      }
    }
    applyStdmag(satellites);
    return satellites;
  } catch {
    return parseSatelliteData(text);
  }
}

// ── Cache ──

function loadFromCache(group: string, ignoreAge = false): { data: string; age: number } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + group);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    const age = Date.now() - ts;
    if (!ignoreAge && age > CACHE_MAX_AGE_MS) return null;
    return { data, age };
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
  const value = JSON.stringify({ ts: Date.now(), data, count });
  try {
    localStorage.setItem(CACHE_KEY_PREFIX + group, value);
  } catch {
    // localStorage full — evict oldest non-active TLE caches and retry
    console.warn(`[TLE cache] localStorage quota exceeded while caching "${group}", evicting stale entries...`);
    evictStaleTLECaches(group);
    try {
      localStorage.setItem(CACHE_KEY_PREFIX + group, value);
    } catch {
      console.warn(`[TLE cache] still over quota after eviction, cache for "${group}" not saved`);
    }
  }
}

/** Remove TLE cache entries that aren't currently enabled, oldest first. */
function evictStaleTLECaches(keepGroup: string) {
  // Read active source IDs from localStorage to avoid circular imports
  const activeGroups = new Set<string>();
  activeGroups.add(keepGroup);
  try {
    const enabledRaw = localStorage.getItem('satvisor_sources_enabled');
    if (enabledRaw) {
      // Enabled IDs are like "celestrak:visual" — the group is after the colon
      for (const id of JSON.parse(enabledRaw)) {
        const group = typeof id === 'string' ? id.split(':').slice(1).join(':') : '';
        if (group) activeGroups.add(group);
      }
    }
  } catch {}

  const entries: { key: string; ts: number }[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(CACHE_KEY_PREFIX)) continue;
    const group = key.slice(CACHE_KEY_PREFIX.length);
    if (activeGroups.has(group)) continue;
    try {
      const parsed = JSON.parse(localStorage.getItem(key)!);
      entries.push({ key, ts: parsed.ts ?? 0 });
    } catch {
      entries.push({ key, ts: 0 });
    }
  }
  // Evict oldest first
  entries.sort((a, b) => a.ts - b.ts);
  for (const e of entries) {
    console.warn(`[TLE cache] evicting inactive source "${e.key.slice(CACHE_KEY_PREFIX.length)}"`);
    localStorage.removeItem(e.key);
  }
}

/**
 * Delete all TLE cache entries older than CACHE_EVICT_AGE_MS.
 * Called once at startup to prevent unbounded localStorage growth.
 * Set VITE_TLE_CACHE_EVICT_AGE_H=0 to disable (useful for offline/air-gapped deployments).
 */
export function evictExpiredTLECaches() {
  if (!CACHE_EVICT_AGE_MS) return;
  const now = Date.now();
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(CACHE_KEY_PREFIX)) continue;
    try {
      const { ts } = JSON.parse(localStorage.getItem(key)!);
      if (now - ts > CACHE_EVICT_AGE_MS) toRemove.push(key);
    } catch {
      toRemove.push(key); // unparseable — remove
    }
  }
  for (const key of toRemove) {
    console.warn(`[TLE cache] evicting expired cache "${key.slice(CACHE_KEY_PREFIX.length)}" (older than ${__TLE_CACHE_EVICT_AGE_H__}h)`);
    localStorage.removeItem(key);
  }
}

/** Read cached data text from localStorage. Returns null if not cached. */
function readCachedText(cacheKey: string, isJsonWrapped: boolean): string | null {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return null;
    return isJsonWrapped ? (JSON.parse(raw) as { data: string }).data : raw;
  } catch {
    return null;
  }
}

/** Check if a NORAD ID exists in cached data (auto-detects format). */
export function cachedTleHasNorad(cacheKey: string, noradId: number, isJsonWrapped = true): boolean {
  const text = readCachedText(cacheKey, isJsonWrapped);
  if (!text) return false;
  if (isOMMJson(text)) {
    // JSON: search for "NORAD_CAT_ID":NNNNN
    return text.includes(`"NORAD_CAT_ID":${noradId}`) || text.includes(`"NORAD_CAT_ID": ${noradId}`);
  }
  // TLE: search for line-1 pattern
  const padded = String(noradId).padStart(5, '0');
  const needle = '1 ' + padded;
  return text.includes('\n' + needle) || text.startsWith(needle);
}

/** Get satellite count from a cached source. Uses stored count if available, falls back to scan. */
export function cachedTleSatCount(cacheKey: string, isJsonWrapped = true): number {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return 0;
    if (isJsonWrapped) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.count === 'number') return parsed.count;
      return countSatellites(parsed.data);
    }
    return countSatellites(raw);
  } catch {
    return 0;
  }
}

// ── Fetching with mirror-first chain ──

async function fetchWithTimeout(url: string, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return resp;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

export async function fetchTLEData(
  group: string,
  onStatus?: (msg: string) => void,
  forceRetry = false,
): Promise<FetchResult> {
  // Try localStorage cache first (skip if forcing refresh)
  const cached = !forceRetry ? loadFromCache(group) : null;
  if (cached) {
    onStatus?.('Loading cached data...');
    return { satellites: await parseSatelliteDataParallel(cached.data), source: 'cache', cacheAge: cached.age };
  }

  // Skip network if rate limited (unless manual retry)
  if (!forceRetry && isRateLimited()) {
    const stale = loadFromCache(group, true);
    if (stale) {
      onStatus?.('Rate limited, using cached data');
      return { satellites: await parseSatelliteDataParallel(stale.data), source: 'stale-cache', cacheAge: stale.age, rateLimited: true };
    }
    throw Object.assign(new Error('Rate limited by CelesTrak'), { rateLimited: true });
  }

  const src = getSourceByGroup(group);
  const isSpecial = src?.special ?? false;

  // 1. Try GitHub mirror (JSON format)
  const mirrorUrl = getMirrorUrl(group, isSpecial);
  try {
    onStatus?.('Fetching from mirror...');
    const resp = await fetchWithTimeout(mirrorUrl);
    if (resp.ok) {
      const text = await resp.text();
      if (text.trim().length > 0) {
        const satellites = await parseSatelliteDataParallel(text);
        saveToCache(group, text, satellites.length);
        clearRateLimit();
        return { satellites, source: 'mirror' };
      }
    }
  } catch {
    // Mirror unavailable — fall through to CelesTrak
  }

  // 2. Try CelesTrak direct (JSON format)
  const celestrakUrl = getCelestrakUrl(group, isSpecial);
  try {
    onStatus?.('Fetching from CelesTrak...');
    const resp = await fetchWithTimeout(celestrakUrl);
    if (resp.status === 403) {
      setRateLimited();
      throw Object.assign(new Error('HTTP 403 — rate limited'), { rateLimited: true });
    }
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    clearRateLimit();
    const satellites = await parseSatelliteDataParallel(text);
    saveToCache(group, text, satellites.length);
    return { satellites, source: 'network' };
  } catch (e) {
    // On failure, try stale cache (ignore age)
    const stale = loadFromCache(group, true);
    if (stale) {
      onStatus?.('Unavailable, using cached data');
      console.warn(`Fetch failed, using stale cache for "${group}"`);
      return {
        satellites: await parseSatelliteDataParallel(stale.data), source: 'stale-cache', cacheAge: stale.age,
        rateLimited: (e as any)?.rateLimited === true,
      };
    }
    onStatus?.('Unavailable, no cached data');
    throw e;
  }
}
