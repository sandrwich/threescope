<script lang="ts">
  import DraggableWindow from './shared/DraggableWindow.svelte';
  import { uiStore } from '../stores/ui.svelte';
  import { observerStore } from '../stores/observer.svelte';
  import { timeStore } from '../stores/time.svelte';
  import { ICON_OBSERVER } from './shared/icons';
  import { getElevation, isElevationLoaded } from '../astro/elevation';
  import { sunAltitude } from '../astro/eclipse';
  import { epochToGmst, epochToDate } from '../astro/epoch';
  import { moonPositionECI, moonIllumination } from '../astro/moon-observer';
  import { getAzEl } from '../astro/az-el';
  import { DEG2RAD } from '../constants';

  // --- Observer location ---
  let obsLat = $state(String(observerStore.location.lat));
  let obsLon = $state(String(observerStore.location.lon));
  let obsAlt = $state(String(observerStore.location.alt));
  let obsName = $state(observerStore.location.name);

  function applyObserver() {
    const lat = Math.max(-90, Math.min(90, Number(obsLat) || 0));
    const lon = Math.max(-180, Math.min(180, Number(obsLon) || 0));
    const alt = Math.max(0, Number(obsAlt) || 0);
    observerStore.setLocation({ name: obsName, lat, lon, alt });
  }

  function lookupAlt() {
    if (!isElevationLoaded()) return;
    const lat = Number(obsLat) || 0;
    const lon = Number(obsLon) || 0;
    obsAlt = String(getElevation(lat, lon));
    applyObserver();
  }

  function useMyLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        obsLat = pos.coords.latitude.toFixed(4);
        obsLon = pos.coords.longitude.toFixed(4);
        obsAlt = String(Math.round(pos.coords.altitude ?? 0));
        obsName = '';
        applyObserver();
      },
      () => { /* user denied or error */ },
      { enableHighAccuracy: true },
    );
  }

  // Sync back when store changes externally
  $effect(() => {
    obsLat = String(observerStore.location.lat);
    obsLon = String(observerStore.location.lon);
    obsAlt = String(observerStore.location.alt);
    obsName = observerStore.location.name;
  });

  // --- Sky data (real-time) ---
  function sunLabel(alt: number): string {
    if (alt > 0) return 'Daylight';
    if (alt > -6) return 'Civil twilight';
    if (alt > -12) return 'Nautical twilight';
    if (alt > -18) return 'Astronomical twilight';
    return 'Night';
  }

  let sunEl = $derived.by(() => {
    if (!observerStore.isSet) return null;
    const epoch = timeStore.epoch;
    const gmst = epochToGmst(epoch) * DEG2RAD;
    const obs = observerStore.location;
    return sunAltitude(epoch, obs.lat, obs.lon, obs.alt, gmst);
  });

  let moonData = $derived.by(() => {
    if (!observerStore.isSet) return null;
    const epoch = timeStore.epoch;
    const gmst = epochToGmst(epoch) * DEG2RAD;
    const obs = observerStore.location;
    const moonEci = moonPositionECI(epoch);
    const { el } = getAzEl(moonEci.x, moonEci.y, moonEci.z, gmst, obs.lat, obs.lon, obs.alt);
    const illum = moonIllumination(epoch);
    return { el, illum };
  });

  // --- Observation window (tonight) ---
  // Find when sun crosses -6° and -18° thresholds
  function findSunCrossing(startEpoch: number, threshold: number, direction: 'down' | 'up', maxHours: number): number | null {
    const obs = observerStore.location;
    const step = 5 / 1440; // 5 minute steps in TLE epoch days
    const maxSteps = Math.round(maxHours * 12);
    let t = startEpoch;
    let prevAlt = sunAltitude(t, obs.lat, obs.lon, obs.alt, epochToGmst(t) * DEG2RAD);

    for (let i = 0; i < maxSteps; i++) {
      t += step;
      const alt = sunAltitude(t, obs.lat, obs.lon, obs.alt, epochToGmst(t) * DEG2RAD);
      const crossed = direction === 'down'
        ? (prevAlt >= threshold && alt < threshold)
        : (prevAlt <= threshold && alt > threshold);
      if (crossed) {
        // Binary search for precision
        let lo = t - step, hi = t;
        for (let j = 0; j < 10; j++) {
          const mid = (lo + hi) / 2;
          const midAlt = sunAltitude(mid, obs.lat, obs.lon, obs.alt, epochToGmst(mid) * DEG2RAD);
          if ((direction === 'down' && midAlt >= threshold) || (direction === 'up' && midAlt <= threshold)) {
            lo = mid;
          } else {
            hi = mid;
          }
        }
        return (lo + hi) / 2;
      }
      prevAlt = alt;
    }
    return null;
  }

  function formatUtc(epoch: number): string {
    const d = epochToDate(epoch);
    const h = String(d.getUTCHours()).padStart(2, '0');
    const m = String(d.getUTCMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }

  // Cache observation window — recompute only when epoch changes significantly
  let lastWindowEpoch = $state(0);
  let obsWindow = $state<{ start: number | null; end: number | null } | null>(null);

  $effect(() => {
    if (!observerStore.isSet) { obsWindow = null; return; }
    const epoch = timeStore.epoch;
    // Recompute every 10 minutes of sim time
    if (Math.abs(epoch - lastWindowEpoch) < 10 / 1440) return;
    lastWindowEpoch = epoch;

    const currentSunAlt = sunEl;
    if (currentSunAlt === null) return;

    let start: number | null = null;
    let end: number | null = null;

    if (currentSunAlt > -6) {
      // Sun is above civil twilight threshold — find when it drops below -6°
      start = findSunCrossing(epoch, -6, 'down', 24);
      if (start !== null) {
        end = findSunCrossing(start, -6, 'up', 24);
      }
    } else if (currentSunAlt > -18) {
      // We're in the observation window right now
      start = epoch;
      // Find when sun drops below -18° (end of window, most LEO sats eclipsed)
      const astroEnd = findSunCrossing(epoch, -18, 'down', 12);
      // Or find when sun rises back above -6° (dawn)
      const civilEnd = findSunCrossing(epoch, -6, 'up', 24);
      end = astroEnd ?? civilEnd;
    } else {
      // Deep night — find next rise above -18° (morning window)
      start = findSunCrossing(epoch, -18, 'up', 24);
      if (start !== null) {
        end = findSunCrossing(start, -6, 'up', 12);
      }
    }

    obsWindow = { start, end };
  });
</script>

{#snippet obsIcon()}<span class="title-icon">{@html ICON_OBSERVER}</span>{/snippet}

<DraggableWindow id="observer" title="Observer" icon={obsIcon} bind:open={uiStore.observerWindowOpen} initialX={10} initialY={490}>
  <div class="ow">
    <!-- Location -->
    <h4 class="section-header">Location</h4>
    <div class="obs-name-row">
      <label>Name</label>
      <input class="obs-input" type="text" bind:value={obsName} onblur={applyObserver} placeholder="Home" />
    </div>
    <div class="obs-coord-row">
      <div class="obs-field">
        <label>Lat</label>
        <input class="obs-input" type="number" min="-90" max="90" step="0.01" bind:value={obsLat} onblur={applyObserver} />
      </div>
      <div class="obs-field">
        <label>Lon</label>
        <input class="obs-input" type="number" min="-180" max="180" step="0.01" bind:value={obsLon} onblur={applyObserver} />
      </div>
      <div class="obs-field">
        <label class="alt-label">Alt (m) <button class="alt-auto" onclick={lookupAlt} title="Auto-detect from coordinates">&#8635;</button></label>
        <input class="obs-input" type="number" min="0" step="1" bind:value={obsAlt} onblur={applyObserver} />
      </div>
    </div>
    <button class="geo-btn" onclick={useMyLocation}>Use My Location</button>

    {#if observerStore.isSet}
      <!-- Sky -->
      <h4 class="section-header">Sky</h4>
      <div class="sky-grid">
        <span class="sky-label">Sun</span>
        <span class="sky-value">{sunEl !== null ? `${sunEl.toFixed(1)}\u00b0` : '\u2014'}</span>
        <span class="sky-note">{sunEl !== null ? sunLabel(sunEl) : ''}</span>

        <span class="sky-label">Moon</span>
        <span class="sky-value">{moonData ? `${moonData.el.toFixed(1)}\u00b0` : '\u2014'}</span>
        <span class="sky-note">{moonData ? `${moonData.illum.toFixed(0)}% illuminated` : ''}</span>
      </div>

      <!-- Tonight -->
      <h4 class="section-header">Observation Window</h4>
      {#if obsWindow && obsWindow.start !== null && obsWindow.end !== null}
        <div class="window-row">
          <span class="window-times">{formatUtc(obsWindow.start)} — {formatUtc(obsWindow.end)} UTC</span>
        </div>
        <div class="window-hint">Sun between &minus;6&deg; and &minus;18&deg;</div>
        <div class="window-hint">Satellites sunlit, sky dark enough to observe</div>
      {:else if obsWindow && obsWindow.start !== null}
        <div class="window-row">
          <span class="window-times">From {formatUtc(obsWindow.start)} UTC</span>
        </div>
        <div class="window-hint">End not found in the next 24h</div>
      {:else if sunEl !== null && sunEl <= -18}
        <div class="window-hint">Deep night &mdash; most LEO satellites eclipsed</div>
      {:else}
        <div class="window-hint">No window found in the next 24h</div>
      {/if}
    {/if}
  </div>
</DraggableWindow>

<style>
  .ow {
    min-width: 260px;
    max-width: 320px;
  }

  .section-header {
    font-size: 11px;
    color: var(--text-ghost);
    font-weight: normal;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin: 12px 0 8px;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--border);
  }
  .section-header:first-child { margin-top: 0; }

  /* Location fields (same as former SettingsWindow observer section) */
  .obs-coord-row {
    display: flex;
    gap: 8px;
    margin-bottom: 10px;
  }
  .obs-field {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
  }
  .obs-field label {
    font-size: 10px;
    color: var(--text-ghost);
  }
  .alt-label {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .alt-auto {
    background: none;
    border: none;
    color: var(--text-ghost);
    cursor: pointer;
    font-size: 11px;
    padding: 0;
    line-height: 1;
  }
  .alt-auto:hover { color: var(--text-dim); }
  .obs-input {
    background: var(--ui-bg);
    color: var(--text);
    border: 1px solid var(--border);
    padding: 3px 6px;
    font-size: 12px;
    font-family: inherit;
    width: 100%;
    box-sizing: border-box;
  }
  .obs-input:hover { border-color: var(--border-hover); }
  .obs-name-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }
  .obs-name-row label {
    color: var(--text-dim);
    flex-shrink: 0;
  }
  .obs-name-row .obs-input {
    flex: 1;
  }
  .geo-btn {
    background: none;
    border: 1px solid var(--border);
    color: var(--text-dim);
    font-size: 11px;
    font-family: inherit;
    padding: 4px 12px;
    cursor: pointer;
    width: 100%;
  }
  .geo-btn:hover { border-color: var(--border-hover); color: var(--text); }

  /* Sky section */
  .sky-grid {
    display: grid;
    grid-template-columns: auto auto 1fr;
    gap: 2px 10px;
    font-size: 12px;
  }
  .sky-label {
    color: var(--text-ghost);
  }
  .sky-value {
    color: var(--text-dim);
    text-align: right;
  }
  .sky-note {
    color: var(--text-ghost);
    font-size: 11px;
  }

  /* Observation window */
  .window-row {
    margin-bottom: 4px;
  }
  .window-times {
    font-size: 13px;
    color: var(--text-dim);
    letter-spacing: 0.5px;
  }
  .window-hint {
    font-size: 10px;
    color: var(--text-ghost);
  }
</style>
