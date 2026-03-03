export type SourceCategory =
  | 'constellations'
  | 'special-interest'
  | 'communications'
  | 'navigation'
  | 'weather'
  | 'scientific'
  | 'debris'
  | 'misc';

export interface TLESource {
  name: string;
  group: string;
  category?: SourceCategory;
  special?: boolean; // uses SPECIAL= instead of GROUP= for CelesTrak
}

export const TLE_SOURCES: TLESource[] = [
  { name: 'None (Globe only)', group: 'none' },

  // ── Mega-Constellations ──
  { name: 'Starlink', group: 'starlink', category: 'constellations' },
  { name: 'OneWeb', group: 'oneweb', category: 'constellations' },
  { name: 'Kuiper', group: 'kuiper', category: 'constellations' },
  { name: 'Qianfan (G60)', group: 'qianfan', category: 'constellations' },
  { name: 'Hulianwang (Guowang)', group: 'hulianwang', category: 'constellations' },

  // ── Special Interest ──
  { name: 'Space Stations', group: 'stations', category: 'special-interest' },
  { name: '100 Brightest', group: 'visual', category: 'special-interest' },
  { name: 'Active Satellites', group: 'active', category: 'special-interest' },
  { name: "Last 30 Days' Launches", group: 'last-30-days', category: 'special-interest' },
  { name: 'Analyst Satellites', group: 'analyst', category: 'special-interest' },
  { name: 'Decaying (Reentry)', group: 'decaying', category: 'special-interest', special: true },

  // ── Communications ──
  { name: 'Iridium NEXT', group: 'iridium-NEXT', category: 'communications' },
  { name: 'Globalstar', group: 'globalstar', category: 'communications' },
  { name: 'Orbcomm', group: 'orbcomm', category: 'communications' },
  { name: 'Intelsat', group: 'intelsat', category: 'communications' },
  { name: 'SES', group: 'ses', category: 'communications' },
  { name: 'Eutelsat', group: 'eutelsat', category: 'communications' },
  { name: 'Telesat', group: 'telesat', category: 'communications' },
  { name: 'Geostationary', group: 'geo', category: 'communications' },
  { name: 'Amateur Radio', group: 'amateur', category: 'communications' },
  { name: 'SatNOGS', group: 'satnogs', category: 'communications' },
  { name: 'Experimental Comms', group: 'x-comm', category: 'communications' },
  { name: 'Other Comms', group: 'other-comm', category: 'communications' },

  // ── Navigation ──
  { name: 'All GNSS', group: 'gnss', category: 'navigation' },
  { name: 'GPS Operational', group: 'gps-ops', category: 'navigation' },
  { name: 'GLONASS', group: 'glo-ops', category: 'navigation' },
  { name: 'Galileo', group: 'galileo', category: 'navigation' },
  { name: 'BeiDou', group: 'beidou', category: 'navigation' },
  { name: 'SBAS', group: 'sbas', category: 'navigation' },
  { name: 'NNSS', group: 'nnss', category: 'navigation' },
  { name: 'Musson', group: 'musson', category: 'navigation' },

  // ── Weather & Earth Observation ──
  { name: 'Weather', group: 'weather', category: 'weather' },
  { name: 'NOAA', group: 'noaa', category: 'weather' },
  { name: 'GOES', group: 'goes', category: 'weather' },
  { name: 'Earth Resources', group: 'resource', category: 'weather' },
  { name: 'Planet', group: 'planet', category: 'weather' },
  { name: 'Spire', group: 'spire', category: 'weather' },
  { name: 'SARSAT', group: 'sarsat', category: 'weather' },
  { name: 'ARGOS', group: 'argos', category: 'weather' },
  { name: 'Disaster Monitoring', group: 'dmc', category: 'weather' },
  { name: 'TDRSS', group: 'tdrss', category: 'weather' },

  // ── Scientific & Other ──
  { name: 'Science', group: 'science', category: 'scientific' },
  { name: 'Geodetic', group: 'geodetic', category: 'scientific' },
  { name: 'Engineering', group: 'engineering', category: 'scientific' },
  { name: 'Education', group: 'education', category: 'scientific' },
  { name: 'Military', group: 'military', category: 'misc' },
  { name: 'Radar Calibration', group: 'radar', category: 'misc' },
  { name: 'CubeSats', group: 'cubesat', category: 'misc' },
  { name: 'Other', group: 'other', category: 'misc' },

  // ── Debris ──
  { name: 'FENGYUN 1C Debris', group: 'fengyun-1c-debris', category: 'debris' },
  { name: 'COSMOS 2251 Debris', group: 'cosmos-2251-debris', category: 'debris' },
  { name: 'IRIDIUM 33 Debris', group: 'iridium-33-debris', category: 'debris' },
  { name: 'COSMOS 1408 Debris (ASAT)', group: 'cosmos-1408-debris', category: 'debris' },

  // ── GEO Protected Zone (special datasets) ──
  { name: 'GEO Protected Zone', group: 'gpz', category: 'misc', special: true },
  { name: 'GEO Protected Zone+', group: 'gpz-plus', category: 'misc', special: true },
];

// ── Mirror (satvisor-data repo) ──

const MIRROR_BASE = 'https://raw.githubusercontent.com/satvisorcom/satvisor-data/master';

export function getMirrorUrl(group: string, special = false): string {
  const dir = special ? 'celestrak/special/json' : 'celestrak/json';
  return `${MIRROR_BASE}/${dir}/${group}.json`;
}

export function getMirrorManifestUrl(): string {
  return `${MIRROR_BASE}/manifest.json`;
}

export type CatalogName = 'satnogs' | 'stdmag';

export function getMirrorCatalogUrl(name: CatalogName): string {
  return `${MIRROR_BASE}/catalog/${name}.json`;
}

// ── CelesTrak direct (fallback) ──

export function getCelestrakUrl(group: string, special = false): string {
  const param = special ? 'SPECIAL' : 'GROUP';
  return `https://celestrak.org/NORAD/elements/gp.php?${param}=${group}&FORMAT=json`;
}

/** Look up a source definition by group slug. */
export function getSourceByGroup(group: string): TLESource | undefined {
  return TLE_SOURCES.find(s => s.group === group);
}
