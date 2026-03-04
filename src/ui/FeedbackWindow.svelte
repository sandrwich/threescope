<script lang="ts">
  import DraggableWindow from './shared/DraggableWindow.svelte';
  import MobileSheet from './shared/MobileSheet.svelte';
  import Checkbox from './shared/Checkbox.svelte';
  import Slider from './shared/Slider.svelte';
  import Button from './shared/Button.svelte';
  import InfoTip from './shared/InfoTip.svelte';
  import { uiStore } from '../stores/ui.svelte';
  import { feedbackStore } from '../stores/feedback.svelte';
  import { ICON_FEEDBACK } from './shared/icons';

  let volumeDisplay = $derived(Math.round(feedbackStore.audioVolume * 100) + '%');
</script>

{#snippet fbIcon()}<span class="title-icon">{@html ICON_FEEDBACK}</span>{/snippet}
{#snippet windowContent()}
  <h4 class="section-header">Targets</h4>

  <div class="row">
    <label>Audio<InfoTip>Synthesized UI sounds via Web Audio API. Tones, clicks, and sweeps generated in real time.</InfoTip></label>
    <Checkbox checked={feedbackStore.audioEnabled} onchange={() => feedbackStore.setAudioEnabled(!feedbackStore.audioEnabled)} />
  </div>
  {#if feedbackStore.audioUnsupported}
    <div class="bt-help"><strong>Web Audio not supported in this browser.</strong></div>
  {/if}

  {#if feedbackStore.audioEnabled}
    <Slider label="Volume" display={volumeDisplay} min={0} max={100} value={Math.round(feedbackStore.audioVolume * 100)} oninput={(e) => feedbackStore.setAudioVolume(Number((e.target as HTMLInputElement).value) / 100)} />
  {/if}

  <div class="row">
    <label>Haptic<InfoTip>Vibration feedback via navigator.vibrate(). Works on phones and some desktop browsers.</InfoTip></label>
    <Checkbox checked={feedbackStore.hapticEnabled} onchange={() => feedbackStore.setHapticEnabled(!feedbackStore.hapticEnabled)} />
  </div>
  {#if feedbackStore.hapticUnsupported}
    <div class="bt-help"><strong>Vibration not supported in this browser.</strong></div>
  {/if}

  {#if __FEEDBACK_TOYS__}
  <div class="row">
    <label>Toys<InfoTip>Connect to Bluetooth vibration devices via WebBluetooth. Uses an embedded WASM Buttplug server — no external app needed. Requires a compatible browser with Web Bluetooth enabled.</InfoTip></label>
    <Checkbox checked={feedbackStore.buttplugEnabled} onchange={() => feedbackStore.setButtplugEnabled(!feedbackStore.buttplugEnabled)} />
  </div>

  {#if feedbackStore.buttplugEnabled}
    <div class="toys-panel">
      <div class="toys-header">
        <span class="dot" class:ok={feedbackStore.buttplugStatus === 'connected'} class:loading={feedbackStore.buttplugStatus === 'loading'} class:err={feedbackStore.buttplugStatus === 'error'}></span>
        <span class="toys-status">{feedbackStore.buttplugStatus}</span>
        {#if feedbackStore.buttplugStatus === 'connected'}
          <Button size="xs" onclick={() => feedbackStore.testButtplug()}>Test</Button>
          <Button size="xs" onclick={() => feedbackStore.startButtplugScan()}>Scan</Button>
        {/if}
      </div>

      {#if feedbackStore.buttplugStatus === 'connected'}
        {#if feedbackStore.buttplugDevices.length > 0}
          <div class="dev-list">
            {#each feedbackStore.buttplugDevices as dev}
              <div class="dev-row">
                <span class="dev-name">{dev.name}</span>
                <span class="dev-meta">
                  {#if dev.battery !== null}
                    {@const pct = Math.round(dev.battery * 100)}
                    <span class="dev-bat" class:low={pct <= 15} class:mid={pct > 15 && pct <= 40}>{pct}%</span>
                  {/if}
                </span>
              </div>
            {/each}
          </div>
        {:else}
          <div class="dev-empty">No devices found. Click Scan to pair.</div>
        {/if}
      {/if}

      {#if feedbackStore.buttplugStatus === 'loading'}
        <div class="dev-empty">Initializing WASM server…</div>
      {/if}

      {#if feedbackStore.buttplugError === 'init-failed'}
        <div class="dev-empty dev-error">WASM server init failed. Check console for details.</div>
      {/if}
    </div>
  {/if}

  {#if feedbackStore.buttplugError === 'no-bluetooth'}
    <div class="bt-help">
      <strong>Web Bluetooth not available</strong>
      <ul>
        <li><b>Chrome/Edge (Win/Mac)</b>: works out of the box</li>
        <li><b>Chrome/Edge (Linux)</b>:<br><code>chrome://flags/#enable-experimental-web-platform-features</code></li>
        <li><b>Android</b>: works in Chrome 56+</li>
        <li><b>Firefox/Safari/iOS</b>: not supported</li>
      </ul>
      <span class="bt-note">Linux needs BlueZ 5.43+ and bluetooth service running.</span>
    </div>
  {/if}
  {/if}

  {#if feedbackStore.hapticEnabled || feedbackStore.audioEnabled || feedbackStore.buttplugEnabled}
    <h4 class="section-header no-border">Output</h4>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="intensity-bar" class:active={feedbackStore.dynamicIntensity > 0} onclick={() => feedbackStore.forceStop()} title="Click to force stop">
      <div class="intensity-fill" style="width: {Math.round(feedbackStore.dynamicIntensity * 100)}%"></div>
      <span class="intensity-label">{Math.round(feedbackStore.dynamicIntensity * 100)}%</span>
    </div>
  {/if}
{/snippet}

{#if uiStore.isMobile}
  <MobileSheet id="feedback" title="Feedback" icon={fbIcon}>
    {@render windowContent()}
  </MobileSheet>
{:else}
  <DraggableWindow id="feedback" title="Feedback" icon={fbIcon} bind:open={uiStore.feedbackWindowOpen} initialX={10} initialY={550}>
    {@render windowContent()}
  </DraggableWindow>
{/if}

<style>
  .section-header {
    font-size: 11px;
    color: var(--text-ghost);
    font-weight: normal;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin: 10px 0 6px;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--border);
  }
  .section-header:first-child { margin-top: 0; }
  .section-header.no-border { border-bottom: none; padding-bottom: 0; }
  .row {
    display: flex;
    align-items: center;
    min-width: 280px;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  .row label { color: var(--text-dim); font-size: 12px; }
  .toys-panel {
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 6px 8px;
    margin-bottom: 6px;
  }
  .toys-header {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .dot {
    width: 7px; height: 7px;
    border-radius: 50%;
    background: var(--text-muted);
    flex-shrink: 0;
  }
  .dot.ok { background: var(--live); }
  .dot.loading { background: var(--warning); animation: blink 0.8s infinite; }
  .dot.err { background: var(--danger); }
  @keyframes blink { 50% { opacity: 0.3; } }
  .toys-status {
    font-size: 11px;
    color: var(--text-dim);
    flex: 1;
    text-transform: capitalize;
  }
  .dev-list {
    margin-top: 6px;
    border-top: 1px solid var(--border);
    padding-top: 4px;
  }
  .dev-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    padding: 3px 2px;
    border-radius: 2px;
  }
  .dev-row:hover { background: var(--row-hover); }
  .dev-name {
    color: var(--text);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dev-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    margin-left: 8px;
  }
  .dev-bat {
    font-size: 10px;
    color: var(--live);
    background: var(--ui-bg);
    padding: 0 4px;
    border-radius: 2px;
  }
  .dev-bat.low { color: var(--danger); }
  .dev-bat.mid { color: var(--warning); }
  .dev-empty {
    font-size: 11px;
    color: var(--text-muted);
    font-style: italic;
    margin-top: 6px;
  }
  .dev-error { color: var(--danger); font-style: normal; }
  .bt-help {
    margin-bottom: 6px;
    padding: 5px 8px;
    background: color-mix(in srgb, var(--warning) 8%, transparent);
    border: 1px solid var(--warning);
    border-radius: 3px;
    font-size: 11px;
    color: var(--warning);
    line-height: 1.6;
  }
  .bt-help strong { color: var(--warning-bright); }
  .bt-help ul { margin-top: 4px; }
  .bt-help ul { margin: 0; padding-left: 14px; }
  .bt-help li { margin-bottom: 2px; }
  .bt-help b { color: var(--text-dim); }
  .bt-help code {
    font-size: 10px;
    background: color-mix(in srgb, var(--text) 6%, transparent);
    padding: 1px 4px;
    border-radius: 2px;
  }
  .bt-note { font-size: 10px; color: var(--text-muted); display: block; margin-top: 4px; }
  .intensity-bar {
    position: relative;
    height: 16px;
    background: var(--ui-bg);
    border: 1px solid var(--border);
    border-radius: 2px;
    overflow: hidden;
    cursor: pointer;
  }
  .intensity-bar:hover { border-color: var(--danger); }
  .intensity-bar.active { border-color: var(--live); }
  .intensity-fill {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    background: var(--live);
    opacity: 0.25;
    transition: width 0.1s linear;
  }
  .intensity-bar.active .intensity-fill { opacity: 0.4; }
  .intensity-label {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    color: var(--text-muted);
    pointer-events: none;
  }
  .intensity-bar.active .intensity-label { color: var(--text); }
</style>
