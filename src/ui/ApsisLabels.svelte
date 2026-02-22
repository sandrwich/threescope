<script lang="ts">
  import { onMount } from 'svelte';
  import { uiStore } from '../stores/ui.svelte';

  let periEl: HTMLDivElement;
  let apoEl: HTMLDivElement;

  onMount(() => {
    uiStore.periLabelEl = periEl;
    uiStore.apoLabelEl = apoEl;
  });
</script>

<div class="apsis-label peri" bind:this={periEl} class:visible={uiStore.periVisible}>
  {uiStore.periText}
</div>
<div class="apsis-label apo" bind:this={apoEl} class:visible={uiStore.apoVisible}>
  {uiStore.apoText}
</div>

<style>
  .apsis-label {
    position: absolute;
    display: none;
    font-size: 12px;
    pointer-events: none;
    white-space: nowrap;
  }
  .apsis-label.visible { display: block; }
  .peri { color: #87ceeb; }
  .apo { color: #ffa500; }
</style>
