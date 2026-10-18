// Interior design fee calculator: pure functions, no I/O, no network.
//
// Everything here is arithmetic on numbers the user types: how many hours a
// project takes THEM, what each fee model would bill, and what an hour of their
// time should earn. Nothing is a market rate and nothing is a forecast.

export const MAX_PROJECTS = 300;

export const MODEL_NOTE =
  "Estimates, not market rates and not advice: every hour, rate, percentage and budget is a number you typed. Check your contract, local licensing rules and what the client will accept yourself.";

export const MODELS = ["hourly", "flat", "percent", "sqft", "margin", "hybrid"];

export const MODEL_LABELS = {
  hourly: "Hourly",
  flat: "Flat fee",
  percent: "Percent of project cost",
  sqft: "Per square foot",
  margin: "Product margin only",
  hybrid: "Flat design fee + product margin",
};

export const DEFAULTS = Object.freeze({
  designHours: 40,
  siteVisits: 4,
  visitHours: 2.5,
  procurementItems: 60,
  minutesPerItem: 25,
  meetings: 6,
  meetingHours: 1,
  overrunPct: 25,
  stressOverrunPct: 50,
  targetHourly: 100,
  walkAwayPct: 75,
  projectCost: 40000,
  productSpend: 30000,
  sqft: 1500,
  hourlyRate: 125,
  writeOffPct: 10,
  flatFee: 8500,
  percentRate: 20,
  sqftRate: 6,
  marginPct: 25,
  hybridFlat: 3500,
  hybridMarginPct: 18,
});

export const INPUT_NOTES = [
  { what: "Design hours, site visits, meetings", detail: "Hours of concept, drawings and revisions, plus site visits and client meetings (count x hours each). Replace the defaults with your own tracked time." },
  { what: "Procurement items and minutes per item", detail: "Every piece you source, order, track, receive and chase. Procurement is the hidden load in percent and margin models." },
  { what: "Overrun percent", detail: "How much longer the project runs than your baseline hours. Overrun lands on you under every model except hourly. Stress overrun is the bad case used to pick the sturdier model." },
  { what: "Target hourly rate", detail: "What an hour of your time should earn. Effective hourly = what the model bills / hours you actually spend." },
  { what: "Project cost and product spend", detail: "Project cost is the client's total furnishings and installation budget (percent-of-cost base). Product spend is what you buy through your firm (margin base)." },
  { what: "Hourly rate and write-off", detail: "Hourly bills rate x hours, less the share you write off or never bill." },
  { what: "Flat, percent, per sq ft, margin, hybrid", detail: "Leave a model's rate blank to leave it out. Margin is your net margin on product spend after your own discount to the client; hybrid is a flat design fee plus a lower margin." },
  { what: "Walk-away fee", detail: "Expected hours x a floor rate (a percent of your target). Below it the project costs you more than it is worth to you." },
  { what: "Past-project rows", detail: "project,model,fee,hours. Effective hourly = fee / hours, grouped by fee model so you can see which kind of engagement actually paid you best." },
];

export const money = (v) => {
  if (v === null || v === undefined || Number.isNaN(v) || !Number.isFinite(v)) return "n/a";
  const r = Math.round(Math.abs(v) * 100) / 100;
  return `${v < -0.004 ? "-" : ""}$${r.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
export const pct = (p, digits = 1) => (p === null || p === undefined || Number.isNaN(p) || !Number.isFinite(p) ? "n/a" : `${(p * 100).toFixed(digits).replace(/\.0+$/, "")}%`);

const toNumber = (s) => {
  if (typeof s === "number") return Number.isFinite(s) ? s : null;
  const t = String(s ?? "").trim().replace(/^\$/, "").replace(/,/g, "");
  if (t === "" || !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  return Number(t);
};

// Required inputs: always present, validated against a range.
const FIELDS = [
  ["designHours", 0, 1e5], ["siteVisits", 0, 1e4], ["visitHours", 0, 100], ["procurementItems", 0, 1e5],
  ["minutesPerItem", 0, 2000], ["meetings", 0, 1e4], ["meetingHours", 0, 100], ["overrunPct", 0, 1000],
  ["stressOverrunPct", 0, 1000], ["targetHourly", 0.01, 1e5], ["walkAwayPct", 0, 100], ["projectCost", 0, 1e9],
  ["productSpend", 0, 1e9], ["sqft", 0, 1e7], ["writeOffPct", 0, 100],
];
// Model rates: blank leaves the model out (hourly defaults on; the rest default on too, set to "" to drop).
const RATE_FIELDS = [
  ["hourlyRate", 0, 1e5], ["flatFee", 0, 1e9], ["percentRate", 0, 100], ["sqftRate", 0, 1e5],
  ["marginPct", 0, 100], ["hybridFlat", 0, 1e9], ["hybridMarginPct", 0, 100],
];

/** Merge user options over defaults and validate. Throws Error with a readable message. */
export function normalizeOptions(raw = {}) {
  const o = { ...DEFAULTS };
  for (const [k, lo, hi] of FIELDS) {
    const v = raw[k];
    if (v === undefined || v === null || v === "") continue;
    const n = toNumber(v);
    if (n === null) throw new Error(`${k} must be a number`);
    if (n < lo || n > hi) throw new Error(`${k} must be between ${lo} and ${hi}`);
    o[k] = n;
  }
  for (const [k, lo, hi] of RATE_FIELDS) {
    if (!(k in raw)) continue;
    const v = raw[k];
    if (v === null || v === "") { o[k] = null; continue; }
    if (v === undefined) continue;
    const n = toNumber(v);
    if (n === null) throw new Error(`${k} must be a number`);
    if (n < lo || n > hi) throw new Error(`${k} must be between ${lo} and ${hi}`);
    o[k] = n;
  }
  return o;
}

/** Baseline hours of your time the project takes before any overrun. */
export function baselineParts(o) {
  return {
    design: o.designHours,
    siteVisits: o.siteVisits * o.visitHours,
    procurement: (o.procurementItems * o.minutesPerItem) / 60,
    meetings: o.meetings * o.meetingHours,
  };
}

const sum = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);

function modelFees(o) {
  const fees = {};
  if (o.hourlyRate !== null) fees.hourly = { billed: (hours) => o.hourlyRate * hours * (1 - o.writeOffPct / 100), fixed: false, basis: `${money(o.hourlyRate)}/h less ${o.writeOffPct}% written off` };
  if (o.flatFee !== null) fees.flat = { fee: o.flatFee, basis: "fixed" };
  if (o.percentRate !== null) fees.percent = { fee: (o.percentRate / 100) * o.projectCost, basis: `${o.percentRate}% of ${money(o.projectCost)}` };
  if (o.sqftRate !== null) fees.sqft = { fee: o.sqftRate * o.sqft, basis: `${money(o.sqftRate)} x ${o.sqft} sq ft` };
  if (o.marginPct !== null) fees.margin = { fee: (o.marginPct / 100) * o.productSpend, basis: `${o.marginPct}% of ${money(o.productSpend)} product spend` };
  if (o.hybridFlat !== null && o.hybridMarginPct !== null) fees.hybrid = { fee: o.hybridFlat + (o.hybridMarginPct / 100) * o.productSpend, basis: `${money(o.hybridFlat)} + ${o.hybridMarginPct}% of ${money(o.productSpend)}` };
  return fees;
}

/** Compare every fee model on one project. */
export function compare(raw = {}) {
  const o = normalizeOptions(raw);
  const parts = baselineParts(o);
  const baseline = sum(parts);
  const hoursAt = (overrun) => baseline * (1 + overrun / 100);
  const expected = hoursAt(o.overrunPct);
  const stress = hoursAt(o.stressOverrunPct);
  const defs = modelFees(o);
  const scenarios = [0, 25, 50, 100];
  const models = Object.entries(defs).map(([id, d]) => {
    const feeAt = (h) => (d.billed ? d.billed(h) : d.fee);
    const fee = feeAt(expected);
    const eff = (h) => (h > 0 ? feeAt(h) / h : null);
    // Hours the model can absorb before effective hourly drops below target.
    const hoursAtTarget = d.billed ? null : d.fee / o.targetHourly;
    return {
      id, label: MODEL_LABELS[id], basis: d.basis, fee,
      effective: eff(expected), stressEffective: eff(stress),
      gapToTarget: eff(expected) === null ? null : eff(expected) - o.targetHourly,
      meetsTarget: eff(expected) !== null && eff(expected) >= o.targetHourly - 1e-9,
      stressMeetsTarget: eff(stress) !== null && eff(stress) >= o.targetHourly - 1e-9,
      byOverrun: scenarios.map((s) => ({ overrunPct: s, hours: hoursAt(s), effective: eff(hoursAt(s)) })),
      breakEvenOverrunPct: hoursAtTarget === null || baseline <= 0 ? null : (hoursAtTarget / baseline - 1) * 100,
    };
  });
  const best = [...models].sort((a, b) => b.effective - a.effective)[0] || null;
  const sturdiest = [...models].sort((a, b) => b.stressEffective - a.stressEffective)[0] || null;
  const minimumFee = expected * o.targetHourly;
  const walkAway = expected * ((o.targetHourly * o.walkAwayPct) / 100);
  return { options: o, parts, baseline, expected, stress, models, best, sturdiest, minimumFee, walkAway };
}

export function summarizeCompare(c) {
  const o = c.options;
  if (!c.models.length) return { status: "empty", text: "No fee model has a rate: fill in at least one." };
  const ok = c.models.filter((m) => m.meetsTarget).length;
  let text = `Expected ${c.expected.toFixed(1)} hours (${c.baseline.toFixed(1)} baseline + ${o.overrunPct}% overrun). To earn ${money(o.targetHourly)} an hour you need ${money(c.minimumFee)}; walk away below ${money(c.walkAway)}.`;
  text += ` ${ok} of ${c.models.length} models meet target; best is ${c.best.label} at ${money(c.best.effective)} an hour.`;
  if (c.sturdiest && c.sturdiest.id !== c.best.id) text += ` At ${o.stressOverrunPct}% overrun the sturdiest is ${c.sturdiest.label} at ${money(c.sturdiest.stressEffective)}.`;
  return { status: ok ? "ok" : "below", text };
}

/** Parse past-project rows: project,model,fee,hours. Never throws; errors carry line numbers. */
export function parseProjects(text) {
  const projects = [];
  const errors = [];
  let seenHeader = false;
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const f = line.split(",").map((s) => s.trim());
    if (!seenHeader && /^(project|name)$/i.test(f[0])) { seenHeader = true; return; }
    seenHeader = true;
    const at = `Line ${i + 1}`;
    if (f.length < 4) { errors.push(`${at}: expected project,model,fee,hours`); return; }
    const fee = toNumber(f[2]);
    const hours = toNumber(f[3]);
    if (!f[0]) errors.push(`${at}: project name is empty`);
    else if (!f[1]) errors.push(`${at}: model is empty (for example hourly, flat, percent)`);
    else if (fee === null || fee < 0) errors.push(`${at}: fee must be a number of dollars, zero or more`);
    else if (hours === null || hours <= 0) errors.push(`${at}: hours must be greater than zero`);
    else projects.push({ name: f[0], model: f[1].toLowerCase(), fee, hours });
  });
  if (projects.length > MAX_PROJECTS) errors.push(`Too many projects: ${projects.length} (limit ${MAX_PROJECTS})`);
  return { projects, errors };
}

/** Rank past projects worst effective hourly first and group results by fee model. */
export function history(parsed, raw = {}) {
  const o = normalizeOptions(raw);
  const projects = (parsed.projects || []).map((p) => {
    const effective = p.fee / p.hours;
    const neededFee = p.hours * o.targetHourly;
    const shortfall = Math.max(0, neededFee - p.fee);
    return { ...p, effective, neededFee, shortfall, atTarget: shortfall <= 1e-9 };
  }).sort((a, b) => a.effective - b.effective || a.name.localeCompare(b.name));
  const groups = new Map();
  for (const p of projects) {
    const g = groups.get(p.model) || { model: p.model, count: 0, fee: 0, hours: 0 };
    g.count += 1; g.fee += p.fee; g.hours += p.hours;
    groups.set(p.model, g);
  }
  const byModel = [...groups.values()].map((g) => ({ ...g, effective: g.fee / g.hours })).sort((a, b) => b.effective - a.effective || a.model.localeCompare(b.model));
  const fee = projects.reduce((a, p) => a + p.fee, 0);
  const hours = projects.reduce((a, p) => a + p.hours, 0);
  const shortfall = projects.reduce((a, p) => a + p.shortfall, 0);
  return {
    options: o, projects, byModel, fee, hours, shortfall,
    below: projects.filter((p) => !p.atTarget).length,
    blendedHourly: hours > 0 ? fee / hours : null,
  };
}

export function summarizeHistory(h) {
  if (!h.projects.length) return { status: "empty", text: "No projects." };
  const o = h.options;
  const best = h.byModel[0];
  const worst = h.byModel[h.byModel.length - 1];
  let text = `${h.below} of ${h.projects.length} projects earned under ${money(o.targetHourly)} an hour (blended ${money(h.blendedHourly)}); the shortfall to target is ${money(h.shortfall)}.`;
  if (h.byModel.length > 1) text += ` Best model: ${best.model} at ${money(best.effective)} an hour; worst: ${worst.model} at ${money(worst.effective)}.`;
  return { status: h.below ? "below" : "ok", text };
}
