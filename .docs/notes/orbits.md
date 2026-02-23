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

## J2 Secular Corrections

The original approach froze orbit orientations at TLE epoch, causing satellites to visibly drift off their displayed orbits when time was warped forward (J2 causes ~5°/day RAAN precession for LEO).

### Perifocal split

The orbit **shape** depends only on (a, e) — invariant under J2. Only the **orientation** (Ω, ω) precesses. The computation splits into two phases:

1. **Perifocal vertices** (computed once at TLE load): sweep true anomaly, store (x_pf, y_pf) per vertex. These never change.

2. **ECI rotation** (recomputed periodically): apply J2-corrected Ω(t) and ω(t) to rotate perifocal → ECI.

J2 secular rates (computed once per satellite at parse time):

```
dΩ/dt = -1.5 · n · J2 · (Rₑ/p)² · cos(i)
dω/dt =  1.5 · n · J2 · (Rₑ/p)² · (2 - 2.5·sin²(i))
```

Where J2 = 1.08263×10⁻³, Rₑ = 6378.137 km (equatorial), p = a(1-e²).

### Recomputation schedule

ECI vertices are recomputed when simulation time drifts >15 minutes from the last computation, with a wall-clock guard capping at ~30 Hz to prevent CPU overload at extreme time warps.

**Cost per recompute** (10k satellites, 30 segments): 60k trig calls + 310k matrix multiplies ≈ 5ms.

### Atmospheric drag (ndot)

The first derivative of mean motion (ṅ) is parsed from TLE line 1 and used to correct semi-major axis decay: a(t) = (μ/n(t)²)^(1/3) where n(t) = n₀ + ṅ·Δt. Perifocal vertices are rebuilt when any satellite's `a` has drifted >0.1 km (checked every 6 hours of sim-time).

## Trade-offs

**What we keep accurate**: RAAN precession, argument of perigee rotation, and semi-major axis decay for all background orbits. The highlighted orbit (single selected satellite) still uses full SGP4 propagation for maximum accuracy.

**What we approximate**: J3/J4 higher-order terms (<0.1°/day), short-period oscillations in eccentricity and inclination, third-body perturbations (only significant for MEO/GEO).
