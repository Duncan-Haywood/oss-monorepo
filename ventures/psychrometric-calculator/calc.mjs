// Psychrometric calculator engine: moist-air properties and air-handling processes.
//
// Equations: ASHRAE Handbook, Fundamentals (2017 and later), Chapter 1, "Psychrometrics":
//   - saturation pressure over ice (-100..0 C) and liquid water (0..200 C) from Hyland and Wexler
//     (1983), the chapter's equations 5 and 6;
//   - humidity ratio W = 0.621945 pw / (p - pw)                         (eq 20/22)
//   - enthalpy h = 1.006 t + W (2501 + 1.86 t)            kJ/kg dry air (eq 32)
//   - specific volume v = 0.287042 (t + 273.15)(1 + 1.607858 W) / p    m3/kg dry air, p in kPa (eq 26)
//   - thermodynamic wet bulb from the adiabatic-saturation balance       (eq 33, and eq 35 below 0 C)
//   - standard atmosphere p = 101.325 (1 - 2.25577e-5 Z)^5.2559 kPa       (eq 3)
// Relative humidity and dew point use saturation over ice below 0 C, as the chapter does (below
// freezing the "dew point" is the frost point).
//
// Everything is computed in SI and converted at the edges. IP enthalpy is shown on the IP datum
// (0 F dry air): h = 0.240 t + W (1061 + 0.444 t) Btu/lb, so it reads the same as an IP chart.
//
// Pure: no imports, no clock, no randomness, so the page, the tests and agents all get the same answer.

const ICE = [-5.6745359e3, 6.3925247, -9.677843e-3, 6.2215701e-7, 2.0747825e-9, -9.484024e-13, 4.1635019];
const WATER = [-5.8002206e3, 1.3914993, -4.8640239e-2, 4.1764768e-5, -1.4452093e-8, 6.5459673];

export const T_MIN = -60; // C, the range the solver searches
export const T_MAX = 100;

/** Saturation vapour pressure, Pa, over ice below 0 C and over water at or above it. */
export function satPressure(tC) {
  const T = tC + 273.15;
  if (tC < 0) {
    const [c1, c2, c3, c4, c5, c6, c7] = ICE;
    return Math.exp(c1 / T + c2 + c3 * T + c4 * T ** 2 + c5 * T ** 3 + c6 * T ** 4 + c7 * Math.log(T));
  }
  const [c8, c9, c10, c11, c12, c13] = WATER;
  return Math.exp(c8 / T + c9 + c10 * T + c11 * T ** 2 + c12 * T ** 3 + c13 * Math.log(T));
}

/** Standard-atmosphere pressure, Pa, at an altitude in metres. */
export function stdPressure(altM) {
  return 101325 * (1 - 2.25577e-5 * altM) ** 5.2559;
}

export const humRatio = (pw, p) => (0.621945 * pw) / (p - pw);
export const vapourPressure = (W, p) => (p * W) / (0.621945 + W);
export const satHumRatio = (t, p) => humRatio(satPressure(t), p);
export const enthalpy = (t, W) => 1.006 * t + W * (2501 + 1.86 * t);
export const tFromEnthalpy = (h, W) => (h - 2501 * W) / (1.006 + 1.86 * W);
export const volume = (t, W, p) => (0.287042 * (t + 273.15) * (1 + 1.607858 * W)) / (p / 1000);

function bisect(f, lo, hi, iter = 100) {
  let flo = f(lo);
  for (let i = 0; i < iter; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (fm === 0) return mid;
    if ((fm < 0) === (flo < 0)) { lo = mid; flo = fm; } else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Dew point (frost point below 0 C), C, from the vapour pressure in Pa. */
export function dewPoint(pw) {
  if (!(pw > 0)) return NaN;
  return bisect((t) => satPressure(t) - pw, -100, 200);
}

/** Humidity ratio from dry bulb and thermodynamic wet bulb (ASHRAE eq 33, eq 35 below 0 C). */
export function humRatioFromWetBulb(t, twb, p) {
  const ws = satHumRatio(twb, p);
  if (twb >= 0) return ((2501 - 2.326 * twb) * ws - 1.006 * (t - twb)) / (2501 + 1.86 * t - 4.186 * twb);
  return ((2830 - 0.24 * twb) * ws - 1.006 * (t - twb)) / (2830 + 1.86 * t - 2.1 * twb);
}

/** Thermodynamic wet bulb, C, by bisection between the dew point and the dry bulb. */
export function wetBulb(t, W, p) {
  const lo = Math.min(dewPoint(vapourPressure(W, p)), t) - 1;
  return bisect((twb) => humRatioFromWetBulb(t, twb, p) - W, lo, t);
}

/** Every property of moist air at dry bulb t (C), humidity ratio W (kg/kg) and pressure p (Pa). */
export function state(t, W, p) {
  const pws = satPressure(t);
  const pw = vapourPressure(W, p);
  const ws = humRatio(pws, p);
  const v = volume(t, W, p);
  return {
    t, W, p, pw, pws, ws,
    rh: pw / pws,
    mu: W / ws,
    tdp: dewPoint(pw),
    twb: wetBulb(t, W, p),
    h: enthalpy(t, W),
    v,
    rho: (1 + W) / v,
  };
}

// ---------- units ----------

export const fToC = (f) => ((f - 32) * 5) / 9;
export const cToF = (c) => (c * 9) / 5 + 32;
const FT = 0.3048;
const PSI = 6894.757293168;
const FT3_PER_M3 = 35.3146667;
const CFM_TO_M3S = 0.00047194745;
const M3H_TO_M3S = 1 / 3600;
const KW_TO_BTUH = 3412.141633;
const L_PER_GAL = 3.785411784;

const ipEnthalpy = (tF, W) => 0.24 * tF + W * (1061 + 0.444 * tF);

/** The kinds of property a point can be fixed by, with their labels in each unit system. */
export const KINDS = {
  t: { label: "Dry bulb", IP: "°F", SI: "°C" },
  twb: { label: "Wet bulb", IP: "°F", SI: "°C" },
  tdp: { label: "Dew point", IP: "°F", SI: "°C" },
  rh: { label: "Relative humidity", IP: "%", SI: "%" },
  W: { label: "Humidity ratio", IP: "gr/lb", SI: "g/kg" },
  h: { label: "Enthalpy", IP: "Btu/lb", SI: "kJ/kg" },
};

const tempIn = (x, u) => (u === "IP" ? fToC(x) : x);
const tempOut = (c, u) => (u === "IP" ? cToF(c) : c);

/** Value of property `kind` for a state, in the display units of system `u`. */
export function propValue(kind, s, u) {
  switch (kind) {
    case "t": return tempOut(s.t, u);
    case "twb": return tempOut(s.twb, u);
    case "tdp": return tempOut(s.tdp, u);
    case "rh": return s.rh * 100;
    case "W": return u === "IP" ? s.W * 7000 : s.W * 1000;
    case "h": return u === "IP" ? ipEnthalpy(cToF(s.t), s.W) : s.h;
    default: throw new Error(`unknown property ${kind}`);
  }
}

// Humidity ratio fixed by dry bulb t (C) and one other property given in display units.
function wGivenT(t, kind, x, u, p) {
  switch (kind) {
    case "rh": return humRatio((x / 100) * satPressure(t), p);
    case "twb": return humRatioFromWetBulb(t, tempIn(x, u), p);
    case "tdp": return humRatio(satPressure(tempIn(x, u)), p);
    case "W": return u === "IP" ? x / 7000 : x / 1000;
    case "h": {
      if (u === "IP") { const tF = cToF(t); return (x - 0.24 * tF) / (1061 + 0.444 * tF); }
      return (x - 1.006 * t) / (2501 + 1.86 * t);
    }
    default: throw new Error(`unknown property ${kind}`);
  }
}

// Pairs that fix the same thing twice and so cannot locate a point.
const DEGENERATE = [["tdp", "W"], ["twb", "h"]];

/**
 * Solve a point from two properties in display units: `{ k1, v1, k2, v2 }` with kinds from KINDS.
 * Returns a state or `{ error }`.
 */
export function solvePoint(k1, v1, k2, v2, u, p) {
  if (!(k1 in KINDS) || !(k2 in KINDS)) return { error: "Choose two properties to fix the point." };
  if (k1 === k2) return { error: `Both properties are ${KINDS[k1].label.toLowerCase()}: pick two different ones.` };
  if (!Number.isFinite(v1) || !Number.isFinite(v2)) return { error: "Enter a number for both properties." };
  if (DEGENERATE.some(([a, b]) => (a === k1 && b === k2) || (a === k2 && b === k1))) {
    return { error: `${KINDS[k1].label} and ${KINDS[k2].label.toLowerCase()} ${k1 === "twb" || k2 === "twb" ? "lie along almost the same line on the chart" : "both fix only the moisture content"}, so together they cannot locate a point. Add a dry bulb or relative humidity instead.` };
  }
  for (const [k, v] of [[k1, v1], [k2, v2]]) {
    if (k === "rh" && (v <= 0 || v > 100)) return { error: "Relative humidity must be above 0 and at most 100%." };
    if (k === "W" && v < 0) return { error: "Humidity ratio cannot be negative." };
  }
  let t;
  let W;
  if (k1 === "t" || k2 === "t") {
    const [tx, ok, ov] = k1 === "t" ? [v1, k2, v2] : [v2, k1, v1];
    t = tempIn(tx, u);
    if (t < T_MIN || t > T_MAX) return { error: `Dry bulb must be between ${fmtT(T_MIN, u)} and ${fmtT(T_MAX, u)}.` };
    W = wGivenT(t, ok, ov, u, p);
  } else {
    // Neither is the dry bulb: walk the dry bulb until the second property matches the first.
    // The first property (preferring one that fixes moisture directly) gives W at each trial t.
    const order = ["W", "tdp", "rh", "twb", "h"];
    const [ka, va, kb, vb] = order.indexOf(k1) <= order.indexOf(k2) ? [k1, v1, k2, v2] : [k2, v2, k1, v1];
    const f = (tt) => {
      const w = wGivenT(tt, ka, va, u, p);
      if (!(w >= 0) || w > satHumRatio(tt, p) * 1.000001) return NaN;
      return propValue(kb, state(tt, w, p), u) - vb;
    };
    const roots = [];
    const N = 320;
    let prevT = T_MIN, prevF = f(T_MIN);
    for (let i = 1; i <= N; i++) {
      const tt = T_MIN + ((T_MAX - T_MIN) * i) / N;
      const ft = f(tt);
      if (Number.isFinite(prevF) && Number.isFinite(ft) && (prevF === 0 || (prevF < 0) !== (ft < 0))) roots.push(bisect(f, prevT, tt));
      prevT = tt; prevF = ft;
    }
    if (!roots.length) return { error: `No air between ${fmtT(T_MIN, u)} and ${fmtT(T_MAX, u)} has that ${KINDS[k1].label.toLowerCase()} and ${KINDS[k2].label.toLowerCase()}.` };
    t = roots[0];
    W = wGivenT(t, ka, va, u, p);
  }
  if (!(W >= 0)) return { error: "Those values give a negative humidity ratio: the wet bulb or enthalpy is too low for that dry bulb." };
  const ws = satHumRatio(t, p);
  if (W > ws * 1.0005) return { error: `That point lies beyond saturation (over 100% relative humidity) at ${fmtT(t, u)}: check the values.` };
  return state(t, Math.min(W, ws), p);
}

const fmtT = (c, u) => (u === "IP" ? `${cToF(c).toFixed(0)} °F` : `${c.toFixed(0)} °C`);

// ---------- processes (SI) ----------

const massFlow = (q, s) => q / s.v; // kg dry air per s from a volume flow in m3/s at the stream's own state

/** Adiabatic mixing of two streams given volume flows (m3/s) measured at each stream's state. */
export function mix(a, qa, b, qb, p) {
  const ma = massFlow(qa, a), mb = massFlow(qb, b);
  const m = ma + mb;
  const W = (ma * a.W + mb * b.W) / m;
  const h = (ma * a.h + mb * b.h) / m;
  const t = tFromEnthalpy(h, W);
  const fog = W > satHumRatio(t, p);
  return { out: state(t, fog ? satHumRatio(t, p) : W, p), ma, mb, fractionB: mb / m, fog, Wmix: W, hmix: h };
}

/** Apparatus dew point: where the line from `a` through `b` (t-W plane) meets saturation, or null. */
export function apparatusDewPoint(a, b, p) {
  const dt = b.t - a.t, dW = b.W - a.W;
  if (dt >= 0) return null;
  const g = (s) => satHumRatio(a.t + s * dt, p) - (a.W + s * dW);
  // s = 0 is the entering point (below saturation); walk outward until the line reaches saturation.
  let lo = 0, hi = 1;
  if (g(hi) <= 0) return null; // the leaving point is itself saturated or beyond
  while (g(hi) > 0 && hi < 200) { lo = hi; hi *= 1.5; if (a.t + hi * dt < T_MIN) return null; }
  if (g(hi) > 0) return null;
  const s = bisect(g, lo, hi);
  const t = a.t + s * dt;
  return { t, W: a.W + s * dW };
}

/** Cooling coil from entering and leaving states and the volume flow at the entering state. */
export function coil(a, b, q, p) {
  const m = massFlow(q, a);
  const total = m * (a.h - b.h); // kW
  const latent = m * (a.W - b.W) * 2501; // kW, vapour removed times the latent heat at 0 C
  const sensible = total - latent;
  const adp = apparatusDewPoint(a, b, p);
  const bypass = adp ? (b.t - adp.t) / (a.t - adp.t) : null;
  return { m, total, sensible, latent, shr: total > 0 ? sensible / total : null, condensate: m * Math.max(0, a.W - b.W), adp, bypass };
}

/** Leaving state of a coil from its apparatus dew point (C) and bypass factor (0..1). */
export function coilFromAdp(a, adpT, bf, p) {
  const wA = satHumRatio(adpT, p);
  const W = bf * a.W + (1 - bf) * wA;
  const h = bf * a.h + (1 - bf) * enthalpy(adpT, wA);
  return state(tFromEnthalpy(h, W), W, p);
}

/** Evaporative (adiabatic) cooler: leaving dry bulb from the effectiveness, along the entering wet bulb. */
export function evaporative(a, eff, p) {
  const t = a.t - eff * (a.t - a.twb);
  return state(t, humRatioFromWetBulb(t, a.twb, p), p);
}

// ---------- the page / agent entry point ----------

export const PROCESSES = {
  none: "Just the point",
  mix: "Mix two airstreams",
  coil: "Cooling coil: entering and leaving air",
  adp: "Cooling coil: apparatus dew point and bypass factor",
  heat: "Sensible heating or cooling",
  evap: "Evaporative cooler",
};

/** The page's example: AHRI-rated coil entering air 80 F dry bulb / 67 F wet bulb, leaving 55/54, 1200 cfm. */
export function sampleInput() {
  return {
    units: "IP", altitude: "0", pressure: "",
    k1: "t", v1: "80", k2: "twb", v2: "67",
    process: "coil",
    bk1: "t", bv1: "55", bk2: "twb", bv2: "54",
    flowA: "1200", flowB: "400", leaving: "95", adpT: "50", bypass: "0.15", eff: "85",
  };
}

const num = (x) => (x === undefined || x === null || String(x).trim() === "" ? NaN : Number(String(x).trim().replace(",", ".")));

/** Convert a state to display values in system u. */
export function display(s, u) {
  const vol = u === "IP" ? s.v * 16.0184634 : s.v;
  return {
    t: tempOut(s.t, u), twb: tempOut(s.twb, u), tdp: tempOut(s.tdp, u),
    rh: s.rh * 100, W: propValue("W", s, u), h: propValue("h", s, u),
    v: vol, rho: u === "IP" ? s.rho / 16.0184634 : s.rho,
    pw: u === "IP" ? s.pw / PSI : s.pw / 1000,
    mu: s.mu * 100,
  };
}

export const DISPLAY_UNITS = {
  IP: { t: "°F", W: "gr/lb", h: "Btu/lb", v: "ft³/lb", rho: "lb/ft³", pw: "psia", p: "psia", alt: "ft", flow: "cfm", load: "Btu/h", water: "gal/h" },
  SI: { t: "°C", W: "g/kg", h: "kJ/kg", v: "m³/kg", rho: "kg/m³", pw: "kPa", p: "kPa", alt: "m", flow: "m³/h", load: "kW", water: "L/h" },
};

/**
 * Analyse a point and an optional process. All fields are strings as typed on the page
 * (see sampleInput()); units "IP" or "SI". Returns `{ error }` or the full result.
 */
export function analyze(input = {}) {
  const x = { ...sampleInput(), ...input };
  const u = x.units === "SI" ? "SI" : "IP";
  const U = DISPLAY_UNITS[u];
  let p;
  const pIn = num(x.pressure);
  if (Number.isFinite(pIn)) {
    p = u === "IP" ? pIn * PSI : pIn * 1000;
    if (p < 30000 || p > 120000) return { error: `Pressure must be between ${u === "IP" ? "4.4 and 17.4 psia" : "30 and 120 kPa"}.` };
  } else {
    const alt = num(x.altitude);
    const z = Number.isFinite(alt) ? (u === "IP" ? alt * FT : alt) : 0;
    if (z < -500 || z > 9000) return { error: `Altitude must be between ${u === "IP" ? "-1,640 and 29,500 ft" : "-500 and 9,000 m"}.` };
    p = stdPressure(z);
  }
  const a = solvePoint(x.k1, num(x.v1), x.k2, num(x.v2), u, p);
  if (a.error) return { error: `Point A: ${a.error}` };
  const flow = (v) => (u === "IP" ? v * CFM_TO_M3S : v * M3H_TO_M3S);
  const load = (kw) => (u === "IP" ? kw * KW_TO_BTUH : kw);
  const water = (kgs) => (u === "IP" ? (kgs * 3600) / L_PER_GAL : kgs * 3600);
  const out = { units: u, unitLabels: U, p, pDisplay: u === "IP" ? p / PSI : p / 1000, a, points: [{ label: "A", s: a }], process: x.process in PROCESSES ? x.process : "none", findings: [] };
  const say = (severity, title, detail) => out.findings.push({ severity, title, detail });
  const qA = num(x.flowA);
  const needFlow = () => {
    if (!(qA > 0)) return `Enter the airflow of stream A in ${U.flow}.`;
    return null;
  };
  const loads = (kw) => ({ kw, display: load(kw), tons: kw * KW_TO_BTUH / 12000 });

  switch (out.process) {
    case "none": break;
    case "mix": {
      const b = solvePoint(x.bk1, num(x.bv1), x.bk2, num(x.bv2), u, p);
      if (b.error) return { error: `Point B: ${b.error}` };
      const qB = num(x.flowB);
      if (needFlow()) return { error: needFlow() };
      if (!(qB > 0)) return { error: `Enter the airflow of stream B in ${U.flow}.` };
      const r = mix(a, flow(qA), b, flow(qB), p);
      out.b = b; out.result = r.out;
      out.points.push({ label: "B", s: b }, { label: "M", s: r.out });
      out.lines = [["A", "B"]];
      out.mix = { fractionB: r.fractionB, fog: r.fog };
      say("info", `${(r.fractionB * 100).toFixed(0)}% of the mixed dry air comes from B`, `By mass of dry air, not by volume: each flow is converted at its own specific volume (${display(a, u).v.toFixed(u === "IP" ? 2 : 3)} and ${display(b, u).v.toFixed(u === "IP" ? 2 : 3)} ${U.v}). The mixed point M lies on the straight line from A to B.`);
      if (r.fog) say("high", "The mixed air is supersaturated: fog forms", "The straight mixing line crosses the saturation curve. The excess water condenses as fog; M is shown at saturation on the same enthalpy line, which is close to where it ends up.");
      break;
    }
    case "coil": {
      const b = solvePoint(x.bk1, num(x.bv1), x.bk2, num(x.bv2), u, p);
      if (b.error) return { error: `Leaving air (B): ${b.error}` };
      if (needFlow()) return { error: needFlow() };
      if (b.t >= a.t) return { error: "The leaving air is not cooler than the entering air. For heating, choose Sensible heating or cooling." };
      if (b.W > a.W + 1e-7) return { error: "The leaving air holds more moisture than the entering air, which a cooling coil cannot do. Check the leaving wet bulb or humidity." };
      const r = coil(a, b, flow(qA), p);
      out.b = b; out.result = b;
      out.points.push({ label: "B", s: b });
      out.lines = [["A", "B"]];
      out.coil = { total: loads(r.total), sensible: loads(r.sensible), latent: loads(r.latent), shr: r.shr, condensate: water(r.condensate), adp: r.adp && { t: tempOut(r.adp.t, u), W: propValue("W", { W: r.adp.W }, u) }, bypass: r.bypass };
      if (r.adp) { out.points.push({ label: "ADP", s: state(r.adp.t, r.adp.W, p) }); out.lines = [["A", "ADP"]]; }
      say("info", `Sensible heat ratio ${r.shr.toFixed(2)}`, `${(r.shr * 100).toFixed(0)}% of the coil's ${fmtLoad(load(r.total), u)} goes to lowering the temperature and ${(100 - r.shr * 100).toFixed(0)}% to removing moisture (${water(r.condensate).toFixed(u === "IP" ? 2 : 1)} ${U.water} of condensate).`);
      if (r.adp) say("info", `Apparatus dew point ${tempOut(r.adp.t, u).toFixed(1)} ${U.t}, bypass factor ${r.bypass.toFixed(2)}`, "The coil line from the entering through the leaving point, extended, meets saturation at the apparatus dew point. The bypass factor is the share of the air that behaves as if it missed the coil.");
      else say("medium", "No apparatus dew point", "The coil line never reaches saturation in range, so no ADP or bypass factor can be read for these points.");
      if (b.W >= a.W - 1e-7) say("info", "No moisture removed", "The leaving humidity ratio equals the entering one: the coil surface stayed above the entering dew point, so this is sensible cooling only.");
      if (b.rh > 0.97) say("medium", "Leaving air is close to saturation", `Leaving relative humidity is ${(b.rh * 100).toFixed(0)}%. Duct surfaces downstream that are any cooler will sweat.`);
      break;
    }
    case "adp": {
      const adpT = tempIn(num(x.adpT), u);
      const bf = num(x.bypass);
      if (needFlow()) return { error: needFlow() };
      if (!Number.isFinite(adpT)) return { error: "Enter the apparatus dew point." };
      if (!(bf >= 0 && bf < 1)) return { error: "The bypass factor must be from 0 up to (not including) 1." };
      if (adpT >= a.tdp) return { error: `The apparatus dew point must be below the entering dew point (${tempOut(a.tdp, u).toFixed(1)} ${U.t}), or the coil removes no moisture.` };
      const b = coilFromAdp(a, adpT, bf, p);
      const r = coil(a, b, flow(qA), p);
      out.b = b; out.result = b;
      const adpState = state(adpT, satHumRatio(adpT, p), p);
      out.points.push({ label: "B", s: b }, { label: "ADP", s: adpState });
      out.lines = [["A", "ADP"]];
      out.coil = { total: loads(r.total), sensible: loads(r.sensible), latent: loads(r.latent), shr: r.shr, condensate: water(r.condensate), adp: { t: tempOut(adpT, u), W: propValue("W", adpState, u) }, bypass: bf };
      say("info", `Leaving air ${tempOut(b.t, u).toFixed(1)} ${U.t} dry bulb, ${tempOut(b.twb, u).toFixed(1)} ${U.t} wet bulb`, `A bypass factor of ${bf} puts the leaving point ${(bf * 100).toFixed(0)}% of the way back from the apparatus dew point toward the entering air. Sensible heat ratio ${r.shr.toFixed(2)}.`);
      break;
    }
    case "heat": {
      const t2 = tempIn(num(x.leaving), u);
      if (needFlow()) return { error: needFlow() };
      if (!Number.isFinite(t2) || t2 < T_MIN || t2 > T_MAX) return { error: `Enter a leaving dry bulb between ${fmtT(T_MIN, u)} and ${fmtT(T_MAX, u)}.` };
      if (t2 < a.tdp) return { error: `${fmtT(t2, u)} is below the dew point (${tempOut(a.tdp, u).toFixed(1)} ${U.t}): moisture would condense, so this is not sensible cooling. Use a cooling-coil process.` };
      const b = state(t2, a.W, p);
      const kw = massFlow(flow(qA), a) * (b.h - a.h);
      out.b = b; out.result = b;
      out.points.push({ label: "B", s: b });
      out.lines = [["A", "B"]];
      out.heat = { load: loads(kw) };
      say("info", `${kw >= 0 ? "Heating" : "Cooling"} load ${fmtLoad(Math.abs(load(kw)), u, kw < 0)}`, `Moisture stays the same, so relative humidity goes from ${(a.rh * 100).toFixed(0)}% to ${(b.rh * 100).toFixed(0)}%.`);
      if (kw > 0 && b.rh < 0.3) say("medium", "Dry air", `Heated air at ${(b.rh * 100).toFixed(0)}% relative humidity is below the 30 to 60% range usually aimed for in occupied rooms.`);
      break;
    }
    case "evap": {
      const eff = num(x.eff) / 100;
      if (needFlow()) return { error: needFlow() };
      if (!(eff > 0 && eff <= 1)) return { error: "Effectiveness must be above 0 and at most 100%." };
      const b = evaporative(a, eff, p);
      const m = massFlow(flow(qA), a);
      out.b = b; out.result = b;
      out.points.push({ label: "B", s: b });
      out.lines = [["A", "B"]];
      out.evap = { water: water(m * (b.W - a.W)), drop: tempOut(a.t, u) - tempOut(b.t, u) };
      say("info", `Cools ${(tempOut(a.t, u) - tempOut(b.t, u)).toFixed(1)} ${U.t === "°F" ? "°F" : "K"}, to ${tempOut(b.t, u).toFixed(1)} ${U.t} at ${(b.rh * 100).toFixed(0)}% RH`, `Leaving air follows the entering wet bulb (${tempOut(a.twb, u).toFixed(1)} ${U.t}), the lowest temperature evaporation can reach. Water evaporated: ${water(m * (b.W - a.W)).toFixed(u === "IP" ? 2 : 1)} ${U.water}, before bleed-off.`);
      if (a.t - a.twb < 5) say("medium", "Little room to cool", `The wet-bulb depression is only ${(tempOut(a.t, u) - tempOut(a.twb, u)).toFixed(1)} degrees: in air this humid an evaporative cooler mostly adds moisture.`);
      break;
    }
  }
  if (!out.findings.length) say("info", `Dew point ${tempOut(a.tdp, u).toFixed(1)} ${U.t}`, `Any surface colder than ${tempOut(a.tdp, u).toFixed(1)} ${U.t} in this air will collect condensation${a.tdp < 0 ? " (as frost, since it is below freezing)" : ""}.`);
  return out;
}

// Tons of refrigeration only make sense for cooling.
const fmtLoad = (v, u, tons = true) => (u === "IP" ? `${Math.round(v).toLocaleString("en-US")} Btu/h${tons ? ` (${(v / 12000).toFixed(2)} tons)` : ""}` : `${v.toFixed(2)} kW`);

/** Rows of the property table for each point, in display units. */
export function propertyRows(r) {
  const u = r.units, U = r.unitLabels;
  const dec = { t: 1, twb: 1, tdp: 1, rh: 1, W: u === "IP" ? 1 : 2, h: 2, v: u === "IP" ? 3 : 4, rho: 4, pw: u === "IP" ? 4 : 3, mu: 1 };
  const names = [["t", "Dry bulb", U.t], ["twb", "Wet bulb", U.t], ["tdp", "Dew point", U.t], ["rh", "Relative humidity", "%"], ["W", "Humidity ratio", U.W], ["h", "Enthalpy", U.h], ["v", "Specific volume", U.v], ["rho", "Density (moist air)", U.rho], ["pw", "Vapour pressure", U.pw], ["mu", "Degree of saturation", "%"]];
  const shown = r.points.map((pt) => ({ label: pt.label, d: display(pt.s, u) }));
  return names.map(([k, name, unit]) => ({ key: k, name, unit, values: shown.map((x) => x.d[k].toFixed(dec[k])) }));
}

/** CSV of the property table and the process results. */
export function reportCsv(r) {
  // Spreadsheet formula-injection guard: text starting =, +, -, @, tab or CR gets an apostrophe; plain numbers (negative temperatures) pass.
  const q = (c) => {
    let s = String(c);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [["Property", "Unit", ...r.points.map((p) => p.label)].map(q).join(",")];
  for (const row of propertyRows(r)) lines.push([row.name, row.unit, ...row.values].map(q).join(","));
  lines.push(["Pressure", r.unitLabels.p, r.pDisplay.toFixed(r.units === "IP" ? 3 : 3)].map(q).join(","));
  if (r.coil) {
    const c = r.coil, U = r.unitLabels;
    lines.push(["Total load", U.load, c.total.display.toFixed(r.units === "IP" ? 0 : 3)].map(q).join(","));
    lines.push(["Sensible load", U.load, c.sensible.display.toFixed(r.units === "IP" ? 0 : 3)].map(q).join(","));
    lines.push(["Latent load", U.load, c.latent.display.toFixed(r.units === "IP" ? 0 : 3)].map(q).join(","));
    lines.push(["Sensible heat ratio", "", c.shr.toFixed(3)].map(q).join(","));
    lines.push(["Condensate", U.water, c.condensate.toFixed(3)].map(q).join(","));
    if (c.adp) lines.push(["Apparatus dew point", U.t, c.adp.t.toFixed(2)].map(q).join(","));
    if (c.bypass !== null) lines.push(["Bypass factor", "", c.bypass.toFixed(3)].map(q).join(","));
  }
  if (r.heat) lines.push(["Load (positive = heating)", r.unitLabels.load, r.heat.load.display.toFixed(r.units === "IP" ? 0 : 3)].map(q).join(","));
  if (r.evap) lines.push(["Water evaporated", r.unitLabels.water, r.evap.water.toFixed(3)].map(q).join(","));
  return lines.join("\n") + "\n";
}

// ---------- chart ----------

/**
 * An SVG psychrometric chart (dry bulb across, humidity ratio up) with the saturation curve,
 * relative-humidity lines, wet-bulb lines and the result's points and process lines.
 */
export function chartSvg(r) {
  const u = r.units, U = r.unitLabels, p = r.p;
  const W = 680, H = 444, L = 44, R = 58, T = 14, B = 54;
  const ts = r.points.map((pt) => pt.s.t);
  let tLo = u === "IP" ? fToC(30) : -5, tHi = u === "IP" ? fToC(110) : 45;
  tLo = Math.min(tLo, Math.floor(Math.min(...ts) / 5) * 5 - 2);
  tHi = Math.max(tHi, Math.ceil(Math.max(...ts) / 5) * 5 + 2);
  const wTop = Math.max(u === "IP" ? 200 / 7000 : 0.03, ...r.points.map((pt) => pt.s.W * 1.1));
  const X = (t) => L + ((W - L - R) * (t - tLo)) / (tHi - tLo);
  const Y = (w) => T + (H - T - B) * (1 - Math.min(w, wTop) / wTop);
  const curve = (fn, t0 = tLo, t1 = tHi) => {
    const pts = [];
    for (let i = 0; i <= 80; i++) {
      const t = t0 + ((t1 - t0) * i) / 80;
      const w = fn(t);
      if (w > wTop) { // clip at the top edge: a rising curve stops there, a falling one starts below it
        if (pts.length) { pts.push(`${X(t).toFixed(1)},${Y(wTop).toFixed(1)}`); break; }
        continue;
      }
      if (w >= 0) pts.push(`${X(t).toFixed(1)},${Y(w).toFixed(1)}`);
    }
    return pts.join(" ");
  };
  const parts = [];
  // dry-bulb grid and labels
  const step = u === "IP" ? 10 : 5;
  const dLo = Math.ceil(tempOut(tLo, u) / step) * step, dHi = tempOut(tHi, u);
  for (let d = dLo; d <= dHi; d += step) {
    const t = tempIn(d, u);
    parts.push(`<line x1="${X(t).toFixed(1)}" x2="${X(t).toFixed(1)}" y1="${Y(Math.min(satHumRatio(t, p), wTop)).toFixed(1)}" y2="${H - B}" stroke="#e3eaed"/><text x="${X(t).toFixed(1)}" y="${H - B + 14}" text-anchor="middle">${d}</text>`);
  }
  // humidity-ratio grid on the right
  const wStep = u === "IP" ? 20 / 7000 : 0.0025;
  for (let w = 0; w <= wTop + 1e-12; w += wStep) {
    parts.push(`<line x1="${L}" x2="${W - R}" y1="${Y(w).toFixed(1)}" y2="${Y(w).toFixed(1)}" stroke="#eef3f5"/><text x="${W - R + 6}" y="${(Y(w) + 4).toFixed(1)}">${(u === "IP" ? w * 7000 : w * 1000).toFixed(u === "IP" ? 0 : 1)}</text>`);
  }
  // wet-bulb lines
  const wbStep = u === "IP" ? 10 : 5;
  for (let d = Math.ceil(tempOut(tLo, u) / wbStep) * wbStep; d <= dHi; d += wbStep) {
    const twb = tempIn(d, u);
    parts.push(`<polyline fill="none" stroke="#9db8c4" stroke-dasharray="3 3" stroke-width="0.8" points="${curve((t) => humRatioFromWetBulb(t, twb, p), twb, tHi)}"/>`);
  }
  // RH lines
  for (const f of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) {
    parts.push(`<polyline fill="none" stroke="#b9cbd3" stroke-width="0.9" points="${curve((t) => humRatio(f * satPressure(t), p))}"/>`);
    const tLab = tHi - (tHi - tLo) * 0.06;
    const wLab = humRatio(f * satPressure(tLab), p);
    if (wLab < wTop * 0.95) parts.push(`<text x="${(X(tLab) - 4).toFixed(1)}" y="${(Y(wLab) - 3).toFixed(1)}" text-anchor="end">${f * 100}%</text>`);
  }
  parts.push(`<polyline fill="none" stroke="#163c4e" stroke-width="2" points="${curve((t) => satHumRatio(t, p))}"/>`);
  // process lines and points
  const at = (label) => r.points.find((pt) => pt.label === label)?.s;
  for (const [l1, l2] of r.lines || []) {
    const s1 = at(l1), s2 = at(l2);
    if (s1 && s2) parts.push(`<line x1="${X(s1.t).toFixed(1)}" y1="${Y(s1.W).toFixed(1)}" x2="${X(s2.t).toFixed(1)}" y2="${Y(s2.W).toFixed(1)}" stroke="#b5452a" stroke-width="2"${l2 === "ADP" ? ' stroke-dasharray="6 4"' : ""}/>`);
  }
  for (const pt of r.points) {
    const cx = X(pt.s.t).toFixed(1), cy = Y(pt.s.W).toFixed(1);
    const adp = pt.label === "ADP"; // sits on the saturation curve, left of the coil's leaving point: label it below left
    parts.push(`<circle cx="${cx}" cy="${cy}" r="5" fill="${adp ? "#fff" : "#b5452a"}" stroke="#b5452a" stroke-width="2"/><text x="${(+cx + (adp ? -8 : 8)).toFixed(1)}" y="${(+cy + (adp ? 18 : -7)).toFixed(1)}"${adp ? ' text-anchor="end"' : ""} class="pt">${pt.label}</text>`);
  }
  const axis = `<line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" stroke="#6f8791"/><line x1="${W - R}" x2="${W - R}" y1="${T}" y2="${H - B}" stroke="#6f8791"/>`;
  const caption = `<text x="${L}" y="${H - 22}">Across: dry bulb, ${U.t}. Right axis: humidity ratio, ${U.W}. At ${r.pDisplay.toFixed(u === "IP" ? 2 : 1)} ${U.p}.</text><text x="${L}" y="${H - 7}">Solid curves: saturation and 10 to 90% RH. Dashed: wet bulb every ${wbStep} ${U.t}.</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="min-width:560px" role="img" aria-label="Psychrometric chart with ${r.points.map((x) => x.label).join(", ")} plotted">${parts.join("")}${axis}${caption}</svg>`;
}
