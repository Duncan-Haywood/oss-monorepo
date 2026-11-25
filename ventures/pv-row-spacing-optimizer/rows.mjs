// Row geometry and energy for long, parallel rows of PV modules on flat
// ground: fixed-tilt racks or horizontal single-axis trackers.
//
// Everything is worked in the plane across the rows (rows are long enough
// that their ends do not matter: the "infinite rows" model of PVsyst's
// "unlimited sheds" and pvlib's infinite_sheds). Lengths are in units of the
// collector width (the slant width of a row), so the ground coverage ratio
// GCR = width / pitch is the only spacing input.
//
// Beam shading. Write s for the unit vector to the sun and n for the module
// normal. A point a share t up the collector is shaded by the row in front
// when the ray to the sun passes under that row's top edge; solving for the
// highest such t gives the shaded share of the width
//     fs = 1 - s_up / (GCR * (s . n))        clipped to [0, 1]
// (s . n is cos AOI; the along-row part of s drops out). When the sun is
// behind the row (s . n <= 0) there is no beam on the front face at all.
// check/pvlib_reference.py compares fs with pvlib.shading.shaded_fraction1d.
//
// Sky view. Averaged over the width, the share of an isotropic sky a row's
// face sees past the row in front is, by integrating (1 + cos(psi + tilt))/2
// over the face (psi = elevation of the front row's top edge),
//     VF = (1 + p - sqrt(1 + p^2 - 2 p cos tilt)) / 2,   p = 1 / GCR
// which tends to the open-field (1 + cos tilt)/2 as p grows (Hottel's
// crossed strings give the same).
//
// Diffuse is split by Hay and Davies (1980): the circumsolar share
// (DNI / extraterrestrial) travels with the beam and is shaded like it; the
// rest is isotropic and scaled by VF. Ground-reflected light is the open-field
// albedo x GHI x (1 - cos tilt)/2, not reduced by the rows (a small
// overstatement, at most that whole term, about 0.6% of GHI at 25 deg tilt
// and 20% albedo).
//
// Electrical effect. A shadow across the bottom of a row does not cost only
// its own area: a module's cells are wired in series substrings behind bypass
// diodes, and a substring with a shaded cell drops out. `bands` is the number
// of such substrings stacked across the width (2 for two standard modules in
// portrait, 4 for two half-cut modules in portrait, 3 per module in
// landscape); any beam shading in a band removes that band's beam and
// circumsolar light, as PVsyst's "according to strings" approximation does.
// bands = 0 treats the loss as linear in the shaded area (thin film, or
// half-cut landscape layouts).

const RAD = Math.PI / 180;

/** Shaded share of the collector width for one sun position. */
export function shadedFraction(sUp, cosAoi, gcr) {
  if (!(gcr > 0) || !(cosAoi > 0)) return 0;
  const fs = 1 - sUp / (gcr * cosAoi);
  return fs <= 0 ? 0 : fs >= 1 ? 1 : fs;
}

/** Share of the beam lost: the shaded share, or the share of electrical
 * bands any shadow touches. */
export function beamLossShare(fs, bands) {
  if (!(fs > 0)) return 0;
  if (!(bands > 0)) return fs;
  return Math.min(1, Math.ceil(fs * bands - 1e-9) / bands);
}

/** Width-averaged sky view factor of a row face (tilt in degrees). GCR 0
 * means an isolated row. */
export function skyViewFactor(tiltDeg, gcr) {
  const c = Math.cos(tiltDeg * RAD);
  if (!(gcr > 0)) return (1 + c) / 2;
  const p = 1 / gcr;
  return (1 + p - Math.sqrt(Math.max(0, 1 + p * p - 2 * p * c))) / 2;
}

/** Horizontal single-axis tracker rotation in degrees, positive toward the
 * cross-axis direction c (axis azimuth + 90 deg), from the sun's components
 * along c (sC) and up (sUp). True tracking, then Anderson and Mikofski
 * (2020) backtracking on flat ground, then the rotation limit. */
export function trackerRotation(sC, sUp, gcr, maxAngle, backtrack) {
  let theta = Math.atan2(sC, sUp) / RAD;
  if (backtrack && gcr > 0) {
    const temp = Math.cos(theta * RAD) / gcr;
    if (temp < 1) theta -= Math.sign(theta) * (Math.acos(temp) / RAD);
  }
  return Math.max(-maxAngle, Math.min(maxAngle, theta));
}

/** Minimum pitch (in collector widths) that keeps a fixed-tilt row free of
 * beam shading for one sun position: from fs = 0, p = cos tilt + sin tilt *
 * s_toward / s_up, where s_toward is the sun component toward the facing side. */
export function shadeFreePitch(sToward, sUp, tiltDeg) {
  if (!(sUp > 0)) return Infinity;
  const b = tiltDeg * RAD;
  return Math.cos(b) + (Math.sin(b) * sToward) / sUp;
}

/** Physical constants of the energy model, overridable by the caller. */
export const MODEL_DEFAULTS = {
  albedo: 0.2,
  iamB: 0.05, // ASHRAE incidence-angle modifier on the beam
  gamma: -0.0035, // power temperature coefficient, per deg C
  noct: 45, // deg C, for the cell temperature
  losses: 0.14, // soiling, mismatch, wiring, inverter and availability, as one share
  bands: 2,
};

function iam(cosAoi, b) {
  if (!(cosAoi > 0)) return 0;
  return Math.max(0, 1 - b * (1 / cosAoi - 1));
}

/** Simulate one layout through a prepared weather series (see weather.mjs).
 * layout: { kind: "fixed", tilt, azimuth } or
 *         { kind: "tracker", axisAzimuth, maxAngle, backtrack }
 * gcr: ground coverage ratio, or 0 for an isolated row.
 * Returns annual kWh per kWp (DC, after losses) and the plane-of-array
 * irradiation split (kWh/m2): beam, circumsolar, isotropic sky, ground, and
 * what shading removed. */
export function simulate(weather, layout, gcr, model = {}) {
  const m = { ...MODEL_DEFAULTS, ...model };
  const { sE, sN, sU, ghi, dni, dhi, ext, tair, day, dt } = weather;
  const tempK = (m.noct - 20) / 800;
  let energy = 0, beam = 0, circ = 0, iso = 0, ground = 0, shadeLost = 0;
  if (layout.kind === "fixed") {
    const b = layout.tilt * RAD;
    const az = layout.azimuth * RAD;
    const fE = Math.sin(az) * Math.sin(b), fN = Math.cos(az) * Math.sin(b), fU = Math.cos(b);
    const vf = skyViewFactor(layout.tilt, gcr);
    const gnd = (m.albedo * (1 - Math.cos(b))) / 2;
    for (let k = 0; k < day.length; k++) {
      const i = day[k];
      const cosAoi = sE[i] * fE + sN[i] * fN + sU[i] * fU;
      const ai = ext[i] > 0 ? dni[i] / ext[i] : 0;
      let eb = 0, ec = 0;
      if (cosAoi > 0) {
        eb = dni[i] * cosAoi * iam(cosAoi, m.iamB);
        ec = (dhi[i] * ai * cosAoi) / Math.max(sU[i], 0.01745);
      }
      const lost = beamLossShare(shadedFraction(sU[i], cosAoi, gcr), m.bands) * (eb + ec);
      const ei = dhi[i] * (1 - ai) * vf;
      const eg = ghi[i] * gnd;
      const e = eb + ec - lost + ei + eg;
      beam += eb; circ += ec; iso += ei; ground += eg; shadeLost += lost;
      energy += (e / 1000) * (1 + m.gamma * (tair[i] + e * tempK - 25));
    }
  } else {
    const az = (layout.axisAzimuth + 90) * RAD;
    const cE = Math.sin(az), cN = Math.cos(az);
    const vfCache = new Map();
    for (let k = 0; k < day.length; k++) {
      const i = day[k];
      const sC = sE[i] * cE + sN[i] * cN;
      const th = trackerRotation(sC, sU[i], gcr, layout.maxAngle, layout.backtrack);
      const tr = th * RAD;
      const cosAoi = sC * Math.sin(tr) + sU[i] * Math.cos(tr);
      const tilt = Math.abs(th);
      const key = Math.round(tilt * 10);
      let vf = vfCache.get(key);
      if (vf === undefined) { vf = skyViewFactor(key / 10, gcr); vfCache.set(key, vf); }
      const ai = ext[i] > 0 ? dni[i] / ext[i] : 0;
      let eb = 0, ec = 0;
      if (cosAoi > 0) {
        eb = dni[i] * cosAoi * iam(cosAoi, m.iamB);
        ec = (dhi[i] * ai * cosAoi) / Math.max(sU[i], 0.01745);
      }
      const lost = beamLossShare(shadedFraction(sU[i], cosAoi, gcr), m.bands) * (eb + ec);
      const ei = dhi[i] * (1 - ai) * vf;
      const eg = (ghi[i] * m.albedo * (1 - Math.cos(tr))) / 2;
      const e = eb + ec - lost + ei + eg;
      beam += eb; circ += ec; iso += ei; ground += eg; shadeLost += lost;
      energy += (e / 1000) * (1 + m.gamma * (tair[i] + e * tempK - 25));
    }
  }
  const s = dt * weather.annualScale;
  const kwh = (x) => (x * s) / 1000;
  return {
    kwhPerKwp: energy * s * (1 - m.losses),
    poa: { beam: kwh(beam), circumsolar: kwh(circ), sky: kwh(iso), ground: kwh(ground), shadeLost: kwh(shadeLost) },
  };
}
