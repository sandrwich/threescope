# Satellite Visual Magnitude Estimation

Threescope estimates how bright a satellite appears during a pass. The estimate
is shown in the Mag column of the Passes window and in the hover tooltip.

## How It Works

```
apparent_mag = stdMag + range_correction + phase_correction + extinction
```

**Standard magnitude** (stdMag) is the satellite's intrinsic brightness at 1000 km
range and 90° phase angle. This value comes from `src/data/stdmag.json`, a
pre-generated lookup table keyed by NORAD catalog number.

**Range correction** accounts for distance — closer satellites appear brighter.
`5 · log₁₀(range / 1000)`. A satellite at 500 km gets a -1.5 mag boost.

**Phase correction** accounts for sun angle. We model satellites as Lambertian
(diffuse) spheres: `F(φ) = (sin(φ) + (π − φ) · cos(φ)) / π`. Satellites facing
the sun (low phase angle) are brighter. This is the biggest source of error —
real satellites have flat panels and shiny surfaces, not uniform matte spheres.

**Atmospheric extinction** dims satellites near the horizon. We use the
Kasten-Young (1989) airmass formula with 0.2 mag/airmass (clear sky).

## Where the Data Comes From

TLE files contain no brightness information. We generate `src/data/stdmag.json`
by merging three external sources, in priority order:

### 1. McCants QuickSat Database (qs.mag) — ~3,000 satellites

The gold standard. Mike McCants maintained a database of **observationally-derived
visual magnitudes** from decades of amateur satellite observations. Each entry is
a real measurement, not a guess.

- **Source**: GitHub mirror at `barolfe/satellite-tracker` (original site offline
  since 2020)
- **Convention**: McCants uses full-phase (0°), brightest-likely orientation.
  We add +1.0 mag to convert to our 90° half-phase convention.
- **Coverage**: ~4,100 entries total, ~3,000 non-decayed satellites with magnitudes
- **Limitation**: Frozen at September 2020. No Starlink, no recent launches.

### 2. CelesTrak SATCAT RCS — ~12,000 satellites

CelesTrak publishes a satellite catalog with Radar Cross-Section (RCS) values in
square meters. We convert RCS to approximate magnitude using:

```
stdMag = -26.74 - 2.5 · log₁₀(0.15 · RCS / (4π² · 10¹²))
```

The 0.15 albedo is a rough spacecraft average (solar panels ~0.05, white paint ~0.2).

- **Source**: `https://celestrak.org/pub/satcat.csv` (~6.5 MB, free, no auth)
- **Coverage**: ~33,000 objects have RCS, ~15,000 on-orbit
- **Limitation**: RCS is radar reflectivity, not optical — the conversion is
  approximate. Modern constellations (Starlink, OneWeb) have no RCS entries.

### 3. Name-Prefix Heuristics — constellations missing from both sources

For satellites not in McCants or SATCAT, we match the satellite name against
known constellation prefixes:

| Prefix | StdMag | Rationale |
|--------|--------|-----------|
| STARLINK | 5.5 | v1.5/v2-mini average |
| ONEWEB | 7.0 | Smaller constellation sats |
| IRIDIUM | 6.0 | Non-flare baseline |
| GPS/NAVSTAR | 8.0 | High orbit, faint |
| GLONASS/BEIDOU/GALILEO | 7.5–8.0 | Navigation constellations |
| COSMOS | 4.0 | Typically large Soviet-era |
| SL-\*/CZ-\*/FALCON | 3.0–3.5 | Rocket bodies |

### 4. Object-Type Fallback

Satellites matching none of the above get an estimate based on their SATCAT
object type, using median RCS values per type:

- **PAY** (payload): ~2.3 m² → stdMag ~5.8
- **R/B** (rocket body): ~4.6 m² → stdMag ~5.0
- **DEB** (debris): ~0.02 m² → stdMag ~10.9

If none of these apply, `stdMag` is null and the UI shows `?`.

## Generating the Data

```bash
npx tsx scripts/generate-stdmag.ts
```

This fetches McCants and SATCAT, merges them by priority, and writes
`src/data/stdmag.json` (~390 KB, ~33,000 entries keyed by NORAD ID).
The generated file is committed to the repo so the app works offline.

Output breakdown from a typical run:
- McCants observed: ~3,000 satellites
- SATCAT RCS-derived: ~12,000 satellites
- Name-prefix rule: ~13,000 satellites (mostly Starlink)
- Object-type fallback: ~5,000 satellites

## Accuracy

| Component | Error |
|-----------|-------|
| Range correction | < 0.1 mag |
| Phase angle geometry | < 0.5° |
| Phase model (Lambertian sphere) | ±1–2 mag |
| Atmospheric extinction | ±0.3 mag |
| StdMag (McCants observed) | ±0.5–1.0 mag |
| StdMag (RCS-derived) | ±1.5–2.0 mag |
| StdMag (name-prefix) | ±1–3 mag |

**Overall: ±1–2 magnitudes** for most satellites. Good enough to tell
"naked eye" from "binoculars" from "telescope." Not accurate enough for
camera exposure planning.

The biggest error source is the phase model — real satellites are not
uniform spheres. A Starlink edge-on vs face-on can differ by 3+ magnitudes.

## Regenerating

```bash
npx tsx scripts/generate-stdmag.ts
```

Fetches both sources, merges by priority, writes `src/data/stdmag.json`.
Commit the updated JSON after regenerating.
