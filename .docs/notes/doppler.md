# Doppler Shift Analysis

## Background

The original C/raylib TLEscope added Doppler analysis in commit `1f991d4`. It computes the Doppler-shifted receive frequency for a satellite pass — useful for amateur radio operators tracking weather satellites (NOAA APT at 137 MHz) or ISS repeaters.

This port diverges from the original implementation in two ways: the range-rate computation and the coordinate transformation.

## Propagation

Doppler analysis always uses full SGP4 propagation via satellite.js. This is the same propagator used for satellite positions and orbit rendering in the default accurate mode. In approximate mode, background orbit *rendering* falls back to analytical Kepler ellipses for performance (see [orbits.md](orbits.md)), but Doppler computation always uses SGP4 regardless of mode — analytical Kepler doesn't model perturbations accurately enough for frequency prediction.

## What changed from the C version

### 1. Analytical velocity instead of finite difference

The original computes range rate by propagating the satellite to two nearby times and differencing:

```c
// original: two SGP4 calls, numerical derivative
double dt = 0.1 / 86400.0;
double r1 = get_sat_range(sat, epoch - dt, obs);
double r2 = get_sat_range(sat, epoch + dt, obs);
double range_rate = (r2 - r1) / 0.2;  // km/s
```

Each `get_sat_range` call runs a full SGP4 propagation internally, so computing one Doppler sample costs **two** SGP4 evaluations.

satellite.js `propagate()` already returns both position and velocity in one call. The velocity is an analytical output of the SGP4 model — not a finite difference — so it's both exact (to the model's precision) and free:

```typescript
// ours: one SGP4 call, analytical derivative
const result = propagate(satrec, date);
const pos = result.position;  // ECI km
const vel = result.velocity;  // ECI km/s
```

Range rate is then the dot product of the relative velocity with the range unit vector:

```
dr/dt = dot(v_sat_ecef, r_hat)
```

where `r_hat` is the observer→satellite direction. This is exact (within the SGP4 model) rather than a numerical approximation.

Because we work with analytical ECI velocity rather than differencing two ECEF positions, we must explicitly account for Earth's rotation when transforming velocity to ECEF. The finite-difference approach captures this implicitly — both samples use different GMST values, so the Earth's rotation between them is baked into the position difference. With analytical velocity:

```
v_ECEF = Rz(-GMST) · v_ECI  −  ω × r_ECEF
```

where ω = 7.2921159×10⁻⁵ rad/s is Earth's rotation rate. The cross product `ω × r` for ω along the z-axis simplifies to:

```
correction_x = +ω · y_ecef
correction_y = -ω · x_ecef
correction_z = 0
```

Omitting this correction would introduce an error of ~0.47 km/s at the equator (Earth's surface velocity), which at 137 MHz would shift the Doppler prediction by ~215 Hz — noticeable for narrowband applications.

### 2. Direct ECI→ECEF rotation instead of lat/lon round-trip

The original converts the ECI position to ECEF through an intermediate geodetic representation:

```c
// original: ECI → geodetic lat/lon → ECEF (6 trig calls)
double sat_lat = asin(eci_pos.y / sat_r);
double sat_lon_eci = atan2(-eci_pos.z, eci_pos.x);
double sat_lon_ecef = sat_lon_eci - gmst;
double s_x = sat_r * cos(sat_lat) * cos(sat_lon_ecef);
double s_y = sat_r * cos(sat_lat) * sin(sat_lon_ecef);
double s_z = sat_r * sin(sat_lat);
```

This is mathematically correct but unnecessarily indirect. ECI and ECEF differ only by a rotation around the polar axis by GMST. The direct transformation is just `Rz(-GMST)`:

```typescript
// ours: direct rotation (2 trig calls)
const c = Math.cos(gmstRad);
const s = Math.sin(gmstRad);
ecef_x =  c * eci_x + s * eci_y;
ecef_y = -s * eci_x + c * eci_y;
ecef_z =  eci_z;
```

Same result, fewer operations, no precision loss from trigonometric round-tripping.

## The Doppler formula

Classical Doppler for electromagnetic waves:

```
f_received = f_transmitted × c / (c + v_r)
```

where `v_r` is the range rate (positive = receding) and `c` = 299,792.458 km/s.

The relativistic correction factor is `(v/c)²` ≈ 6×10⁻¹⁰ for LEO velocities (~7.5 km/s). At 137 MHz this is ~0.08 mHz — far below any practical measurement threshold. The classical formula is sufficient.

## Precision

The observer's ECEF coordinates use a spherical Earth model (R = 6371 km). This introduces up to ~21 km position error at mid-latitudes compared to WGS-84, translating to ~2% range rate error (~70 Hz at 137 MHz worst case). Acceptable for visualization; WGS-84 equatorial radius is available in constants if precision is needed later.

## Performance

The graph samples one point per pixel of graph width (~390 samples). Each sample is one `propagate()` call (~0.01 ms) plus lightweight math. Total: **~5 ms**, computed once and cached until the pass or frequency changes.

CSV export resamples at user-specified resolution (default 1 sample/sec). A 10-minute pass at 1 Hz produces 600 samples — computed in ~6 ms.

## Implementation

```
src/astro/doppler.ts        Core math: calculateDopplerShift(), rotateEciToEcef()
src/ui/DopplerWindow.svelte Canvas 2D graph, hover crosshair, live marker, CSV export
```

The window is opened from the Doppler icon on each pass row in the Passes window.
