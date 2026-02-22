/**
 * Generate a 1-degree global elevation grid from the open-meteo elevation API.
 * Output: public/data/elevation-1deg.bin (Int16 big-endian, 360 cols × 181 rows)
 * Row 0 = lat 90 (north pole), row 180 = lat -90 (south pole)
 * Col 0 = lon -180, col 359 = lon 179
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public', 'data');
const OUT_FILE = join(OUT_DIR, 'elevation-1deg.bin');

const COLS = 360; // lon -180 to 179
const ROWS = 181; // lat 90 to -90
const BATCH = 100; // coords per API request

async function fetchElevations(lats, lons) {
  const latStr = lats.join(',');
  const lonStr = lons.join(',');
  const url = `https://api.open-meteo.com/v1/elevation?latitude=${latStr}&longitude=${lonStr}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.elevation;
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const grid = new Int16Array(ROWS * COLS);

  // Build all coordinate pairs
  const allLats = [];
  const allLons = [];
  for (let row = 0; row < ROWS; row++) {
    const lat = 90 - row;
    for (let col = 0; col < COLS; col++) {
      const lon = -180 + col;
      allLats.push(lat);
      allLons.push(lon);
    }
  }

  const total = allLats.length;
  console.log(`Fetching ${total} elevation points in batches of ${BATCH}...`);

  for (let i = 0; i < total; i += BATCH) {
    const batchLats = allLats.slice(i, i + BATCH);
    const batchLons = allLons.slice(i, i + BATCH);

    let elevations;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        elevations = await fetchElevations(batchLats, batchLons);
        break;
      } catch (e) {
        console.warn(`  Retry ${attempt + 1} for batch at ${i}: ${e.message}`);
        await sleep(2000 * (attempt + 1));
      }
    }

    if (!elevations) {
      console.error(`Failed batch at index ${i}, filling with 0`);
      for (let j = 0; j < batchLats.length; j++) {
        grid[i + j] = 0;
      }
      continue;
    }

    for (let j = 0; j < elevations.length; j++) {
      // Clamp to Int16 range, treat NaN/null as 0 (ocean)
      const elev = elevations[j];
      grid[i + j] = Math.max(-32768, Math.min(32767, Math.round(elev ?? 0)));
    }

    const pct = Math.round(((i + batchLats.length) / total) * 100);
    process.stdout.write(`\r  ${pct}% (${i + batchLats.length}/${total})`);

    // Small delay to avoid rate limiting
    if (i + BATCH < total) await sleep(50);
  }

  console.log('\nWriting binary file...');

  // Write as big-endian Int16
  const buf = Buffer.alloc(ROWS * COLS * 2);
  for (let i = 0; i < grid.length; i++) {
    buf.writeInt16BE(grid[i], i * 2);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, buf);
  console.log(`Done! ${OUT_FILE} (${buf.length} bytes)`);
}

main().catch(e => { console.error(e); process.exit(1); });
