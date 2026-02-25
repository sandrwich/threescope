# Threescope

A browser-based satellite tracker built with Three.js and Svelte. Runs as a static web app with PWA support — installable and usable offline on any device.

**[threescope.imsandra.fyi](https://threescope.imsandra.fyi/)**

![Main view](docs/screenshots/main.webp)
![Moon view](docs/screenshots/moon.webp)
![Solar system orrery](docs/screenshots/orrery.webp)

## Features

### Satellite Tracking

- **Real-time SGP4 propagation** — orbit trails, ground tracks, footprints, periapsis/apoapsis markers
- **Multi-source TLE data** — CelesTrak categories, custom URLs, pasted TLE files, per-source toggle, caching with staleness warnings
- **SatNOGS database** — browse satellites with metadata, transmitter lists, frequency and status filters, satellite images
- **Selection** — search by name or NORAD ID, multi/single select, per-satellite visibility toggle

### Pass Prediction

- **Pass predictor** — Web Worker background computation, day-grouped sortable pass table with eclipse and magnitude indicators
- **Polar plot** — sky track with eclipse coloring, AOS/LOS markers, live position dot, time scrubbing
- **Pass filters** — interactive polar plot editor with draggable elevation/azimuth handles, horizon mask, frequency range, visibility mode, minimum duration
- **Doppler shift** — real-time Doppler curve with SatNOGS transmitter prefill, hover readout, CSV export
- **Visual magnitude** — phase-corrected brightness estimation with atmospheric extinction

### Views and Rendering

- **3D globe** — atmosphere glow, cloud layer, night lights, bump mapping, ambient occlusion, surface relief
- **2D map** — equirectangular projection with country borders and grid overlay
- **Solar system orrery** — Sun, Moon, and all 8 planets with textures, bump maps, and displacement mapping
- **Graphics presets** — Standard and RTX, with per-setting control (bloom, sphere detail, orbit segments, surface relief)

### Simulation

- **Orbit modes** — analytical (Keplerian with optional J2 precession and atmospheric drag) or full SGP4/SDP4
- **Time control** — pause, speed up/slow down, warp to specific times, epoch input

### Observer

- **Location** — coordinates with auto-altitude from elevation data, browser geolocation
- **Sky data** — sun elevation with twilight classification, moon elevation and illumination, observation window timing

### Theming

- **12 built-in themes** — including Everforest, Gruvbox, Solarized, Nord, Tokyo Night, Dracula, Catppuccin
- **Theme editor** — live color editing, clone, import/export as JSON

### General

- **Command palette** — `Ctrl+K` for satellite search, epoch jump, view toggles, planet navigation
- **PWA** — installable, offline-capable

## Development

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
```

Output goes to `dist/`, deployable to any static host.

## Attribution

Based on [TLEscope](https://github.com/aweeri/TLEscope) by [aweeri](https://github.com/aweeri). TLE data from [CelesTrak](https://celestrak.org). Satellite metadata from [SatNOGS](https://satnogs.org). Moon textures from [NASA SVS CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/). Planet textures from [Solar System Scope](https://www.solarsystemscope.com/textures/).

Licensed under [AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.html).
