/**
 * Global elevation lookup from ETOPO5 5-arc-minute grid.
 * Binary format: big-endian Int16, 4320 cols × 2160 rows.
 * Row 0 = 90°N, col 0 = 0°E, eastward to 360°.
 * Ocean values clamped to 0m.
 */

const COLS = 4320; // 360° × 12 pts/deg
const ROWS = 2160; // 180° × 12 pts/deg
const PTS_PER_DEG = 12; // 5 arc-minute = 12 points per degree

let grid: DataView | null = null;
let loading = false;
let loadPromise: Promise<void> | null = null;

export function isElevationLoaded(): boolean {
  return grid !== null;
}

export function loadElevation(): Promise<void> {
  if (grid) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loading = true;
  loadPromise = fetch('/data/elevation.bin')
    .then(r => r.arrayBuffer())
    .then(buf => {
      grid = new DataView(buf);
      loading = false;
    })
    .catch(() => {
      loading = false;
      loadPromise = null;
    });
  return loadPromise;
}

function sample(row: number, col: number): number {
  if (!grid) return 0;
  // Wrap column (longitude wraps around)
  col = ((col % COLS) + COLS) % COLS;
  // Clamp row (latitude doesn't wrap)
  row = Math.max(0, Math.min(ROWS - 1, row));
  return grid.getInt16((row * COLS + col) * 2);
}

/**
 * Get elevation in meters at a given lat/lon using bilinear interpolation.
 * Returns 0 if data not loaded or location is ocean.
 */
export function getElevation(lat: number, lon: number): number {
  if (!grid) return 0;

  // Convert to grid coordinates
  // Row: 0 = 90°N, increases southward. row = (90 - lat) * 12
  // Col: 0 = 0°E, increases eastward. col = lon * 12 (normalize lon to 0-360 first)
  const rowF = (90 - lat) * PTS_PER_DEG;
  let lonNorm = ((lon % 360) + 360) % 360;
  const colF = lonNorm * PTS_PER_DEG;

  const r0 = Math.floor(rowF);
  const c0 = Math.floor(colF);
  const dr = rowF - r0;
  const dc = colF - c0;

  // Bilinear interpolation
  const v00 = sample(r0, c0);
  const v01 = sample(r0, c0 + 1);
  const v10 = sample(r0 + 1, c0);
  const v11 = sample(r0 + 1, c0 + 1);

  const v0 = v00 + (v01 - v00) * dc;
  const v1 = v10 + (v11 - v10) * dc;
  return Math.max(0, Math.round(v0 + (v1 - v0) * dr));
}
