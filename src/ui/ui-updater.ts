import * as THREE from 'three';
import type { Satellite, SelectedSatInfo } from '../types';
import { ViewMode } from '../types';
import { DRAW_SCALE, EARTH_RADIUS_KM, MU, RAD2DEG, DEG2RAD, MAP_W, TWO_PI } from '../constants';
import { getCorrectedElements } from '../astro/propagator';
import { satColorGl } from '../constants';
import { computeApsis, computeApsis2D } from '../astro/apsis';
import { getMapCoordinates, latLonToSurface } from '../astro/coordinates';
import { uiStore } from '../stores/ui.svelte';
import { sunDirectionECI, isEclipsed } from '../astro/eclipse';
import { computePhaseAngle, observerEci, slantRange, estimateVisualMagnitude } from '../astro/magnitude';
import { epochToGmst } from '../astro/epoch';
import { getAzEl } from '../astro/az-el';
import { observerStore } from '../stores/observer.svelte';
import { beamStore } from '../stores/beam.svelte';

/** Check if a draw-space point is occluded by the Earth sphere. */
function isOccludedByEarth(pt: { x: number; y: number; z: number }, camPos: THREE.Vector3, earthR: number): boolean {
  const dx = pt.x - camPos.x, dy = pt.y - camPos.y, dz = pt.z - camPos.z;
  const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const ux = dx / L, uy = dy / L, uz = dz / L;
  const t = -(camPos.x * ux + camPos.y * uy + camPos.z * uz);
  if (t > 0 && t < L) {
    const cx = camPos.x + ux * t, cy = camPos.y + uy * t, cz = camPos.z + uz * t;
    if (Math.sqrt(cx * cx + cy * cy + cz * cz) < earthR * 0.99) return true;
  }
  return false;
}

/** Format km with space-separated thousands: 340 → "340 km", 12500 → "12 500 km" */
function formatKm(km: number): string {
  return `${Math.round(km).toLocaleString('en-US').replace(/,/g, ' ')} km`;
}

export class UIUpdater {
  update(params: {
    activeSat: Satellite | null;
    hoveredSat: Satellite | null;
    selectedSats: Set<Satellite>;
    gmstDeg: number;
    cfg: any;
    viewMode: ViewMode;
    camera3d: THREE.PerspectiveCamera;
    camera2d: THREE.OrthographicCamera;
    currentEpoch: number;
    periSprite3d: THREE.Sprite;
    apoSprite3d: THREE.Sprite;
    moonDrawPos: THREE.Vector3;
  }): void {
    const {
      activeSat,
      hoveredSat,
      selectedSats,
      gmstDeg,
      cfg,
      viewMode,
      camera3d,
      camera2d,
      currentEpoch,
      periSprite3d,
      apoSprite3d,
    } = params;

    const cardSat = activeSat;
    const L = uiStore.labels;

    // Compute per-sat data for Selection Window
    const satDataArr: SelectedSatInfo[] = [];
    const hasObs = observerStore.isSet;
    const selGmstRad = gmstDeg * DEG2RAD;
    const selSunDir = hasObs ? sunDirectionECI(currentEpoch) : null;
    const selObs = hasObs ? observerStore.location : null;
    const selObsPos = hasObs && selObs ? observerEci(selObs.lat, selObs.lon, selObs.alt, selGmstRad) : null;

    let selIdx = 0;
    for (const sat of selectedSats) {
      const rKm = sat.currentPos.length();
      let lonDeg = (Math.atan2(-sat.currentPos.z, sat.currentPos.x) - (gmstDeg + cfg.earthRotationOffset) * DEG2RAD) * RAD2DEG;
      while (lonDeg > 180) lonDeg -= 360;
      while (lonDeg < -180) lonDeg += 360;

      // Magnitude for this satellite
      let magStr: string | null = null;
      if (hasObs && selSunDir && selObsPos && selObs) {
        const satEci = { x: sat.currentPos.x, y: -sat.currentPos.z, z: sat.currentPos.y };
        if (isEclipsed(satEci.x, satEci.y, satEci.z, selSunDir)) {
          magStr = 'eclipsed';
        } else if (sat.stdMag === null) {
          magStr = 'unknown';
        } else {
          const range = slantRange(satEci, selObsPos);
          const phase = computePhaseAngle(satEci, selSunDir, selObsPos);
          const { el } = getAzEl(satEci.x, satEci.y, satEci.z, selGmstRad, selObs.lat, selObs.lon, selObs.alt);
          const mag = estimateVisualMagnitude(sat.stdMag, range, phase, Math.max(0, el));
          magStr = mag.toFixed(1);
        }
      }

      satDataArr.push({
        noradId: sat.noradId,
        name: sat.name,
        colorIndex: selIdx,
        color: satColorGl(selIdx) as [number, number, number],
        altKm: rKm - EARTH_RADIUS_KM,
        speedKmS: Math.sqrt(MU * (2.0 / rKm - 1.0 / sat.semiMajorAxis)),
        latDeg: Math.asin(sat.currentPos.y / rKm) * RAD2DEG,
        lonDeg,
        incDeg: sat.inclination * RAD2DEG,
        eccen: sat.eccentricity,
        raanDeg: getCorrectedElements(sat, currentEpoch).raan * RAD2DEG,
        periodMin: (TWO_PI / sat.meanMotion) / 60,
        magStr,
      });
      selIdx++;
    }
    uiStore.selectedSatData = satDataArr;

    // Hover tooltip — only when actually hovering
    const infoEl = uiStore.satInfoEl;

    if (hoveredSat) {
      const hSat = hoveredSat;
      const rKm = hSat.currentPos.length();
      const alt = rKm - EARTH_RADIUS_KM;
      const speed = Math.sqrt(MU * (2.0 / rKm - 1.0 / hSat.semiMajorAxis));
      uiStore.satInfoName = `${hSat.name} <span style="color:var(--text-ghost);font-size:11px">#${hSat.noradId}</span>`;
      let magStr = '';
      if (observerStore.isSet) {
        // Render coords → standard ECI: x=rx, y=-rz, z=ry
        const satEci = { x: hSat.currentPos.x, y: -hSat.currentPos.z, z: hSat.currentPos.y };
        const sunDir = sunDirectionECI(currentEpoch);
        const gmstRad = gmstDeg * DEG2RAD;
        const obs = observerStore.location;
        const obsPos = observerEci(obs.lat, obs.lon, obs.alt, gmstRad);

        if (isEclipsed(satEci.x, satEci.y, satEci.z, sunDir)) {
          magStr = '<br>Magnitude: eclipsed';
        } else if (hSat.stdMag === null) {
          magStr = '<br>Magnitude: unknown';
        } else {
          const range = slantRange(satEci, obsPos);
          const phase = computePhaseAngle(satEci, sunDir, obsPos);
          const { el } = getAzEl(satEci.x, satEci.y, satEci.z, gmstRad, obs.lat, obs.lon, obs.alt);
          const mag = estimateVisualMagnitude(hSat.stdMag, range, phase, Math.max(0, el));
          magStr = `<br>Magnitude: ${mag.toFixed(1)}`;
        }

      }
      uiStore.satInfoDetail = `Altitude: ${alt.toFixed(0)} km<br>Speed: ${speed.toFixed(2)} km/s${magStr}`;
      uiStore.satInfoHint = selectedSats.has(hSat) ? 'Click to deselect' : 'Click to select';
      uiStore.satInfoVisible = true;

      if (infoEl) {
        let screenPos: THREE.Vector2;
        if (viewMode === ViewMode.VIEW_3D || viewMode === ViewMode.VIEW_SKY) {
          const drawPos = hSat.currentPos.clone().divideScalar(DRAW_SCALE);
          const projected = drawPos.project(camera3d);
          screenPos = new THREE.Vector2(
            (projected.x * 0.5 + 0.5) * window.innerWidth,
            (-projected.y * 0.5 + 0.5) * window.innerHeight
          );
        } else {
          const mc = getMapCoordinates(hSat.currentPos, gmstDeg, cfg.earthRotationOffset);
          const camCX = (camera2d.left + camera2d.right) / 2;
          let bestX = mc.x;
          for (const off of [-MAP_W, MAP_W]) {
            if (Math.abs(mc.x + off - camCX) < Math.abs(bestX - camCX)) bestX = mc.x + off;
          }
          const nx = (bestX - camera2d.left) / (camera2d.right - camera2d.left);
          const ny = (camera2d.top + mc.y) / (camera2d.top - camera2d.bottom);
          screenPos = new THREE.Vector2(nx * window.innerWidth, ny * window.innerHeight);
        }

        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const infoW = infoEl.offsetWidth;
        const infoH = infoEl.offsetHeight;
        let boxX = screenPos.x + 15;
        let boxY = screenPos.y + 15;
        if (boxX + infoW > vw - 4) boxX = Math.max(4, screenPos.x - infoW - 15);
        if (boxY + infoH > vh - 4) boxY = Math.max(4, screenPos.y - infoH - 15);
        infoEl.style.left = `${boxX}px`;
        infoEl.style.top = `${boxY}px`;
      }
    } else {
      uiStore.satInfoVisible = false;
    }

    // Sky view uses the 3D camera — share the 3D projection path
    const use3dCamera = viewMode === ViewMode.VIEW_3D || viewMode === ViewMode.VIEW_SKY;

    // Apsis labels — tied to cardSat (hovered ?? firstSelected)
    if (cardSat) {
      const apsis = computeApsis(cardSat, currentEpoch);
      const periR = apsis.periPos.length();
      const apoR = apsis.apoPos.length();

      if (use3dCamera) {
        const pDraw = apsis.periPos.clone().divideScalar(DRAW_SCALE);
        const aDraw = apsis.apoPos.clone().divideScalar(DRAW_SCALE);
        const earthR = EARTH_RADIUS_KM / DRAW_SCALE;
        const camPos = camera3d.position;

        const periOccluded = isOccludedByEarth(pDraw, camPos, earthR);
        const apoOccluded = isOccludedByEarth(aDraw, camPos, earthR);

        const isSky = viewMode === ViewMode.VIEW_SKY;
        periSprite3d.position.copy(pDraw);
        periSprite3d.visible = !periOccluded && !isSky;
        apoSprite3d.position.copy(aDraw);
        apoSprite3d.visible = !apoOccluded && !isSky;

        const pp = pDraw.project(camera3d);
        const ap = aDraw.project(camera3d);
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        const ppX = (pp.x * 0.5 + 0.5) * vw;
        const ppY = (-pp.y * 0.5 + 0.5) * vh;
        if (!periOccluded && pp.z < 1 && ppX > -50 && ppX < vw + 50 && ppY > -20 && ppY < vh + 20) {
          L.peri.show(`Peri ${formatKm(periR - EARTH_RADIUS_KM)}`, ppX + 12, ppY - 6);
        } else {
          L.peri.hide();
        }

        const apX = (ap.x * 0.5 + 0.5) * vw;
        const apY = (-ap.y * 0.5 + 0.5) * vh;
        if (!apoOccluded && ap.z < 1 && apX > -50 && apX < vw + 50 && apY > -20 && apY < vh + 20) {
          L.apo.show(`Apo ${formatKm(apoR - EARTH_RADIUS_KM)}`, apX + 12, apY - 6);
        } else {
          L.apo.hide();
        }
      } else {
        periSprite3d.visible = false;
        apoSprite3d.visible = false;

        const peri2d = computeApsis2D(cardSat, currentEpoch, false, cfg.earthRotationOffset);
        const apo2d = computeApsis2D(cardSat, currentEpoch, true, cfg.earthRotationOffset);

        const camL = camera2d.left, camR = camera2d.right;
        const camT = camera2d.top, camB = camera2d.bottom;
        const camCenterX = (camL + camR) / 2;
        const vw = window.innerWidth, vh = window.innerHeight;

        let periX = peri2d.x;
        let apoX = apo2d.x;
        for (const off of [-MAP_W, MAP_W]) {
          if (Math.abs(peri2d.x + off - camCenterX) < Math.abs(periX - camCenterX)) periX = peri2d.x + off;
          if (Math.abs(apo2d.x + off - camCenterX) < Math.abs(apoX - camCenterX)) apoX = apo2d.x + off;
        }

        const pnx = (periX - camL) / (camR - camL);
        const pny = (-peri2d.y - camB) / (camT - camB);
        if (pnx > -0.1 && pnx < 1.1 && pny > -0.1 && pny < 1.1) {
          L.peri.show(`Peri ${formatKm(periR - EARTH_RADIUS_KM)}`, pnx * vw + 12, (1 - pny) * vh - 8);
        } else {
          L.peri.hide();
        }

        const anx = (apoX - camL) / (camR - camL);
        const any_ = (-apo2d.y - camB) / (camT - camB);
        if (anx > -0.1 && anx < 1.1 && any_ > -0.1 && any_ < 1.1) {
          L.apo.show(`Apo ${formatKm(apoR - EARTH_RADIUS_KM)}`, anx * vw + 12, (1 - any_) * vh - 8);
        } else {
          L.apo.hide();
        }
      }
    } else {
      L.peri.hide();
      L.apo.hide();
      periSprite3d.visible = false;
      apoSprite3d.visible = false;
    }

    // Pass markers (AOS / LOS / TCA)
    if (use3dCamera && L.aos.drawPos && L.los.drawPos && L.tca.drawPos) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const earthR = EARTH_RADIUS_KM / DRAW_SCALE;
      const camPos = camera3d.position;

      for (const label of [L.aos, L.los, L.tca]) {
        const dp = label.drawPos!;
        if (isOccludedByEarth(dp, camPos, earthR)) {
          label.hide();
          continue;
        }
        const v = new THREE.Vector3(dp.x, dp.y, dp.z).project(camera3d);
        const sx = (v.x * 0.5 + 0.5) * vw;
        const sy = (-v.y * 0.5 + 0.5) * vh;
        if (v.z < 1 && sx > -50 && sx < vw + 50 && sy > -20 && sy < vh + 20) {
          label.show(label.text, sx + 12, sy - 6);
        } else {
          label.hide();
        }
      }
    } else {
      L.aos.hide();
      L.los.hide();
      L.tca.hide();
    }

    // Range label — km readout along observer→sat line (3D) or below sat (sky)
    // In sky view, skip when beam is locked — the reticle already shows range
    if (cardSat && observerStore.isSet && use3dCamera && !(viewMode === ViewMode.VIEW_SKY && beamStore.locked)) {
      const obsLoc = observerStore.location;
      const obsDrawPos = latLonToSurface(obsLoc.lat, obsLoc.lon, gmstDeg, cfg.earthRotationOffset);
      const satDraw = cardSat.currentPos.clone().divideScalar(DRAW_SCALE);

      // Check the sat is above horizon (same check as orbit-renderer)
      const toSatX = satDraw.x - obsDrawPos.x, toSatY = satDraw.y - obsDrawPos.y, toSatZ = satDraw.z - obsDrawPos.z;
      if (toSatX * obsDrawPos.x + toSatY * obsDrawPos.y + toSatZ * obsDrawPos.z > 0) {
        // Compute slant range in ECI
        const satEci = { x: cardSat.currentPos.x, y: -cardSat.currentPos.z, z: cardSat.currentPos.y };
        const gmstRad = gmstDeg * DEG2RAD;
        const obsPos = observerEci(obsLoc.lat, obsLoc.lon, obsLoc.alt, gmstRad);
        const rangeKm = slantRange(satEci, obsPos);

        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const satScreen = satDraw.clone().project(camera3d);
        const ssx = (satScreen.x * 0.5 + 0.5) * vw;
        const ssy = (-satScreen.y * 0.5 + 0.5) * vh;

        if (viewMode === ViewMode.VIEW_SKY) {
          // Sky view: place range label below the satellite dot
          if (satScreen.z < 1 && ssx > -50 && ssx < vw + 50 && ssy > -20 && ssy < vh + 20) {
            L.range.show(formatKm(rangeKm), ssx, ssy + 18);
          } else {
            L.range.hide();
          }
        } else {
          // 3D orbital view: place at 60% along observer→sat line, angled
          const obsScreen = obsDrawPos.clone().project(camera3d);
          const osx = (obsScreen.x * 0.5 + 0.5) * vw;
          const osy = (-obsScreen.y * 0.5 + 0.5) * vh;

          const sx = osx + (ssx - osx) * 0.6;
          const sy = osy + (ssy - osy) * 0.6;

          let angleDeg = Math.atan2(ssy - osy, ssx - osx) * RAD2DEG;
          if (angleDeg > 90) angleDeg -= 180;
          else if (angleDeg < -90) angleDeg += 180;

          const perpX = -Math.sin(angleDeg * DEG2RAD) * 8;
          const perpY = Math.cos(angleDeg * DEG2RAD) * 8;

          const earthR = EARTH_RADIUS_KM / DRAW_SCALE;
          const mid = new THREE.Vector3(
            obsDrawPos.x + (satDraw.x - obsDrawPos.x) * 0.6,
            obsDrawPos.y + (satDraw.y - obsDrawPos.y) * 0.6,
            obsDrawPos.z + (satDraw.z - obsDrawPos.z) * 0.6,
          );
          if (!isOccludedByEarth(mid, camera3d.position, earthR) &&
              satScreen.z < 1 && sx > -50 && sx < vw + 50 && sy > -20 && sy < vh + 20) {
            L.range.show(formatKm(rangeKm), sx + perpX, sy + perpY, angleDeg);
          } else {
            L.range.hide();
          }
        }
      } else {
        L.range.hide();
      }
    } else {
      L.range.hide();
    }

    // Label collision avoidance — nudge overlapping scene labels apart
    this.nudgeLabels();
  }

  private nudgeLabels() {
    const labels = document.querySelectorAll<HTMLElement>('.scene-label');
    const items: { el: HTMLElement; x: number; y: number; w: number; h: number }[] = [];
    for (const el of labels) {
      // Marker-manager uses inline display; Svelte labels use .visible class
      if (el.style.display !== 'block' && !el.classList.contains('visible')) continue;
      const x = parseFloat(el.dataset.sx || '0');
      const y = parseFloat(el.dataset.sy || '0');
      const w = (el.textContent?.length || 4) * 7 + 4;
      items.push({ el, x, y, w, h: 16 });
    }

    // Sort by y so the downward sweep cascades correctly
    items.sort((a, b) => a.y - b.y);

    // Push each label down past any overlapping labels above it
    for (let i = 1; i < items.length; i++) {
      const cur = items[i];
      for (let j = 0; j < i; j++) {
        const prev = items[j];
        const overlapX = Math.min(cur.x + cur.w, prev.x + prev.w) - Math.max(cur.x, prev.x);
        const overlapY = Math.min(cur.y + cur.h, prev.y + prev.h) - Math.max(cur.y, prev.y);
        if (overlapX > 0 && overlapY > 0) {
          cur.y = prev.y + prev.h + 2;
        }
      }
    }

    for (const { el, x, y } of items) {
      const extra = el.dataset.transformExtra || '';
      el.style.transform = `translate(${x}px,${y}px)${extra}`;
    }
  }
}
