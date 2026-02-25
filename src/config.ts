import type { AppConfig } from './types';

export const defaultConfig: AppConfig = {
  earthRotationOffset: 0.0,
  orbitsToDraw: 3.0,
  showClouds: true,
  showNightLights: true,
  orbitNormal: '#D3D3D360',
  orbitHighlighted: '#CCCCCCFF',
  satNormal: '#EEEEEEA0',
  satHighlighted: '#FFFF00FF',
  satSelected: '#00FF00FF',
  footprintBg: '#FFFFFF22',
  footprintBorder: '#FFFFFF88',
  markerGroups: [
    {
      id: 'observer',
      label: 'Observer',
      color: '#ff8800',
      defaultVisible: true,
      markers: [],
    },
    {
      id: 'launch-sites',
      label: 'Launch Sites',
      color: '#ffffff',
      defaultVisible: false,
      markers: [
        { name: 'Cape Canaveral', lat: 28.3922, lon: -80.6077 },
        { name: 'Vandenberg', lat: 34.7420, lon: -120.5724 },
        { name: 'Kourou (ESA)', lat: 5.2360, lon: -52.7750 },
        { name: 'Baikonur Cosmodrome', lat: 45.9646, lon: 63.3052 },
        { name: 'Mahia (Rocket Lab)', lat: -39.2609, lon: 177.8659 },
        { name: 'Boca Chica (Starbase)', lat: 25.9973, lon: -97.1573 },
        { name: 'Tanegashima', lat: 30.3909, lon: 130.9681 },
        { name: 'Jiuquan', lat: 40.9606, lon: 100.2983 },
        { name: 'Satish Dhawan', lat: 13.7374, lon: 80.2351 },
        { name: 'Wallops Island', lat: 37.9330, lon: -75.4790 },
      ],
    },
  ]
};

const hexCache = new Map<string, { r: number; g: number; b: number; a: number }>();

export function parseHexColor(hex: string): { r: number; g: number; b: number; a: number } {
  let cached = hexCache.get(hex);
  if (cached) return cached;
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  const a = h.length >= 8 ? parseInt(h.substring(6, 8), 16) / 255 : 1.0;
  cached = { r, g, b, a };
  hexCache.set(hex, cached);
  return cached;
}