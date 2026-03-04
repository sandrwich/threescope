# Contributing

## Prerequisites

- **Node.js** 20+
- **npm** (lockfile-based)
- GitHub Packages auth for `@satvisorcom` scope — add to `~/.npmrc`:
  ```
  //npm.pkg.github.com/:_authToken=YOUR_TOKEN
  @satvisorcom:registry=https://npm.pkg.github.com
  ```

## Getting Started

```bash
npm install
npm run dev        # Vite dev server on http://localhost:1420
npm run build      # tsc + vite build → dist/
npm run preview    # serve production build locally
```

## Project Structure

| Directory | Purpose |
|-----------|---------|
| `src/stores/` | Svelte 5 rune-based singleton stores (`*.svelte.ts`) |
| `src/ui/` | Svelte components — windows, panels, toolbar. `shared/` for reusables |
| `src/scene/` | Three.js scene objects (earth, orbits, atmosphere, moon, sun, orrery) |
| `src/astro/` | Pure math — SGP4 helpers, az/el, eclipse, magnitude, epoch utils |
| `src/passes/` | Pass prediction (predictor class + Web Worker) |
| `src/rotator/` | Rotator protocol drivers (rotctld, GS-232, EasyComm) |
| `src/shaders/` | GLSL vertex/fragment shaders |
| `src/feedback/` | Multi-target sensory feedback (audio, haptic, BLE devices) |
| `src/data/` | TLE loading and source definitions |
| `src/interaction/` | Camera controller and input |
| `src/styles/` | Global CSS with all theme variables |

## Testing the Rotator

Two ways to test rotator functionality without hardware:

### Built-in simulator

The project includes a WebSocket rotator simulator that speaks rotctld protocol with simulated motor physics (acceleration, deceleration, backlash):

```bash
npm run rotator-sim
# or with a custom port:
node scripts/rotator-sim.mjs 4534
```

Connect in the app: Setup tab → Network mode → `ws://localhost:4534` (or `4533` for default).

### rotctld dummy rotator

Use Hamlib's `rotctld` with the dummy backend for a more realistic test (supports az/el limits, error codes):

```bash
# Terminal 1: start rotctld with dummy rotator model
rotctld -m 1 -vvvvv -t 1234 -C min_el=5

# Terminal 2: bridge WebSocket to TCP (pick one)
websocat --binary ws-l:127.0.0.1:4534 tcp:127.0.0.1:1234
# or
websockify 4534 localhost:1234
```

Install a bridge if needed:
```bash
cargo install websocat     # single Rust binary
# or
pip install websockify     # Python
```

Connect in the app: Setup tab → Network mode → `ws://localhost:4534`.

Verify rotctld is responding:
```bash
echo "p" | nc -q1 localhost 1234
# Should return two lines: azimuth and elevation
```

### Testing with a remote rotator

SSH port-forward rotctld from a remote host, then bridge locally:

```bash
ssh user@rotator-host -L 4533:localhost:4533 -N &
websocat --binary ws-l:127.0.0.1:4534 tcp:127.0.0.1:4533
```

## Desktop Builds (Tauri)

Requires Rust stable toolchain and system dependencies:

```bash
# Ubuntu/Debian
sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf

# Build
npx tauri build --bundles deb,appimage    # Linux
npx tauri build --bundles nsis,msi        # Windows
```

For development: `npm run tauri dev`

## Submitting Changes

1. Fork the repo and create a branch from `master`
2. Make your changes and verify `npm run build` passes (TypeScript is the only automated quality gate)
3. Open a pull request against `master`

---

## Conventions & Patterns

### Theming

All colors go through CSS custom properties in `src/styles/global.css` `:root`. Never hardcode hex/rgb/rgba values in `<style>` blocks or inline styles. For canvas rendering, use the `palette` object from `src/ui/shared/theme.ts`.

**Text color tiers:**

| CSS variable | Palette field | Use for |
|---|---|---|
| `--text` | `palette.text` | Primary text, hover states |
| `--text-dim` | `palette.textDim` | Labels, secondary text |
| `--text-muted` | `palette.textMuted` | Muted info |
| `--text-faint` | `palette.textFaint` | Faint labels, axis text |
| `--text-ghost` | `palette.textGhost` | Placeholders, section headers |

**Semantic colors:** `--danger`, `--warning`, `--live` for status indicators and alerts.

**Satellite colors:** 9-entry Pride flag palette in `src/constants.ts`. Use helpers, never inline `rgb()`:
- `satColorCss(index)` — CSS/canvas fillStyle
- `satColorRgba(index, alpha)` — translucent canvas
- `satColorGl(index)` — WebGL/Three.js (0–1 floats)

### Stores

Class-based singletons with `$state()` fields, exported as `export const fooStore = new FooStore()`.

- Callback hooks (e.g., `onGraphicsChange`) registered by `App` at init, not Svelte subscriptions
- localStorage persistence: `load()` at startup + immediate writes in setters, all keys prefixed `satvisor_`
- Immutable updates for collections: `this.x = new Set(...)`, `this.x = { ...this.x, ... }`
- Store `load()` calls go in `app.ts` init

### Persisted Toggles

Most user-facing toggles persist to localStorage. If a setting should survive page reload, follow this pattern:

1. Add `$state` field to the store
2. Add to `loadToggles()` with a `satvisor_*` key
3. Add a case to `setToggle()`
4. Wire in component with `<Checkbox>` + `onchange` calling the setter

Never toggle state without persisting — direct assignment without a localStorage write is a bug.

### Shared Components

| Component | Use for |
|-----------|---------|
| `Checkbox.svelte` | All toggle checkboxes |
| `DraggableWindow.svelte` | Floating windows (collision avoidance, edge snapping) |
| `MobileSheet.svelte` | Mobile bottom sheets |
| `InfoTip.svelte` | Hover tooltips on labels |
| `Modal.svelte` | Modal dialogs |
| `Slider.svelte` | Range inputs with label and value display |
| `Button.svelte` | All buttons |
| `icons.ts` | Inline SVG strings via `{@html ICON_FOO}` |

### Adding a New Window

Every window must support both desktop and mobile:

1. Add open state to `uiStore`: `myWindowOpen = $state(false)`
2. Choose a unique `id` string shared by DraggableWindow and MobileSheet
3. Use the snippet pattern — extract content into `{#snippet windowContent()}`:
   ```svelte
   {#if uiStore.isMobile}
     <MobileSheet id="my-feature" title="Title" icon={myIcon}>
       {@render windowContent()}
     </MobileSheet>
   {:else}
     <DraggableWindow id="my-feature" title="Title" icon={myIcon}
       bind:open={uiStore.myWindowOpen} initialX={10} initialY={200}>
       {@render windowContent()}
     </DraggableWindow>
   {/if}
   ```
4. Register in `MobileNav.svelte` (`moreItems` array)
5. Mount in `Overlay.svelte` unconditionally
6. Add toolbar button in `TlePicker.svelte` and optionally a keyboard shortcut in `input-handler.ts`
7. Add command palette action in `CommandPalette.svelte`

### Sprite Atlas

Satellite icons come from a sprite atlas — a horizontal strip of 256x256 sprites in `public/textures/ui/sat_sprites.png`.

To add a new sprite:
1. Create `public/textures/ui/sprites/NN-name.svg` (256x256 viewBox, `#e3e3e3` fill)
2. Add slot constant in `src/scene/sprite-config.ts`
3. Update `getSpriteIndex()` for matching satellites
4. Run `./scripts/generate-sprite.sh`

### Feedback System

The app routes events to audio, haptic, and BLE outputs via `feedbackStore`. Shared components (`Button`, `Checkbox`, `Slider`) already fire feedback through global DOM listeners — no per-component wiring needed. For new discrete interactions, add to `FeedbackEvent` enum and `FEEDBACK_MAP` in `src/feedback/types.ts`. For continuous interactions (drag, scrub), use `feedbackStore.fireDynamic(intensity)` with 0–1 range.
