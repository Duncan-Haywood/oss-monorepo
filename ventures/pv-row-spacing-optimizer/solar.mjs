// Sun position and clear-sky irradiance. Pure functions, no dependencies.
//
// Position: NOAA's solar calculator equations (Meeus, "Astronomical
// Algorithms", low-precision series), good to about 0.01 deg of zenith for
// years 1900-2100, with NOAA's refraction formula for the apparent zenith.
// Clear sky: Ineichen and Perez (2002) as pvlib implements it
// (`pvlib.clearsky.ineichen`, perez_enhancement off), with a Linke turbidity
// the user types instead of pvlib's monthly climatology file, the
// Kasten-Young (1989) air mass and Spencer's extraterrestrial irradiance.
// check/pvlib_reference.py compares both with pvlib.

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
export const SOLAR_CONSTANT = 1366.1;

const sind = (x) => Math.sin(x * RAD);
const cosd = (x) => Math.cos(x * RAD);

/** Sun position for one instant (ms since the Unix epoch, UTC).
 * Returns degrees: zenith (geometric), apparentZenith (with refraction),
 * azimuth (from north, clockwise), declination, and the equation of time
 * in minutes. */
export function sunPosition(ms, lat, lon) {
  const jd = ms / 86400000 + 2440587.5;
  const T = (jd - 2451545) / 36525;
  const L0 = (((280.46646 + T * (36000.76983 + T * 0.0003032)) % 360) + 360) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = sind(M) * (1.914602 - T * (0.004817 + 0.000014 * T)) + sind(2 * M) * (0.019993 - 0.000101 * T) + sind(3 * M) * 0.000289;
  const omega = 125.04 - 1934.136 * T;
  const lambda = L0 + C - 0.00569 - 0.00478 * sind(omega);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * cosd(omega);
  const decl = Math.asin(sind(eps) * sind(lambda)) * DEG;
  const y = Math.tan((eps / 2) * RAD) ** 2;
  const eot = 4 * DEG * (y * sind(2 * L0) - 2 * e * sind(M) + 4 * e * y * sind(M) * cosd(2 * L0) - 0.5 * y * y * sind(4 * L0) - 1.25 * e * e * sind(2 * M));
  const dayMs = ((ms % 86400000) + 86400000) % 86400000;
  let tst = dayMs / 60000 + eot + 4 * lon;
  tst = ((tst % 1440) + 1440) % 1440;
  let ha = tst / 4 - 180;
  const cz = Math.min(1, Math.max(-1, sind(lat) * sind(decl) + cosd(lat) * cosd(decl) * cosd(ha)));
  const zenith = Math.acos(cz) * DEG;
  let az = Math.atan2(sind(ha), cosd(ha) * sind(lat) - Math.tan(decl * RAD) * cosd(lat)) * DEG + 180;
  az = ((az % 360) + 360) % 360;
  const elev = 90 - zenith;
  return { zenith, apparentZenith: 90 - elev - refraction(elev), azimuth: az, declination: decl, eot };
}

/** NOAA's atmospheric refraction approximation, degrees, for a geometric
 * elevation in degrees (returned as a positive lift). */
export function refraction(elev) {
  if (elev > 85) return 0;
  const te = Math.tan(elev * RAD);
  let arcsec;
  if (elev > 5) arcsec = 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5;
  else if (elev > -0.575) arcsec = 1735 + elev * (-518.2 + elev * (103.4 + elev * (-12.79 + elev * 0.711)));
  else arcsec = -20.772 / te;
  return arcsec / 3600;
}

/** Day of year (1-366) of a UTC instant. */
export function dayOfYear(ms) {
  const d = new Date(ms);
  return Math.floor((ms - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000) + 1;
}

/** Extraterrestrial normal irradiance, W/m2 (Spencer 1971, as pvlib's default). */
export function dniExtra(doy) {
  const b = (2 * Math.PI * (doy - 1)) / 365;
  return SOLAR_CONSTANT * (1.00011 + 0.034221 * Math.cos(b) + 0.00128 * Math.sin(b) + 0.000719 * Math.cos(2 * b) + 0.000077 * Math.sin(2 * b));
}

/** Kasten and Young (1989) relative air mass for an apparent zenith in
 * degrees; NaN below the horizon. */
export function airmassRelative(apparentZenith) {
  if (!(apparentZenith <= 90)) return NaN;
  return 1 / (cosd(apparentZenith) + 0.50572 * (6.07995 + (90 - apparentZenith)) ** -1.6364);
}

/** Station pressure in Pa from altitude in m (pvlib's alt2pres). */
export function altitudeToPressure(alt) {
  return 100 * ((44331.514 - alt) / 11880.516) ** (1 / 0.1902632);
}

/** Ineichen-Perez clear sky: {ghi, dni, dhi} W/m2 for one instant. */
export function clearSky(apparentZenith, doy, linkeTurbidity, altitude = 0) {
  const am = airmassRelative(apparentZenith);
  if (!Number.isFinite(am) || apparentZenith >= 90) return { ghi: 0, dni: 0, dhi: 0 };
  const amAbs = (am * altitudeToPressure(altitude)) / 101325;
  const tl = linkeTurbidity;
  const I0 = dniExtra(doy);
  const cz = cosd(apparentZenith);
  const fh1 = Math.exp(-altitude / 8000);
  const fh2 = Math.exp(-altitude / 1250);
  const cg1 = 5.09e-5 * altitude + 0.868;
  const cg2 = 3.92e-5 * altitude + 0.0387;
  const ghi = cg1 * I0 * cz * Math.max(Math.exp(-cg2 * amAbs * (fh1 + fh2 * (tl - 1))), 0);
  const b = 0.664 + 0.163 / fh1;
  const bnci = I0 * Math.max(b * Math.exp(-0.09 * amAbs * (tl - 1)), 0);
  const bnci2 = ghi * Math.min(Math.max((1 - (0.1 - 0.2 * Math.exp(-tl)) / (0.1 + 0.882 / fh1)) / cz, 0), 1e20);
  const dni = Math.min(bnci, bnci2);
  return { ghi, dni, dhi: ghi - dni * cz };
}
