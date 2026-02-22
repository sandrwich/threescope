/**
 * Process ETOPO5 binary into a compact web-ready elevation grid.
 * Input: public/data/ETOPO5.DAT (big-endian Int16, 4320×2160, starts at 90°N 0°E)
 * Output: public/data/elevation.bin (big-endian Int16, 4320×2160, starts at 90°N 0°E, ocean clamped to 0)
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'public', 'data');
const IN_FILE = join(DATA_DIR, 'ETOPO5.DAT');
const OUT_FILE = join(DATA_DIR, 'elevation.bin');

const COLS = 4320; // 360° × 12 pts/deg
const ROWS = 2160; // 180° × 12 pts/deg

const raw = readFileSync(IN_FILE);
console.log(`Read ${raw.length} bytes (expected ${ROWS * COLS * 2})`);

if (raw.length !== ROWS * COLS * 2) {
  console.error('Unexpected file size!');
  process.exit(1);
}

const out = Buffer.alloc(raw.length);
let landCount = 0;
let oceanCount = 0;
let minElev = Infinity;
let maxElev = -Infinity;

for (let i = 0; i < ROWS * COLS; i++) {
  let elev = raw.readInt16BE(i * 2);
  if (elev < 0) {
    elev = 0; // clamp ocean/below sea level to 0
    oceanCount++;
  } else {
    landCount++;
    if (elev < minElev) minElev = elev;
    if (elev > maxElev) maxElev = elev;
  }
  out.writeInt16BE(elev, i * 2);
}

writeFileSync(OUT_FILE, out);

console.log(`Grid: ${COLS}×${ROWS} = ${COLS * ROWS} points`);
console.log(`Land: ${landCount} (${(landCount / (ROWS * COLS) * 100).toFixed(1)}%)`);
console.log(`Ocean: ${oceanCount} (${(oceanCount / (ROWS * COLS) * 100).toFixed(1)}%)`);
console.log(`Land elevation range: ${minElev}m - ${maxElev}m`);
console.log(`Output: ${OUT_FILE} (${out.length} bytes)`);
