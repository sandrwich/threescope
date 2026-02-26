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

<div class="apsis-label scene-label peri" bind:this={periEl} class:visible={uiStore.periVisible}>
  {uiStore.periText}
</div>
<div class="apsis-label scene-label apo" bind:this={apoEl} class:visible={uiStore.apoVisible}>
  {uiStore.apoText}
</div>

<style>
  .apsis-label {
    position: absolute;
    left: 0; top: 0;
    display: none;
    font-size: 12px;
    pointer-events: none;
    white-space: nowrap;
    will-change: transform;
    text-shadow:
      -1px -1px 0 var(--bg),
       1px -1px 0 var(--bg),
      -1px  1px 0 var(--bg),
       1px  1px 0 var(--bg);
  }
  .apsis-label.visible { display: block; }
  .peri { color: var(--apsis-peri); }
  .apo { color: var(--apsis-apo); }
</style>
