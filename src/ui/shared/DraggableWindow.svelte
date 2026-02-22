<script lang="ts">
  import { onMount } from 'svelte';

  // Shared z-index counter — each focus bumps this
  let topZ = 100;

  let {
    title = '',
    open = $bindable(true),
    initialX = 10,
    initialY = 50,
    children,
  }: {
    title?: string;
    open?: boolean;
    initialX?: number;
    initialY?: number;
    children: any;
  } = $props();

  let x = $state(0);
  let y = $state(0);
  let zIndex = $state(++topZ);
  let dragging = $state(false);
  let dragOffX = 0;
  let dragOffY = 0;
  let windowEl: HTMLDivElement | undefined = $state();
  let initialized = false;

  function bringToFront() {
    zIndex = ++topZ;
  }

  function onTitleMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    dragging = true;
    dragOffX = e.clientX - x;
    dragOffY = e.clientY - y;
    bringToFront();
    e.preventDefault();
  }

  function onMouseMove(e: MouseEvent) {
    if (!dragging) return;
    x = Math.max(0, Math.min(window.innerWidth - 80, e.clientX - dragOffX));
    y = Math.max(0, Math.min(window.innerHeight - 30, e.clientY - dragOffY));
  }

  function onMouseUp() {
    dragging = false;
  }

  onMount(() => {
    if (!initialized) {
      x = Math.min(initialX, window.innerWidth - 80);
      y = Math.min(initialY, window.innerHeight - 30);
      initialized = true;
    }
    bringToFront();
    // Capture phase so clicks on inputs/selects/buttons still bring window to front
    windowEl?.addEventListener('mousedown', bringToFront, true);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      windowEl?.removeEventListener('mousedown', bringToFront, true);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  });
</script>

{#if open}
  <div
    class="draggable-window"
    bind:this={windowEl}
    style="left:{x}px;top:{y}px;z-index:{zIndex}"
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="window-titlebar" onmousedown={onTitleMouseDown}>
      <span class="window-title">{title}</span>
      <button class="window-close" onclick={() => open = false}>&times;</button>
    </div>
    <div class="window-body">
      {@render children()}
    </div>
  </div>
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
  }
  .window-close {
    background: none;
    border: none;
    color: var(--text-ghost);
    font-size: 16px;
    cursor: pointer;
    padding: 0 2px;
    line-height: 1;
  }
  .window-close:hover { color: var(--text-dim); }
  .window-body {
    padding: 12px 14px;
  }
</style>
