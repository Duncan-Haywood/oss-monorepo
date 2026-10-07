// Stump grinding bid calculator: pure functions, no dependencies, nothing leaves the browser.
// A job is a list of stump diameters on one site. Grinding time comes from the volume of wood to remove
// (face area x depth below grade, plus stump height above grade, plus a root allowance) divided by how fast YOUR
// grinder actually cuts, scaled for wood hardness. Setup, drive time and per-stump repositioning and cleanup are added,
// then the machine, truck, crew, overhead and margin, and the price is floored at your minimum charge.

export function num(v) {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}
export const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
export const money2 = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);

export const DEFAULT_DIAMETERS = "14, 20, 26, 32";

export const DEFAULTS = {
  heightIn: 6, depthIn: 8, rootPct: 25, hardness: 1,
  cuInPerMin: 1100, repositionMin: 5, cleanupMin: 7, setupMin: 35, driveMinRoundTrip: 40,
  machinePerHr: 28, truckPerMile: 0.85, milesRoundTrip: 24,
  crewSize: 2, wage: 24, overheadPct: 12, targetMarginPct: 25, minCharge: 150,
  quotePerInch: 3.5,
};

export const HARDNESS = [
  { label: "Softwood (pine, spruce, poplar)", factor: 0.8 },
  { label: "Medium (maple, cherry, ash)", factor: 1 },
  { label: "Hardwood (oak, hickory, locust)", factor: 1.3 },
  { label: "Dirty or rotten, rocks in roots", factor: 1.6 },
];

const safe = (x) => (Number.isFinite(x) ? Math.max(0, x) : 0);
const clampPct = (p) => Math.min(99, Math.max(0, safe(p)));

// "14, 20 26;32x2" -> [14,20,26,32,32]. "NxM" or "N*M" repeats a size M times. Junk entries are dropped and counted.
export function parseDiameters(text) {
  const out = [];
  let skipped = 0;
  for (const raw of String(text ?? "").split(/[,;\n\s]+/).filter(Boolean)) {
    const m = raw.match(/^(\d+(?:\.\d+)?)(?:[x*×](\d{1,3}))?$/i);
    if (!m) { skipped++; continue; }
    const d = parseFloat(m[1]);
    const times = m[2] ? parseInt(m[2], 10) : 1;
    if (!(d > 0) || d > 120 || out.length + times > 500) { skipped++; continue; }
    for (let i = 0; i < times; i++) out.push(d);
  }
  return { diameters: out, skipped };
}

// Minutes of cutting for one stump of diameter d (inches).
export function grindMinutes(d, o) {
  const r = safe(d) / 2;
  const area = Math.PI * r * r;
  const volume = area * (safe(o.depthIn) + safe(o.heightIn)) * (1 + safe(o.rootPct) / 100);
  const rate = Math.max(1, safe(o.cuInPerMin));
  return { volume, minutes: (volume / rate) * Math.max(0.1, safe(o.hardness)) };
}

// Full cost build-up for the job.
export function jobCost(diameters, o) {
  const n = diameters.length;
  const stumps = diameters.map((d) => {
    const g = grindMinutes(d, o);
    const onSite = g.minutes + safe(o.repositionMin) + safe(o.cleanupMin);
    return { d, volume: g.volume, grindMin: g.minutes, varMin: onSite };
  });
  const grindMin = stumps.reduce((s, x) => s + x.grindMin, 0);
  const varMin = stumps.reduce((s, x) => s + x.varMin, 0);
  const onSiteMin = n > 0 ? varMin + safe(o.setupMin) : 0;
  const driveMin = n > 0 ? safe(o.driveMinRoundTrip) : 0;
  const paidHours = (onSiteMin + driveMin) / 60;
  const crew = Math.max(1, Math.round(safe(o.crewSize) || 1));
  const labour = paidHours * crew * safe(o.wage);
  const machine = (grindMin / 60) * safe(o.machinePerHr);
  const truck = n > 0 ? safe(o.milesRoundTrip) * safe(o.truckPerMile) : 0;
  const direct = labour + machine + truck;
  const markup = clampPct(o.overheadPct) + clampPct(o.targetMarginPct);
  const raw = markup < 100 ? direct / (1 - markup / 100) : null;
  const price = raw === null ? null : n > 0 ? Math.max(raw, safe(o.minCharge)) : 0;
  const breakEven = clampPct(o.overheadPct) < 100 ? Math.max(direct / (1 - clampPct(o.overheadPct) / 100), 0) : null;
  return {
    n, stumps, grindMin, varMin, onSiteMin, driveMin, paidHours, crew, labour, machine, truck, direct,
    raw, price, breakEven, minApplies: raw !== null && price > raw,
    profit: price === null ? null : price - direct - price * (clampPct(o.overheadPct) / 100),
    totalInches: diameters.reduce((s, d) => s + d, 0),
  };
}

// Split the price across stumps: setup, drive and the minimum-charge top-up are shared equally; each stump's own
// minutes (cutting, repositioning, cleanup) are weighted by time. Shares add up to the price.
export function perStumpPrices(diameters, o) {
  const job = jobCost(diameters, o);
  if (job.price === null || job.n === 0) return [];
  const shared = safe(o.setupMin) + job.driveMin;
  const totalW = job.varMin + shared;
  return job.stumps.map((s) => {
    const w = s.varMin + shared / job.n;
    const share = totalW > 0 ? w / totalW : 1 / job.n;
    const price = job.price * share;
    return { d: s.d, grindMin: s.grindMin, price, perInch: price / s.d };
  });
}

// How the quote you have been giving compares: a flat $ per diameter inch, floored at your minimum.
export function quoteCheck(diameters, o) {
  const job = jobCost(diameters, o);
  const quote = job.n === 0 ? 0 : Math.max(safe(o.quotePerInch) * job.totalInches, safe(o.minCharge));
  const profitHr = job.paidHours > 0 ? (quote - job.direct - quote * (clampPct(o.overheadPct) / 100)) / job.paidHours : null;
  return {
    quote, needed: job.price,
    gap: job.price === null ? null : quote - job.price,
    profit: quote - job.direct - quote * (clampPct(o.overheadPct) / 100),
    marginPct: quote > 0 ? ((quote - job.direct - quote * (clampPct(o.overheadPct) / 100)) / quote) * 100 : null,
    profitPerPaidHour: profitHr,
    breakEvenPerInch: job.totalInches > 0 && job.breakEven !== null ? job.breakEven / job.totalInches : null,
    neededPerInch: job.totalInches > 0 && job.price !== null ? job.price / job.totalInches : null,
  };
}

// Same stumps, different wood.
export function hardnessSensitivity(diameters, o) {
  return HARDNESS.map((h) => {
    const j = jobCost(diameters, { ...o, hardness: h.factor });
    return { label: h.label, factor: h.factor, grindMin: j.grindMin, price: j.price, onSiteMin: j.onSiteMin };
  });
}

// Setup and drive time are paid once per trip: n identical stumps of the average size on one visit.
export function bundleSensitivity(diameters, o, counts = [1, 2, 4, 8]) {
  const avg = diameters.length ? diameters.reduce((s, d) => s + d, 0) / diameters.length : 0;
  return counts.map((count) => {
    const j = jobCost(Array(count).fill(avg), o);
    return { count, avg, total: j.price, each: j.price === null ? null : j.price / count, minApplies: j.minApplies };
  });
}

// Grinder speed is the number people guess worst: what does ±30% do?
export function speedSensitivity(diameters, o, mults = [0.7, 0.85, 1, 1.15, 1.3]) {
  return mults.map((mult) => {
    const j = jobCost(diameters, { ...o, cuInPerMin: o.cuInPerMin * mult });
    return { mult, cuInPerMin: o.cuInPerMin * mult, grindMin: j.grindMin, onSiteMin: j.onSiteMin, price: j.price };
  });
}

export function wageSensitivity(diameters, o, mults = [0.8, 1, 1.25, 1.5]) {
  return mults.map((mult) => {
    const j = jobCost(diameters, { ...o, wage: o.wage * mult });
    return { mult, wage: o.wage * mult, price: j.price };
  });
}
