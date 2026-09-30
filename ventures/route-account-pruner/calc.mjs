// Route account pruner. Pure functions, no DOM, no network.
// An hour of route time (on site plus driving) is worth T dollars to the owner: what
// that hour would earn refilled, redeployed or simply not worked. An account's surplus is
// what it brings in after materials and vehicle cost, minus T for every hour it takes.
// Repricing is searched on a grid and discounted by an assumed cancellation rate that the
// user types (nothing in a single snapshot of accounts can measure it). A cancelled
// account leaves surplus 0, because its hours go back to being worth T.

export const num = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "n/a");
export const money = (v) => (Number.isFinite(v) ? (v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : "n/a");
export const pct = (v, d = 1) => (Number.isFinite(v) ? (v * 100).toFixed(d) + "%" : "n/a");

const MIN_ACCOUNTS = 5;
const MAX_ACCOUNTS = 2000;
const STEP = 0.01;
export const DEFAULTS = { targetPerHour: 65, vehiclePerHour: 12, churnPer10: 0.1, maxIncrease: 0.25, billing: "month" };

const moneyNum = (s) => {
  const t = String(s).trim().replace(/^\((.*)\)$/, "-$1").replace(/[$€£,\s]/g, "");
  if (t === "" || !/^-?\d*\.?\d+$/.test(t)) return NaN;
  return Number(t);
};

// Rows: account, price, visits per month, minutes on site, drive minutes, materials per month (optional).
export function parseRows(text) {
  const warnings = [];
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { error: "Paste or upload one row per account: name, price, visits per month, minutes on site, drive minutes, and optionally materials cost per month." };
  const delim = lines[0].includes("\t") ? "\t" : lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
  const split = (l) => {
    const cells = [];
    let cur = "", q = false;
    for (const ch of l) {
      if (ch === '"') q = !q;
      else if (ch === delim && !q) { cells.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  };
  let rows = lines.map(split);
  let ci = { name: 0, price: 1, visits: 2, onsite: 3, drive: 4, mat: 5 };
  const looksHeader = rows[0].some((c) => /[a-z]/i.test(c)) && rows[0].slice(1, 5).every((c) => Number.isNaN(moneyNum(c)));
  if (looksHeader) {
    const head = rows[0].map((h) => h.toLowerCase());
    const used = new Set();
    const pick = (re, fallback) => {
      const i = head.findIndex((h, k) => !used.has(k) && re.test(h));
      const r = i >= 0 ? i : fallback;
      if (r >= 0) used.add(r);
      return r;
    };
    const name = pick(/name|account|customer|client|address/, 0);
    const price = pick(/price|rate|fee|charge|revenue|billing|monthly|per visit/, 1);
    const drive = pick(/drive|travel|transit|commute/, 4);
    const visits = pick(/visit|frequency|stops|times/, 2);
    const onsite = pick(/on.?site|service|work|job|labor|minutes/, 3);
    const mat = pick(/material|chem|supply|supplies|cost|dump|disposal/, -1);
    ci = { name, price, visits, onsite, drive, mat };
    rows = rows.slice(1);
  }
  if ((rows[0]?.length || 0) < 5) return { error: "Each row needs five values: account, price, visits per month, minutes on site, drive minutes (materials cost per month is optional)." };
  const accounts = [];
  let skipped = 0;
  rows.forEach((c, idx) => {
    const a = {
      name: (c[ci.name] || "").trim() || "Account " + (idx + 1),
      price: moneyNum(c[ci.price] ?? ""), visits: moneyNum(c[ci.visits] ?? ""), onsite: moneyNum(c[ci.onsite] ?? ""),
      drive: moneyNum(c[ci.drive] ?? ""), materials: ci.mat >= 0 && (c[ci.mat] ?? "") !== "" ? moneyNum(c[ci.mat]) : 0,
    };
    const ok = [a.price, a.visits, a.onsite, a.drive, a.materials].every(Number.isFinite) &&
      a.price > 0 && a.visits > 0 && a.visits <= 62 && a.onsite > 0 && a.onsite <= 1440 && a.drive >= 0 && a.drive <= 600 && a.materials >= 0 && a.price <= 1e6;
    if (ok) accounts.push(a); else skipped++;
  });
  if (skipped) warnings.push(`${skipped} row${skipped === 1 ? "" : "s"} skipped: a price, visit count, minutes on site or drive minutes was missing, not a number, or out of range.`);
  if (accounts.length > MAX_ACCOUNTS) return { error: `More than ${MAX_ACCOUNTS} accounts; split the file.` };
  return { accounts, warnings };
}

export function accountEconomics(a, o) {
  const monthly = o.billing === "visit" ? a.price * a.visits : a.price;
  const hours = (a.visits * (a.onsite + a.drive)) / 60;
  const driveHours = (a.visits * a.drive) / 60;
  const vehicle = driveHours * o.vehiclePerHour;
  const net = monthly - a.materials - vehicle; // before the value of the hours
  return { monthly, hours, driveHours, vehicle, net, yieldPerHour: net / hours, surplus: net - o.targetPerHour * hours };
}

const cancelRate = (inc, o) => Math.min(1, Math.max(0, o.churnPer10 * (inc / 0.1)));
function bestIncrease(e, o) {
  let best = { increase: 0, expected: e.surplus, churn: 0 };
  for (let k = 1; k * STEP <= o.maxIncrease + 1e-9; k++) {
    const inc = k * STEP;
    const s = e.surplus + e.monthly * inc;
    const c = cancelRate(inc, o);
    if (c >= 1 - 1e-9) break; // certain cancellation is a drop, not a price
    const expected = (1 - c) * s;
    if (expected > best.expected + 1e-9) best = { increase: k / 100, expected, churn: c };
  }
  return best;
}

function decide(e, o) {
  const needed = e.surplus >= 0 ? 0 : -e.surplus / e.monthly;
  // An account already earning its hours is left alone: repricing is for the ones that do not.
  if (e.surplus >= 0) return { action: "keep", expected: e.surplus, neededIncrease: 0, repriceExpected: e.surplus };
  const up = bestIncrease(e, o);
  const options = [
    { action: "keep", expected: e.surplus },
    { action: "reprice", expected: up.expected, increase: up.increase, churn: up.churn },
    { action: "drop", expected: 0 },
  ];
  // Ties go to keep, then reprice, so a neutral account is never dropped.
  let best = options[0];
  for (const x of options.slice(1)) if (x.expected > best.expected + 1e-9) best = x;
  return { ...best, neededIncrease: needed, repriceExpected: up.expected };
}

export function analyze(accounts, opts = {}) {
  const o = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (opts[k] !== undefined && opts[k] !== "" && opts[k] !== null) o[k] = opts[k];
  if (!Array.isArray(accounts) || accounts.length < MIN_ACCOUNTS) return { error: `Need at least ${MIN_ACCOUNTS} accounts to rank them against each other.` };
  for (const k of ["targetPerHour", "vehiclePerHour"]) if (!Number.isFinite(o[k]) || o[k] < 0) return { error: "Hour values must be zero or more." };
  if (o.targetPerHour <= 0) return { error: "Enter what an hour of route time is worth to you (more than zero); the tool cannot rank accounts without it." };
  if (!Number.isFinite(o.churnPer10) || o.churnPer10 < 0 || o.churnPer10 > 1) return { error: "Cancellation rate per 10% increase must be between 0% and 100%." };
  if (!Number.isFinite(o.maxIncrease) || o.maxIncrease < 0 || o.maxIncrease > 1) return { error: "Largest increase to consider must be between 0% and 100%." };
  const warnings = [];
  const rows = accounts.map((a) => {
    const e = accountEconomics(a, o);
    return { ...a, ...e, ...decide(e, o) };
  });
  rows.sort((x, y) => x.surplus / x.hours - y.surplus / y.hours);
  const hours = rows.reduce((s, r) => s + r.hours, 0);
  const revenue = rows.reduce((s, r) => s + r.monthly, 0);
  const surplusNow = rows.reduce((s, r) => s + r.surplus, 0);
  const surplusPlan = rows.reduce((s, r) => s + r.expected, 0);
  const dropped = rows.filter((r) => r.action === "drop");
  const repriced = rows.filter((r) => r.action === "reprice");
  const freedHours = dropped.reduce((s, r) => s + r.hours, 0);
  const driveShare = rows.reduce((s, r) => s + r.driveHours, 0) / hours;
  const below = rows.filter((r) => r.surplus < 0);
  const belowShare = below.length / rows.length;
  if (driveShare > 0.4) warnings.push(`Driving is ${pct(driveShare, 0)} of your route hours. Route density, not pricing, may be the larger lever: a cluster of nearby accounts beats repricing a far one.`);
  if (rows.some((r) => r.drive === 0)) warnings.push("Some accounts have 0 drive minutes. Enter the extra driving each one adds to your day, not zero, or they will look better than they are.");
  if (!below.length) warnings.push("Every account clears the value you gave an hour of route time. Raise that number if you could use the hours better, and the ranking will tighten.");
  // Sensitivity: how many accounts change verdict if an hour is worth 20% less or more.
  const sens = [0.8, 1, 1.2].map((m) => {
    const so = { ...o, targetPerHour: o.targetPerHour * m };
    const acts = accounts.map((a) => decide(accountEconomics(a, so), so).action);
    return { factor: m, targetPerHour: so.targetPerHour, drop: acts.filter((x) => x === "drop").length, reprice: acts.filter((x) => x === "reprice").length, keep: acts.filter((x) => x === "keep").length };
  });
  return { options: o, n: rows.length, rows, hours, revenue, surplusNow, surplusPlan, gain: surplusPlan - surplusNow, dropped: dropped.length, repriced: repriced.length, freedHours, driveShare, belowShare, warnings, sens };
}

export function sampleText() {
  // 40 invented lawn-care accounts: some tight, some far away or long for their price.
  let s = 7;
  const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  const out = ["account,price per month,visits per month,minutes on site,drive minutes,materials per month"];
  for (let i = 1; i <= 40; i++) {
    const far = rnd() < 0.25;
    const lot = 25 + Math.round(rnd() * 70);
    const drive = far ? 18 + Math.round(rnd() * 22) : 4 + Math.round(rnd() * 8);
    const price = Math.round((lot * 1.15 + 14 + rnd() * 12) / 5) * 5;
    out.push(`Account ${i},${price * 4},4,${lot},${drive},${Math.round(8 + rnd() * 20)}`);
  }
  return out.join("\n");
}

export function reportCsv(r) {
  const head = "account,monthly revenue,route hours per month,yield per hour,surplus per month,action,price increase,expected surplus after action";
  const rows = r.rows.map((x) => [x.name.replace(/,/g, " "), x.monthly.toFixed(2), x.hours.toFixed(2), x.yieldPerHour.toFixed(2), x.surplus.toFixed(2), x.action, x.action === "reprice" ? (x.increase * 100).toFixed(0) + "%" : "", x.expected.toFixed(2)].join(","));
  return [head, ...rows].join("\n") + "\n";
}
