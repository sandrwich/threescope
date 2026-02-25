/** Formatting utilities. */

/** Format a number trimming trailing zeros after the decimal. */
function trimNum(n: number, maxDecimals: number): string {
  const s = n.toFixed(maxDecimals);
  if (!s.includes('.')) return s;
  return s.replace(/\.?0+$/, '');
}

/** Format frequency in Hz to a human-readable string (e.g. "145.825 MHz"). */
export function formatFreqHz(hz: number): string {
  if (hz >= 1e9) return trimNum(hz / 1e9, 3) + ' GHz';
  if (hz >= 1e6) return trimNum(hz / 1e6, 3) + ' MHz';
  if (hz >= 1e3) return trimNum(hz / 1e3, 1) + ' kHz';
  return trimNum(hz, 0) + ' Hz';
}

/** Format frequency in MHz to a human-readable string (e.g. "8 GHz", "144 MHz"). */
export function formatMHz(mhz: number): string {
  if (mhz >= 1000) return trimNum(mhz / 1000, 2) + ' GHz';
  return trimNum(mhz, 1) + ' MHz';
}

/** Format a frequency range in MHz, sharing unit when both values fall in the same tier. */
export function formatMHzRange(minMHz: number, maxMHz: number): string {
  const bothGHz = minMHz >= 1000 && maxMHz >= 1000;
  const bothMHz = minMHz < 1000 && maxMHz < 1000;
  if (bothGHz) return trimNum(minMHz / 1000, 2) + '–' + trimNum(maxMHz / 1000, 2) + ' GHz';
  if (bothMHz) return trimNum(minMHz, 1) + '–' + trimNum(maxMHz, 1) + ' MHz';
  return formatMHz(minMHz) + '–' + formatMHz(maxMHz);
}
