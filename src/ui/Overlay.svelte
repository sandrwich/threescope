<script lang="ts">
  import { onMount } from 'svelte';
  import { uiStore } from '../stores/ui.svelte';
  import TopPanel from './TopPanel.svelte';
  import StatsPanel from './StatsPanel.svelte';
  import TlePicker from './TlePicker.svelte';
  import MobileNav from './MobileNav.svelte';
  import SatInfo from './SatInfo.svelte';
  import SceneLabels from './SceneLabels.svelte';
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
  import RotatorWindow from './RotatorWindow.svelte';
  import FeedbackWindow from './FeedbackWindow.svelte';
  import SkyReticle from './SkyReticle.svelte';
  import SkyRotator from './SkyRotator.svelte';

  onMount(() => {
    uiStore.updateMobileState();
    const onResize = () => uiStore.updateMobileState();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  });
</script>

<div id="ui-overlay">
  {#if uiStore.chromeVisible}
    <TopPanel />
    <StatsPanel />
    {#if uiStore.isMobile}
      <MobileNav />
    {:else}
      <TlePicker />
      <BottomPanel />
    {/if}
    <SatInfo />
  {/if}
  <SceneLabels />
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
  <RotatorWindow />
  <FeedbackWindow />
  <SkyReticle />
  <SkyRotator />
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
