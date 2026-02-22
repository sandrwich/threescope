<script lang="ts">
  import DraggableWindow from './shared/DraggableWindow.svelte';
  import InfoTip from './shared/InfoTip.svelte';
  import Checkbox from './shared/Checkbox.svelte';
  import { uiStore } from '../stores/ui.svelte';
  import { ICON_SETTINGS } from './shared/icons';
  import { settingsStore } from '../stores/settings.svelte';
  import { getPresetSettings } from '../graphics';
  import { getSimPresetSettings } from '../simulation';

  // --- Graphics ---
  function onGfxPresetChange(e: Event) {
    const val = (e.target as HTMLSelectElement).value;
    if (val === 'custom') return;
    settingsStore.applyGraphics(getPresetSettings(val));
  }

  function onGfxChange() {
    settingsStore.applyGraphics({ ...settingsStore.graphics });
  }

  function onReliefInput(e: Event) {
    settingsStore.graphics.surfaceRelief = Number((e.target as HTMLInputElement).value);
    onGfxChange();
  }

  function onSphereDetailChange(e: Event) {
    settingsStore.graphics.sphereDetail = Number((e.target as HTMLSelectElement).value);
    onGfxChange();
  }

  // --- Simulation ---
  function onSimPresetChange(e: Event) {
    const val = (e.target as HTMLSelectElement).value;
    if (val === 'custom') return;
    settingsStore.applySimulation(getSimPresetSettings(val));
  }

  function onSimChange() {
    settingsStore.applySimulation({ ...settingsStore.simulation });
  }

  function onOrbitModeChange(e: Event) {
    settingsStore.simulation.orbitMode = (e.target as HTMLSelectElement).value as 'analytical' | 'sgp4';
    onSimChange();
  }

  function onOrbitSegmentsChange(e: Event) {
    settingsStore.simulation.orbitSegments = Number((e.target as HTMLSelectElement).value);
    onSimChange();
  }

  function onUpdateQualityChange(e: Event) {
    settingsStore.simulation.updateQuality = Number((e.target as HTMLSelectElement).value);
    onSimChange();
  }

  // --- FPS ---
  function onFpsInput(e: Event) {
    settingsStore.applyFpsLimit(Number((e.target as HTMLInputElement).value));
  }

  let fpsLabelText = $derived(
    settingsStore.fpsSliderValue === 0 ? 'Vsync' :
    settingsStore.fpsSliderValue > 480 ? 'Unlocked' :
    String(settingsStore.fpsSliderValue)
  );

  let showFpsWarning = $derived(settingsStore.fpsSliderValue > 480);
  let reliefDisplay = $derived((settingsStore.graphics.surfaceRelief / 10).toFixed(1) + 'x');
  let isAnalytical = $derived(settingsStore.simulation.orbitMode === 'analytical');
</script>

{#snippet settIcon()}<span class="title-icon">{@html ICON_SETTINGS}</span>{/snippet}
<DraggableWindow title="Settings" icon={settIcon} bind:open={uiStore.settingsOpen} initialX={10} initialY={490}>
  <h4 class="section-header">Graphics</h4>
  <div class="row">
    <label>Preset</label>
    <select value={settingsStore.graphicsPreset ?? 'custom'} onchange={onGfxPresetChange}>
      <option value="standard">Standard</option>
      <option value="rtx">RTX</option>
      <option value="custom" disabled hidden>Custom</option>
    </select>
  </div>
  <div class="row">
    <label>Bloom <InfoTip>UnrealBloomPass post-processing. Samples bright fragments and applies a Gaussian blur to simulate light bleeding — visible on the sun disc, city lights, and atmosphere rim.</InfoTip></label>
    <Checkbox bind:checked={settingsStore.graphics.bloom} onchange={onGfxChange} />
  </div>
  <div class="row">
    <label>Atmosphere Glow <InfoTip>Additive rim-glow shell around Earth. Uses a Fresnel-based fragment shader on a slightly oversized sphere — fragments facing the camera get more glow. Only visible when bloom is enabled.</InfoTip></label>
    <Checkbox bind:checked={settingsStore.graphics.atmosphereGlow} onchange={onGfxChange} />
  </div>
  <div class="row">
    <label>Bump Mapping <InfoTip>Perturbs surface normals in the fragment shader using a height map. Adds visible terrain detail (mountains, craters) to Earth, Moon, and planets without increasing vertex count. Uses 4 neighboring texel samples to estimate the local gradient.</InfoTip></label>
    <Checkbox bind:checked={settingsStore.graphics.bumpMapping} onchange={onGfxChange} />
  </div>
  <div class="row">
    <label>Curvature AO <InfoTip>Curvature-based ambient occlusion. Computes a Laplacian from 4 height map neighbors vs. the center texel — concave areas (crater floors, valleys) get darkened, adding depth without a separate AO pass.</InfoTip></label>
    <Checkbox bind:checked={settingsStore.graphics.curvatureAO} onchange={onGfxChange} />
  </div>
  <div class="row">
    <label>Sphere Detail <InfoTip>
      Latitude × longitude subdivisions for planet sphere meshes. Higher counts give vertex displacement maps more geometry to deform.
      <div class="tip-options">
        <div><b>Low</b> (32×32) — 2k tris, fast</div>
        <div><b>Medium</b> (64×64) — 8k tris</div>
        <div><b>High</b> (128×128) — 33k tris</div>
        <div><b>Very High</b> (256×256) — 131k tris</div>
        <div><b>Ultra</b> (512×512) — 524k tris, sharpest relief</div>
      </div>
    </InfoTip></label>
    <select value={String(settingsStore.graphics.sphereDetail)} onchange={onSphereDetailChange}>
      <option value="32">Low</option>
      <option value="64">Medium</option>
      <option value="128">High</option>
      <option value="256">Very High</option>
      <option value="512">Ultra</option>
    </select>
  </div>
  <div class="row slider-row">
    <label>Surface Relief <span class="value-label">{reliefDisplay}</span></label>
    <input type="range" class="slider" min="0" max="100" value={settingsStore.graphics.surfaceRelief} oninput={onReliefInput}>
  </div>

  <h4 class="section-header">Simulation</h4>
  <div class="row">
    <label>Preset</label>
    <select value={settingsStore.simulationPreset ?? 'custom'} onchange={onSimPresetChange}>
      <option value="approximate">Approximate</option>
      <option value="accurate">Accurate</option>
      <option value="custom" disabled hidden>Custom</option>
    </select>
  </div>
  <div class="row">
    <label>Orbit Mode <InfoTip>
      How background orbit paths are computed.
      <div class="tip-options">
        <div><b>Analytical</b> — Keplerian ellipse from TLE orbital elements (a, e, i, Ω, ω). Shape computed once at load; orientation updated with optional J2 secular corrections. Fast even with 10k+ satellites.</div>
        <div><b>SGP4</b> — full SGP4/SDP4 numerical propagation for every satellite. Includes J2–J4, drag, lunar/solar perturbations. Most accurate but O(n × segments) propagation calls on every recompute.</div>
      </div>
    </InfoTip></label>
    <select value={settingsStore.simulation.orbitMode} onchange={onOrbitModeChange}>
      <option value="analytical">Analytical</option>
      <option value="sgp4">SGP4</option>
    </select>
  </div>
  <div class="row">
    <label>Orbit Segments <InfoTip>
      Number of line segments per orbit ellipse. Each segment is a pair of vertices connected by GL_LINES.
      <div class="tip-options">
        <div><b>Low</b> (16) — visibly polygonal, lightest</div>
        <div><b>Medium</b> (30) — good balance for large datasets</div>
        <div><b>High</b> (60) — smooth curves</div>
        <div><b>Ultra</b> (90) — near-continuous, heaviest</div>
      </div>
    </InfoTip></label>
    <select value={String(settingsStore.simulation.orbitSegments)} onchange={onOrbitSegmentsChange}>
      <option value="16">Low</option>
      <option value="30">Medium</option>
      <option value="60">High</option>
      <option value="90">Ultra</option>
    </select>
  </div>
  {#if isAnalytical}
    <div class="row">
      <label>J2 Precession <InfoTip>
        Applies J2 secular perturbation to orbit orientation. Earth's oblateness causes RAAN to regress and argument of perigee to advance — about 5°/day for typical LEO orbits.
        <div class="tip-options">
          <div><b>On</b> — Ω(t) = Ω₀ + Ω̇·Δt, ω(t) = ω₀ + ω̇·Δt</div>
          <div><b>Off</b> — orbits stay frozen at TLE epoch angles</div>
        </div>
      </InfoTip></label>
      <Checkbox bind:checked={settingsStore.simulation.j2Precession} onchange={onSimChange} />
    </div>
    <div class="row">
      <label>Atmospheric Drag <InfoTip>
        Uses the TLE first derivative of mean motion (ṅ, ndot) to model orbital decay. Every 6 hours of sim-time, semi-major axis is recomputed: a(t) = (μ / n(t)²)^⅓ where n(t) = n₀ + ṅ·Δt. Perifocal vertices are rebuilt if any satellite's a drifts &gt;0.1 km.
        <div class="tip-options">
          <div><b>On</b> — LEO orbits gradually shrink</div>
          <div><b>Off</b> — orbits keep their original size</div>
        </div>
      </InfoTip></label>
      <Checkbox bind:checked={settingsStore.simulation.atmosphericDrag} onchange={onSimChange} />
    </div>
  {/if}
  <div class="row">
    <label>Update Quality <InfoTip>
      Satellites are divided into N batches. Each frame, one batch gets a full SGP4 position update. N adapts to time warp: at high warp, more batches run per frame automatically.
      <div class="tip-options">
        <div><b>Ultra</b> — every satellite updated every frame, zero staleness</div>
        <div><b>High</b> — LEO ≈ 1 km max error</div>
        <div><b>Balanced</b> — LEO ≈ 2 km max error</div>
        <div><b>Low</b> — LEO ≈ 4 km max error</div>
        <div><b>Lowest</b> — LEO ≈ 8 km max error</div>
      </div>
      <div>Errors for LEO at ~550 km altitude (~7.6 km/s), 1× speed, 60 FPS. Scales linearly with frame rate — at 30 FPS errors double. Higher orbits are slower and have proportionally less error.</div>
    </InfoTip></label>
    <select value={String(settingsStore.simulation.updateQuality)} onchange={onUpdateQualityChange}>
      <option value="1">Ultra</option>
      <option value="8">High</option>
      <option value="16">Balanced</option>
      <option value="32">Low</option>
      <option value="64">Lowest</option>
    </select>
  </div>

  <h4 class="section-header">General</h4>
  <div class="row slider-row">
    <label>FPS Limit <span class="value-label">{fpsLabelText}</span></label>
    <input type="range" class="slider" min="0" max="482" value={settingsStore.fpsSliderValue} oninput={onFpsInput}>
  </div>
  {#if showFpsWarning}
    <div class="warning">May reduce UI responsiveness</div>
  {/if}
</DraggableWindow>

<style>
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
  .row {
    display: flex;
    align-items: center;
    min-width: 280px;
    justify-content: space-between;
    margin-bottom: 10px;
  }
  .row label { color: var(--text-dim); }
  .row select {
    background: var(--ui-bg);
    color: var(--text);
    border: 1px solid var(--border);
    padding: 3px 6px;
    font-size: 13px;
    font-family: inherit;
    cursor: pointer;
  }
  .row select:hover { border-color: var(--border-hover); }
  .slider-row { flex-direction: column; align-items: stretch; gap: 4px; }
  .slider-row label { display: flex; justify-content: space-between; }
  .slider {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 4px;
    background: var(--border);
    outline: none;
    cursor: pointer;
  }
  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    background: var(--text-dim);
    border: none;
    cursor: pointer;
  }
  .slider::-moz-range-thumb {
    width: 14px;
    height: 14px;
    background: var(--text-dim);
    border: none;
    cursor: pointer;
  }
  .slider:hover::-webkit-slider-thumb { background: var(--text); }
  .slider:hover::-moz-range-thumb { background: var(--text); }
  .value-label { color: var(--text-muted); }
  .warning {
    font-size: 11px;
    color: #cc6633;
    margin: -6px 0 8px;
  }
</style>
