import type { AppConfig } from './types';

export const defaultConfig: AppConfig = {
  earthRotationOffset: 0.0,
  orbitsToDraw: 3.0,
  showClouds: false,
  showNightLights: true,
  bgColor: '#101010',
  orbitNormal: '#D3D3D326',
  orbitHighlighted: '#FFFFFFFF',
  satNormal: '#EEEEEE66',
  satHighlighted: '#FFFF00FF',
  satSelected: '#00FF00FF',
  textMain: '#FFFFFFFF',
  textSecondary: '#D3D3D3FF',
  uiBg: '#000000CC',
  periapsis: '#87CEEBFF',
  apoapsis: '#FFA500FF',
  footprintBg: '#FFFFFF22',
  footprintBorder: '#FFFFFF88',
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
    { name: 'Wallops Island', lat: 37.9330, lon: -75.4790 }
  ]
};

export function parseHexColor(hex: string): { r: number; g: number; b: number; a: number } {
  hex = hex.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  const a = hex.length >= 8 ? parseInt(hex.substring(6, 8), 16) / 255 : 1.0;
  return { r, g, b, a };
}

export function hexToCSS(hex: string): string {
  const c = parseHexColor(hex);
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${c.a.toFixed(2)})`;
}
