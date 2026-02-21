# Orbit Rendering Optimization

## Problem

TLEscope renders orbital paths for every loaded satellite. The naive approach calls the **SGP4 propagator** for each point on each orbit — an iterative algorithm that solves the Kepler equation with secular and periodic perturbation corrections. This is accurate but expensive.

**Case study: Starlink constellation (~9,546 satellites)**

### Before: SGP4 per point

Each orbit was drawn with 90 line segments, requiring 91 SGP4 calls per satellite. With 9,546 Starlink satellites, that's **868,686 SGP4 calls per frame**.

Each call involves: epoch-to-Date conversion, `satellite.propagate()` (iterative Kepler solver + perturbation model), and coordinate transformation.

**Measured result: ~1 FPS.**

## Insight: Orbits are ellipses

**SGP4 tells you where a satellite is at a specific time, but we don't need time-accurate positions to draw the orbit shape.** An orbit is a Keplerian ellipse fully defined by five orbital elements we already have from the TLE:

- **a** — semi-major axis
- **e** — eccentricity
- **i** — inclination
- **Ω** — right ascension of ascending node (RAAN)
- **ω** — argument of perigee

The ellipse shape doesn't change over a single orbital period (~90 minutes for LEO). So we can compute all orbits **once** when TLE data loads, store the vertices, and never recompute.

### Analytical Keplerian orbit computation

For each satellite, the orbit is computed analytically:

1. **Build rotation matrix** from perifocal to ECI frame (6 trig calls, once per satellite):

```
R = Rz(-Ω) · Rx(-i) · Rz(-ω)
```

2. **Step through true anomaly** ν from 0 to 2π:

```
p = a(1 - e²)                       semi-latus rectum
r = p / (1 + e·cos(ν))              orbital radius
x_pf = r·cos(ν), y_pf = r·sin(ν)   perifocal position
[x,y,z]_eci = R · [x_pf, y_pf]     rotate to ECI
```

Cost per point: 2 trig calls + 1 division + 6 multiply-adds — orders of magnitude cheaper than SGP4.

### Per-frame rendering

The precomputed vertex data is stored in a single contiguous `Float32Array`. Each frame, the GPU buffer is assembled from this data:

- **No hover/selection**: Single `Float32Array.set()` memcpy of the entire buffer. Zero computation.
- **Hover changes**: Reassemble buffer skipping the active satellite's orbit. Still just memcpy operations.
- **Highlighted orbit**: The single hovered/selected satellite still uses SGP4 for its orbit path, since multi-orbit tracks show visible J2 precession effects that matter for accuracy.

## After: Precomputed analytical orbits

| Metric | Before | After |
|---|---|---|
| SGP4 calls per frame | 868,686 | **0** (background) + ~400 (highlighted sat) |
| FPS (9,546 Starlink sats) | ~1 FPS | **92 FPS** |
| Frame spikes | Every frame | **None** |
| Precomputation cost | — | Once at TLE load, imperceptible |

## Trade-offs

**What we lose**: Analytical Keplerian orbits don't account for J2 oblateness, atmospheric drag, or third-body perturbations. Over a single orbital period, these effects cause <1 km of drift — invisible at visualization scale.

**What we keep**: The highlighted orbit (single selected satellite) still uses full SGP4 propagation, correctly showing RAAN precession over multiple orbit periods.
