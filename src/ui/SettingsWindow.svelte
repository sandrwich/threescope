<script lang="ts">
  import DraggableWindow from './shared/DraggableWindow.svelte';
  import { resetWindowLayout } from './shared/DraggableWindow.svelte';
  import MobileSheet from './shared/MobileSheet.svelte';
  import InfoTip from './shared/InfoTip.svelte';
  import Checkbox from './shared/Checkbox.svelte';
  import Select from './shared/Select.svelte';
  import Slider from './shared/Slider.svelte';
  import Button from './shared/Button.svelte';
  import { uiStore } from '../stores/ui.svelte';
  import { ICON_SETTINGS } from './shared/icons';
  import { settingsStore } from '../stores/settings.svelte';
  import { themeStore } from '../stores/theme.svelte';
  import { getPresetSettings } from '../graphics';
  import { getSimPresetSettings } from '../simulation';

  // Build timezone list: common zones + all IANA zones from Intl
  const COMMON_TIMEZONES = [
    'UTC',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Anchorage',
    'Pacific/Honolulu',
    'America/Sao_Paulo',
    'America/Argentina/Buenos_Aires',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Europe/Moscow',
    'Asia/Dubai',
    'Asia/Kolkata',
    'Asia/Bangkok',
    'Asia/Shanghai',
    'Asia/Tokyo',
    'Asia/Seoul',
    'Australia/Sydney',
    'Pacific/Auckland',
  ];

  function getAllTimezones(): string[] {
    try {
      // @ts-ignore — supportedValuesOf is available in modern browsers
      const all: string[] = Intl.supportedValuesOf('timeZone');
      return all;
    } catch {
      return COMMON_TIMEZONES;
    }
  }

  const allTimezones = getAllTimezones();

  // Timezone label: "America/New_York (EST)"
  function tzLabel(tz: string): string {
    const display = tz.replace(/_/g, ' ');
    if (tz === 'UTC') return 'UTC';
    try {
      const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' });
      const abbr = fmt.formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value;
      return abbr ? `${display} (${abbr})` : display;
    } catch {
      return display;
    }
  }

  function onTimezoneChange(e: Event) {
    settingsStore.applyTimezone((e.target as HTMLSelectElement).value);
  }

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

  function onOrbitsToDrawInput(e: Event) {
    settingsStore.simulation.orbitsToDraw = Number((e.target as HTMLInputElement).value) / 10;
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

  // --- FOV ---
  function onFovInput(e: Event) {
    settingsStore.applyFov(Number((e.target as HTMLInputElement).value));
  }

  // --- Texture Quality (lite mode) ---
  const textureQualityForced = !!__FORCED_TEXTURE_QUALITY__;
  let liteMode = $state(
    __FORCED_TEXTURE_QUALITY__
      ? __FORCED_TEXTURE_QUALITY__ === 'lite'
      : localStorage.getItem('satvisor_lite_mode') === 'true'
  );

  function setTextureQuality(lite: boolean) {
    localStorage.setItem('satvisor_lite_mode', String(lite));
    location.reload();
  }

  let fpsLabelText = $derived(
    settingsStore.fpsSliderValue === 0 ? 'Vsync' :
    settingsStore.fpsSliderValue > 480 ? 'Unlocked' :
    String(settingsStore.fpsSliderValue)
  );

  let showFpsWarning = $derived(settingsStore.fpsSliderValue > 480);
  let fovDisplay = $derived(settingsStore.fov + '°');
  let reliefDisplay = $derived((settingsStore.graphics.surfaceRelief / 10).toFixed(1) + 'x');
  let isAnalytical = $derived(settingsStore.simulation.orbitMode === 'analytical');
  let orbitsDisplay = $derived(settingsStore.simulation.orbitsToDraw.toFixed(1));
</script>

{#snippet settIcon()}<span class="title-icon">{@html ICON_SETTINGS}</span>{/snippet}
{#snippet windowContent()}
  <h4 class="section-header">Graphics</h4>
  {#if !textureQualityForced}
    <div class="row">
      <label>Texture Quality<InfoTip>Controls texture resolution and total download size. Requires a page reload.
        <div class="tip-options">
          <div><b>Full</b> (~74 MB total)</div>
          <div>8K earth &amp; moon, 4K clouds, displacement &amp; normal maps, elevation grid, 8K planet textures in orrery</div>
          <div>~26 MB blocking before app loads</div>
          <div>~18 MB elevation grid loaded in background</div>
          <div>~22 MB planet textures on demand in orrery</div>
          <div style="margin-top:6px"><b>Lite</b> (~4 MB total)</div>
          <div>4K earth, 2K night &amp; stars, 1K clouds &amp; moon, no displacement/normal/elevation, lower-res planet &amp; orrery thumbnails</div>
          <div>~2 MB blocking before app loads</div>
          <div>~1 MB planet textures on demand in orrery</div>
        </div>
      </InfoTip></label>
      <Select size="xs" value={liteMode ? 'lite' : 'full'} onchange={(e) => setTextureQuality((e.target as HTMLSelectElement).value === 'lite')}>
        <option value="full">Full</option>
        <option value="lite">Lite</option>
      </Select>
    </div>
  {/if}
  <div class="row">
    <label>Preset</label>
    <Select size="xs" value={settingsStore.graphicsPreset ?? 'custom'} onchange={onGfxPresetChange}>
      <option value="standard">Standard</option>
      <option value="rtx">RTX</option>
      <option value="custom" disabled hidden>Custom</option>
    </Select>
  </div>
  <div class="row">
    <label>Bloom<InfoTip>UnrealBloomPass post-processing. Samples bright fragments and applies a Gaussian blur to simulate light bleeding — visible on the sun disc, city lights, and atmosphere rim.</InfoTip></label>
    <Checkbox bind:checked={settingsStore.graphics.bloom} onchange={onGfxChange} />
  </div>
  <div class="row">
    <label>Atmosphere Glow<InfoTip>Additive rim-glow shell around Earth. Uses a Fresnel-based fragment shader on a slightly oversized sphere — fragments facing the camera get more glow. Only visible when bloom is enabled.</InfoTip></label>
    <Checkbox bind:checked={settingsStore.graphics.atmosphereGlow} onchange={onGfxChange} />
  </div>
  <div class="row">
    <label>Bump Mapping<InfoTip>Perturbs surface normals in the fragment shader using a height map. Adds visible terrain detail (mountains, craters) to Earth, Moon, and planets without increasing vertex count. Uses 4 neighboring texel samples to estimate the local gradient.</InfoTip></label>
    <Checkbox bind:checked={settingsStore.graphics.bumpMapping} onchange={onGfxChange} />
  </div>
  <div class="row">
    <label>Curvature AO<InfoTip>Curvature-based ambient occlusion. Computes a Laplacian from 4 height map neighbors vs. the center texel — concave areas (crater floors, valleys) get darkened, adding depth without a separate AO pass.</InfoTip></label>
    <Checkbox bind:checked={settingsStore.graphics.curvatureAO} onchange={onGfxChange} />
  </div>
  <div class="row">
    <label>Sphere Detail<InfoTip>
      Latitude × longitude subdivisions for planet sphere meshes. Higher counts give vertex displacement maps more geometry to deform.
      <div class="tip-options">
        <div><b>Low</b> (32×32) — 2k tris, fast</div>
        <div><b>Medium</b> (64×64) — 8k tris</div>
        <div><b>High</b> (128×128) — 33k tris</div>
        <div><b>Very High</b> (256×256) — 131k tris</div>
        <div><b>Ultra</b> (512×512) — 524k tris, sharpest relief</div>
      </div>
    </InfoTip></label>
    <Select size="xs" value={String(settingsStore.graphics.sphereDetail)} onchange={onSphereDetailChange}>
      <option value="32">Low</option>
      <option value="64">Medium</option>
      <option value="128">High</option>
      <option value="256">Very High</option>
      <option value="512">Ultra</option>
    </Select>
  </div>
  <Slider label="Surface Relief" display={reliefDisplay} min={0} max={100} value={settingsStore.graphics.surfaceRelief} oninput={onReliefInput}>
    {#snippet tip()}<InfoTip>Perturbs vertex positions along normals using the height map. Controls the exaggeration multiplier — 0× is flat, 10× is extreme terrain relief.</InfoTip>{/snippet}
  </Slider>

  <h4 class="section-header">Simulation</h4>
  <div class="row">
    <label>Preset</label>
    <Select size="xs" value={settingsStore.simulationPreset ?? 'custom'} onchange={onSimPresetChange}>
      <option value="approximate">Approximate</option>
      <option value="accurate">Accurate</option>
      <option value="custom" disabled hidden>Custom</option>
    </Select>
  </div>
  <div class="row">
    <label>Orbit Mode<InfoTip>
      How background orbit paths are computed.
      <div class="tip-options">
        <div><b>Analytical</b> — Keplerian ellipse from TLE orbital elements (a, e, i, Ω, ω). Shape computed once at load; orientation updated with optional J2 secular corrections. Fast even with 10k+ satellites.</div>
        <div><b>SGP4</b> — full SGP4/SDP4 numerical propagation for every satellite. Includes J2–J4, drag, lunar/solar perturbations. Most accurate but O(n × segments) propagation calls on every recompute.</div>
      </div>
    </InfoTip></label>
    <Select size="xs" value={settingsStore.simulation.orbitMode} onchange={onOrbitModeChange}>
      <option value="analytical">Analytical</option>
      <option value="sgp4">SGP4</option>
    </Select>
  </div>
  <div class="row">
    <label>Orbit Segments<InfoTip>
      Number of line segments per orbit ellipse. Each segment is a pair of vertices connected by GL_LINES.
      <div class="tip-options">
        <div><b>Low</b> (16) — visibly polygonal, lightest</div>
        <div><b>Medium</b> (30) — good balance for large datasets</div>
        <div><b>High</b> (60) — smooth curves</div>
        <div><b>Ultra</b> (90) — near-continuous, heaviest</div>
      </div>
    </InfoTip></label>
    <Select size="xs" value={String(settingsStore.simulation.orbitSegments)} onchange={onOrbitSegmentsChange}>
      <option value="16">Low</option>
      <option value="30">Medium</option>
      <option value="60">High</option>
      <option value="90">Ultra</option>
    </Select>
  </div>
  <Slider label="Orbits to Draw" display={orbitsDisplay} min={5} max={50} step={5} value={settingsStore.simulation.orbitsToDraw * 10} oninput={onOrbitsToDrawInput}>
    {#snippet tip()}<InfoTip>How many full orbital periods to render for highlighted satellite orbit paths. Higher values show more of the trajectory but cost more GPU/CPU.</InfoTip>{/snippet}
  </Slider>
  {#if isAnalytical}
    <div class="row">
      <label>J2 Precession<InfoTip>
        Applies J2 secular perturbation to orbit orientation. Earth's oblateness causes RAAN to regress and argument of perigee to advance — about 5°/day for typical LEO orbits.
        <div class="tip-options">
          <div><b>On</b> — Ω(t) = Ω₀ + Ω̇·Δt, ω(t) = ω₀ + ω̇·Δt</div>
          <div><b>Off</b> — orbits stay frozen at TLE epoch angles</div>
        </div>
      </InfoTip></label>
      <Checkbox bind:checked={settingsStore.simulation.j2Precession} onchange={onSimChange} />
    </div>
    <div class="row">
      <label>Atmospheric Drag<InfoTip>
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
    <label>Update Quality<InfoTip>
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
    <Select size="xs" value={String(settingsStore.simulation.updateQuality)} onchange={onUpdateQualityChange}>
      <option value="1">Ultra</option>
      <option value="8">High</option>
      <option value="16">Balanced</option>
      <option value="32">Low</option>
      <option value="64">Lowest</option>
    </Select>
  </div>

  <h4 class="section-header">General</h4>
  <div class="row">
    <label>Timezone</label>
    <Select class="tz-select" size="xs" value={settingsStore.timezone} onchange={onTimezoneChange}>
      {#each allTimezones as tz}
        <option value={tz}>{tzLabel(tz)}</option>
      {/each}
    </Select>
  </div>
  <Slider label="FPS Limit" display={fpsLabelText} min={0} max={482} value={settingsStore.fpsSliderValue} oninput={onFpsInput} />
  {#if showFpsWarning}
    <div class="warning">May reduce UI responsiveness</div>
  {/if}
  <Slider label="Field of View" display={fovDisplay} min={10} max={120} value={settingsStore.fov} oninput={onFovInput}>
    {#snippet tip()}<InfoTip>Camera vertical field of view. Lower values give a telephoto/zoomed-in effect, higher values give a wide-angle/fisheye look. Default is 45°.</InfoTip>{/snippet}
  </Slider>
  <div class="row">
    <label>Theme</label>
    <Button size="xs" onclick={() => { uiStore.themeEditorOpen = !uiStore.themeEditorOpen; if (uiStore.isMobile) uiStore.openMobileSheet('theme-editor'); }}>
      {themeStore.activeTheme.name}
    </Button>
  </div>
  <div class="row">
    <label>Layout</label>
    <Button size="xs" onclick={resetWindowLayout}>Reset Window Positions</Button>
  </div>
{/snippet}

{#if uiStore.isMobile}
  <MobileSheet id="settings" title="Settings" icon={settIcon}>
    {@render windowContent()}
  </MobileSheet>
{:else}
  <DraggableWindow id="settings" title="Settings" icon={settIcon} bind:open={uiStore.settingsOpen} initialX={10} initialY={490}>
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
  .row {
    display: flex;
    align-items: center;
    min-width: 280px;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  .row label { color: var(--text-dim); font-size: 12px; }
  :global(.tz-select) {
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .warning {
    font-size: 11px;
    color: var(--warning);
    margin: -6px 0 8px;
  }

</style>
