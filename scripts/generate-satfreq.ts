#!/usr/bin/env npx tsx
/**
 * generate-satfreq.ts
 *
 * Generates src/data/satnogs.json — a lookup table of satellite metadata and
 * transmitter frequencies keyed by NORAD catalog number.
 *
 * Data source: SatNOGS DB API (public, no auth)
 *   https://db.satnogs.org/api/satellites/?format=json
 *   https://db.satnogs.org/api/transmitters/?format=json
 *
 * Usage:
 *   npx tsx scripts/generate-satfreq.ts
 *
 * Output:
 *   src/data/satnogs.json — { [noradId]: { sat: [...], tx: [[...], ...] } }
 *
 * The generated file should be committed to the repo. A GitHub Action can
 * run this script periodically to keep the data fresh.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

const SAT_API_URL = 'https://db.satnogs.org/api/satellites/?format=json';
const TX_API_URL = 'https://db.satnogs.org/api/transmitters/?format=json';

// ─── Types ──────────────────────────────────────────────────────

interface SatnogsSat {
  sat_id: string;
  norad_cat_id: number;
  name: string;
  names: string;
  image: string;
  status: string;
  launched: string | null;
  website: string;
  operator: string;
  countries: string;
}

interface SatnogsTx {
  description: string;
  alive: boolean;
  type: string;
  downlink_low: number | null;
  downlink_high: number | null;
  mode: string | null;
  norad_cat_id: number;
  status: string;
  service: string;
}

// ─── Helpers ────────────────────────────────────────────────────

// Service priority for sorting (lower = more relevant for radio hobbyists)
const SERVICE_PRIORITY: Record<string, number> = {
  'Amateur': 0,
  'Meteorological': 1,
  'Space Research': 2,
  'Radiolocation': 3,
  'Radionavigational': 4,
  'Aeronautical': 5,
  'Inter-satellite': 6,
};

function servicePriority(service: string): number {
  return SERVICE_PRIORITY[service] ?? 99;
}

async function fetchJson<T>(url: string, label: string): Promise<T> {
  console.log(`Fetching ${label}...`);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
  const data = await resp.json();
  console.log(`  → ${Array.isArray(data) ? data.length + ' entries' : 'ok'}`);
  return data;
}

// ─── Main ───────────────────────────────────────────────────────

/**
 * Output format per satellite:
 *   sat: [name, satId, names, status, launched, countries, operator, image, website]
 *   tx:  [[desc, freqHz, mode, service], ...]
 *
 * All satellites with a valid NORAD ID are included (even without transmitters).
 */

async function main() {
  const [satellites, transmitters] = await Promise.all([
    fetchJson<SatnogsSat[]>(SAT_API_URL, 'SatNOGS satellites'),
    fetchJson<SatnogsTx[]>(TX_API_URL, 'SatNOGS transmitters'),
  ]);

  // Filter to active, alive transmitters with a downlink frequency
  const activeTx = transmitters.filter(tx =>
    tx.alive &&
    tx.status === 'active' &&
    tx.downlink_low !== null &&
    tx.downlink_low > 0
  );
  console.log(`\n  ${activeTx.length} active transmitters with downlink`);

  // Group transmitters by NORAD ID
  const txByNorad = new Map<number, SatnogsTx[]>();
  for (const tx of activeTx) {
    const id = tx.norad_cat_id;
    if (!id || id <= 0) continue;
    if (!txByNorad.has(id)) txByNorad.set(id, []);
    txByNorad.get(id)!.push(tx);
  }

  // Build output — include ALL satellites
  const result: Record<string, { sat?: (string | null)[]; tx: (string | number | null)[][] }> = {};

  for (const s of satellites) {
    if (s.norad_cat_id <= 0) continue;
    const noradId = s.norad_cat_id;

    // Get transmitters for this satellite (may be empty)
    const txList = txByNorad.get(noradId) ?? [];
    txList.sort((a, b) => {
      const sp = servicePriority(a.service) - servicePriority(b.service);
      if (sp !== 0) return sp;
      return (a.downlink_low ?? 0) - (b.downlink_low ?? 0);
    });

    const tx = txList.map(t => [
      t.description || 'Unknown',
      t.downlink_low!,
      t.mode || null,
      t.service || null,
    ]);

    result[String(noradId)] = {
      sat: [
        s.name || null,
        s.sat_id,
        s.names || null,
        s.status || null,
        s.launched?.slice(0, 10) || null,
        s.countries || null,
        (s.operator && s.operator !== 'None') ? s.operator : null,
        s.image || null,
        s.website || null,
      ],
      tx,
    };
  }

  // Also include orphan transmitters (NORAD IDs with tx but no satellite entry)
  for (const [noradId, txList] of txByNorad) {
    if (result[String(noradId)]) continue;
    txList.sort((a, b) => {
      const sp = servicePriority(a.service) - servicePriority(b.service);
      if (sp !== 0) return sp;
      return (a.downlink_low ?? 0) - (b.downlink_low ?? 0);
    });
    result[String(noradId)] = {
      tx: txList.map(t => [
        t.description || 'Unknown',
        t.downlink_low!,
        t.mode || null,
        t.service || null,
      ]),
    };
  }

  // Statistics
  const totalTx = Object.values(result).reduce((s, e) => s + e.tx.length, 0);
  const withSat = Object.values(result).filter(e => e.sat).length;
  const withTx = Object.values(result).filter(e => e.tx.length > 0).length;
  const statusCounts: Record<string, number> = {};
  for (const e of Object.values(result)) {
    const status = (e.sat?.[3] as string) || 'unknown';
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  }
  console.log(`\nOutput: ${Object.keys(result).length} satellites, ${totalTx} transmitters`);
  console.log(`  ${withSat} with metadata, ${withTx} with transmitters`);
  console.log(`  Status: ${Object.entries(statusCounts).map(([k,v]) => `${k}=${v}`).join(', ')}`);

  // Spot checks — these must all pass or the script fails (CI gate)
  const checks: [string, string][] = [
    ['ISS', '25544'],
    ['NOAA-15', '25338'],
    ['NOAA-18', '28654'],
    ['NOAA-19', '33591'],
  ];
  let spotFailed = false;
  console.log('\n  Spot checks:');
  for (const [name, id] of checks) {
    const e = result[id];
    if (e && e.tx.length > 0 && e.sat) {
      const first = e.tx[0];
      console.log(`    ✓ ${name} (${id}): ${e.tx.length} tx — first: ${((first[1] as number) / 1e6).toFixed(3)} MHz (${first[2] ?? '?'})`);
    } else {
      console.error(`    ✗ ${name} (${id}): MISSING — expected transmitter data`);
      spotFailed = true;
    }
  }
  if (spotFailed) {
    console.error('\nSpot check failed — aborting. SatNOGS data may be incomplete.');
    process.exit(1);
  }

  // Write output
  const outPath = join(import.meta.dirname!, '..', 'src', 'data', 'satnogs.json');
  mkdirSync(dirname(outPath), { recursive: true });

  const json = JSON.stringify(result);
  writeFileSync(outPath, json + '\n');
  console.log(`\nWritten to ${outPath} (${(json.length / 1024).toFixed(0)} KB)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
