<script lang="ts" module>
  const WIN_PREFIX = 'threescope_win_';

  // Shared z-index counter — must be in module scope so ALL instances share it
  let topZ = 100;

  // Registry of open window rects for collision avoidance + edge snapping
  const openWindows = new Map<string, { x: number; y: number; w: number; h: number }>();

  const SNAP_THRESHOLD = 12;

  function rectsOverlap(
    a: { x: number; y: number; w: number; h: number },
    b: { x: number; y: number; w: number; h: number },
    threshold = 40,
  ): boolean {
    const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return overlapX > threshold && overlapY > threshold;
  }

  function findFreePosition(
    prefX: number, prefY: number, w: number, h: number, selfKey: string,
  ): { x: number; y: number } {
    const STEP = 30;
    let cx = prefX, cy = prefY;
    for (let i = 0; i < 10; i++) {
      const cand = { x: cx, y: cy, w, h };
      let collides = false;
      for (const [k, rect] of openWindows) {
        if (k === selfKey) continue;
        if (rectsOverlap(cand, rect)) { collides = true; break; }
      }
      if (!collides) return { x: cx, y: cy };
      cx += STEP; cy += STEP;
      if (cx + w > window.innerWidth - 10) cx = 10;
      if (cy + h > window.innerHeight - 30) cy = 40;
    }
    return { x: cx, y: cy };
  }

  export function resetWindowLayout() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(WIN_PREFIX)) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);
    location.reload();
  }
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { ICON_CLOSE } from './icons';

  const ICON_CHEVRON = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 4.5l3 3 3-3"/></svg>';

  // ── Component instance ──

  let {
    title = '',
    id = '',
    icon = undefined as any,
    headerExtra = undefined as any,
    footer = undefined as any,
    open = $bindable(true),
    focus = 0,
    initialX = 10,
    initialY = 50,
    children,
  }: {
    title?: string;
    id?: string;
    icon?: any;
    headerExtra?: any;
    footer?: any;
    open?: boolean;
    focus?: number;
    initialX?: number;
    initialY?: number;
    children: any;
  } = $props();

  let x = $state(0);
  let y = $state(0);
  let zIndex = $state(++topZ);
  let dragging = $state(false);
  let collapsed = $state(false);
  let stableWidth = $state(0); // ratchets up — window never shrinks below its max observed width
  let dragOffX = 0;
  let dragOffY = 0;
  let windowEl: HTMLDivElement | undefined = $state();
  let initialized = false;

  // Restore open/closed state from localStorage (use raw props, not $derived, to avoid reactive issues during init)
  {
    const key = id || title;
    if (key) {
      const saved = localStorage.getItem(`${WIN_PREFIX}${key}_open`);
      if (saved !== null) open = saved === 'true';
    }
  }

  // Snap guide state
  let snapV = $state<number | null>(null);
  let snapH = $state<number | null>(null);

  const winKey = $derived(id || title);

  // ── localStorage helpers ──

  function sKey(suffix: string): string {
    return `${WIN_PREFIX}${winKey}_${suffix}`;
  }

  function savePosition() {
    if (!winKey) return;
    localStorage.setItem(sKey('x'), String(Math.round(x)));
    localStorage.setItem(sKey('y'), String(Math.round(y)));
  }

  function loadPosition(): { x: number; y: number } | null {
    if (!winKey) return null;
    const sx = localStorage.getItem(sKey('x'));
    const sy = localStorage.getItem(sKey('y'));
    if (sx === null || sy === null) return null;
    return { x: Number(sx), y: Number(sy) };
  }

  // ── Core functions ──

  function bringToFront() {
    zIndex = ++topZ;
  }

  function onTitlePointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    dragging = true;
    dragOffX = e.clientX - x;
    dragOffY = e.clientY - y;
    bringToFront();
    e.preventDefault();
  }

  function onTitleDblClick() {
    collapsed = !collapsed;
    if (winKey) localStorage.setItem(sKey('collapsed'), String(collapsed));
    requestAnimationFrame(updateRegistry);
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;
    const w = windowEl?.offsetWidth ?? 200;
    const h = windowEl?.offsetHeight ?? 100;
    let nx = e.clientX - dragOffX;
    let ny = e.clientY - dragOffY;

    // Clamp to viewport
    nx = Math.max(10, Math.min(window.innerWidth - w - 10, nx));
    ny = Math.max(10, Math.min(window.innerHeight - 30, ny));

    // Edge snapping
    const vTargets: number[] = [10, window.innerWidth - 10];
    const hTargets: number[] = [10, window.innerHeight - 10];
    for (const [k, rect] of openWindows) {
      if (k === winKey) continue;
      vTargets.push(rect.x, rect.x + rect.w);
      hTargets.push(rect.y, rect.y + rect.h);
    }

    let sv: number | null = null;
    for (const vt of vTargets) {
      if (Math.abs(nx - vt) < SNAP_THRESHOLD) { nx = vt; sv = vt; break; }
      if (Math.abs(nx + w - vt) < SNAP_THRESHOLD) { nx = vt - w; sv = vt; break; }
    }
    let sh: number | null = null;
    for (const ht of hTargets) {
      if (Math.abs(ny - ht) < SNAP_THRESHOLD) { ny = ht; sh = ht; break; }
      if (Math.abs(ny + h - ht) < SNAP_THRESHOLD) { ny = ht - h; sh = ht; break; }
    }

    snapV = sv; snapH = sh;
    x = nx; y = ny;
  }

  function onPointerUp() {
    if (!dragging) return;
    dragging = false;
    snapV = null; snapH = null;
    savePosition();
    updateRegistry();
  }

  function clampToViewport() {
    if (!windowEl || dragging) return;
    const w = windowEl.offsetWidth;
    const h = windowEl.offsetHeight;
    const maxX = window.innerWidth - w - 10;
    const maxY = window.innerHeight - h - 10;
    if (x > maxX) x = Math.max(10, maxX);
    if (y > maxY) y = Math.max(10, maxY);
  }

  function updateRegistry() {
    if (windowEl && winKey) {
      if (!collapsed && windowEl.offsetWidth > stableWidth) {
        stableWidth = windowEl.offsetWidth;
      }
      openWindows.set(winKey, { x, y, w: windowEl.offsetWidth, h: windowEl.offsetHeight });
    }
  }

  // ── Open/close transition ──

  function windowTransition(_node: HTMLElement, { duration = 120 }: { duration?: number } = {}) {
    return {
      duration,
      easing: cubicOut,
      css: (t: number) => `opacity: ${t}; transform: scale(${0.95 + 0.05 * t})`,
    };
  }

  // ── Lifecycle ──

  let ro: ResizeObserver | null = null;

  // Track open state: bring to front + persist
  $effect(() => {
    if (open) zIndex = ++topZ;
    if (winKey) localStorage.setItem(sKey('open'), String(open));
  });

  // External bring-to-front trigger — track focus value change
  let prevFocus = focus;
  $effect(() => {
    if (focus !== prevFocus) {
      prevFocus = focus;
      zIndex = ++topZ;
    }
  });

  $effect(() => {
    const el = windowEl;
    if (!el) return;

    if (!initialized) {
      const saved = loadPosition();
      if (saved) {
        x = saved.x;
        y = saved.y;
      } else {
        // Resolve right-aligned windows (initialX >= 9000) and find free spot
        const resolvedX = initialX >= 9000
          ? Math.max(10, window.innerWidth - (el.offsetWidth || 250) - 10)
          : initialX;
        const resolvedY = Math.max(10, Math.min(window.innerHeight - 30, initialY));
        const estW = el.offsetWidth || 250;
        const estH = el.offsetHeight || 200;
        const free = findFreePosition(resolvedX, resolvedY, estW, estH, winKey);
        x = free.x;
        y = free.y;
      }
      // Restore collapsed state
      if (winKey) {
        const sc = localStorage.getItem(sKey('collapsed'));
        if (sc === 'true') collapsed = true;
      }
      initialized = true;
    }

    requestAnimationFrame(() => { clampToViewport(); updateRegistry(); });

    ro?.disconnect();
    ro = new ResizeObserver(() => { clampToViewport(); updateRegistry(); });
    ro.observe(el);

    return () => {
      ro?.disconnect();
      openWindows.delete(winKey);
    };
  });

  onMount(() => {
    window.addEventListener('resize', clampToViewport);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('resize', clampToViewport);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  });
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="draggable-window"
    bind:this={windowEl}
    style="left:{x}px;top:{y}px;z-index:{zIndex}{stableWidth ? `;min-width:${stableWidth}px` : ''}"
    transition:windowTransition={{ duration: 120 }}
    onpointerdown={bringToFront}
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="window-titlebar" onpointerdown={onTitlePointerDown} ondblclick={onTitleDblClick}>
      <span class="window-title">
        {#if icon}{@render icon()}{/if}
        {title}
      </span>
      {#if headerExtra}{@render headerExtra()}{/if}
      <div class="window-controls">
        <button class="window-collapse" class:collapsed title={collapsed ? 'Expand' : 'Collapse'} onclick={onTitleDblClick}>{@html ICON_CHEVRON}</button>
        <button class="window-close" onclick={() => open = false}>{@html ICON_CLOSE}</button>
      </div>
    </div>
    {#if !collapsed}
      <div class="window-collapsible" transition:slide={{ duration: 150 }}>
        <div class="window-body" class:has-footer={!!footer}>
          {@render children()}
        </div>
        {#if footer}
          <div class="window-footer">
            {@render footer()}
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

{#if dragging && snapV !== null}
  <div class="snap-guide-v" style="left:{snapV}px"></div>
{/if}
{#if dragging && snapH !== null}
  <div class="snap-guide-h" style="top:{snapH}px"></div>
{/if}

<style>
  .draggable-window {
    position: absolute;
    pointer-events: auto;
    background: var(--modal-bg);
    border: 1px solid var(--border);
    font-size: 13px;
    color: var(--text-muted);
    min-width: 200px;
    max-width: calc(100vw - 20px);
  }
  .window-titlebar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 8px;
    cursor: grab;
    user-select: none;
    border-bottom: 1px solid var(--border);
    background: var(--ui-bg);
  }
  .window-titlebar:active { cursor: grabbing; }
  .window-title {
    font-size: 11px;
    color: var(--text-ghost);
    text-transform: uppercase;
    letter-spacing: 1px;
    font-weight: normal;
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .window-controls {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    margin-left: 4px;
  }
  .window-collapse, .window-close {
    background: none;
    border: none;
    color: var(--text-ghost);
    cursor: pointer;
    padding: 0;
    display: flex;
    align-items: center;
  }
  .window-collapse :global(svg), .window-close :global(svg) { width: 10px; height: 10px; }
  .window-collapse:hover, .window-close:hover { color: var(--text-dim); }
  .window-collapse :global(svg) { transition: transform 0.15s ease-out; }
  .window-collapse.collapsed :global(svg) { transform: rotate(-90deg); }
  .window-title :global(.title-icon) {
    display: inline-flex;
    align-items: center;
    line-height: 0;
    margin-top: -2px;
  }
  .window-title :global(.title-icon svg) {
    width: 11px;
    height: 11px;
  }

  .window-body {
    padding: 12px 14px;
  }
  .window-footer {
    border-top: 1px solid var(--border);
    padding: 4px 14px 3px;
  }
  .window-footer:not(:has(*)) {
    display: none;
  }

  /* Snap guide lines */
  .snap-guide-v {
    position: fixed;
    top: 0;
    width: 1px;
    height: 100vh;
    background: var(--snap-guide);
    pointer-events: none;
    z-index: 9998;
  }
  .snap-guide-h {
    position: fixed;
    left: 0;
    height: 1px;
    width: 100vw;
    background: var(--snap-guide);
    pointer-events: none;
    z-index: 9998;
  }
</style>
