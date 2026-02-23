export interface TLESource {
  name: string;
  group: string;
}

export const TLE_SOURCES: TLESource[] = [
  { name: 'None (Globe only)', group: 'none' },
  { name: "Last 30 Days' Launches", group: 'last-30-days' },
  { name: 'Space Stations', group: 'stations' },
  { name: '100 Brightest', group: 'visual' },
  { name: 'Active Satellites', group: 'active' },
  { name: 'Analyst Satellites', group: 'analyst' },
  { name: 'Russian ASAT (COSMOS 1408)', group: 'cosmos-1408-debris' },
  { name: 'Chinese ASAT (FENGYUN 1C)', group: 'fengyun-1c-debris' },
  { name: 'IRIDIUM 33 Debris', group: 'iridium-33-debris' },
  { name: 'COSMOS 2251 Debris', group: 'cosmos-2251-debris' },
  { name: 'Weather', group: 'weather' },
  { name: 'NOAA', group: 'noaa' },
  { name: 'GOES', group: 'goes' },
  { name: 'Earth Resources', group: 'resource' },
  { name: 'SARSAT', group: 'sarsat' },
  { name: 'Disaster Monitoring', group: 'dmc' },
  { name: 'TDRSS', group: 'tdrss' },
  { name: 'ARGOS', group: 'argos' },
  { name: 'Planet', group: 'planet' },
  { name: 'Spire', group: 'spire' },
  { name: 'Starlink', group: 'starlink' },
  { name: 'OneWeb', group: 'oneweb' },
  { name: 'GPS Operational', group: 'gps-ops' },
  { name: 'Galileo', group: 'galileo' },
  { name: 'Amateur Radio', group: 'amateur' },
  { name: 'CubeSats', group: 'cubesat' },
];

export function getCelestrakUrl(group: string): string {
  return `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=tle`;
}
