<script lang="ts">
  import { onMount } from 'svelte';
  import { uiStore } from '../stores/ui.svelte';

  const labels = Object.values(uiStore.labels);

  onMount(() => {
    // el refs are bound by Svelte via bind:this — no manual wiring needed
  });
</script>

{#each labels as label, i}
  <div
    class="scene-label"
    bind:this={label.el}
    class:visible={label.visible}
    style:color={label.color}
    style:font-size="{label.fontSize}px"
    style:pointer-events="none"
  >
    {label.text}
  </div>
{/each}

<style>
  .scene-label {
    position: absolute;
    left: 0; top: 0;
    display: none;
    pointer-events: none;
    white-space: nowrap;
    will-change: transform;
    text-shadow:
      -1px -1px 0 var(--scene-shadow),
       1px -1px 0 var(--scene-shadow),
      -1px  1px 0 var(--scene-shadow),
       1px  1px 0 var(--scene-shadow);
  }
  .scene-label.visible { display: block; }
</style>
