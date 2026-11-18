// @ts-check
// Water supply pipe sizing for a house: how much water the pipes must carry at
// the busy moment, and the smallest pipe in each run that carries it within
// your velocity limit and still leaves the pressure you need at every fixture.
//
// Demand is Hunter's probabilistic method done exactly. Roy Hunter (National
// Bureau of Standards, 1940) treated each fixture as busy with probability
// p = (minutes per use x uses in the peak hour) / 60, independently of the
// others, and sized for the flow that the number of fixtures running at once
// does not exceed 99% of the time. His fixture-unit tables are a hand
// approximation of that rule. Here the rule is computed directly: the total
// flow of the fixtures fed by a pipe is a sum of independent binomials, one
// per fixture type, and its distribution is built by convolution on a grid of
// 0.01 gpm, so the quantile is exact for flows typed to the hundredth.
//
// Nothing here is a code table. The fixture flows, minutes per use, uses per
// peak hour, the pressure you need at a fixture, the velocity limit and the
// equivalent length of fittings are the numbers you type. Code-approved sizing
// (IPC/UPC fixture-unit tables, local amendments) can give a different answer
// and is what an inspector checks.
//
// Pipe loss is Darcy-Weisbach with the Colebrook-White friction factor
// (64/Re below Re 2300), water viscosity from the Vogel equation and density
// from Thiesen's fit at the temperature you type. Bores are computed from outside diameter and wall:
// copper K, L and M from ASTM B88 nominal OD and wall; PEX SDR 9 and CPVC
// SDR 11 copper-tube-size from OD and minimum wall (OD/SDR, with a 0.070 in
// and 0.068 in floor). Minimum wall gives the largest bore, so the loss is
// slightly optimistic for real tube; type your maker's bore with `customBores`.

const G = 32.174; // ft/s^2
const PSI_PER_FT_HEAD_60F = 62.37 / 144; // static head of water at about 60 F

/** Nominal size label -> [outside diameter in, wall in]. */
const COPPER_OD = { "1/2": 0.625, "3/4": 0.875, "1": 1.125, "1-1/4": 1.375, "1-1/2": 1.625, "2": 2.125 };
const WALL = {
  "copper-k": { "1/2": 0.049, "3/4": 0.065, "1": 0.065, "1-1/4": 0.065, "1-1/2": 0.072, "2": 0.083 },
  "copper-l": { "1/2": 0.040, "3/4": 0.045, "1": 0.050, "1-1/4": 0.055, "1-1/2": 0.060, "2": 0.070 },
  "copper-m": { "1/2": 0.028, "3/4": 0.032, "1": 0.035, "1-1/4": 0.042, "1-1/2": 0.049, "2": 0.058 },
};
const SDR = { "pex": [9, 0.070], "cpvc": [11, 0.068] };
const ROUGHNESS_FT = { "copper-k": 5e-6, "copper-l": 5e-6, "copper-m": 5e-6, "pex": 2e-5, "cpvc": 5e-6 };
export const MATERIALS = { "copper-k": "Copper type K", "copper-l": "Copper type L", "copper-m": "Copper type M", "pex": "PEX SDR 9 (CTS)", "cpvc": "CPVC SDR 11 (CTS)" };
export const SIZES = ["1/2", "3/4", "1", "1-1/4", "1-1/2", "2"];

/** Inside diameter in inches for a material and nominal size. @param {string} material @param {string} size */
export function boreIn(material, size) {
  const od = /** @type {any} */ (COPPER_OD)[size];
  if (od == null) return null;
  const w = /** @type {any} */ (WALL)[material];
  if (w) return +(od - 2 * w[size]).toFixed(4);
  const s = /** @type {any} */ (SDR)[material];
  if (!s) return null;
  const wall = Math.max(Math.round((od / s[0]) * 1000) / 1000, s[1]);
  return +(od - 2 * wall).toFixed(4);
}

/** Kinematic viscosity of water, ft^2/s, at a temperature in F (Vogel equation for viscosity, Thiesen's fit for density). @param {number} tempF */
export function waterNu(tempF) {
  const c = (tempF - 32) * 5 / 9;
  const mu = 2.414e-5 * Math.pow(10, 247.8 / (c + 273.15 - 140)); // Pa s
  const rho = 1000 * (1 - ((c + 288.9414) / (508929.2 * (c + 68.12963))) * (c - 3.9863) ** 2); // kg/m^3
  return (mu / rho) * 10.7639; // m^2/s -> ft^2/s
}

/** Darcy friction factor. @param {number} re @param {number} relRough */
export function frictionFactor(re, relRough) {
  if (re <= 0) return 0;
  if (re < 2300) return 64 / re;
  // Colebrook-White by fixed-point iteration on 1/sqrt(f), seeded with Swamee-Jain.
  let x = -2 * Math.log10(relRough / 3.7 + 5.74 / Math.pow(re, 0.9));
  for (let i = 0; i < 50; i++) {
    const nx = -2 * Math.log10(relRough / 3.7 + 2.51 * x / re);
    if (Math.abs(nx - x) < 1e-12) { x = nx; break; }
    x = nx;
  }
  return 1 / (x * x);
}

/**
 * Flow in a pipe: velocity, Reynolds number, friction factor and loss in psi per foot.
 * @param {number} gpm @param {number} boreInches @param {{ tempF?: number, roughnessFt?: number }} [o]
 */
export function pipeFlow(gpm, boreInches, o = {}) {
  const d = boreInches / 12;
  const area = Math.PI * d * d / 4;
  const v = (gpm / 448.831) / area;
  const nu = waterNu(o.tempF ?? 60);
  const re = v * d / nu;
  const f = frictionFactor(re, (o.roughnessFt ?? 5e-6) / d);
  const headPerFt = f * (1 / d) * v * v / (2 * G);
  return { velocityFps: v, reynolds: re, friction: f, psiPerFt: headPerFt * PSI_PER_FT_HEAD_60F };
}

/** @param {number} n @param {number} p */
function binomialPmf(n, p) {
  const out = new Array(n + 1).fill(0);
  if (p <= 0) { out[0] = 1; return out; }
  if (p >= 1) { out[n] = 1; return out; }
  const lq = Math.log1p(-p), lp = Math.log(p);
  let lc = 0;
  for (let k = 0; k <= n; k++) {
    if (k > 0) lc += Math.log(n - k + 1) - Math.log(k);
    out[k] = Math.exp(lc + k * lp + (n - k) * lq);
  }
  return out;
}

/** @param {number} a @param {number} b */
const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };

/**
 * Exact distribution of total flow for independent fixture types.
 * @param {{ gpm: number, p: number, count: number }[]} groups
 */
export function demandDistribution(groups) {
  const live = groups.filter((g) => g.count > 0 && g.gpm > 0);
  const units = live.map((g) => Math.round(g.gpm * 100));
  const step = units.reduce((a, b) => gcd(a, b), 0) || 1;
  let pmf = [1];
  live.forEach((g, i) => {
    const k = units[i] / step;
    const b = binomialPmf(g.count, g.p);
    const next = new Array(pmf.length + g.count * k).fill(0);
    for (let x = 0; x < pmf.length; x++) {
      if (pmf[x] === 0) continue;
      for (let j = 0; j <= g.count; j++) next[x + j * k] += pmf[x] * b[j];
    }
    pmf = next;
  });
  const gpmStep = step / 100;
  const mean = live.reduce((s, g) => s + g.count * g.p * g.gpm, 0);
  const variance = live.reduce((s, g) => s + g.count * g.p * (1 - g.p) * g.gpm * g.gpm, 0);
  const allOn = live.reduce((s, g) => s + g.count * g.gpm, 0);
  /** smallest flow with P(total <= flow) >= q @param {number} q */
  const quantile = (q) => {
    let c = 0;
    for (let x = 0; x < pmf.length; x++) { c += pmf[x]; if (c >= q - 1e-12) return +(x * gpmStep).toFixed(4); }
    return +((pmf.length - 1) * gpmStep).toFixed(4);
  };
  return { pmf, gpmStep, mean, variance, allOn, quantile };
}

/** Inverse standard normal (Acklam's rational approximation, relative error about 1e-9). @param {number} q */
export function normInv(q) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.3577518672690, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (q < lo) { const t = Math.sqrt(-2 * Math.log(q)); return (((((c[0] * t + c[1]) * t + c[2]) * t + c[3]) * t + c[4]) * t + c[5]) / ((((d[0] * t + d[1]) * t + d[2]) * t + d[3]) * t + 1); }
  if (q > 1 - lo) return -normInv(1 - q);
  const t = q - 0.5, r = t * t;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * t / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** @typedef {{ name?: string, gpm: number, p?: number, minutesPerUse?: number, usesPerPeakHour?: number }} FixtureType */
/** @typedef {{ id: string, parent?: string | null, lengthFt: number, riseFt?: number, fittingsFt?: number, fixtures?: Record<string, number>, minSize?: string }} Segment */
/** @typedef {{ fixtureTypes: Record<string, FixtureType>, segments: Segment[], material?: string, customBores?: Record<string, number>, staticPsi: number, meterLossPsi?: number, minPsi: number, maxVelocityFps?: number, quantile?: number, tempF?: number, roughnessFt?: number }} SupplyPlan */

const isNum = (/** @type {any} */ x) => typeof x === "number" && Number.isFinite(x);

/** @param {any} d */
export function validateSupply(d) {
  const e = [];
  if (d == null || typeof d !== "object" || Array.isArray(d)) return ["The supply plan is an object."];
  const ft = d.fixtureTypes;
  if (ft == null || typeof ft !== "object" || Array.isArray(ft) || Object.keys(ft).length === 0) e.push("fixtureTypes is an object with at least one fixture type.");
  else for (const [k, t] of Object.entries(ft)) {
    if (k.length > 40) { e.push(`Fixture type id "${k.slice(0, 40)}..." is longer than 40 characters.`); continue; }
    if (t == null || typeof t !== "object" || Array.isArray(t)) { e.push(`Fixture type ${k} is an object.`); continue; }
    const a = /** @type {any} */ (t);
    if (a.name != null && (typeof a.name !== "string" || a.name.length > 80)) e.push(`Fixture type ${k}: name is text up to 80 characters.`);
    if (!(isNum(a.gpm) && a.gpm > 0 && a.gpm <= 100)) e.push(`Fixture type ${k}: gpm (flow while running) must be more than 0 and at most 100.`);
    else if (Math.abs(a.gpm * 100 - Math.round(a.gpm * 100)) > 1e-6) e.push(`Fixture type ${k}: type gpm to the hundredth (e.g. 2.2 or 1.75).`);
    if (a.p != null) { if (!(isNum(a.p) && a.p >= 0 && a.p <= 1)) e.push(`Fixture type ${k}: p must be between 0 and 1.`); }
    else {
      if (!(isNum(a.minutesPerUse) && a.minutesPerUse > 0 && a.minutesPerUse <= 60)) e.push(`Fixture type ${k}: type p, or minutesPerUse (more than 0, at most 60).`);
      if (!(isNum(a.usesPerPeakHour) && a.usesPerPeakHour >= 0 && a.usesPerPeakHour <= 60)) e.push(`Fixture type ${k}: type p, or usesPerPeakHour (0 to 60).`);
      else if (isNum(a.minutesPerUse) && a.minutesPerUse * a.usesPerPeakHour > 60) e.push(`Fixture type ${k}: minutesPerUse x usesPerPeakHour is more than 60 minutes; the fixture cannot be busy more than the whole hour.`);
    }
  }
  if (!Array.isArray(d.segments) || d.segments.length === 0) e.push("segments is a list with at least one pipe run.");
  else if (d.segments.length > 200) e.push("At most 200 segments.");
  const mat = d.material ?? "copper-l";
  if (!(mat in MATERIALS)) e.push(`material must be one of ${Object.keys(MATERIALS).join(", ")}.`);
  if (d.customBores != null) {
    if (typeof d.customBores !== "object" || Array.isArray(d.customBores)) e.push("customBores is an object of nominal size to inside diameter in inches.");
    else for (const [s, v] of Object.entries(d.customBores)) {
      if (!SIZES.includes(s)) e.push(`customBores: ${s} is not one of ${SIZES.join(", ")}.`);
      else if (!(isNum(v) && v > 0.2 && v < 2.2)) e.push(`customBores: ${s} must be an inside diameter between 0.2 and 2.2 inches.`);
    }
  }
  if (!(isNum(d.staticPsi) && d.staticPsi > 0 && d.staticPsi <= 200)) e.push("staticPsi (pressure at the meter or tank, no flow) must be more than 0 and at most 200.");
  if (!(isNum(d.minPsi) && d.minPsi >= 0 && d.minPsi <= 100)) e.push("minPsi (pressure you need at each fixture while it runs; type your code's or maker's figure) must be 0 to 100.");
  if (d.meterLossPsi != null && !(isNum(d.meterLossPsi) && d.meterLossPsi >= 0 && d.meterLossPsi <= 100)) e.push("meterLossPsi must be 0 to 100.");
  if (d.maxVelocityFps != null && !(isNum(d.maxVelocityFps) && d.maxVelocityFps >= 1 && d.maxVelocityFps <= 20)) e.push("maxVelocityFps must be 1 to 20.");
  if (d.quantile != null && !(isNum(d.quantile) && d.quantile >= 0.5 && d.quantile < 1)) e.push("quantile must be at least 0.5 and less than 1 (Hunter used 0.99).");
  if (d.tempF != null && !(isNum(d.tempF) && d.tempF >= 33 && d.tempF <= 200)) e.push("tempF must be 33 to 200.");
  if (d.roughnessFt != null && !(isNum(d.roughnessFt) && d.roughnessFt >= 0 && d.roughnessFt <= 0.01)) e.push("roughnessFt must be 0 to 0.01.");
  if (e.length) return e;
  const ids = new Set();
  d.segments.forEach((/** @type {any} */ s, i) => {
    const n = `Segment ${s && typeof s.id === "string" ? s.id : i + 1}`;
    if (s == null || typeof s !== "object" || Array.isArray(s)) { e.push(`${n} is an object.`); return; }
    if (typeof s.id !== "string" || !s.id || s.id.length > 40) { e.push(`${n}: id is text of 1 to 40 characters.`); return; }
    if (ids.has(s.id)) e.push(`${n}: id is used twice.`);
    ids.add(s.id);
    if (!(isNum(s.lengthFt) && s.lengthFt >= 0 && s.lengthFt <= 2000)) e.push(`${n}: lengthFt must be 0 to 2000.`);
    if (s.riseFt != null && !(isNum(s.riseFt) && s.riseFt >= -100 && s.riseFt <= 100)) e.push(`${n}: riseFt must be -100 to 100 (negative runs downhill).`);
    if (s.fittingsFt != null && !(isNum(s.fittingsFt) && s.fittingsFt >= 0 && s.fittingsFt <= 2000)) e.push(`${n}: fittingsFt (equivalent length of fittings and valves) must be 0 to 2000.`);
    if (s.minSize != null && !SIZES.includes(s.minSize)) e.push(`${n}: minSize must be one of ${SIZES.join(", ")}.`);
    if (s.fixtures != null) {
      if (typeof s.fixtures !== "object" || Array.isArray(s.fixtures)) e.push(`${n}: fixtures is an object of fixture type to count.`);
      else for (const [k, c] of Object.entries(s.fixtures)) {
        if (!(k in d.fixtureTypes)) e.push(`${n}: fixture type ${k.slice(0, 40)} is not in fixtureTypes.`);
        else if (!(Number.isInteger(c) && /** @type {number} */ (c) >= 0 && /** @type {number} */ (c) <= 200)) e.push(`${n}: count of ${k} must be a whole number 0 to 200.`);
      }
    }
  });
  if (e.length) return e;
  const roots = d.segments.filter((/** @type {any} */ s) => s.parent == null);
  if (roots.length !== 1) e.push(`Exactly one segment has no parent (the run from the meter); found ${roots.length}.`);
  for (const s of d.segments) if (s.parent != null && !ids.has(s.parent)) e.push(`Segment ${s.id}: parent ${String(s.parent).slice(0, 40)} is not a segment id.`);
  if (e.length) return e;
  // cycles
  const par = new Map(d.segments.map((/** @type {any} */ s) => [s.id, s.parent ?? null]));
  for (const s of d.segments) {
    let cur = s.id, steps = 0;
    while (cur != null && steps <= d.segments.length) { cur = par.get(cur); steps++; }
    if (cur != null) { e.push(`Segment ${s.id} is in a loop of parents; the supply is a tree from the meter.`); break; }
  }
  if (!e.length && !d.segments.some((/** @type {any} */ s) => s.fixtures && Object.values(s.fixtures).some((c) => /** @type {number} */ (c) > 0))) e.push("No segment feeds any fixture.");
  return e;
}

/** @param {FixtureType} t */
const probability = (t) => t.p ?? (/** @type {number} */ (t.minutesPerUse) * /** @type {number} */ (t.usesPerPeakHour)) / 60;

/** @param {SupplyPlan} d */
export function sizeSupply(d) {
  const errors = validateSupply(d);
  if (errors.length) return { ok: false, errors };
  const material = d.material ?? "copper-l";
  const q = d.quantile ?? 0.99;
  const vmax = d.maxVelocityFps ?? 8;
  const tempF = d.tempF ?? 60;
  const rough = d.roughnessFt ?? /** @type {any} */ (ROUGHNESS_FT)[material];
  const bore = (/** @type {string} */ s) => d.customBores?.[s] ?? /** @type {number} */ (boreIn(material, s));
  const types = Object.entries(d.fixtureTypes).map(([id, t]) => ({ id, name: t.name ?? id, gpm: t.gpm, p: probability(t) }));
  const kids = new Map(d.segments.map((s) => [s.id, /** @type {string[]} */ ([])]));
  for (const s of d.segments) if (s.parent != null) /** @type {string[]} */ (kids.get(s.parent)).push(s.id);
  const byId = new Map(d.segments.map((s) => [s.id, s]));
  // Fixtures fed through each segment (its own plus everything downstream).
  /** @type {Map<string, Record<string, number>>} */
  const fed = new Map();
  const root = /** @type {Segment} */ (d.segments.find((s) => s.parent == null));
  /** @type {string[]} */
  const order = [];
  const stack = [root.id];
  while (stack.length) { const id = /** @type {string} */ (stack.pop()); order.push(id); stack.push(.../** @type {string[]} */ (kids.get(id))); }
  for (const id of [...order].reverse()) {
    /** @type {Record<string, number>} */
    const c = { ...(byId.get(id)?.fixtures || {}) };
    for (const k of /** @type {string[]} */ (kids.get(id))) for (const [t, n] of Object.entries(/** @type {Record<string, number>} */ (fed.get(k)))) c[t] = (c[t] ?? 0) + n;
    fed.set(id, c);
  }
  const z = normInv(q);
  const seg = order.map((id) => {
    const s = /** @type {Segment} */ (byId.get(id));
    const counts = /** @type {Record<string, number>} */ (fed.get(id));
    const dist = demandDistribution(types.map((t) => ({ gpm: t.gpm, p: t.p, count: counts[t.id] ?? 0 })));
    const demand = dist.quantile(q);
    const fixtures = Object.values(counts).reduce((a, b) => a + b, 0);
    return { id, parent: s.parent ?? null, lengthFt: s.lengthFt, riseFt: s.riseFt ?? 0, fittingsFt: s.fittingsFt ?? 0, fixturesHere: Object.values(s.fixtures || {}).some((n) => n > 0), fixtures, counts,
      demandGpm: demand, allOnGpm: +dist.allOn.toFixed(4), meanGpm: +dist.mean.toFixed(4), normalGpm: +Math.min(dist.allOn, dist.mean + z * Math.sqrt(dist.variance)).toFixed(4),
      sizeIndex: Math.max(0, s.minSize ? SIZES.indexOf(s.minSize) : 0), velocityLimited: false };
  });
  const flowAt = (/** @type {typeof seg[number]} */ r, /** @type {number} */ i) => pipeFlow(r.demandGpm, bore(SIZES[i]), { tempF, roughnessFt: rough });
  const warnings = [];
  // 1. Smallest size inside the velocity limit.
  for (const r of seg) {
    while (r.sizeIndex < SIZES.length - 1 && flowAt(r, r.sizeIndex).velocityFps > vmax + 1e-12) { r.sizeIndex++; r.velocityLimited = true; }
    if (flowAt(r, r.sizeIndex).velocityFps > vmax + 1e-12) warnings.push(`Segment ${r.id}: ${r.demandGpm} gpm is over ${vmax} ft/s even in 2 in pipe.`);
  }
  const lossOf = (/** @type {typeof seg[number]} */ r, /** @type {number} */ i) => r.demandGpm > 0 ? flowAt(r, i).psiPerFt * (r.lengthFt + r.fittingsFt) : 0;
  const idx = new Map(seg.map((r, i) => [r.id, i]));
  const pressures = () => {
    /** @type {Map<string, number>} */
    const p = new Map();
    for (const r of seg) {
      const up = r.parent == null ? d.staticPsi - (d.meterLossPsi ?? 0) : /** @type {number} */ (p.get(r.parent));
      p.set(r.id, up - lossOf(r, r.sizeIndex) - r.riseFt * PSI_PER_FT_HEAD_60F);
    }
    return p;
  };
  // 2. Upsize until every fixture node keeps minPsi: on the path to the worst node,
  //    take the step with the most psi gained per foot of pipe made bigger.
  let p = pressures();
  const upsized = new Set();
  for (let guard = 0; guard < seg.length * SIZES.length; guard++) {
    let worst = null, worstP = Infinity;
    for (const r of seg) if (r.fixturesHere && /** @type {number} */ (p.get(r.id)) < d.minPsi - 1e-9 && /** @type {number} */ (p.get(r.id)) < worstP) { worst = r; worstP = /** @type {number} */ (p.get(r.id)); }
    if (!worst) break;
    let best = null, bestGain = 0;
    for (let cur = /** @type {any} */ (worst); cur; cur = cur.parent == null ? null : seg[/** @type {number} */ (idx.get(cur.parent))]) {
      if (cur.sizeIndex >= SIZES.length - 1) continue;
      const gain = (lossOf(cur, cur.sizeIndex) - lossOf(cur, cur.sizeIndex + 1)) / Math.max(cur.lengthFt + cur.fittingsFt, 1e-6);
      if (gain > bestGain) { bestGain = gain; best = cur; }
    }
    if (!best) break;
    best.sizeIndex++;
    upsized.add(best.id);
    p = pressures();
  }
  const rows = seg.map((r) => {
    const fl = flowAt(r, r.sizeIndex);
    return { id: r.id, parent: r.parent, fixtures: r.fixtures, counts: r.counts, demandGpm: r.demandGpm, allOnGpm: r.allOnGpm, meanGpm: r.meanGpm, normalGpm: r.normalGpm,
      size: SIZES[r.sizeIndex], boreIn: bore(SIZES[r.sizeIndex]), velocityFps: +fl.velocityFps.toFixed(3), reynolds: Math.round(fl.reynolds), friction: +fl.friction.toFixed(5),
      psiPer100Ft: +(fl.psiPerFt * 100).toFixed(3), lossPsi: +lossOf(r, r.sizeIndex).toFixed(3), elevationPsi: +(r.riseFt * PSI_PER_FT_HEAD_60F).toFixed(3),
      endPsi: +(/** @type {number} */ (p.get(r.id))).toFixed(2), feedsFixturesHere: r.fixturesHere,
      sizedBy: upsized.has(r.id) ? "pressure" : r.velocityLimited ? "velocity" : "smallest" };
  });
  const fixtureNodes = rows.filter((r) => r.feedsFixturesHere);
  const low = fixtureNodes.filter((r) => r.endPsi < d.minPsi - 1e-9);
  const lowest = fixtureNodes.reduce((a, b) => (b.endPsi < a.endPsi ? b : a));
  if (low.length) warnings.push(`Even after upsizing, ${low.map((r) => r.id).join(", ")} ${low.length === 1 ? "is" : "are"} below ${d.minPsi} psi; raise the supply pressure, shorten the run or add a booster.`);
  return { ok: true, errors: [], material, materialName: /** @type {any} */ (MATERIALS)[material], quantile: q, maxVelocityFps: vmax, tempF, staticPsi: d.staticPsi, meterLossPsi: d.meterLossPsi ?? 0, minPsi: d.minPsi,
    fixtureTypes: types.map((t) => ({ ...t, p: +t.p.toFixed(6) })), segments: rows, passes: low.length === 0, lowest: { id: lowest.id, psi: lowest.endPsi }, warnings };
}

/** @param {any} r */
export function supplyText(r) {
  if (!r.ok) return r.errors;
  const L = [`${r.materialName}; demand is the flow not exceeded ${(r.quantile * 100).toFixed(1).replace(/\.0$/, "")}% of the busy hour (Hunter's rule, computed exactly); velocity limit ${r.maxVelocityFps} ft/s; water at ${r.tempF} F.`];
  L.push(`Supply ${r.staticPsi} psi static${r.meterLossPsi ? `, less ${r.meterLossPsi} psi for meter and backflow` : ""}; need ${r.minPsi} psi at each fixture.`, "");
  for (const s of r.segments) {
    L.push(`${s.id}${s.parent ? ` (from ${s.parent})` : ""}: ${s.size} in, ${s.fixtures} fixture${s.fixtures === 1 ? "" : "s"} fed, design ${s.demandGpm} gpm (all on at once ${s.allOnGpm}), ${s.velocityFps.toFixed(1)} ft/s, loses ${s.lossPsi.toFixed(2)} psi${s.elevationPsi ? ` and ${s.elevationPsi.toFixed(2)} psi to height` : ""}, ${s.endPsi.toFixed(1)} psi at the end${s.sizedBy === "smallest" ? "" : `; sized up for ${s.sizedBy}`}.`);
  }
  L.push("", r.passes ? `Every fixture keeps at least ${r.minPsi} psi; the lowest is ${r.lowest.id} at ${r.lowest.psi.toFixed(1)} psi.` : `Not enough pressure: the lowest is ${r.lowest.id} at ${r.lowest.psi.toFixed(1)} psi.`);
  for (const w of r.warnings) L.push(`Warning: ${w}`);
  return L;
}

/** The worked example on the page and in the tests: a two-bath house on copper L. */
export const EXAMPLE = {
  material: "copper-l", staticPsi: 60, meterLossPsi: 5, minPsi: 20, maxVelocityFps: 8, tempF: 60,
  fixtureTypes: {
    lav: { name: "Bathroom sink", gpm: 1.5, minutesPerUse: 1, usesPerPeakHour: 6 },
    wc: { name: "Toilet (tank refill)", gpm: 3, minutesPerUse: 1, usesPerPeakHour: 4 },
    shower: { name: "Shower", gpm: 2, minutesPerUse: 8, usesPerPeakHour: 2 },
    kitchen: { name: "Kitchen sink", gpm: 2.2, minutesPerUse: 1.5, usesPerPeakHour: 6 },
    dw: { name: "Dishwasher", gpm: 1.5, minutesPerUse: 2, usesPerPeakHour: 1 },
    cw: { name: "Clothes washer", gpm: 4, minutesPerUse: 4, usesPerPeakHour: 2 },
    hose: { name: "Hose bibb", gpm: 5, minutesPerUse: 10, usesPerPeakHour: 1 },
  },
  segments: [
    { id: "main", lengthFt: 40, riseFt: 2, fittingsFt: 15, fixtures: { hose: 1 } },
    { id: "kitchen-laundry", parent: "main", lengthFt: 25, fittingsFt: 8, fixtures: { kitchen: 1, dw: 1, cw: 1 } },
    { id: "riser", parent: "main", lengthFt: 18, riseFt: 10, fittingsFt: 10 },
    { id: "bath-1", parent: "riser", lengthFt: 15, fittingsFt: 6, fixtures: { lav: 2, wc: 1, shower: 1 } },
    { id: "bath-2", parent: "riser", lengthFt: 30, riseFt: 1, fittingsFt: 8, fixtures: { lav: 1, wc: 1, shower: 1 } },
  ],
};
