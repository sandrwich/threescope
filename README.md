# Satvisor

A browser-based satellite tracker built with Three.js and Svelte. Runs as a static web app with PWA support — installable and usable offline on any device.

**[satvisor.com](https://satvisor.com/)**

![Main view](docs/screenshots/main.webp)
![Moon view](docs/screenshots/moon.webp)
![Solar system orrery](docs/screenshots/orrery.webp)

## Features

### Views and Rendering

- **3D globe** — atmosphere glow, cloud layer, night lights, bump mapping, curvature ambient occlusion, vertex displacement relief
- **2D map** — equirectangular projection with country borders and lat/lon grid overlay
- **Sky view** — first-person observer POV with az/el grid, cardinal labels, beam reticle, click-to-aim
- **Solar system orrery** — Sun, Moon, and all 8 planets with textures, bump maps, and displacement mapping
- **Graphics presets** — Standard and RTX, with per-setting control (bloom, sphere detail, orbit segments, surface relief)
- **Texture quality** — switchable Full and Lite modes, slow-connection auto-detection on loading screen

### Antenna Rotator

- **Hardware control** — Web Serial (GS-232, EasyComm II) and WebSocket (rotctld/Hamlib) drivers
- **Auto-tracking** — slews rotator to follow locked satellite with angular velocity monitoring and slew warning
- **Radar scope** — CRT-style polar display with phosphor persistence, satellite blips, draggable beam reticle, sky path overlay
- **Pass-end actions** — park, slew to next AOS with countdown, or idle
- **Status bar** — live az/el, angular velocity, and state display in bottom panel when connected

### Satellite Tracking

- **Real-time SGP4 propagation** — orbit trails, ground tracks, footprints, periapsis/apoapsis markers
- **Multi-source TLE data** — 60+ CelesTrak categories, custom URLs, file upload, pasted TLE/OMM, per-source toggle, caching with staleness warnings
- **SatNOGS database** — browse satellites with metadata, transmitter lists, frequency and status filters, satellite images
- **Selection** — search by name or NORAD ID, multi/single select, per-satellite visibility toggle, spotlight mode
- **Sprite atlas** — custom SVG satellite icons with Earth-pointing rotation and magnitude-based brightness

### Pass Prediction

- **Pass predictor** — Web Worker background computation, day-grouped pass table with eclipse and magnitude indicators, live active-pass highlighting
- **Polar plot** — sky track with eclipse coloring, AOS/TCA/LOS markers, live position dot, time scrubbing, moon/sun position
- **Pass filters** — interactive polar plot editor with draggable elevation/azimuth handles, 8-directional horizon mask, frequency range, visibility mode, minimum duration
- **Doppler shift** — Doppler curve with SatNOGS transmitter prefill, hover readout, range rate, CSV export
- **Visual magnitude** — phase-corrected brightness estimation with atmospheric extinction and standard magnitude catalog

### Observer

- **Location** — coordinates with auto-altitude from elevation data, browser geolocation, draggable marker
- **Sky data** — sun elevation with twilight classification, moon elevation and illumination, observation window timing
- **Beam / antenna** — configurable beam width, azimuth/elevation aiming, satellite lock with auto-tracking, 3D cone visualization

### Simulation

- **Orbit modes** — analytical (Keplerian with optional J2 precession and atmospheric drag) or full SGP4/SDP4
- **Time control** — pause, speed up/slow down (0.25x–131072x), warp to specific times, per-field editing, time scrub strip, epoch input

### Theming

- **12 built-in themes** — Dark, High Contrast, Light, Lavender, TLEscope, Solarized, Gruvbox, Nord, Catppuccin, Everforest, Tokyo Night, Dracula
- **Theme editor** — live color editing with 50+ variables, clone, import/export as JSON

### Feedback

- **Audio** — Web Audio API synthesis (clicks, tones, sweeps, blips) for UI interactions and tracking events
- **Haptic** — vibration patterns on supported devices
- **BLE toys** — embedded WASM integration for Bluetooth vibration devices, no external app needed

### General

- **Command palette** — `Ctrl+K` for satellite search, epoch jump, view toggles, planet navigation, window toggles
- **Map markers** — observer location, launch sites (Cape Canaveral, Vandenberg, Kourou, Baikonur, and more), per-group visibility
- **Mobile** — responsive bottom navigation, slide-up sheets, touch-optimized controls, pinch zoom
- **PWA** — installable, offline-capable, service worker with smart caching

## Development

Some dependencies are published to GitHub Packages under the `@satvisorcom` scope. The `.npmrc` in the repo configures the registry, but you need a GitHub personal access token with `read:packages` scope:

```bash
echo "//npm.pkg.github.com/:_authToken=YOUR_TOKEN" >> ~/.npmrc
npm install
npm run dev
```

Build for production:

```bash
npm run build
```

Output goes to `dist/`, deployable to any static host.

## Self-Hosting

Satvisor can run fully self-contained with no external internet access. All external data dependencies are configurable via build-time environment variables.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_TEXTURE_QUALITY` | *(user choice)* | Force `lite` or `full` texture mode and hide the user toggle. Lite reduces initial download from ~26 MB to ~2 MB |
| `VITE_DATA_MIRROR` | `https://raw.githubusercontent.com/satvisorcom/satvisor-data/master` | Base URL for TLE data and satellite catalogs (stdmag, satnogs) |
| `VITE_CELESTRAK_BASE` | `https://celestrak.org` | Base URL for CelesTrak direct TLE fallback |
| `VITE_SATNOGS_BASE` | `https://db.satnogs.org` | Base URL for SatNOGS satellite images and pages |
| `VITE_TLE_CACHE_MAX_AGE_H` | `1` | Hours before cached TLE data is considered stale and refetched |
| `VITE_TLE_CACHE_EVICT_AGE_H` | `24` | Hours after which TLE caches are deleted on startup. Skipped when offline. Set `0` to disable (keeps TLE data indefinitely — useful for offline deployments) |
| `VITE_FEEDBACK_TOYS` | `true` | Enable Bluetooth toy feedback integration. Set `false` to remove the feature entirely (hides UI, prevents WASM load) |

### Air-Gapped / Offline Deployment

To run Satvisor on an isolated network with no internet:

1. **Clone the [satvisor-data](https://github.com/satvisorcom/satvisor-data) repo** and serve it from your local server (e.g. at `/data-mirror/`)

2. **Build with all URLs pointed locally:**
   ```bash
   VITE_TEXTURE_QUALITY=lite \
   VITE_DATA_MIRROR=/data-mirror \
   VITE_CELESTRAK_BASE= \
   VITE_SATNOGS_BASE= \
   VITE_TLE_CACHE_EVICT_AGE_H=0 \
     npm run build
   ```

3. **Deploy `dist/`** to any static file server (nginx, caddy, python -m http.server, etc.)

Setting `VITE_CELESTRAK_BASE` to empty disables the CelesTrak fallback — TLE data will only come from the mirror. Setting `VITE_SATNOGS_BASE` to empty means satellite images won't load, but everything else works.

The data mirror must follow the same directory structure:
```
<mirror>/celestrak/json/{group}.json       # TLE data per source
<mirror>/celestrak/special/json/{group}.json  # Special TLE sources
<mirror>/catalog/stdmag.json               # Visual magnitude catalog
<mirror>/catalog/satnogs.json              # SatNOGS satellite metadata
<mirror>/manifest.json                     # Source manifest (optional)
```

After first load, the service worker caches all static assets (JS, CSS, textures) — subsequent visits work fully offline. TLE data is cached in localStorage for 24 hours.

## Credits

- TLE data from [CelesTrak](https://celestrak.org)
- Satellite metadata from [SatNOGS](https://satnogs.org)
- Moon textures from [NASA SVS CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/)
- Planet textures from [Solar System Scope](https://www.solarsystemscope.com/textures/)
- Inspired by [TLEscope](https://github.com/aweeri/TLEscope) by [aweeri](https://github.com/aweeri)

## License

[AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.html)
