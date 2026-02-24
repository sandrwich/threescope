#!/usr/bin/env npx tsx
/**
 * generate-stdmag.ts
 *
 * Generates src/data/stdmag.json — a lookup table of satellite standard visual
 * magnitudes keyed by NORAD catalog number.
 *
 * Data sources (in priority order):
 *   1. McCants qs.mag  — observationally-derived visual magnitudes (~4,100 sats)
 *   2. CelesTrak SATCAT — RCS (radar cross-section) converted to estimated mag
 *   3. Built-in name-prefix heuristics — for known constellations missing from both
 *
 * Usage:
 *   npx tsx scripts/generate-stdmag.ts
 *
 * Output:
 *   src/data/stdmag.json — compact { [noradId]: stdMag } mapping
 *
 * The generated file should be committed to the repo so the app works offline
 * without fetching these sources at runtime.
 *
 * See .docs/magnitude.md for full documentation on sources and accuracy.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MCCANTS_URL = 'https://raw.githubusercontent.com/barolfe/satellite-tracker/master/qs.mag';
const SATCAT_URL = 'https://celestrak.org/pub/satcat.csv';

/**
 * Convert RCS (m²) to approximate standard magnitude.
 *
 * Based on the reflected-sunlight formula for a Lambertian sphere:
 *   stdMag = -26.74 - 2.5 * log10(albedo * RCS / (4π * range²))
 * evaluated at range = 1000 km, 90° phase angle.
 *
 * At 90° phase for a Lambertian sphere, the phase function F(90°) = 1/π,
 * so the effective reflected fraction is albedo * F(90°) = albedo/π.
 *
 * The Sun's apparent magnitude is -26.74. At 1000 km (10⁶ m):
 *   stdMag = -26.74 - 2.5 * log10(albedo * RCS / (4π² * 10¹²))
 *
 * We use albedo = 0.15 (typical spacecraft average, between white paint ~0.2
 * and solar panels ~0.05).
 */
function rcsToStdMag(rcsM2: number): number {
  const albedo = 0.15;
  // Fraction of incident sunlight reflected toward observer at 1000 km, 90° phase
  const flux = (albedo * rcsM2) / (4 * Math.PI * Math.PI * 1e12);
  return -26.74 - 2.5 * Math.log10(flux);
}

/**
 * McCants "QuickSat" magnitude convention:
 * Brightness at 1000 km, FULL (100%) illumination, brightest orientation.
 * Our model uses 90° phase (half illumination) as the reference.
 *
 * The Lambertian phase function ratio: F(0°)/F(90°) = 2 (full/half).
 * In magnitudes: -2.5 * log10(2) ≈ -0.75
 * So McCants magnitudes are ~0.75 mag brighter than our 90° convention.
 *
 * Additionally, McCants uses "brightest likely" orientation which is
 * another ~0.3–0.7 mag brighter than average. We split the difference
 * and add 1.0 mag to convert McCants → our convention.
 */
const MCCANTS_OFFSET = 1.0;

// ---------------------------------------------------------------------------
// Name-prefix heuristics for constellations missing from both sources
// ---------------------------------------------------------------------------

// Values are standard magnitude at 1000 km, 90° phase angle.
// Sources: McCants qs.mag (with +1.0 offset), Mallama et al. papers.
// IMPORTANT: stdMag is intrinsic brightness at 1000 km — NOT apparent
// brightness at orbital altitude. The range formula handles distance.
const PREFIX_RULES: [string, number][] = [
  ['STARLINK',    7.0],   // Mallama 2021/2024: VisorSat 7.2, Gen2 Mini 7.9
  ['ONEWEB',      7.0],   // Mallama 2020/2022: 7.05 ± 0.62
  ['IRIDIUM',     6.5],   // McCants 5.5 full-phase + 1.0 offset
  ['GLOBALSTAR',  5.0],   // McCants 3.5-4.5 full-phase + 1.0 offset
  ['ORBCOMM',     8.0],   // McCants 7.0 full-phase + 1.0 offset
  ['BEIDOU',      5.5],   // Large GNSS sat, similar to GPS/GLONASS
  ['GALILEO',     5.5],   // Large GNSS sat with ~12.5 m² solar panels
  ['GLONASS',     5.5],   // McCants 4.0-5.5 full-phase + 1.0 offset
  ['GPS ',        5.5],   // McCants 3.5-5.0 full-phase + 1.0 offset
  ['NAVSTAR',     5.5],   // Same as GPS
  ['FENGYUN',     5.0],   // McCants 4.0-4.5 full-phase + 1.0 offset
  ['METEOR-M',    5.0],   // McCants 4.0 full-phase + 1.0 offset
  ['NOAA ',       5.5],   // McCants 4.5-5.0 full-phase + 1.0 offset
  ['COSMOS',      5.0],   // McCants varies widely, 5.0 is mid-range
  ['SL-',         3.5],   // McCants ~3.0 full-phase + offset, rocket bodies
  ['CZ-',         3.5],   // Long March rocket bodies
  ['FALCON 9',    3.0],   // McCants 2.0 full-phase + 1.0 offset
  ['DELTA',       3.5],   // McCants 2.5 full-phase + 1.0 offset
  ['ATLAS',       3.5],   // McCants 2.5 full-phase + 1.0 offset
];

function prefixMag(name: string): number | null {
  const upper = name.toUpperCase();
  for (const [prefix, mag] of PREFIX_RULES) {
    if (upper.startsWith(prefix)) return mag;
  }
  return null;
}

// Object type fallback based on median RCS per type (on-orbit objects):
//   PAY → median 2.3 m²,  R/B → median 4.6 m²,  DEB → median 0.02 m²
function objectTypeMag(objectType: string): number {
  switch (objectType) {
    case 'PAY': return rcsToStdMag(2.3);    // ~5.8
    case 'R/B': return rcsToStdMag(4.6);    // ~5.0
    case 'DEB': return rcsToStdMag(0.02);   // ~10.9
    default:    return 6.0;
  }
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

async function fetchText(url: string, label: string): Promise<string> {
  console.log(`Fetching ${label}...`);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch ${label}: ${resp.status} ${resp.statusText}`);
  const text = await resp.text();
  console.log(`  → ${(text.length / 1024).toFixed(0)} KB`);
  return text;
}

// ---------------------------------------------------------------------------
// Parsing McCants qs.mag
// ---------------------------------------------------------------------------

interface McCantsEntry {
  noradId: number;
  mag: number;
  flag: string;
}

function parseMcCants(text: string): McCantsEntry[] {
  const lines = text.split('\n');
  const entries: McCantsEntry[] = [];

  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    if (line.length < 37) continue;

    const idStr = line.substring(0, 5).trim();
    const id = parseInt(idStr, 10);
    if (isNaN(id) || id <= 0 || id >= 99999) continue; // skip header/footer

    const flag = line[6] || ' ';
    const magStr = line.substring(32, 37).trim();
    if (!magStr) continue;

    const mag = parseFloat(magStr);
    if (isNaN(mag)) continue;

    entries.push({ noradId: id, mag, flag });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Parsing CelesTrak SATCAT CSV
// ---------------------------------------------------------------------------

interface SatcatEntry {
  noradId: number;
  name: string;
  objectType: string;
  rcs: number | null;
  decayed: boolean;
}

function parseSatcat(csv: string): SatcatEntry[] {
  const lines = csv.split('\n');
  if (lines.length < 2) return [];

  // Parse header to find column indices
  const header = lines[0].split(',');
  const idx = {
    name: header.indexOf('OBJECT_NAME'),
    norad: header.indexOf('NORAD_CAT_ID'),
    type: header.indexOf('OBJECT_TYPE'),
    rcs: header.indexOf('RCS'),
    decay: header.indexOf('DECAY_DATE'),
  };

  const entries: SatcatEntry[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Simple CSV split (SATCAT has no quoted/comma-containing fields)
    const cols = line.split(',');

    const noradId = parseInt(cols[idx.norad], 10);
    if (isNaN(noradId)) continue;

    const rcsStr = cols[idx.rcs]?.trim();
    const rcs = rcsStr ? parseFloat(rcsStr) : null;

    entries.push({
      noradId,
      name: cols[idx.name] || '',
      objectType: cols[idx.type] || '',
      rcs: (rcs !== null && !isNaN(rcs) && rcs > 0) ? rcs : null,
      decayed: !!(cols[idx.decay]?.trim()),
    });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Fetch both sources in parallel
  const [mccantsText, satcatText] = await Promise.all([
    fetchText(MCCANTS_URL, 'McCants qs.mag'),
    fetchText(SATCAT_URL, 'CelesTrak SATCAT CSV'),
  ]);

  const mccants = parseMcCants(mccantsText);
  const satcat = parseSatcat(satcatText);

  console.log(`\nParsed:`);
  console.log(`  McCants: ${mccants.length} entries with magnitude`);
  console.log(`  SATCAT:  ${satcat.length} total, ${satcat.filter(s => s.rcs !== null).length} with RCS`);

  // Build the lookup: noradId → stdMag
  // We only include on-orbit objects (no point shipping data for decayed sats)
  const result: Record<number, number> = {};
  const stats = { mccants: 0, rcs: 0, prefix: 0, objectType: 0, skippedDecayed: 0 };

  // Index McCants by NORAD ID
  const mccantsMap = new Map<number, number>();
  for (const entry of mccants) {
    // Skip decayed objects (flag 'd') — they're not useful for live tracking
    if (entry.flag === 'd') {
      stats.skippedDecayed++;
      continue;
    }
    // Convert McCants convention to our 90° phase convention
    mccantsMap.set(entry.noradId, entry.mag + MCCANTS_OFFSET);
  }

  // Build a set of decayed NORAD IDs from SATCAT
  const decayedIds = new Set<number>();
  for (const entry of satcat) {
    if (entry.decayed) decayedIds.add(entry.noradId);
  }

  // Process SATCAT entries (on-orbit only)
  for (const entry of satcat) {
    if (entry.decayed) continue;

    const noradId = entry.noradId;

    // Priority 1: McCants observed magnitude
    if (mccantsMap.has(noradId)) {
      result[noradId] = round1(mccantsMap.get(noradId)!);
      stats.mccants++;
      continue;
    }

    // Priority 2: RCS-derived magnitude
    if (entry.rcs !== null) {
      result[noradId] = round1(rcsToStdMag(entry.rcs));
      stats.rcs++;
      continue;
    }

    // Priority 3: Name-prefix heuristic
    const pmag = prefixMag(entry.name);
    if (pmag !== null) {
      result[noradId] = pmag;
      stats.prefix++;
      continue;
    }

    // Priority 4: Object-type fallback
    result[noradId] = round1(objectTypeMag(entry.objectType));
    stats.objectType++;
  }

  // Also add McCants entries that might not be in SATCAT (shouldn't happen, but just in case)
  for (const [noradId, mag] of mccantsMap) {
    if (!(noradId in result) && !decayedIds.has(noradId)) {
      result[noradId] = round1(mag);
      stats.mccants++;
    }
  }

  console.log(`\nOutput: ${Object.keys(result).length} entries`);
  console.log(`  Source breakdown:`);
  console.log(`    McCants observed:    ${stats.mccants}`);
  console.log(`    SATCAT RCS-derived:  ${stats.rcs}`);
  console.log(`    Name-prefix rule:    ${stats.prefix}`);
  console.log(`    Object-type fallback:${stats.objectType}`);
  console.log(`    Skipped (decayed):   ${stats.skippedDecayed}`);

  // Spot-check well-known satellites
  console.log(`\n  Spot checks:`);
  const checks: [string, number][] = [
    ['ISS', 25544], ['Hubble', 20580], ['Vanguard 1', 5],
  ];
  for (const [name, id] of checks) {
    console.log(`    ${name} (${id}): ${result[id] ?? 'missing'}`);
  }

  // Write output
  const outPath = join(import.meta.dirname!, '..', 'src', 'data', 'stdmag.json');
  mkdirSync(dirname(outPath), { recursive: true });

  const json = JSON.stringify(result);
  writeFileSync(outPath, json + '\n');
  console.log(`\nWritten to ${outPath} (${(json.length / 1024).toFixed(0)} KB)`);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
