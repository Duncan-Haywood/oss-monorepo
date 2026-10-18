// Bookkeeping client fee calculator: pure functions, no I/O, no network.
//
// Everything here is arithmetic on numbers the user types: how much work a
// client brings each month, how long each kind of work takes THEM, and what an
// hour of their time should earn. Nothing is a market rate and nothing is a
// forecast.

export const MAX_CLIENTS = 200;

export const MODEL_NOTE =
  "Estimates, not market rates and not advice: every volume, minute, rate and software figure is a number you typed. Check scope, engagement terms and local rules yourself.";

export const CLEANLINESS = ["clean", "average", "messy"];

export const DEFAULTS = Object.freeze({
  transactions: 300,
  accounts: 3,
  payrollRuns: 1,
  arApItems: 40,
  salesTaxFilings: 1,
  cleanupMonths: 0,
  cleanliness: "average",
  minClean: 0.5,
  minAverage: 1,
  minMessy: 2,
  reconMinutes: 20,
  payrollMinutes: 25,
  arApMinutes: 3,
  salesTaxMinutes: 45,
  reviewMinutes: 30,
  cleanupMultiplier: 1.25,
  software: 40,
  targetHourly: 75,
  bufferPct: 20,
  walkAwayPct: 75,
  competitorFee: null,
});

export const INPUT_NOTES = [
  { what: "Monthly transactions", detail: "Bank and card lines you categorize each month. Minutes per transaction depend on how clean the books are: you set clean, average and messy." },
  { what: "Accounts, payroll runs, AR/AP items, sales-tax filings", detail: "Each has its own minutes per unit (reconciliation per account, per payroll run, per invoice or bill, per filing). Defaults are placeholders; replace them with your own timed numbers." },
  { what: "Monthly review and client contact", detail: "A fixed block of minutes for the close, questions and the monthly call, whatever the volume." },
  { what: "Software", detail: "Monthly software and tool cost you carry for this client. It is added to the fee after your hours, not marked up." },
  { what: "Target hourly rate", detail: "What an hour of your bookkeeping time should earn. The minimum fee is hours x this rate plus software." },
  { what: "Recommended fee", detail: "The minimum plus your buffer percent, for scope creep and the months that run long." },
  { what: "Walk-away price", detail: "Hours x a floor rate (a percent of your target) plus software. Below it, the client costs you more than the work is worth to you." },
  { what: "Cleanup months", detail: "Catch-up months are priced as a one-time fee: the monthly workload x a slow-down multiplier x your rate x the buffer. Software is not charged on cleanup." },
  { what: "Roster rows", detail: "client,fee,hours[,software]. Effective hourly = (fee - software) / hours. Raise needed = the fee increase that reaches your target rate." },
];

export const money = (v) => {
  if (v === null || v === undefined || Number.isNaN(v)) return "n/a";
  const r = Math.round(Math.abs(v) * 100) / 100;
  return `${v < -0.004 ? "-" : ""}$${r.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
export const pct = (p, digits = 1) => (p === null || p === undefined || Number.isNaN(p) ? "n/a" : `${(p * 100).toFixed(digits).replace(/\.0+$/, "")}%`);

const toNumber = (s) => {
  if (typeof s === "number") return Number.isFinite(s) ? s : null;
  const t = String(s ?? "").trim().replace(/^\$/, "").replace(/,/g, "");
  if (t === "" || !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  return Number(t);
};

const FIELDS = [
  ["transactions", 0, 1e7], ["accounts", 0, 1000], ["payrollRuns", 0, 100], ["arApItems", 0, 1e6],
  ["salesTaxFilings", 0, 100], ["cleanupMonths", 0, 120], ["minClean", 0, 600], ["minAverage", 0, 600], ["minMessy", 0, 600],
  ["reconMinutes", 0, 5000], ["payrollMinutes", 0, 5000], ["arApMinutes", 0, 1000], ["salesTaxMinutes", 0, 5000],
  ["reviewMinutes", 0, 5000], ["cleanupMultiplier", 1, 20], ["software", 0, 1e6], ["targetHourly", 0.01, 1e5],
  ["bufferPct", 0, 500], ["walkAwayPct", 0, 100],
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
  if (raw.cleanliness !== undefined && raw.cleanliness !== null && raw.cleanliness !== "") {
    const c = String(raw.cleanliness).toLowerCase();
    if (!CLEANLINESS.includes(c)) throw new Error("cleanliness must be clean, average or messy");
    o.cleanliness = c;
  }
  if (raw.competitorFee !== undefined && raw.competitorFee !== null && raw.competitorFee !== "") {
    const n = toNumber(raw.competitorFee);
    if (n === null || n < 0) throw new Error("competitorFee must be a number of dollars, zero or more");
    o.competitorFee = n;
  }
  return o;
}

const MIN_KEY = { clean: "minClean", average: "minAverage", messy: "minMessy" };

/** Minutes of your time one month of this client takes. */
export function monthlyMinutes(o, cleanliness = o.cleanliness) {
  const perTxn = o[MIN_KEY[cleanliness]];
  return {
    transactions: o.transactions * perTxn,
    reconciliation: o.accounts * o.reconMinutes,
    payroll: o.payrollRuns * o.payrollMinutes,
    arAp: o.arApItems * o.arApMinutes,
    salesTax: o.salesTaxFilings * o.salesTaxMinutes,
    review: o.reviewMinutes,
  };
}

const sum = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);

/** Price one prospective client. */
export function price(raw = {}) {
  const o = normalizeOptions(raw);
  const parts = monthlyMinutes(o);
  const minutes = sum(parts);
  const hours = minutes / 60;
  const labor = hours * o.targetHourly;
  const minimum = labor + o.software;
  const recommended = minimum * (1 + o.bufferPct / 100);
  const floorRate = (o.targetHourly * o.walkAwayPct) / 100;
  const walkAway = hours * floorRate + o.software;
  const cleanupHours = (o.cleanupMonths * minutes * o.cleanupMultiplier) / 60;
  const cleanupQuote = cleanupHours * o.targetHourly * (1 + o.bufferPct / 100);
  const byCleanliness = Object.fromEntries(CLEANLINESS.map((c) => {
    const h = sum(monthlyMinutes(o, c)) / 60;
    return [c, { hours: h, minimum: h * o.targetHourly + o.software }];
  }));
  let competitor = null;
  if (o.competitorFee !== null) {
    const eff = hours > 0 ? (o.competitorFee - o.software) / hours : null;
    competitor = {
      fee: o.competitorFee,
      effectiveHourly: eff,
      gapToTarget: eff === null ? null : eff - o.targetHourly,
      status: o.competitorFee >= recommended ? "above-recommended" : o.competitorFee >= minimum ? "above-minimum" : o.competitorFee >= walkAway ? "below-minimum" : "below-walk-away",
      shortfallToMinimum: Math.max(0, minimum - o.competitorFee),
    };
  }
  return { options: o, parts, minutes, hours, minimum, recommended, walkAway, floorRate, cleanupHours, cleanupQuote, byCleanliness, competitor };
}

export function summarizePrice(p) {
  const o = p.options;
  let text = `Charge at least ${money(p.minimum)} a month (${p.hours.toFixed(2)} hours x ${money(o.targetHourly)} + ${money(o.software)} software); quote ${money(p.recommended)} with a ${pct(o.bufferPct / 100, 0)} buffer; walk away below ${money(p.walkAway)}.`;
  if (o.cleanupMonths > 0) text += ` One-time cleanup of ${o.cleanupMonths} month${o.cleanupMonths === 1 ? "" : "s"}: ${money(p.cleanupQuote)}.`;
  if (p.competitor) {
    const c = p.competitor;
    text += ` At a competitor's ${money(c.fee)} you would earn ${money(c.effectiveHourly)} an hour.`;
  }
  return { status: p.competitor && p.competitor.status === "below-walk-away" ? "walk" : "ok", text };
}

/** Parse roster rows: client,fee,hours[,software]. Never throws; errors carry line numbers. */
export function parseRoster(text) {
  const clients = [];
  const errors = [];
  let seenHeader = false;
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const f = line.split(",").map((s) => s.trim());
    if (!seenHeader && /^(client|name)$/i.test(f[0])) { seenHeader = true; return; }
    seenHeader = true;
    const at = `Line ${i + 1}`;
    if (f.length < 3) { errors.push(`${at}: expected client,fee,hours[,software]`); return; }
    const fee = toNumber(f[1]);
    const hours = toNumber(f[2]);
    const software = f[3] === undefined || f[3] === "" ? 0 : toNumber(f[3]);
    if (!f[0]) errors.push(`${at}: client name is empty`);
    else if (fee === null || fee < 0) errors.push(`${at}: fee must be a number of dollars, zero or more`);
    else if (hours === null || hours <= 0) errors.push(`${at}: hours must be greater than zero`);
    else if (software === null || software < 0) errors.push(`${at}: software must be a number, zero or more`);
    else clients.push({ name: f[0], fee, hours, software });
  });
  if (clients.length > MAX_CLIENTS) errors.push(`Too many clients: ${clients.length} (limit ${MAX_CLIENTS})`);
  return { clients, errors };
}

/** Rank roster clients worst effective hourly first and size the raise each needs. */
export function roster(parsed, raw = {}) {
  const o = normalizeOptions(raw);
  const clients = (parsed.clients || []).map((c) => {
    const effective = (c.fee - c.software) / c.hours;
    const neededFee = c.hours * o.targetHourly + c.software;
    const raise = Math.max(0, neededFee - c.fee);
    return { ...c, effective, neededFee, raise, raisePct: c.fee > 0 ? raise / c.fee : null, atTarget: raise <= 1e-9 };
  }).sort((a, b) => a.effective - b.effective || a.name.localeCompare(b.name));
  const fee = clients.reduce((a, c) => a + c.fee, 0);
  const hours = clients.reduce((a, c) => a + c.hours, 0);
  const software = clients.reduce((a, c) => a + c.software, 0);
  const totalRaise = clients.reduce((a, c) => a + c.raise, 0);
  return {
    options: o,
    clients,
    below: clients.filter((c) => !c.atTarget).length,
    fee, hours, software, totalRaise,
    blendedHourly: hours > 0 ? (fee - software) / hours : null,
    blendedAtTarget: hours > 0 ? (fee + totalRaise - software) / hours : null,
  };
}

export function summarizeRoster(r) {
  if (!r.clients.length) return { status: "empty", text: "No clients." };
  const o = r.options;
  if (!r.below) return { status: "ok", text: `All ${r.clients.length} clients meet ${money(o.targetHourly)} an hour; blended ${money(r.blendedHourly)}.` };
  const worst = r.clients[0];
  return {
    status: "raise",
    text: `${r.below} of ${r.clients.length} clients are below ${money(o.targetHourly)} an hour (blended ${money(r.blendedHourly)}); raising them to target adds ${money(r.totalRaise)} a month. Lowest: ${worst.name} at ${money(worst.effective)} an hour, needs +${money(worst.raise)}.`,
  };
}
