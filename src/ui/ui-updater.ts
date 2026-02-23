import * as THREE from 'three';
import type { Satellite, SelectedSatInfo } from '../types';
import { ViewMode } from '../types';
import { DRAW_SCALE, EARTH_RADIUS_KM, MU, RAD2DEG, DEG2RAD, MAP_W, TWO_PI } from '../constants';
import { getCorrectedElements } from '../astro/propagator';
import { ORBIT_COLORS } from '../scene/orbit-renderer';
import { computeApsis, computeApsis2D } from '../astro/apsis';
import { getMapCoordinates } from '../astro/coordinates';
import { uiStore } from '../stores/ui.svelte';

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

    // Compute per-sat data for Selection Window
    const satDataArr: SelectedSatInfo[] = [];
    let selIdx = 0;
    for (const sat of selectedSats) {
      const rKm = sat.currentPos.length();
      let lonDeg = (Math.atan2(-sat.currentPos.z, sat.currentPos.x) - (gmstDeg + cfg.earthRotationOffset) * DEG2RAD) * RAD2DEG;
      while (lonDeg > 180) lonDeg -= 360;
      while (lonDeg < -180) lonDeg += 360;
      satDataArr.push({
        name: sat.name,
        color: ORBIT_COLORS[selIdx % ORBIT_COLORS.length] as [number, number, number],
        altKm: rKm - EARTH_RADIUS_KM,
        speedKmS: Math.sqrt(MU * (2.0 / rKm - 1.0 / sat.semiMajorAxis)),
        latDeg: Math.asin(sat.currentPos.y / rKm) * RAD2DEG,
        lonDeg,
        incDeg: sat.inclination * RAD2DEG,
        eccen: sat.eccentricity,
        raanDeg: getCorrectedElements(sat, currentEpoch).raan * RAD2DEG,
        periodMin: (TWO_PI / sat.meanMotion) / 60,
      });
      selIdx++;
    }
    uiStore.selectedSatData = satDataArr;

    // Hover tooltip — only when actually hovering
    const infoEl = uiStore.satInfoEl;
    const periLabel = uiStore.periLabelEl;
    const apoLabel = uiStore.apoLabelEl;

    if (hoveredSat) {
      const hSat = hoveredSat;
      const rKm = hSat.currentPos.length();
      const alt = rKm - EARTH_RADIUS_KM;
      const speed = Math.sqrt(MU * (2.0 / rKm - 1.0 / hSat.semiMajorAxis));
      uiStore.satInfoName = hSat.name;
      uiStore.satInfoDetail = `Altitude: ${alt.toFixed(0)} km<br>Speed: ${speed.toFixed(2)} km/s`;
      uiStore.satInfoHint = selectedSats.has(hSat) ? 'Click to deselect' : 'Click to select';
      uiStore.satInfoVisible = true;

      if (infoEl) {
        let screenPos: THREE.Vector2;
        if (viewMode === ViewMode.VIEW_3D) {
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

    // Apsis labels — tied to cardSat (hovered ?? firstSelected)
    if (cardSat) {
      const apsis = computeApsis(cardSat, currentEpoch);
      const periR = apsis.periPos.length();
      const apoR = apsis.apoPos.length();

      if (viewMode === ViewMode.VIEW_3D) {
        const pDraw = apsis.periPos.clone().divideScalar(DRAW_SCALE);
        const aDraw = apsis.apoPos.clone().divideScalar(DRAW_SCALE);
        const earthR = EARTH_RADIUS_KM / DRAW_SCALE;
        const camPos = camera3d.position;

        const isOccluded = (pt: THREE.Vector3): boolean => {
          const dx = pt.x - camPos.x, dy = pt.y - camPos.y, dz = pt.z - camPos.z;
          const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const ux = dx / L, uy = dy / L, uz = dz / L;
          const t = -(camPos.x * ux + camPos.y * uy + camPos.z * uz);
          if (t > 0 && t < L) {
            const cx = camPos.x + ux * t, cy = camPos.y + uy * t, cz = camPos.z + uz * t;
            if (Math.sqrt(cx * cx + cy * cy + cz * cz) < earthR * 0.99) return true;
          }
          return false;
        };

        const periOccluded = isOccluded(pDraw);
        const apoOccluded = isOccluded(aDraw);

        periSprite3d.position.copy(pDraw);
        periSprite3d.visible = !periOccluded;
        apoSprite3d.position.copy(aDraw);
        apoSprite3d.visible = !apoOccluded;

        const pp = pDraw.project(camera3d);
        const ap = aDraw.project(camera3d);
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        const ppX = (pp.x * 0.5 + 0.5) * vw;
        const ppY = (-pp.y * 0.5 + 0.5) * vh;
        if (!periOccluded && pp.z < 1 && ppX > -50 && ppX < vw + 50 && ppY > -20 && ppY < vh + 20) {
          uiStore.periText = `Peri: ${(periR - EARTH_RADIUS_KM).toFixed(0)} km`;
          uiStore.periVisible = true;
          if (periLabel) {
            periLabel.style.left = `${ppX + 20}px`;
            periLabel.style.top = `${ppY - 8}px`;
          }
        } else {
          uiStore.periVisible = false;
        }

        const apX = (ap.x * 0.5 + 0.5) * vw;
        const apY = (-ap.y * 0.5 + 0.5) * vh;
        if (!apoOccluded && ap.z < 1 && apX > -50 && apX < vw + 50 && apY > -20 && apY < vh + 20) {
          uiStore.apoText = `Apo: ${(apoR - EARTH_RADIUS_KM).toFixed(0)} km`;
          uiStore.apoVisible = true;
          if (apoLabel) {
            apoLabel.style.left = `${apX + 20}px`;
            apoLabel.style.top = `${apY - 8}px`;
          }
        } else {
          uiStore.apoVisible = false;
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
        uiStore.periText = `Peri: ${(periR - EARTH_RADIUS_KM).toFixed(0)} km`;
        uiStore.periVisible = pnx > -0.1 && pnx < 1.1 && pny > -0.1 && pny < 1.1;
        if (uiStore.periVisible && periLabel) {
          periLabel.style.left = `${pnx * vw + 12}px`;
          periLabel.style.top = `${(1 - pny) * vh - 8}px`;
        }

        const anx = (apoX - camL) / (camR - camL);
        const any_ = (-apo2d.y - camB) / (camT - camB);
        uiStore.apoText = `Apo: ${(apoR - EARTH_RADIUS_KM).toFixed(0)} km`;
        uiStore.apoVisible = anx > -0.1 && anx < 1.1 && any_ > -0.1 && any_ < 1.1;
        if (uiStore.apoVisible && apoLabel) {
          apoLabel.style.left = `${anx * vw + 12}px`;
          apoLabel.style.top = `${(1 - any_) * vh - 8}px`;
        }
      }
    } else {
      uiStore.periVisible = false;
      uiStore.apoVisible = false;
      periSprite3d.visible = false;
      apoSprite3d.visible = false;
    }
  }
}
