/** Formatting utilities. */

// ── Timezone-aware date/time formatting ──

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function getDateParts(date: Date, tz: string) {
  const key = tz;
  let fmt = dtfCache.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    });
    dtfCache.set(key, fmt);
  }
  const parts = fmt.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? '00';
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') === '24' ? '00' : get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/** Format epoch (unix seconds) as "YYYY-MM-DD HH:MM:SS" in the given timezone. */
export function formatDatetimeTz(unixSec: number, tz: string): string {
  const d = new Date(unixSec * 1000);
  const p = getDateParts(d, tz);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

/** Format epoch (unix seconds) as "HH:MM:SS" in the given timezone. */
export function formatTimeTz(unixSec: number, tz: string): string {
  const d = new Date(unixSec * 1000);
  const p = getDateParts(d, tz);
  return `${p.hour}:${p.minute}:${p.second}`;
}

/** Format epoch (unix seconds) as "HH:MM" in the given timezone. */
export function formatTimeShortTz(unixSec: number, tz: string): string {
  const d = new Date(unixSec * 1000);
  const p = getDateParts(d, tz);
  return `${p.hour}:${p.minute}`;
}

/** Get date components { year, month, day, hour, minute, second } as numbers in the given timezone. */
export function getDateComponentsTz(unixSec: number, tz: string): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const d = new Date(unixSec * 1000);
  const p = getDateParts(d, tz);
  return {
    year: parseInt(p.year),
    month: parseInt(p.month),
    day: parseInt(p.day),
    hour: parseInt(p.hour),
    minute: parseInt(p.minute),
    second: parseInt(p.second),
  };
}

/** Get a "YYYY-M-D" day key for grouping, in the given timezone. */
export function dayKeyTz(unixSec: number, tz: string): string {
  const c = getDateComponentsTz(unixSec, tz);
  return `${c.year}-${c.month}-${c.day}`;
}

/** Format epoch (unix seconds) as "YYYY-MM-DD_HHMM" for filenames, in the given timezone. */
export function formatFileDateTz(unixSec: number, tz: string): { date: string; time: string } {
  const d = new Date(unixSec * 1000);
  const p = getDateParts(d, tz);
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}${p.minute}`,
  };
}

// ── Number formatting ──

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

/** Format seconds as clock-style countdown: "1:05:30" or "5:30". */
export function fmtCountdown(sec: number): string {
  if (sec <= 0) return '0:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** Format seconds as compact countdown: "42s", "3m 42s", "2h 15m", "1d 3h". */
export function fmtCountdownCompact(sec: number): string {
  if (sec < 60) return `${Math.floor(sec)}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${Math.floor(sec % 60)}s`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  return `${d}d ${h}h`;
}

/** Format seconds as pass duration: "5m30s". */
export function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m${String(s).padStart(2, '0')}s`;
}

/** Format seconds as "m:ss" duration (for charts/timelines). */
export function fmtDurationClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
