<script lang="ts">
  import TopPanel from './TopPanel.svelte';
  import StatsPanel from './StatsPanel.svelte';
  import TlePicker from './TlePicker.svelte';
  import SatInfo from './SatInfo.svelte';
  import ApsisLabels from './ApsisLabels.svelte';
  import PassMarkers from './PassMarkers.svelte';
  import BottomPanel from './BottomPanel.svelte';
  import InfoModal from './InfoModal.svelte';
  import SettingsWindow from './SettingsWindow.svelte';
  import TimeWindow from './TimeWindow.svelte';
  import ViewWindow from './ViewWindow.svelte';
  import SelectionWindow from './SelectionWindow.svelte';
  import CommandPalette from './CommandPalette.svelte';
  import PassesWindow from './PassesWindow.svelte';
  import PolarPlot from './PolarPlot.svelte';
  import DopplerWindow from './DopplerWindow.svelte';
  import DataSourcesWindow from './DataSourcesWindow.svelte';
  import ObserverWindow from './ObserverWindow.svelte';
  import PassFilterWindow from './PassFilterWindow.svelte';
  import ThemeEditorWindow from './ThemeEditorWindow.svelte';
  import SatDatabaseWindow from './SatDatabaseWindow.svelte';
</script>

<div id="ui-overlay">
  <TopPanel />
  <StatsPanel />
  <TlePicker />
  <SatInfo />
  <ApsisLabels />
  <PassMarkers />
  <BottomPanel />
  <InfoModal />
  <SettingsWindow />
  <ObserverWindow />
  <TimeWindow />
  <ViewWindow />
  <SelectionWindow />
  <DataSourcesWindow />
  <PassesWindow />
  <PolarPlot />
  <DopplerWindow />
  <CommandPalette />
  <PassFilterWindow />
  <ThemeEditorWindow />
  <SatDatabaseWindow />
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
