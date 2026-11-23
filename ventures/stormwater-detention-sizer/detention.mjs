// Stormwater detention pond sizer: NRCS curve-number runoff, the NRCS
// triangular unit hydrograph, level-pool (storage-indication) routing and a
// two-stage outlet (low orifice, upper weir) sized so the post-development
// peak outflow does not exceed the pre-development peak for each storm.
//
// US customary units throughout: acres, inches of rain, feet of stage,
// cubic feet of storage, cubic feet per second of flow, minutes for the
// time step and hours for times of concentration.
//
// Sources (named in README "Spec sources"):
// - Runoff depth: USDA NRCS, National Engineering Handbook Part 630,
//   Chapter 10, eq. 10-11 (Q = (P - Ia)^2 / (P - Ia + S), S = 1000/CN - 10,
//   Ia = 0.2 S), the same equation as TR-55 (1986) eq. 2-3/2-4.
// - Unit hydrograph: NEH-630 Chapter 16, the triangular unit hydrograph,
//   qp = PRF * A * Q / Tp with PRF 484, Tp = D/2 + 0.6 Tc (lag = 0.6 Tc).
// - Design storm: alternating-block hyetograph from an intensity-duration
//   curve i = a / (t + b)^n (Chow, Maidment and Mays, Applied Hydrology,
//   1988, section 14.4).
// - Routing: storage-indication (modified Puls) level-pool routing, same
//   book, section 8.2.
// - Orifice Q = Cd A sqrt(2 g h); sharp-crested rectangular weir
//   Q = Cw L H^1.5 with Cw = 3.33 (US units).
//
// Pure functions; no imports, clocks or randomness, so the page, the CLI and
// the tests all compute the same numbers.

export const G = 32.174; // ft/s^2
export const CFS_HR_PER_INCH_SQMI = 2323200 / 3600; // 1 in over 1 sq mi, in cfs-hours (645.33)
export const ACRES_PER_SQMI = 640;
const FT3_PER_ACRE_IN = 43560 / 12;

// --- runoff -------------------------------------------------------------

// Cumulative direct runoff depth (in) for cumulative rainfall p (in).
export function runoffDepth(p, cn, iaRatio = 0.2) {
  if (!(cn > 0 && cn <= 100)) throw new Error("curve number must be in (0, 100]");
  if (cn === 100) return Math.max(0, p);
  const s = 1000 / cn - 10;
  const ia = iaRatio * s;
  if (p <= ia) return 0;
  return (p - ia) ** 2 / (p - ia + s);
}

// --- design storm ---------------------------------------------------------

// Average intensity (in/hr) over a duration t (minutes) from i = a/(t+b)^n.
export function idfIntensity(tMin, { a, b, n }) {
  return a / (tMin + b) ** n;
}

// Alternating-block hyetograph: incremental depths (in) per step of dtMin,
// over durationMin, with the largest block at the centre and the rest placed
// alternately right and left of it.
export function alternatingBlock(idf, durationMin, dtMin) {
  const steps = Math.round(durationMin / dtMin);
  if (steps < 1 || Math.abs(steps * dtMin - durationMin) > 1e-9 * durationMin) {
    throw new Error("storm duration must be a whole number of time steps");
  }
  const cum = (k) => (k === 0 ? 0 : (idfIntensity(k * dtMin, idf) * k * dtMin) / 60);
  const blocks = [];
  for (let k = 1; k <= steps; k++) blocks.push(cum(k) - cum(k - 1));
  // blocks are already in decreasing order for any decreasing IDF curve; sort to be safe
  const sorted = [...blocks].sort((x, y) => y - x);
  const out = new Array(steps).fill(0);
  const centre = Math.floor((steps - 1) / 2);
  out[centre] = sorted[0];
  let left = centre - 1, right = centre + 1;
  for (let j = 1; j < steps; j++) {
    if ((j % 2 === 1 && right < steps) || left < 0) out[right++] = sorted[j];
    else out[left--] = sorted[j];
  }
  return out;
}

// Incremental runoff depths (in) per step from incremental rainfall.
export function excessIncrements(rain, cn, iaRatio = 0.2) {
  let p = 0, q = 0;
  return rain.map((dp) => {
    p += dp;
    const qNew = runoffDepth(p, cn, iaRatio);
    const dq = qNew - q;
    q = qNew;
    return dq;
  });
}

// --- unit hydrograph --------------------------------------------------------

// Ordinates (cfs per inch of excess) of the NRCS triangular unit hydrograph
// for a step of dtMin, each the mean of the triangle over its step so the
// ordinates conserve exactly 1 inch over the area.
export function triangularUH(areaAc, tcHr, dtMin, prf = 484) {
  const dt = dtMin / 60;
  const aSqmi = areaAc / ACRES_PER_SQMI;
  const tp = dt / 2 + 0.6 * tcHr;
  const qp = (prf * aSqmi) / tp; // cfs per inch
  const tb = (2 * CFS_HR_PER_INCH_SQMI * aSqmi) / qp; // base from the volume of 1 inch
  // integral of the triangle from 0 to t
  const F = (t) => {
    if (t <= 0) return 0;
    if (t <= tp) return (qp * t * t) / (2 * tp);
    if (t >= tb) return (qp * tb) / 2;
    const r = tb - t;
    return (qp * tb) / 2 - (qp * r * r) / (2 * (tb - tp));
  };
  const n = Math.ceil(tb / dt);
  const u = [];
  for (let j = 0; j < n; j++) u.push((F((j + 1) * dt) - F(j * dt)) / dt);
  return { ordinates: u, tp, qp, tb };
}

// Discrete convolution: step-mean flow (cfs) from excess increments (in).
export function convolve(excess, uh) {
  const out = new Array(excess.length + uh.length - 1).fill(0);
  for (let m = 0; m < excess.length; m++) {
    const e = excess[m];
    if (e === 0) continue;
    for (let j = 0; j < uh.length; j++) out[m + j] += e * uh[j];
  }
  return out;
}

export function hydrograph({ areaAc, cn, tcHr, rain, dtMin, prf = 484, iaRatio = 0.2 }) {
  const excess = excessIncrements(rain, cn, iaRatio);
  const uh = triangularUH(areaAc, tcHr, dtMin, prf);
  const flow = convolve(excess, uh.ordinates);
  const runoffIn = excess.reduce((s, x) => s + x, 0);
  return { flow, runoffIn, volumeFt3: runoffIn * areaAc * FT3_PER_ACRE_IN, peak: Math.max(...flow), uh };
}

// --- pond and outlet ----------------------------------------------------------

// Storage (ft3) at stage h (ft) above the bottom of a rectangular basin with
// a bottom length x width and side slopes z horizontal to 1 vertical: the
// exact prismoidal volume.
export function pondStorage(h, { length, width, sideSlope }) {
  if (h <= 0) return 0;
  const z = sideSlope;
  return length * width * h + (length + width) * z * h * h + (4 / 3) * z * z * h * h * h;
}

export function pondArea(h, { length, width, sideSlope }) {
  const z = sideSlope;
  return (length + 2 * z * h) * (width + 2 * z * h);
}

// Circular orifice with its invert at the pond bottom. Above the crown it is
// an orifice under head to its centre; below the crown the flow is scaled
// as (h/d)^1.5 from the flow at the crown, a weir-like transition that keeps
// the rating continuous and increasing (a simplification named on the page).
export function orificeFlow(h, d, cd = 0.6) {
  if (h <= 0 || d <= 0) return 0;
  const area = (Math.PI * d * d) / 4;
  const full = (hh) => cd * area * Math.sqrt(2 * G * (hh - d / 2));
  if (h >= d) return full(h);
  return full(d) * (h / d) ** 1.5;
}

export function weirFlow(h, crest, length, cw = 3.33) {
  if (length <= 0 || h <= crest) return 0;
  return cw * length * (h - crest) ** 1.5;
}

export function outletFlow(h, outlet) {
  return orificeFlow(h, outlet.orificeDiameter, outlet.cd ?? 0.6) +
    weirFlow(h, outlet.weirCrest ?? Infinity, outlet.weirLength ?? 0, outlet.cw ?? 3.33);
}

// --- routing --------------------------------------------------------------------

// Storage-indication routing of a step-mean inflow series. storage(h) and
// outflow(h) must both increase with h. Each step solves
// 2 S(h1)/dt + O(h1) = I0 + I1 + 2 S(h0)/dt - O(h0) for h1 by bisection,
// so there is no rating-table interpolation error. Inflow is continued with
// zeros until the pond has drained to 1/1000 of its peak outflow or a cap.
export function route(inflow, dtMin, storage, outflow, { maxStage = 1e4, drainSteps = 20000 } = {}) {
  const dt = dtMin * 60;
  const stages = [0], outs = [0];
  let h = 0, o = 0, s = 0, peakOut = 0, peakStage = 0;
  const total = inflow.length + drainSteps;
  let prevIn = 0;
  for (let k = 0; k < total; k++) {
    const iNow = k < inflow.length ? inflow[k] : 0;
    const rhs = prevIn + iNow + (2 * s) / dt - o;
    let lo = 0, hi = Math.max(1, h * 2);
    const f = (x) => (2 * storage(x)) / dt + outflow(x) - rhs;
    while (f(hi) < 0) { hi *= 2; if (hi > maxStage) break; }
    for (let it = 0; it < 80; it++) {
      const mid = (lo + hi) / 2;
      if (f(mid) < 0) lo = mid; else hi = mid;
    }
    h = rhs <= 0 ? 0 : (lo + hi) / 2;
    s = storage(h);
    o = outflow(h);
    prevIn = iNow;
    stages.push(h);
    outs.push(o);
    if (o > peakOut) peakOut = o;
    if (h > peakStage) peakStage = h;
    if (k >= inflow.length && o < peakOut * 1e-3 && s < storage(peakStage) * 1e-3) break;
  }
  return { stage: stages, outflow: outs, peakOut, peakStage, peakStorage: storage(peakStage) };
}

// --- sizing ---------------------------------------------------------------------

function bisectIncreasing(fn, target, lo, hi, iters = 60) {
  // fn increases with x; returns x with fn(x) ~= target, clamped to [lo, hi].
  if (fn(hi) <= target) return hi;
  if (fn(lo) >= target) return lo;
  for (let i = 0; i < iters; i++) {
    const mid = (lo + hi) / 2;
    if (fn(mid) < target) lo = mid; else hi = mid;
  }
  return lo; // the side that keeps the peak at or under the target
}

function num(x, name, { min = -Infinity, max = Infinity, allowBlank = false, fallback } = {}) {
  // Number("") is 0, so a blank required field would pass as zero wherever 0
  // is in range (side slope, IDF b) while the page shows its placeholder.
  if (x === undefined || x === null || String(x).trim() === "") {
    if (allowBlank) return fallback;
    throw new Error(`${name}: enter a number`);
  }
  const v = Number(String(x).trim());
  if (!Number.isFinite(v)) throw new Error(`${name}: enter a number`);
  if (v < min || v > max) throw new Error(max === Infinity ? `${name}: must be ${min} or more` : `${name}: must be between ${min} and ${max}`);
  return v;
}

export function sampleInput() {
  return {
    areaAc: "5",
    preCN: "61", preTcHr: "0.5",
    postCN: "85", postTcHr: "0.2",
    durationHr: "24", dtMin: "2",
    smallLabel: "2-year", smallA: "40", smallB: "10", smallN: "0.8", smallAllow: "",
    largeLabel: "100-year", largeA: "85", largeB: "10", largeN: "0.8", largeAllow: "",
    length: "100", width: "60", sideSlope: "3",
    freeboard: "1", cd: "0.6", cw: "3.33", prf: "484",
  };
}

export function parseInput(raw) {
  const x = { ...raw };
  const p = {
    areaAc: num(x.areaAc, "Drainage area", { min: 0.01, max: 2000 }),
    preCN: num(x.preCN, "Pre-development curve number", { min: 30, max: 100 }),
    preTcHr: num(x.preTcHr, "Pre-development time of concentration", { min: 0.05, max: 24 }),
    postCN: num(x.postCN, "Post-development curve number", { min: 30, max: 100 }),
    postTcHr: num(x.postTcHr, "Post-development time of concentration", { min: 0.05, max: 24 }),
    durationHr: num(x.durationHr, "Storm duration", { min: 0.25, max: 72, allowBlank: true, fallback: 24 }),
    dtMin: num(x.dtMin, "Time step", { min: 0.25, max: 30, allowBlank: true, fallback: 2 }),
    length: num(x.length, "Basin bottom length", { min: 1, max: 5000 }),
    width: num(x.width, "Basin bottom width", { min: 1, max: 5000 }),
    sideSlope: num(x.sideSlope, "Side slope", { min: 0, max: 20 }),
    freeboard: num(x.freeboard, "Freeboard", { min: 0, max: 10, allowBlank: true, fallback: 1 }),
    cd: num(x.cd, "Orifice coefficient", { min: 0.3, max: 1, allowBlank: true, fallback: 0.6 }),
    cw: num(x.cw, "Weir coefficient", { min: 2, max: 4, allowBlank: true, fallback: 3.33 }),
    prf: num(x.prf, "Peak rate factor", { min: 100, max: 700, allowBlank: true, fallback: 484 }),
    storms: [],
  };
  if (Math.abs(Math.round((p.durationHr * 60) / p.dtMin) * p.dtMin - p.durationHr * 60) > 1e-6) {
    throw new Error("Storm duration must be a whole number of time steps");
  }
  for (const key of ["small", "large"]) {
    const a = x[`${key}A`];
    if ((a === undefined || String(a).trim() === "") && key === "large") continue;
    p.storms.push({
      label: String(x[`${key}Label`] || (key === "small" ? "Small storm" : "Large storm")).slice(0, 40),
      idf: {
        a: num(a, `${key === "small" ? "Small" : "Large"} storm a`, { min: 0.01, max: 10000 }),
        b: num(x[`${key}B`], `${key === "small" ? "Small" : "Large"} storm b`, { min: 0, max: 200 }),
        n: num(x[`${key}N`], `${key === "small" ? "Small" : "Large"} storm n`, { min: 0.1, max: 1.5 }),
      },
      allow: num(x[`${key}Allow`], `${key} storm allowable outflow`, { min: 0, max: 1e6, allowBlank: true, fallback: null }),
    });
  }
  return p;
}

// Size a two-stage outlet. The orifice is sized on the first (small) storm
// with no weir; the weir crest sits at the small storm's peak stage, so the
// small storm never reaches it; the weir length is then sized on the second
// (large) storm. Each search keeps the peak outflow at or under the allowable.
export function size(p) {
  const pond = { length: p.length, width: p.width, sideSlope: p.sideSlope };
  const S = (h) => pondStorage(h, pond);
  const findings = [];
  const postUH = triangularUH(p.areaAc, p.postTcHr, p.dtMin, p.prf);
  const lagLimit = 0.29 * postUH.tp * 60;
  if (p.dtMin > lagLimit) {
    findings.push({ severity: "medium", title: "Time step is coarse for this site", detail: `NRCS guidance keeps the step under about 0.29 x Tp (${lagLimit.toFixed(1)} min here); a ${p.dtMin} min step can understate the peaks.` });
  }
  const storms = p.storms.map((st) => {
    const rain = alternatingBlock(st.idf, p.durationHr * 60, p.dtMin);
    const depth = rain.reduce((s, x) => s + x, 0);
    const pre = hydrograph({ areaAc: p.areaAc, cn: p.preCN, tcHr: p.preTcHr, rain, dtMin: p.dtMin, prf: p.prf });
    const post = hydrograph({ areaAc: p.areaAc, cn: p.postCN, tcHr: p.postTcHr, rain, dtMin: p.dtMin, prf: p.prf });
    const allow = st.allow ?? pre.peak;
    return { ...st, rain, depth, pre, post, allow, peakIntensity: Math.max(...rain) / (p.dtMin / 60) };
  });

  const outlet = { orificeDiameter: 0, weirCrest: Infinity, weirLength: 0, cd: p.cd, cw: p.cw };
  const runWith = (o, st) => route(st.post.flow, p.dtMin, S, (h) => outletFlow(h, o));

  // stage 1: orifice on the small storm
  const s1 = storms[0];
  if (s1.post.peak <= s1.allow) {
    findings.push({ severity: "info", title: `No detention needed for the ${s1.label} storm`, detail: `The post-development peak (${s1.post.peak.toFixed(2)} cfs) is already at or under the allowable (${s1.allow.toFixed(2)} cfs).` });
  }
  const peak1 = (d) => runWith({ ...outlet, orificeDiameter: d }, s1).peakOut;
  if (s1.allow <= 0) throw new Error("The small storm's allowable outflow is zero: the pre-development site makes no runoff in it. Enter an allowable outflow.");
  outlet.orificeDiameter = bisectIncreasing(peak1, s1.allow, 0.01, 8, 40);
  const r1 = runWith(outlet, s1);
  s1.routed = r1;
  outlet.weirCrest = r1.peakStage;

  // stage 2: weir on the large storm
  if (storms[1]) {
    const s2 = storms[1];
    const peak2 = (L) => runWith({ ...outlet, weirLength: L }, s2).peakOut;
    const orificeOnly = peak2(0);
    if (orificeOnly > s2.allow) {
      outlet.weirLength = 0;
      findings.push({ severity: "high", title: `The orifice alone lets out more than the ${s2.label} allowable`, detail: `With no weir the ${s2.label} outflow peaks at ${orificeOnly.toFixed(2)} cfs against ${s2.allow.toFixed(2)} cfs. A larger basin footprint lowers the stage and the orifice flow with it.` });
    } else {
      // the longest weir that keeps the large-storm peak at the allowable: it
      // releases all that is allowed, so the basin is as shallow as it can be
      outlet.weirLength = bisectIncreasing(peak2, s2.allow, 0, 500, 40);
      if (outlet.weirLength >= 500) findings.push({ severity: "info", title: "Weir length capped at 500 ft", detail: `Even a 500 ft weir keeps the ${s2.label} peak under its allowable; the basin is larger than this storm needs.` });
    }
    s2.routed = runWith(outlet, s2);
  }
  // the small storm with the final outlet (the weir crest is at its peak stage, so it is unchanged)
  const last = storms[storms.length - 1].routed;
  const requiredDepth = last.peakStage + p.freeboard;
  const topArea = pondArea(requiredDepth, pond);
  for (const st of storms) {
    const r = st.routed;
    if (r.peakOut > st.allow * (1 + 1e-6) + 1e-9) findings.push({ severity: "high", title: `${st.label} outflow is over the allowable`, detail: `${r.peakOut.toFixed(2)} cfs against ${st.allow.toFixed(2)} cfs.` });
  }
  if (outlet.orificeDiameter < 1 / 12 * 3) {
    findings.push({ severity: "medium", title: "Small orifice", detail: `A ${(outlet.orificeDiameter * 12).toFixed(1)} in orifice clogs easily. Many manuals set a minimum (often 2 to 4 in) and a trash rack; check yours.` });
  }
  return {
    input: p,
    storms: storms.map((st) => ({
      label: st.label, idf: st.idf, depthIn: st.depth, peakIntensity: st.peakIntensity,
      prePeak: st.pre.peak, preRunoffIn: st.pre.runoffIn, postPeak: st.post.peak, postRunoffIn: st.post.runoffIn,
      postVolumeFt3: st.post.volumeFt3, allow: st.allow, allowFromPre: st.allow === st.pre.peak,
      peakOut: st.routed.peakOut, peakStage: st.routed.peakStage, peakStorageFt3: st.routed.peakStorage,
      rain: st.rain, inflow: st.post.flow, outflow: st.routed.outflow, stage: st.routed.stage, preFlow: st.pre.flow,
    })),
    outlet: { orificeDiameterFt: outlet.orificeDiameter, orificeDiameterIn: outlet.orificeDiameter * 12, weirCrestFt: storms[1] ? outlet.weirCrest : null, weirLengthFt: storms[1] ? outlet.weirLength : null },
    requiredDepthFt: requiredDepth,
    topLengthFt: p.length + 2 * p.sideSlope * requiredDepth,
    topWidthFt: p.width + 2 * p.sideSlope * requiredDepth,
    topAreaFt2: topArea,
    storageAtTopFt3: pondStorage(requiredDepth, pond),
    findings,
  };
}

export function analyze(raw) {
  try {
    return size(parseInput(raw));
  } catch (e) {
    return { error: e.message };
  }
}

// Spreadsheet formula-injection guard: storm names are typed by the visitor.
export function csvCell(c) {
  let s = String(c);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function reportCsv(a) {
  const dt = a.input.dtMin;
  const head = ["minute"];
  for (const s of a.storms) head.push(`${s.label} rain in`, `${s.label} pre cfs`, `${s.label} inflow cfs`, `${s.label} outflow cfs`, `${s.label} stage ft`);
  const n = Math.max(...a.storms.map((s) => Math.max(s.inflow.length, s.outflow.length, s.preFlow.length)));
  const rows = [head.map(csvCell).join(",")];
  const f = (x, d) => (x === undefined ? "" : Number(x).toFixed(d));
  for (let k = 0; k < n; k++) {
    const row = [String(k * dt)];
    // stage and outflow arrays start at time 0 with an extra leading zero; align on step ends
    for (const s of a.storms) row.push(f(s.rain[k], 4), f(s.preFlow[k], 3), f(s.inflow[k], 3), f(s.outflow[k + 1], 3), f(s.stage[k + 1], 3));
    rows.push(row.join(","));
  }
  return rows.join("\n") + "\n";
}
