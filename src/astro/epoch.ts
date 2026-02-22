// Epoch format: YY * 1000 + day_of_year.fraction (e.g. 26051.5 = 2026 day 51 noon)

export function getCurrentRealTimeEpoch(): number {
  const now = new Date();
  const year = now.getUTCFullYear();
  const yy = year % 100;

  // Day of year (1-based)
  const startOfYear = Date.UTC(year, 0, 1);
  const dayOfYear = (now.getTime() - startOfYear) / 86400000 + 1;

  return yy * 1000.0 + dayOfYear;
}

export function normalizeEpoch(epoch: number): number {
  let yy = Math.floor(epoch / 1000.0);
  let dayOfYear = epoch % 1000.0;
  let year = yy < 57 ? 2000 + yy : 1900 + yy;

  while (true) {
    const daysInYear = isLeapYear(year) ? 366 : 365;
    if (dayOfYear >= daysInYear + 1.0) {
      dayOfYear -= daysInYear;
      year++;
      yy = year % 100;
    } else if (dayOfYear < 1.0) {
      year--;
      yy = year % 100;
      const prevDays = isLeapYear(year) ? 366 : 365;
      dayOfYear += prevDays;
    } else {
      break;
    }
  }

  return yy * 1000.0 + dayOfYear;
}

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function epochToUnix(epoch: number): number {
  epoch = normalizeEpoch(epoch);
  const yy = Math.floor(epoch / 1000.0);
  const day = epoch % 1000.0;
  const year = yy < 57 ? 2000 + yy : 1900 + yy;

  // Jan 1 of that year in ms
  const jan1 = Date.UTC(year, 0, 1);
  // day is 1-based, so day 1.0 = start of Jan 1
  return jan1 / 1000 + (day - 1.0) * 86400.0;
}

export function epochToDate(epoch: number): Date {
  return new Date(epochToUnix(epoch) * 1000);
}

export function unixToEpoch(unixSeconds: number): number {
  const date = new Date(unixSeconds * 1000);
  const year = date.getUTCFullYear();
  const yy = year % 100;
  const startOfYear = Date.UTC(year, 0, 1);
  const dayOfYear = (date.getTime() - startOfYear) / 86400000 + 1;
  return yy * 1000.0 + dayOfYear;
}

export function epochToJulianDate(epoch: number): number {
  const unix = epochToUnix(epoch);
  return unix / 86400.0 + 2440587.5;
}

export function epochToGmst(epoch: number): number {
  const jd = epochToJulianDate(epoch);
  let gmst = (280.46061837 + 360.98564736629 * (jd - 2451545.0)) % 360.0;
  if (gmst < 0) gmst += 360.0;
  return gmst;
}

export function epochToDatetimeStr(epoch: number): string {
  epoch = normalizeEpoch(epoch);
  const yy = Math.floor(epoch / 1000.0);
  let dayOfYear = epoch % 1000.0;
  const year = yy < 57 ? 2000 + yy : 1900 + yy;

  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  let day = Math.floor(dayOfYear);
  const frac = dayOfYear - day;

  let month = 0;
  for (let i = 0; i < 12; i++) {
    if (day <= daysInMonth[i]) {
      month = i + 1;
      break;
    }
    day -= daysInMonth[i];
  }

  const hours = frac * 24.0;
  const h = Math.floor(hours);
  const minutes = (hours - h) * 60.0;
  const m = Math.floor(minutes);
  const seconds = Math.round((minutes - m) * 60.0);

  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(year, 4)}-${pad(month)}-${pad(day)} ${pad(h)}:${pad(m)}:${pad(seconds)} UTC`;
}
