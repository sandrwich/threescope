<script lang="ts" generics="T">
  let {
    items,
    rowHeight = 30,
    maxHeight = 400,
    buffer = 20,
    row,
    footer = undefined as any,
  }: {
    items: T[];
    rowHeight?: number;
    maxHeight?: number;
    buffer?: number;
    row: any;
    footer?: any;
  } = $props();

  let scrollTop = $state(0);

  function onScroll(e: Event) {
    scrollTop = (e.target as HTMLElement).scrollTop;
  }

  let winStart = $derived(Math.max(0, Math.floor(scrollTop / rowHeight) - buffer));
  let winEnd = $derived(Math.min(items.length, winStart + Math.ceil(maxHeight / rowHeight) + 2 * buffer));
</script>

<div class="vl-viewport" style="max-height:{maxHeight}px" onscroll={onScroll}>
  {#if winStart > 0}<div style="height:{winStart * rowHeight}px"></div>{/if}
  {#each items.slice(winStart, winEnd) as item, j (winStart + j)}
    {@render row(item, winStart + j)}
  {/each}
  {#if winEnd < items.length}<div style="height:{(items.length - winEnd) * rowHeight}px"></div>{/if}
  {#if footer}{@render footer()}{/if}
</div>

<style>
  .vl-viewport {
    overflow-y: auto;
  }
</style>
