// @ts-check
// Member checks: NDS allowable-stress checks on sawn lumber.
//
// Copied unchanged from ventures/open-house-plans/structure.mjs (2026-10-29), so
// this venture publishes on its own; structure.test.mjs and
// data/structure-fixture.json come with it and pin the same numbers. Fix both
// copies together.
//
// A port of research/house-spans (joists, rafters, headers, girders) and the stud
// check of research/house-framing, so the browser and the agent engine size
// members the same way the research track does. structure.test.mjs pins this
// port against numbers printed by the Python originals.
//
// Units: inches, pounds, psi; spans in feet at the interface. Every check is a
// simple span under uniform load with the compression edge braced, dry service,
// normal temperature. The base design values are SPF No. 2 as reprinted by NELMA
// (house-spans README). Nothing here has been reviewed by an engineer.

export const T = 1.5;
export const DEPTH = { "2x4": 3.5, "2x6": 5.5, "2x8": 7.25, "2x10": 9.25, "2x12": 11.25 };
export const NOMINAL = { "2x4": 4, "2x6": 6, "2x8": 8, "2x10": 10, "2x12": 12 };
const CF_B = { "2x4": 1.5, "2x6": 1.3, "2x8": 1.2, "2x10": 1.1, "2x12": 1.0 };
const CF_C = { "2x4": 1.15, "2x6": 1.1, "2x8": 1.05, "2x10": 1.0, "2x12": 1.0 };
const CR = 1.15;
export const SPF2 = { Fb: 875, Fv: 135, Fc_perp: 425, Fc: 1150, E: 1.4e6, Emin: 510e3 };

// Load cases as house-spans defines them (loads psf on plan).
export function roofCase(snowPsf = 30) {
  return { name: `roof-snow${snowPsf}`, dead: 15, live: snowPsf, CD: 1.15, liveLimit: 180, totalLimit: 180 };
}
export const FLOOR = { name: "floor", dead: 10, live: 40, CD: 1.0, liveLimit: 360, totalLimit: 240 };

/** Demand/capacity ratios of one member at one clear span (1.0 = at capacity). */
export function check(m, spanFt, c) {
  const { size, plies = 1, spacingIn = 16, repetitive = true, bearingIn = 1.5, pitch = 0 } = m;
  const L = spanFt * 12 + bearingIn;
  const cos = 1 / Math.sqrt(1 + (pitch / 12) ** 2);
  // a dead load stated on the slope is larger per unit of plan; live (snow) is on plan
  const wD = (c.dead / cos) * (spacingIn / 144);
  const wL = (c.live * spacingIn) / 144;
  const w = wD + wL;
  const b = T * plies;
  const d = DEPTH[size];
  const S = (b * d * d) / 6, A = b * d, I = (b * d ** 3) / 12;
  const Cr = repetitive && plies === 1 && spacingIn <= 24 ? CR : 1;
  const Fb = SPF2.Fb * c.CD * CF_B[size] * Cr;
  const Fv = SPF2.Fv * c.CD;
  const M = (w * L * L) / 8;
  const V = w * (L / 2 - d) * cos;
  const R = (w * L) / 2;
  const k = (5 * L ** 4) / (384 * SPF2.E * I * cos ** 2);
  return {
    bending: M / S / Fb,
    shear: (1.5 * V) / A / Fv,
    "deflection live": (k * wL) / (L / c.liveLimit),
    "deflection total": (k * w) / (L / c.totalLimit),
    bearing: R / (b * bearingIn) / SPF2.Fc_perp,
  };
}

export function worst(ratios) {
  let key = null;
  for (const k of Object.keys(ratios)) if (key === null || ratios[k] > ratios[key]) key = k;
  return [key, ratios[key]];
}

/** Smallest size that carries spanFt, as {size, governs, ratio}, or null. */
export function sizeMember(spanFt, c, { spacingIn = 16, plies = 1, sizes = ["2x6", "2x8", "2x10", "2x12"], pitch = 0, bearingIn = 1.5 } = {}) {
  for (const size of sizes) {
    const [governs, ratio] = worst(check({ size, plies, spacingIn, pitch, bearingIn, repetitive: true }, spanFt, c));
    if (ratio <= 1) return { size, plies, governs, ratio };
  }
  return null;
}

/** Longest clear span (ft, to 0.01) a member carries, by bisection. */
export function maxSpan(m, c, hiFt = 60) {
  if (worst(check(m, 1, c))[1] > 1) return 0;
  let lo = 0, hi = hiFt;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (worst(check(m, mid, c))[1] <= 1) lo = mid; else hi = mid;
  }
  return Math.floor(lo * 100) / 100;
}

function columnStability(FcStar, Emin, le, d, c = 0.8) {
  const FcE = (0.822 * Emin) / (le / d) ** 2;
  const a = FcE / FcStar;
  const b = (1 + a) / (2 * c);
  return [b - Math.sqrt(b * b - a / c), FcE];
}

/**
 * Worst ratio of one wall stud under roof gravity and wind on its face
 * (house-framing's stud_check): D+S, D+0.75(0.6W)+0.75S, D+0.6W.
 * roofPlf = [dead, snow] line loads on the wall top, lb/ft.
 */
export function studCheck(stud, spacingIn, lengthIn, roofPlf, windPsf = 0) {
  const d = DEPTH[stud];
  const A = T * d, S = (T * d * d) / 6;
  const [wD, wS] = roofPlf;
  let out = 0;
  for (const [kD, kS, kW, CD] of [[1, 1, 0, 1.15], [1, 0.75, 0.45, 1.6], [1, 0, 0.6, 1.6]]) {
    const P = ((kD * wD + kS * wS) * spacingIn) / 12;
    const fc = P / A;
    const FcStar = SPF2.Fc * CD * CF_C[stud];
    const [Cp, FcE] = columnStability(FcStar, SPF2.Emin, lengthIn, d);
    const wLat = (kW * windPsf * spacingIn) / 144;
    const fb = (wLat * lengthIn ** 2) / 8 / S;
    const Fb1 = SPF2.Fb * CD * CF_B[stud] * CR;
    if (fc >= FcE) return Infinity;
    const ratio = (fc / (FcStar * Cp)) ** 2 + fb / (Fb1 * (1 - fc / FcE));
    out = Math.max(out, ratio, P / (T * d) / SPF2.Fc_perp);
  }
  return out;
}

/**
 * Worst ratio of bending, shear, L/240 total-load deflection and jack bearing
 * for a built-up header (house-framing's header_check). wPlf in lb/ft.
 */
export function headerCheck(size, spanIn, wPlf, plies = 2, jacksPerSide = 1, stud = "2x6") {
  const d = DEPTH[size];
  const b = plies * T;
  const w = wPlf / 12;
  const M = (w * spanIn ** 2) / 8, V = (w * spanIn) / 2;
  const CD = 1.15;
  const ratios = [
    M / ((b * d * d) / 6) / (SPF2.Fb * CD * CF_B[size]),
    (1.5 * V) / (b * d) / (SPF2.Fv * CD),
    ((5 * w * spanIn ** 4) / (384 * SPF2.E * ((b * d ** 3) / 12))) / (spanIn / 240),
  ];
  // the header bears on each jack across min(header width, stud depth) by the jack's 1.5 in
  if (jacksPerSide) ratios.push(V / (jacksPerSide * T * Math.min(b, DEPTH[stud]) * SPF2.Fc_perp));
  return Math.max(...ratios);
}

/**
 * Header over an opening: the smallest 2-ply (then 3-ply) size that passes
 * headerCheck with one jack a side, then two. Returns {size, plies, jacks,
 * ratio} or null when no sawn header works (an engineered beam is needed).
 */
export function sizeHeader(spanIn, wPlf, stud = "2x6") {
  for (const plies of [2, 3]) {
    for (const size of ["2x6", "2x8", "2x10", "2x12"]) {
      for (const jacks of [1, 2]) {
        const ratio = headerCheck(size, spanIn, wPlf, plies, jacks, stud);
        if (ratio <= 1) return { size, plies, jacks, ratio };
      }
    }
  }
  return null;
}
