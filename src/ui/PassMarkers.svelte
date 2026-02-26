<script lang="ts">
  import { onMount } from 'svelte';
  import { uiStore } from '../stores/ui.svelte';

  let aosEl: HTMLDivElement;
  let losEl: HTMLDivElement;
  let tcaEl: HTMLDivElement;

  onMount(() => {
    uiStore.passAosLabelEl = aosEl;
    uiStore.passLosLabelEl = losEl;
    uiStore.passTcaLabelEl = tcaEl;
  });
</script>

<div class="pass-label scene-label aos" bind:this={aosEl} class:visible={uiStore.passAosVisible}>
  {uiStore.passAosText}
</div>
<div class="pass-label scene-label los" bind:this={losEl} class:visible={uiStore.passLosVisible}>
  {uiStore.passLosText}
</div>
<div class="pass-label scene-label tca" bind:this={tcaEl} class:visible={uiStore.passTcaVisible}>
  {uiStore.passTcaText}
</div>

<style>
  .pass-label {
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
  .pass-label.visible { display: block; }
  .aos { color: var(--marker-aos); }
  .los { color: var(--marker-los); }
  .tca { color: var(--marker-tca); }
</style>
