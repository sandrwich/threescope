/** Shared touch-aware metrics for all canvas-based charts. */

const _isTouch =
  typeof window !== 'undefined' &&
  ('ontouchstart' in window || navigator.maxTouchPoints > 0);

/**
 * Unified sizing constants for canvas chart rendering.
 * On touch devices, dots, markers, handles, and hit areas are scaled up
 * so interactions feel natural with finger input.
 */
export const chart = {
  /** Dot radius for data points / markers */
  dot:          _isTouch ? 7 : 4,
  /** Small dot (legend, secondary) */
  dotSmall:     _isTouch ? 5 : 3,
  /** Large dot (live indicator, selected) */
  dotLarge:     _isTouch ? 9 : 5,
  /** Marker half-size (squares, diamonds) */
  marker:       _isTouch ? 5 : 3,
  /** Hit distance for pointer interactions (logical px) */
  hitRadius:    _isTouch ? 32 : 16,
  /** Retain / hysteresis radius (slightly larger) */
  retainRadius: _isTouch ? 40 : 24,
  /** Handle radius for draggable controls */
  handle:       _isTouch ? 14 : 10,
  /** Handle hit area (handle + touch padding) */
  handleHit:    _isTouch ? 20 : 14,
  /** Line width for tracks / paths */
  line:         _isTouch ? 2 : 1.5,
  /** Whether the primary input is touch */
  isTouch:      _isTouch,
} as const;

/** Per-event hit radius — use for mixed mouse+touch devices (e.g. Surface). */
export function pointerHitRadius(e: PointerEvent): number {
  return e.pointerType === 'touch' ? chart.hitRadius * 1.5 : chart.hitRadius;
}
