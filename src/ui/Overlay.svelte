<script lang="ts">
  import TopPanel from './TopPanel.svelte';
  import StatsPanel from './StatsPanel.svelte';
  import TlePicker from './TlePicker.svelte';
  import SatInfo from './SatInfo.svelte';
  import ApsisLabels from './ApsisLabels.svelte';
  import BottomPanel from './BottomPanel.svelte';
  import InfoModal from './InfoModal.svelte';
  import SettingsWindow from './SettingsWindow.svelte';
  import TimeWindow from './TimeWindow.svelte';
</script>

<div id="ui-overlay">
  <TopPanel />
  <StatsPanel />
  <TlePicker />
  <SatInfo />
  <ApsisLabels />
  <BottomPanel />
  <InfoModal />
  <SettingsWindow />
  <TimeWindow />
</div>

<style>
  #ui-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    user-select: none;
  }
  #ui-overlay > :global(*) {
    pointer-events: auto;
  }
</style>
