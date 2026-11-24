// Estimate print time and filament length from the moves in a G-code file,
// for files that carry no slicer summary (other slicers, CAM output, files a
// post-processor or a print host rewrote) and as a second opinion on one that
// does. Pure computation: no network, no state; the page reads the file in
// the browser and nothing is uploaded.
//
// Model (written for this project; the ideas are the standard ones every
// firmware and slicer estimator uses, described in our own words):
//   * Each G0/G1/G2/G3 is a block with a length (XYZ, or |E| for an
//     extruder-only move such as a retraction), a requested speed (F) and a
//     per-axis direction.
//   * Speeds are capped by the per-axis maximum feedrates (M203) and
//     accelerations by the per-axis maximums (M201) and the print / travel /
//     retract acceleration in force (M204).
//   * The speed allowed at the joint between two blocks comes from the
//     cornering rule: Marlin-style "jerk" (M205 X/Y/Z/E: the largest instant
//     change of speed on each axis) or "junction deviation" (M205 J, or a
//     square-corner velocity as Klipper names it).
//   * A two-pass lookahead (backward, then forward) makes every block's
//     entry speed reachable from its neighbours at the block's acceleration,
//     and each block is timed as a trapezoid (accelerate, cruise, decelerate)
//     or a triangle when it is too short to reach its speed.
//   * G4 dwells are added; heater waits (M109, M190, M116) cannot be timed
//     from the file and are counted instead, as slicers do.
// What firmware does that this leaves out: minimum segment time slow-downs,
// input shaping and pressure advance, Klipper's minimum cruise ratio, and the
// time a heater actually takes. eval/motion-vs-prusaslicer-*.md measures how
// far that leaves the estimate from a slicer's own on real slices.

export const DEFAULT_LIMITS = Object.freeze({
  // PrusaSlicer 2.7.2's built-in defaults (its machine_max_* settings with no
  // printer profile loaded), so a bare file is read the way that slicer would.
  maxFeed: { X: 500, Y: 500, Z: 12, E: 120 }, // mm/s
  maxAccel: { X: 9000, Y: 9000, Z: 500, E: 10000 }, // mm/s^2
  printAccel: 1500, // mm/s^2, M204 P (or S)
  travelAccel: 1500, // mm/s^2, M204 T (or S)
  retractAccel: 1500, // mm/s^2, M204 R
  jerk: { X: 10, Y: 10, Z: 0.2, E: 2.5 }, // mm/s
  junctionDeviation: null, // mm; when set, replaces jerk for XYZ corners
  defaultFeed: 60, // mm/s, until the file sets F
});

const AXES = ['X', 'Y', 'Z', 'E'];

function cloneLimits(l) {
  return {
    maxFeed: { ...l.maxFeed }, maxAccel: { ...l.maxAccel }, printAccel: l.printAccel,
    travelAccel: l.travelAccel, retractAccel: l.retractAccel, jerk: { ...l.jerk },
    junctionDeviation: l.junctionDeviation, defaultFeed: l.defaultFeed,
  };
}

/** Strip comments; return {letter: number} words and the command (e.g. "G1"). */
export function parseLine(raw) {
  let s = raw;
  const semi = s.indexOf(';');
  if (semi >= 0) s = s.slice(0, semi);
  if (s.indexOf('(') >= 0) s = s.replace(/\([^)]*\)/g, '');
  const star = s.indexOf('*');
  if (star >= 0) s = s.slice(0, star);
  s = s.trim().toUpperCase();
  if (!s) return null;
  const words = {};
  let cmd = null;
  // "E" inside a number exponent is rare in G-code and ambiguous with the E
  // axis, so numbers are read without exponents: match letter then number.
  for (const m of s.matchAll(/([A-Z])\s*([-+]?(?:\d+\.?\d*|\.\d+))?/g)) {
    const letter = m[1];
    const val = m[2] === undefined ? null : Number(m[2]);
    if (letter === 'N' && cmd === null) continue; // line number
    if ((letter === 'G' || letter === 'M' || letter === 'T') && cmd === null) {
      cmd = letter + (val === null ? '' : String(val));
      continue;
    }
    if (!(letter in words)) words[letter] = val;
  }
  return { cmd, words };
}

function arcGeometry(x0, y0, x1, y1, w, cw) {
  // Centre from I/J offsets, or from R (the shorter arc for R > 0).
  let cx; let cy;
  if (w.I != null || w.J != null) {
    cx = x0 + (w.I ?? 0); cy = y0 + (w.J ?? 0);
  } else if (w.R != null) {
    const r = Math.abs(w.R);
    const dx = x1 - x0; const dy = y1 - y0;
    const d = Math.hypot(dx, dy);
    if (d === 0 || d > 2 * r + 1e-9) return null;
    const h = Math.sqrt(Math.max(0, r * r - (d / 2) ** 2));
    const mx = (x0 + x1) / 2; const my = (y0 + y1) / 2;
    // Pick the side so that the arc is the short one (R>0) or long one (R<0).
    let sign = cw ? -1 : 1;
    if (w.R < 0) sign = -sign;
    cx = mx - sign * h * dy / d; cy = my + sign * h * dx / d;
  } else return null;
  const r = Math.hypot(x0 - cx, y0 - cy);
  const a0 = Math.atan2(y0 - cy, x0 - cx);
  const a1 = Math.atan2(y1 - cy, x1 - cx);
  let theta = cw ? a0 - a1 : a1 - a0;
  while (theta <= 1e-12) theta += 2 * Math.PI;
  if (theta > 2 * Math.PI) theta -= 2 * Math.PI;
  const s = cw ? -1 : 1;
  return {
    xy: r * theta,
    startDir: [-Math.sin(a0) * s, Math.cos(a0) * s],
    endDir: [-Math.sin(a1) * s, Math.cos(a1) * s],
  };
}

/**
 * Read the moves out of G-code text and estimate time and filament.
 * opts.limits overrides DEFAULT_LIMITS (partially); limits the file sets with
 * M201/M203/M204/M205 then apply from where they appear, as on a printer,
 * unless opts.ignoreFileLimits is true.
 */
export function estimateMotion(text, opts = {}) {
  const base = cloneLimits(DEFAULT_LIMITS);
  const o = opts.limits ?? {};
  for (const k of ['maxFeed', 'maxAccel', 'jerk']) if (o[k]) Object.assign(base[k], o[k]);
  for (const k of ['printAccel', 'travelAccel', 'retractAccel', 'junctionDeviation', 'defaultFeed']) {
    if (o[k] !== undefined) base[k] = o[k];
  }
  const lim = base;
  const useFile = !opts.ignoreFileLimits;

  const src = String(text ?? '');
  const lines = src.split('\n');

  // Block arrays (grown as needed).
  let cap = 1024;
  let L = new Float64Array(cap); // length mm
  let V = new Float64Array(cap); // nominal speed mm/s
  let A = new Float64Array(cap); // acceleration mm/s^2
  let J = new Float64Array(cap); // max entry speed from the corner rule
  let K = new Uint8Array(cap); // kind: 0 extrude, 1 travel, 2 retract/E-only
  let n = 0;
  const grow = () => {
    cap *= 2;
    const g = (Arr, a) => { const b = new Arr(cap); b.set(a); return b; };
    L = g(Float64Array, L); V = g(Float64Array, V); A = g(Float64Array, A);
    J = g(Float64Array, J); K = g(Uint8Array, K);
  };

  let absXYZ = true; let absE = true; let scale = 1;
  const pos = { X: 0, Y: 0, Z: 0, E: 0 };
  let feed = lim.defaultFeed; // mm/s
  let filament = 0; // net mm of filament pushed
  let dwell = 0; // s
  // Volumetric extrusion: E counts cubic millimetres, not millimetres of
  // filament. Marlin and RepRapFirmware switch it on with M200 D<diameter>
  // (D0 switches it off); Cura's UltiGCode flavour always writes it.
  let volumetric = /^;FLAVOR:UltiGCode\s*$/m.test(src);
  let heaterWaits = 0; let homes = 0; let moves = 0; let arcs = 0;
  const unsupported = new Map();
  // Direction ratios (per mm of block length) of the previous block, and its
  // exit direction for arcs; null after a stop (dwell, homing, wait).
  let prev = null;
  let prevNominal = 0;

  const cornerLimit = (r, nominal, kind) => {
    // Largest speed at the joint from `prev` into a block with ratios r.
    let v = nominal;
    if (prev) v = Math.min(v, prevNominal);
    const jd = lim.junctionDeviation;
    if (jd != null && jd > 0 && prev && kind !== 2 && prev.kind !== 2) {
      const lx = Math.hypot(r[0], r[1], r[2]); const px = Math.hypot(prev.r[0], prev.r[1], prev.r[2]);
      if (lx > 0 && px > 0) {
        const cos = -(r[0] * prev.r[0] + r[1] * prev.r[1] + r[2] * prev.r[2]) / (lx * px);
        if (cos < 0.999999) {
          const c = Math.max(-0.999999, cos);
          const sinHalf = Math.sqrt(0.5 * (1 - c));
          const a = A[n];
          v = Math.min(v, Math.sqrt(a * jd * sinHalf / (1 - sinHalf)));
        } else v = Math.min(v, 0);
      }
      // Extruder jerk still applies under junction deviation in Marlin.
      const de = Math.abs(r[3] - prev.r[3]);
      if (de > 0 && lim.jerk.E > 0) v = Math.min(v, lim.jerk.E / de);
      return Math.max(0, v);
    }
    // Jerk, as Marlin's classic planner reads it: an axis that keeps its
    // direction may change speed by up to its jerk; one that reverses (or
    // starts or stops) is held to its jerk on the larger of the two sides,
    // not on the sum. Both sides scale with the joint speed, so the limit is
    // jerk / ratio.
    for (let k = 0; k < 4; k++) {
      const j = lim.jerk[AXES[k]];
      const a = prev ? prev.r[k] : 0; const b = r[k];
      const d = a * b > 0 ? Math.abs(a - b) : Math.max(Math.abs(a), Math.abs(b));
      if (d > 1e-12) v = Math.min(v, j / d);
    }
    return Math.max(0, v);
  };

  const addBlock = (len, r, kind, endR) => {
    if (n === cap) grow();
    // Nominal speed: F, capped so no axis passes its maximum feedrate.
    let v = feed;
    for (let k = 0; k < 4; k++) {
      const m = lim.maxFeed[AXES[k]];
      const a = Math.abs(r[k]);
      if (a > 1e-12 && m > 0) v = Math.min(v, m / a);
    }
    let a = kind === 0 ? lim.printAccel : kind === 1 ? lim.travelAccel : lim.retractAccel;
    for (let k = 0; k < 4; k++) {
      const m = lim.maxAccel[AXES[k]];
      const ra = Math.abs(r[k]);
      if (ra > 1e-12 && m > 0) a = Math.min(a, m / ra);
    }
    L[n] = len; V[n] = v; A[n] = a; K[n] = kind;
    J[n] = cornerLimit(r, v, kind);
    prev = { r: endR ?? r, kind };
    prevNominal = v;
    n++;
  };

  for (let li = 0; li < lines.length; li++) {
    const p = parseLine(lines[li]);
    if (!p) continue;
    const { cmd, words: w } = p;
    if (cmd === null) {
      // Bare coordinates continue the last motion mode in many controllers;
      // slicers never write them, so they are counted, not moved.
      if (w.X != null || w.Y != null || w.Z != null || w.E != null) {
        unsupported.set('coordinates without G0/G1', (unsupported.get('coordinates without G0/G1') ?? 0) + 1);
      }
      continue;
    }
    switch (cmd) {
      case 'G0': case 'G1': case 'G2': case 'G3': {
        if (w.F != null && w.F > 0) feed = (w.F * scale) / 60;
        const t = {};
        for (const ax of ['X', 'Y', 'Z']) {
          t[ax] = w[ax] == null ? pos[ax] : absXYZ ? w[ax] * scale : pos[ax] + w[ax] * scale;
        }
        const tE = w.E == null ? pos.E : absE ? w.E * scale : pos.E + w.E * scale;
        const dx = t.X - pos.X; const dy = t.Y - pos.Y; const dz = t.Z - pos.Z; const de = tE - pos.E;
        let xy = Math.hypot(dx, dy);
        let startDir = null; let endDir = null;
        if (cmd === 'G2' || cmd === 'G3') {
          const iw = { I: w.I == null ? null : w.I * scale, J: w.J == null ? null : w.J * scale, R: w.R == null ? null : w.R * scale };
          const g = arcGeometry(pos.X, pos.Y, t.X, t.Y, iw, cmd === 'G2');
          if (g) { xy = g.xy; startDir = g.startDir; endDir = g.endDir; arcs++; } else {
            unsupported.set('arc without centre', (unsupported.get('arc without centre') ?? 0) + 1);
          }
        }
        const len = Math.hypot(xy, dz);
        filament += de;
        pos.X = t.X; pos.Y = t.Y; pos.Z = t.Z; pos.E = tE;
        if (len > 1e-9) {
          const ratio = (dir) => [dir ? dir[0] * xy / len : dx / len, dir ? dir[1] * xy / len : dy / len, dz / len, de / len];
          const r = ratio(startDir);
          const endR = endDir ? ratio(endDir) : null;
          addBlock(len, r, de > 1e-9 ? 0 : 1, endR);
          moves++;
        } else if (Math.abs(de) > 1e-9) {
          addBlock(Math.abs(de), [0, 0, 0, Math.sign(de)], 2, null);
          moves++;
        }
        break;
      }
      case 'G4': {
        // P milliseconds, S seconds (Marlin, RepRapFirmware, Klipper agree).
        const s = (w.S ?? 0) + (w.P ?? 0) / 1000;
        if (s > 0) { dwell += s; prev = null; prevNominal = 0; }
        break;
      }
      case 'G20': scale = 25.4; break;
      case 'G21': scale = 1; break;
      case 'G28': {
        // Homing: timed as a move of the homed axes back to 0 at the speed in
        // force, from a stop to a stop (firmware homes at its own speeds and
        // bumps twice, so this is a floor). The first home of a print starts
        // from an unknown place and costs 0 here.
        homes++;
        const named = ['X', 'Y', 'Z'].filter((ax) => ax in w);
        const d = [0, 0, 0];
        (named.length ? named : ['X', 'Y', 'Z']).forEach((ax) => { d['XYZ'.indexOf(ax)] = -pos[ax]; pos[ax] = 0; });
        const len = Math.hypot(d[0], d[1], d[2]);
        prev = null; prevNominal = 0;
        if (len > 1e-9) { addBlock(len, [d[0] / len, d[1] / len, d[2] / len, 0], 1, null); prev = null; prevNominal = 0; }
        break;
      }
      case 'G90': absXYZ = true; absE = true; break;
      case 'G91': absXYZ = false; absE = false; break;
      case 'M82': absE = true; break;
      case 'M83': absE = false; break;
      case 'G92': {
        let any = false;
        for (const ax of AXES) if (w[ax] != null) { pos[ax] = w[ax] * scale; any = true; }
        if (!any) for (const ax of AXES) pos[ax] = 0;
        break;
      }
      case 'M109': case 'M190': case 'M116': case 'M191': heaterWaits++; prev = null; prevNominal = 0; break;
      case 'M200': if (w.D != null) volumetric = w.D > 0; break;
      case 'M400': prev = null; prevNominal = 0; break;
      case 'M201': if (useFile) for (const ax of AXES) if (w[ax] != null && w[ax] > 0) lim.maxAccel[ax] = w[ax]; break;
      case 'M203': if (useFile) for (const ax of AXES) if (w[ax] != null && w[ax] > 0) lim.maxFeed[ax] = w[ax]; break;
      case 'M204':
        if (useFile) {
          if (w.S != null && w.S > 0) { lim.printAccel = w.S; lim.travelAccel = w.S; }
          if (w.P != null && w.P > 0) lim.printAccel = w.P;
          if (w.T != null && w.T > 0) lim.travelAccel = w.T;
          if (w.R != null && w.R > 0) lim.retractAccel = w.R;
        }
        break;
      case 'M205':
        if (useFile) {
          if (w.X != null) { lim.jerk.X = w.X; lim.jerk.Y = w.X; }
          if (w.Y != null) lim.jerk.Y = w.Y;
          if (w.Z != null) lim.jerk.Z = w.Z;
          if (w.E != null) lim.jerk.E = w.E;
          if (w.J != null && w.J > 0) lim.junctionDeviation = w.J;
        }
        break;
      case 'G5': case 'G6':
        unsupported.set(cmd, (unsupported.get(cmd) ?? 0) + 1);
        break;
      default: break;
    }
  }

  // Lookahead. Exit speed of the last block is 0; a stop (prev reset) shows
  // as a corner limit computed from rest, so it needs no special case.
  const entry = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) entry[i] = Math.min(J[i], V[i]);
  entry[n] = 0;
  for (let i = n - 1; i >= 0; i--) {
    const reach = Math.sqrt(entry[i + 1] * entry[i + 1] + 2 * A[i] * L[i]);
    if (entry[i] > reach) entry[i] = reach;
  }
  for (let i = 0; i < n; i++) {
    const reach = Math.sqrt(entry[i] * entry[i] + 2 * A[i] * L[i]);
    if (entry[i + 1] > reach) entry[i + 1] = reach;
  }

  const byKind = [0, 0, 0];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const vi = entry[i]; const vf = entry[i + 1]; const v = V[i]; const a = A[i]; const len = L[i];
    let t;
    const da = (v * v - vi * vi) / (2 * a);
    const dd = (v * v - vf * vf) / (2 * a);
    if (da + dd <= len) t = (v - vi) / a + (v - vf) / a + (len - da - dd) / v;
    else {
      const vp = Math.sqrt(Math.max(vi * vi, vf * vf, (2 * a * len + vi * vi + vf * vf) / 2));
      t = (vp - vi) / a + (vp - vf) / a;
    }
    byKind[K[i]] += t;
    total += t;
  }
  total += dwell;

  return {
    seconds: total,
    hours: Math.round((total / 3600) * 100) / 100,
    filamentMm: filament,
    volumetric,
    breakdown: { extruding: byKind[0], travel: byKind[1], retract: byKind[2], dwell },
    moves, arcs, homes, heaterWaits,
    unsupported: Object.fromEntries(unsupported),
    cornering: lim.junctionDeviation != null && lim.junctionDeviation > 0 ? 'junction deviation' : 'jerk',
    limits: lim,
  };
}
