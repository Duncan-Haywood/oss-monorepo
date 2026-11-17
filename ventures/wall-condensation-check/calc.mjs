// Wall Condensation Check: a steady-state, month-by-month Glaser check of a
// building assembly, with the moisture that condenses at each interface
// carried forward and dried out again, in the manner of ISO 13788's
// interstitial method (interfaces only, no moisture storage, no liquid
// transport, no air leakage, no rain, no solar gain).
//
// Pure: no imports, no clock, no randomness. Every number the page shows comes
// from `analyze(input)`.

export const R_IP_TO_SI = 0.176110; // h·ft²·°F/Btu -> m²·K/W
export const PERM_US_TO_SI = 57.2135e-12; // US perm -> kg/(s·m²·Pa)
export const SECONDS_PER_DAY = 86400;
export const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Surface resistances, m²K/W. ISO 13788 uses 0.13 inside and 0.04 outside for
// the interstitial calculation and 0.25 inside for the surface-humidity check.
export const RSI = 0.13;
export const RSE = 0.04;
export const RSI_SURFACE = 0.25;

/**
 * Typical layer values, rounded, for a quick start. They vary by product,
 * thickness and moisture content (wood and kraft get far more permeable when
 * damp), so the page tells people to replace them with their own datasheet.
 * R in h·ft²·°F/Btu for the whole layer; perm in US perms for the whole layer.
 */
export const LIBRARY = {
  "gypsum-half": { name: "1/2 in gypsum board", r: 0.45, perm: 50 },
  "latex-paint": { name: "Latex primer and paint", r: 0, perm: 5 },
  "vapor-retarder-paint": { name: "Vapor-retarder primer", r: 0, perm: 0.8 },
  "kraft": { name: "Kraft facing on batts", r: 0, perm: 1 },
  "smart-membrane": { name: "Variable-perm membrane, dry winter value", r: 0, perm: 1 },
  "poly-6mil": { name: "6 mil polyethylene", r: 0, perm: 0.06 },
  "batt-r13": { name: "R-13 fiberglass batt, 2x4 cavity", r: 13, perm: 30 },
  "batt-r21": { name: "R-21 fiberglass batt, 2x6 cavity", r: 21, perm: 20 },
  "mineral-wool-r23": { name: "R-23 mineral wool batt, 2x6 cavity", r: 23, perm: 20 },
  "ocsf-55": { name: "5.5 in open-cell spray foam", r: 20, perm: 3 },
  "ccsf-2": { name: "2 in closed-cell spray foam", r: 13, perm: 0.8 },
  "osb-716": { name: "7/16 in OSB, dry", r: 0.62, perm: 1.5 },
  "plywood-half": { name: "1/2 in plywood, dry", r: 0.63, perm: 0.7 },
  "fiberboard-half": { name: "1/2 in fiberboard sheathing", r: 1.3, perm: 20 },
  "xps-1": { name: "1 in XPS foam", r: 5, perm: 1.1 },
  "xps-2": { name: "2 in XPS foam", r: 10, perm: 0.55 },
  "eps-1": { name: "1 in EPS foam", r: 4, perm: 3.5 },
  "polyiso-foil-1": { name: "1 in foil-faced polyiso", r: 6, perm: 0.03 },
  "mineral-wool-board-1-5": { name: "1.5 in mineral wool board", r: 6, perm: 25 },
  "housewrap": { name: "Polymer housewrap", r: 0, perm: 50 },
  "felt-15": { name: "#15 asphalt felt", r: 0, perm: 5 },
  "vented-cladding": { name: "Vented siding (counts as outside air)", r: 0, perm: 1000 },
};

/** Saturation vapour pressure, Pa, over water at or above 0 C and over ice below (ISO 13788). */
export function psat(tC) {
  return tC >= 0 ? 610.5 * Math.exp((17.269 * tC) / (237.3 + tC)) : 610.5 * Math.exp((21.875 * tC) / (265.5 + tC));
}

/** Dew point, C, from a vapour pressure in Pa (inverse of `psat`). */
export function dewPoint(p) {
  if (!(p > 0)) return null;
  const water = Math.log(p / 610.5);
  if (p >= 610.5) return (237.3 * water) / (17.269 - water);
  return (265.5 * water) / (21.875 - water);
}

const fToC = (f) => ((f - 32) * 5) / 9;
export const cToF = (c) => (c * 9) / 5 + 32;

function num(raw, label, errs, { min = -Infinity, max = Infinity, blank = null } = {}) {
  if (raw === "" || raw === null || raw === undefined) {
    if (blank !== null) return blank;
    errs.push(`${label}: enter a number`);
    return NaN;
  }
  const x = typeof raw === "number" ? raw : Number(String(raw).trim().replace(/,/g, ""));
  if (!Number.isFinite(x)) { errs.push(`${label}: "${raw}" is not a number`); return NaN; }
  if (x < min || x > max) { errs.push(`${label}: ${x} is outside ${min} to ${max}`); return NaN; }
  return x;
}

/**
 * Parse a block of month lines: "month, outdoor T, outdoor RH %, indoor T, indoor RH %".
 * The month name is optional; blank lines and lines starting with # are skipped.
 */
export function parseClimate(text, unit = "F") {
  const errs = [];
  const months = [];
  const lines = String(text || "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("#")) continue;
    const cells = line.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    const at = `Climate line ${i + 1}`;
    // An optional month column: a name ("Jan", "January") or a number (1 to 12).
    // Five values means the first is the month; reading it as the outdoor
    // temperature would shift every column and silently give a wrong answer.
    let month = null;
    if (cells.length && !Number.isFinite(Number(cells[0]))) {
      const name = cells.shift().slice(0, 3).toLowerCase();
      const k = MONTH_NAMES.findIndex((m) => m.toLowerCase() === name);
      if (k < 0) { errs.push(`${at}: "${name}" is not a month name`); continue; }
      month = k;
    } else if (cells.length === 5) {
      const k = Number(cells.shift());
      if (!Number.isInteger(k) || k < 1 || k > 12) { errs.push(`${at}: month ${k} is not 1 to 12`); continue; }
      month = k - 1;
    }
    if (cells.length < 4) { errs.push(`${at}: need outdoor temperature, outdoor RH, indoor temperature, indoor RH`); continue; }
    if (cells.length > 4) { errs.push(`${at}: too many values (want month, outdoor temperature, outdoor RH, indoor temperature, indoor RH)`); continue; }
    if (month !== null && month !== months.length) { errs.push(`${at}: ${MONTH_NAMES[month]} is out of order (enter 12 months, January first)`); continue; }
    const tOut = num(cells[0], `${at} outdoor temperature`, errs, { min: unit === "F" ? -60 : -51, max: unit === "F" ? 130 : 55 });
    const rhOut = num(cells[1], `${at} outdoor RH`, errs, { min: 1, max: 100 });
    const tIn = num(cells[2], `${at} indoor temperature`, errs, { min: unit === "F" ? 40 : 4, max: unit === "F" ? 100 : 38 });
    const rhIn = num(cells[3], `${at} indoor RH`, errs, { min: 1, max: 100 });
    months.push({ tOut: unit === "F" ? fToC(tOut) : tOut, rhOut, tIn: unit === "F" ? fToC(tIn) : tIn, rhIn });
  }
  if (!errs.length && months.length !== 12) errs.push(`Climate: enter 12 months, January first (found ${months.length})`);
  return { months, errors: errs };
}

/**
 * Parse layer lines, inside to outside: "name, R-value, permeance".
 * R is per layer (IP h·ft²·°F/Btu or SI m²K/W); permeance per layer (US perms or ng/(s·m²·Pa)).
 */
export function parseLayers(text, rUnit = "IP", permUnit = "perm") {
  const errs = [];
  const layers = [];
  const lines = String(text || "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("#")) continue;
    const cells = line.split(/[,;\t]/).map((s) => s.trim());
    if (cells.length < 3) { errs.push(`Layer line ${i + 1}: need name, R-value, permeance`); continue; }
    const perm = cells.pop();
    const r = cells.pop();
    const name = cells.join(", ") || `Layer ${layers.length + 1}`;
    const at = `Layer "${name}"`;
    const rv = num(r, `${at} R-value`, errs, { min: 0, max: rUnit === "IP" ? 100 : 18 });
    const pv = num(perm, `${at} permeance`, errs, { min: permUnit === "perm" ? 0.001 : 0.05, max: permUnit === "perm" ? 10000 : 600000 });
    layers.push({
      name,
      rSI: rUnit === "IP" ? rv * R_IP_TO_SI : rv,
      // vapour resistance, (s·m²·Pa)/kg
      z: 1 / (permUnit === "perm" ? pv * PERM_US_TO_SI : pv * 1e-12),
      permUS: permUnit === "perm" ? pv : pv / 57.2135,
    });
  }
  if (!errs.length && layers.length < 2) errs.push("Layers: enter at least two layers, inside first");
  return { layers, errors: errs };
}

/** Temperatures and saturation pressures at each interface for one month. */
function profile(layers, m) {
  const rTotal = RSI + RSE + layers.reduce((s, l) => s + l.rSI, 0);
  const pts = [];
  let r = RSI;
  let z = 0;
  // interface 0 = inside surface, interface n = outside surface
  for (let i = 0; i <= layers.length; i++) {
    const t = m.tIn - ((m.tIn - m.tOut) * r) / rTotal;
    pts.push({ t, ps: psat(t), z });
    if (i < layers.length) { r += layers[i].rSI; z += layers[i].z; }
  }
  return { pts, rTotal };
}

/**
 * Vapour pressure at each interface: the taut string from the indoor to the
 * outdoor vapour pressure that stays at or below saturation, pinned at
 * saturation wherever moisture is still lying from earlier months.
 */
function vapourProfile(pts, pIn, pOut, wet) {
  const n = pts.length - 1;
  const p = new Array(n + 1).fill(null);
  p[0] = pIn;
  p[n] = pOut;
  const anchors = [0];
  for (let i = 1; i < n; i++) if (wet[i]) anchors.push(i);
  anchors.push(n);
  for (const i of anchors) if (i > 0 && i < n) p[i] = pts[i].ps;
  const touch = new Set(anchors.filter((i) => i > 0 && i < n));
  for (let a = 0; a < anchors.length - 1; a++) {
    let from = anchors[a];
    const to = anchors[a + 1];
    while (from < to) {
      // gift-wrap: the next point is the one with the lowest slope from `from`
      let best = to;
      let bestSlope = (p[to] - p[from]) / (pts[to].z - pts[from].z || 1e-30);
      for (let j = from + 1; j < to; j++) {
        const dz = pts[j].z - pts[from].z;
        if (dz <= 0) {
          // a zero-resistance layer: the two interfaces are one plane
          if (pts[j].ps < p[from]) { best = j; bestSlope = -Infinity; }
          continue;
        }
        const slope = (pts[j].ps - p[from]) / dz;
        if (slope < bestSlope - 1e-12) { best = j; bestSlope = slope; }
      }
      if (best !== to) { p[best] = Math.min(pts[best].ps, p[from]); touch.add(best); }
      for (let j = from + 1; j < best; j++) p[j] = p[from] + (Number.isFinite(bestSlope) ? bestSlope : 0) * (pts[j].z - pts[from].z);
      from = best;
    }
  }
  return { p, touch };
}

/** One month: flux in minus flux out at each touching interface, kg/(m²·s). */
function monthRates(pts, p, touch) {
  const rates = {};
  for (const i of touch) {
    let a = i - 1;
    while (a > 0 && pts[i].z - pts[a].z <= 0) a--;
    let b = i + 1;
    while (b < pts.length - 1 && pts[b].z - pts[i].z <= 0) b++;
    const fin = (p[a] - p[i]) / Math.max(pts[i].z - pts[a].z, 1e-30);
    const fout = (p[i] - p[b]) / Math.max(pts[b].z - pts[i].z, 1e-30);
    rates[i] = fin - fout;
  }
  return rates;
}

/** Run the monthly cycle for a given climate. Returns per-month rows and per-interface totals. */
export function simulate(layers, months, { years = 2 } = {}) {
  const n = layers.length;
  const moisture = new Array(n + 1).fill(0); // kg/m² lying at each interface
  // ISO 13788 starts the year in the first month that condenses on a dry wall
  // after a month that does not, so the year ends after the drying season.
  const condensesDry = [];
  for (let k = 0; k < 12; k++) {
    const m = months[k];
    const { pts } = profile(layers, m);
    const { p, touch } = vapourProfile(pts, (m.rhIn / 100) * psat(m.tIn), (m.rhOut / 100) * psat(m.tOut), moisture);
    condensesDry.push(Object.values(monthRates(pts, p, touch)).some((g) => g > 1e-15));
  }
  let start = -1;
  for (let k = 0; k < 12; k++) if (condensesDry[k] && !condensesDry[(k + 11) % 12]) { start = k; break; }
  if (start < 0 && condensesDry.some(Boolean)) start = 0;
  const rows = [];
  const peak = new Array(n + 1).fill(0);
  const peakMonth = new Array(n + 1).fill(null);
  const wetMonths = new Array(n + 1).fill(0);
  const yearEnd = [];
  const first = start < 0 ? 0 : start;
  for (let y = 0; y < years; y++) {
    for (let s = 0; s < 12; s++) {
      const k = (first + s) % 12;
      const m = months[k];
      const { pts } = profile(layers, m);
      const pIn = (m.rhIn / 100) * psat(m.tIn);
      const pOut = (m.rhOut / 100) * psat(m.tOut);
      const wet = moisture.map((x) => x > 0);
      const { p, touch } = vapourProfile(pts, pIn, pOut, wet);
      const rates = monthRates(pts, p, touch);
      const secs = MONTH_DAYS[k] * SECONDS_PER_DAY;
      const change = {};
      for (const [i, g] of Object.entries(rates)) {
        const before = moisture[i];
        moisture[i] = Math.max(0, before + g * secs);
        change[i] = moisture[i] - before;
      }
      if (y === years - 1) {
        for (let i = 1; i < n; i++) {
          if (moisture[i] > peak[i]) { peak[i] = moisture[i]; peakMonth[i] = k; }
          if (moisture[i] > 0) wetMonths[i]++;
        }
        const tsi = m.tIn - ((m.tIn - m.tOut) * RSI_SURFACE) / (RSI_SURFACE + RSE + layers.reduce((acc, l) => acc + l.rSI, 0));
        rows.push({
          month: k,
          name: MONTH_NAMES[k],
          tOut: m.tOut,
          tIn: m.tIn,
          pIn,
          pOut,
          interfaces: pts.map((pt, i) => ({ t: pt.t, psat: pt.ps, p: p[i], rh: Math.min(100, (100 * p[i]) / pt.ps) })),
          rates: Object.fromEntries(Object.entries(rates).map(([i, g]) => [i, g * SECONDS_PER_DAY * 1000])), // g/(m²·day)
          change: Object.fromEntries(Object.entries(change).map(([i, c]) => [i, c * 1000])), // g/m² this month
          moisture: moisture.map((x) => x * 1000), // g/m² at month end
          insideSurfaceRh: Math.min(100, (100 * pIn) / psat(tsi)),
          insideSurfaceT: tsi,
        });
      }
    }
    yearEnd.push(moisture.map((x) => x * 1000));
  }
  return { rows, start: start < 0 ? null : start, peak: peak.map((x) => x * 1000), peakMonth, wetMonths, yearEnd };
}

/** The constant indoor RH (all months) at which the wall first collects any moisture, by bisection. */
export function safeIndoorRh(layers, months) {
  const wetAt = (rh) => simulate(layers, months.map((m) => ({ ...m, rhIn: rh })), { years: 1 }).peak.some((x) => x > 1e-6);
  if (wetAt(5)) return 5;
  if (!wetAt(95)) return null; // nothing condenses even at 95%
  let lo = 5;
  let hi = 95;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (wetAt(mid)) hi = mid; else lo = mid;
  }
  return lo;
}

export const DEFAULTS = {
  tempUnit: "F",
  rUnit: "IP",
  permUnit: "perm",
  // An invented cold-climate year (roughly a northern US city), not a real station's normals.
  climate: [
    "Jan, 20, 75, 70, 35",
    "Feb, 24, 72, 70, 35",
    "Mar, 35, 70, 70, 38",
    "Apr, 48, 66, 70, 42",
    "May, 59, 66, 72, 48",
    "Jun, 69, 68, 74, 52",
    "Jul, 74, 70, 75, 55",
    "Aug, 72, 72, 75, 55",
    "Sep, 64, 72, 73, 52",
    "Oct, 52, 70, 70, 45",
    "Nov, 39, 74, 70, 40",
    "Dec, 26, 77, 70, 36",
  ].join("\n"),
  layers: [
    "Latex primer and paint, 0, 5",
    "1/2 in gypsum board, 0.45, 50",
    "R-21 fiberglass batt, 21, 20",
    "7/16 in OSB, 0.62, 1.5",
    "Polymer housewrap, 0, 50",
  ].join("\n"),
};

export function sampleInput() {
  return { ...DEFAULTS };
}

/** Same wall with 1 in XPS outside the OSB: the comparison the guide works through. */
export function sampleWithFoam() {
  return { ...DEFAULTS, layers: DEFAULTS.layers.replace("Polymer housewrap, 0, 50", "1 in XPS foam, 5, 1.1\nPolymer housewrap, 0, 50") };
}

/**
 * Check an assembly over a year.
 * Input: { tempUnit: "F"|"C", rUnit: "IP"|"SI", permUnit: "perm"|"ng", climate: text, layers: text }.
 */
export function analyze(input = {}) {
  const x = { ...DEFAULTS, ...input };
  const tempUnit = x.tempUnit === "C" ? "C" : "F";
  const rUnit = x.rUnit === "SI" ? "SI" : "IP";
  const permUnit = x.permUnit === "ng" ? "ng" : "perm";
  const c = parseClimate(x.climate, tempUnit);
  const l = parseLayers(x.layers, rUnit, permUnit);
  const errors = [...l.errors, ...c.errors];
  if (errors.length) return { error: errors.slice(0, 4).join(". ") };
  const layers = l.layers;
  const months = c.months;
  const sim = simulate(layers, months);
  const n = layers.length;
  const rTotalSI = layers.reduce((s, q) => s + q.rSI, 0);
  const interfaces = [];
  for (let i = 1; i < n; i++) {
    interfaces.push({
      index: i,
      label: `${layers[i - 1].name} | ${layers[i].name}`,
      peak: sim.peak[i],
      peakMonth: sim.peakMonth[i] === null ? null : MONTH_NAMES[sim.peakMonth[i]],
      wetMonths: sim.wetMonths[i],
      endOfYear: sim.yearEnd[sim.yearEnd.length - 1][i],
      endOfFirstYear: sim.yearEnd[0][i],
    });
  }
  const wet = interfaces.filter((f) => f.peak > 1e-6);
  const worst = wet.slice().sort((a, b) => b.peak - a.peak)[0] || null;
  const accumulates = wet.filter((f) => f.endOfYear > 1e-6);
  const worstRow = worst ? sim.rows.reduce((best, r) => (r.moisture[worst.index] > best.moisture[worst.index] ? r : best), sim.rows[0]) : null;
  const coldest = sim.rows.reduce((best, r) => (r.tOut < best.tOut ? r : best), sim.rows[0]);
  const surfaceWorst = sim.rows.reduce((best, r) => (r.insideSurfaceRh > best.insideSurfaceRh ? r : best), sim.rows[0]);
  const safeRh = safeIndoorRh(layers, months);

  const findings = [];
  if (!wet.length) {
    findings.push({ severity: "info", title: "No interstitial condensation in any month", detail: "With these layers and this climate the vapour pressure stays below saturation at every interface all year. The model has no air leakage, rain, built-in moisture or solar-driven inward vapour, so this is the vapour-diffusion case only." });
  } else {
    findings.push({
      severity: accumulates.length ? "high" : "medium",
      title: `Condensation at ${worst.label}`,
      detail: `Peaks at ${worst.peak.toFixed(0)} g/m² at the end of ${worst.peakMonth}, wet for ${worst.wetMonths} month${worst.wetMonths === 1 ? "" : "s"} of the year. ${accumulates.length ? `It does not dry out by year end (${worst.endOfYear.toFixed(0)} g/m² left after the second year), so moisture builds up year on year.` : "It dries out completely within the year."}`,
    });
    for (const f of wet.filter((q) => q !== worst)) findings.push({ severity: "medium", title: `Also condenses at ${f.label}`, detail: `Peaks at ${f.peak.toFixed(0)} g/m² (${f.peakMonth}).` });
  }
  if (surfaceWorst.insideSurfaceRh >= 80) findings.push({ severity: "medium", title: "Inside surface humidity reaches 80% or more", detail: `In ${surfaceWorst.name} the inside surface sits at ${surfaceWorst.insideSurfaceT.toFixed(1)} C and ${surfaceWorst.insideSurfaceRh.toFixed(0)}% RH (Rsi 0.25). ISO 13788 uses 80% as the mould-growth threshold for surfaces.` });
  if (safeRh !== null) findings.push({ severity: "info", title: `Indoor RH that first wets this wall: ${safeRh.toFixed(0)}%`, detail: "Holding the indoor relative humidity at this value or below in every month (other inputs unchanged) gives no condensation anywhere. Above it, some interface collects moisture in at least one month." });
  else findings.push({ severity: "info", title: "Nothing condenses even at 95% indoor RH", detail: "With this climate the outdoor side is permeable enough, or warm enough, that diffusion alone does not wet the wall at any indoor humidity tested." });

  return {
    layers: layers.map((q) => ({ name: q.name, rIP: q.rSI / R_IP_TO_SI, rSI: q.rSI, perm: q.permUS })),
    rTotalIP: rTotalSI / R_IP_TO_SI,
    rTotalSI,
    start: sim.start === null ? null : MONTH_NAMES[sim.start],
    rows: sim.rows,
    interfaces,
    worst,
    worstRow,
    coldest,
    safeIndoorRh: safeRh,
    accumulates: accumulates.length > 0,
    findings,
  };
}

/** CSV of the month-by-month result, one row per month and interface. */
export function reportCsv(a) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = ["month,interface,temperature_c,saturation_pa,vapour_pa,rh_pct,rate_g_m2_day,moisture_end_g_m2"];
  for (const r of a.rows) {
    r.interfaces.forEach((f, i) => {
      const label = i === 0 ? "inside surface" : i === a.layers.length ? "outside surface" : `${a.layers[i - 1].name} | ${a.layers[i].name}`;
      lines.push([r.name, q(label), f.t.toFixed(2), f.psat.toFixed(1), f.p.toFixed(1), f.rh.toFixed(1), (r.rates[i] ?? 0).toFixed(3), r.moisture[i].toFixed(1)].join(","));
    });
  }
  return lines.join("\n") + "\n";
}
