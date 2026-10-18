// Used car lot aging planner: for each unit on an independent dealer's lot,
// what has it cost to carry so far, what does it cost per day now, on which
// day should it stop being retailed and go to wholesale, and which units free
// the most floorplan line per dollar given up?
//
// Model, per unit, one day at a time from today's age `a0` up to the
// floorplan's maximum age `H` (where an unsold unit must be paid off, so it is
// wholesaled):
//
//   balance B(t)   = floored amount x (1 - curtailment % paid by age t)
//   carry   c(t)   = B(t) x APR / 365                (floorplan interest)
//                  + (cost - B(t)) x cash rate / 365 (your own cash in the car)
//                  + daily holding cost              (insurance, lot, upkeep)
//   line    l(t)   = B(t) / 1000 x line value        (what that line would earn
//                                                      on a replacement unit;
//                                                      decision only, not carry)
//   retail  P(t)   = expected retail price, falling by your drop per 30 days
//   whsl    W(t)   = wholesale value, falling by your drop per 30 days
//   q              = daily chance of a retail sale = 1 / expected days to sell
//
// Each day you either wholesale (receive W(t)) or keep it listed: you pay
// c(t) + l(t) and it retails at P(t) with chance q, otherwise it is a day
// older. Unsold at H, it is wholesaled at W(H).
//
// The only thing that changes while the unit is unsold is its age, so every
// plan is "wholesale at age T if it has not retailed by then", for some T in
// [a0, H]. Backward induction over age finds the best T exactly; the tests
// check it against computing every T directly. Pure functions, no network,
// no dependencies.

export const MODEL_NOTE =
  "Each day a unit stays: carrying = floorplan balance x APR/365 + your own cash in the unit x cash rate/365 + daily holding cost (+ line value per $1,000 of balance, if set). " +
  "It retails that day with chance 1/expected days to sell at your expected retail price; otherwise it ages a day and both prices fall by your drop per 30 days. " +
  "The wholesale day is the exact best for the numbers you supply, not a forecast or advice.";

export const INPUT_NOTES = [
  { what: "A12,48,14200,13000,17995,13600,450,300,30,9", detail: "One unit per row: stock,days on lot,total cost,floored amount,expected retail price,wholesale value today,retail drop per 30 days,wholesale drop per 30 days,expected days to retail,daily holding cost[,note]. Dollars as plain numbers." },
  { what: "Total cost / floored amount", detail: "Total cost is everything in the unit (purchase, fees, transport, recon). Floored amount is what the floorplan lender advanced against it; the rest is your own cash." },
  { what: "Expected retail price / retail drop", detail: "What you expect it to actually sell for today after negotiation (from your comps), and how many dollars that expectation falls every 30 days it sits." },
  { what: "Wholesale value / wholesale drop", detail: "What auction or a wholesaler would net you today after fees, and how fast that falls every 30 days." },
  { what: "Expected days to retail", detail: "How many more days you expect it to take to retail at that price; the daily chance of a sale is one over this number." },
  { what: "Curtailments", detail: "Option like 90:10,120:10,150:10 — at 90 days on the lot pay down 10% of the floored amount, and so on. Paid-down principal becomes your own cash, charged at your cash rate." },
  { what: "Header row and # comments", detail: "A first row starting with stock, blank lines and lines starting with # are skipped. Avoid commas inside stock numbers." },
];

export const MAX_UNITS = 500;
export const MAX_AGE = 730;
const EPS = 1e-9;

export function money(n) {
  const v = Math.round(n * 100) / 100;
  const abs = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 && abs !== "0.00" ? "-" : ""}$${abs}`;
}

function num(cell, what, where, errors, { min = 0, integer = false, above = false } = {}) {
  const raw = String(cell ?? "").replace(/[$,\s]/g, "");
  const v = Number(raw);
  const bad = raw === "" || !Number.isFinite(v) || v < min || (above && v <= min) || (integer && !Number.isInteger(v));
  if (bad) {
    errors.push(`${where}: ${what} must be ${integer ? "a whole number" : "a number"}, ${above ? `above ${min}` : `${min} or more`}`);
    return null;
  }
  return v;
}

const COLUMNS = "stock,days,cost,floored,retail,wholesale,retail_drop_30,wholesale_drop_30,days_to_sell,daily_hold";

export function parseUnits(text) {
  const units = [];
  const errors = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const cells = line.split(",").map((c) => c.trim());
    if (/^(stock|unit)$/i.test(cells[0])) return;
    const where = `line ${i + 1}`;
    if (cells.length < 10) {
      errors.push(`${where}: expected ${COLUMNS}`);
      return;
    }
    const before = errors.length;
    const days = num(cells[1], "days on lot", where, errors, { integer: true });
    const cost = num(cells[2], "total cost", where, errors, { above: true });
    const floored = num(cells[3], "floored amount", where, errors);
    const retail = num(cells[4], "expected retail price", where, errors);
    const wholesale = num(cells[5], "wholesale value", where, errors);
    const retailDrop = num(cells[6], "retail drop per 30 days", where, errors);
    const wholesaleDrop = num(cells[7], "wholesale drop per 30 days", where, errors);
    const daysToSell = num(cells[8], "expected days to retail", where, errors, { min: 1 });
    const dailyHold = num(cells[9], "daily holding cost", where, errors);
    if (errors.length > before) return;
    if (days > MAX_AGE) {
      errors.push(`${where}: days on lot above ${MAX_AGE}`);
      return;
    }
    units.push({ stock: cells[0] || `Unit ${units.length + 1}`, days, cost, floored, retail, wholesale, retailDrop, wholesaleDrop, daysToSell, dailyHold, note: cells.slice(10).join(",") });
  });
  if (units.length > MAX_UNITS) errors.push(`at most ${MAX_UNITS} units; split the lot`);
  return { units, errors };
}


export function parseCurtailments(spec) {
  if (Array.isArray(spec)) return spec;
  const s = String(spec ?? "").trim();
  if (!s || s.toLowerCase() === "none") return [];
  const out = [];
  for (const part of s.split(/[,;\s]+/).filter(Boolean)) {
    const m = /^(\d+):(\d+(?:\.\d+)?)%?$/.exec(part);
    if (!m) throw new Error(`curtailment "${part}" must look like 90:10 (day:percent)`);
    out.push({ day: Number(m[1]), pct: Number(m[2]) });
  }
  out.sort((a, b) => a.day - b.day);
  if (out.reduce((t, c) => t + c.pct, 0) > 100 + EPS) throw new Error("curtailments add up to more than 100%");
  return out;
}

const DEFAULTS = { apr: 9, cashRate: 6, lineValue: 0, maxAge: 180, curtailments: "90:10,120:10,150:10" };

export function normalizeOptions(raw = {}) {
  const o = { ...DEFAULTS };
  for (const [k, v] of Object.entries(raw)) if (v !== undefined && v !== null && v !== "") o[k] = v;
  const out = {};
  for (const k of ["apr", "cashRate", "lineValue"]) {
    const v = Number(o[k]);
    if (!Number.isFinite(v) || v < 0) throw new Error(`${k} must be a number, zero or more`);
    out[k] = v;
  }
  const h = Number(o.maxAge);
  if (!Number.isInteger(h) || h < 1 || h > MAX_AGE) throw new Error(`maxAge must be a whole number of days from 1 to ${MAX_AGE}`);
  out.maxAge = h;
  out.curtailments = parseCurtailments(o.curtailments);
  return out;
}

// Floorplan balance on the day the unit is `t` days old: curtailments due on
// or before day t have been paid.
export function balance(u, t, o) {
  let paid = 0;
  for (const c of o.curtailments) if (c.day <= t) paid += c.pct;
  return u.floored * Math.max(0, 1 - paid / 100);
}

// Carrying cost of day t, split into its parts.
export function dayCost(u, t, o) {
  const b = balance(u, t, o);
  const interest = (b * o.apr) / 100 / 365;
  const ownCash = (Math.max(0, u.cost - b) * o.cashRate) / 100 / 365;
  const line = (b / 1000) * o.lineValue;
  return { balance: b, interest, ownCash, hold: u.dailyHold, carry: interest + ownCash + u.dailyHold, line };
}

export const retailAt = (u, t) => Math.max(0, u.retail - (u.retailDrop * (t - u.days)) / 30);
export const wholesaleAt = (u, t) => Math.max(0, u.wholesale - (u.wholesaleDrop * (t - u.days)) / 30);

// Carrying cost already spent: every day from arrival (age 0) to yesterday.
export function carryToDate(u, o) {
  let s = 0;
  for (let t = 0; t < u.days; t += 1) s += dayCost(u, t, o).carry;
  return s;
}

const horizon = (u, o) => Math.max(u.days, o.maxAge);

// Expected outcome of one plan: retail daily until age T, wholesale at T if
// still unsold. Direct sum, used for the "wait" policy and as the reference
// the backward induction must agree with.
export function evaluatePlan(u, T, o) {
  const q = 1 / u.daysToSell;
  let survive = 1;
  let value = 0;
  let carry = 0;
  let lineCost = 0;
  let lineDays = 0;
  let days = 0;
  for (let t = u.days; t < T; t += 1) {
    const d = dayCost(u, t, o);
    value += survive * (q * retailAt(u, t) - d.carry - d.line);
    carry += survive * d.carry;
    lineCost += survive * d.line;
    lineDays += survive * d.balance;
    days += survive;
    survive *= 1 - q;
  }
  value += survive * wholesaleAt(u, T);
  return { T, value, carry, lineCost, lineDays, days, retailChance: 1 - survive };
}

// Exact best wholesale day by backward induction over age. Ties go to the
// earlier day (same expected dollars, less line used).
export function bestDay(u, o) {
  const H = horizon(u, o);
  const q = 1 / u.daysToSell;
  let next = wholesaleAt(u, H);
  let stopFrom = H;
  // Best value of any plan that keeps the unit listed at least today (null
  // when the unit is already at the limit and cannot be kept).
  let keepToday = null;
  for (let t = H - 1; t >= u.days; t -= 1) {
    const d = dayCost(u, t, o);
    const keep = -d.carry - d.line + q * retailAt(u, t) + (1 - q) * next;
    const stop = wholesaleAt(u, t);
    if (t === u.days) keepToday = keep;
    if (stop >= keep - EPS) {
      next = stop;
      stopFrom = t;
    } else {
      next = keep;
    }
  }
  return { T: stopFrom, value: next, keepToday };
}

function analyzeUnit(u, o) {
  const H = horizon(u, o);
  const best = bestDay(u, o);
  const plan = evaluatePlan(u, best.T, o);
  const wait = evaluatePlan(u, H, o);
  const now = evaluatePlan(u, u.days, o);
  const toDate = carryToDate(u, o);
  const today = dayCost(u, u.days, o);
  const holdGain = plan.value - now.value; // what keeping it listed adds over wholesaling today
  // Dollars the unit earns over wholesaling today, before charging the line's
  // own opportunity value, per $1,000 of floorplan line per day it uses.
  const perLineDay = plan.lineDays > EPS ? (holdGain + plan.lineCost) / (plan.lineDays / 1000) : null;
  return {
    stock: u.stock,
    note: u.note,
    days: u.days,
    cost: u.cost,
    carryToDate: toDate,
    carryPerDay: today.carry,
    today,
    wholesaleAge: best.T,
    wholesaleIn: best.T - u.days,
    action: best.T === u.days ? "wholesale now" : best.T >= H ? "retail to the floorplan limit" : `retail, wholesale at day ${best.T} if unsold`,
    retailChance: plan.retailChance,
    expectedValue: plan.value,
    expectedProfit: plan.value + plan.lineCost - u.cost - toDate,
    wholesaleNow: wholesaleAt(u, u.days),
    holdGain,
    perLineDay,
    expectedDays: plan.days,
    lineDays: plan.lineDays,
    waitValue: wait.value,
    waitLineDays: wait.lineDays,
    leftByWaiting: plan.value - wait.value,
    keepCost: best.keepToday === null ? null : now.value - best.keepToday,
    forcedNow: u.days >= o.maxAge,
  };
}

export function plan(parsed, rawOptions = {}) {
  const o = normalizeOptions(rawOptions);
  const rows = parsed.units.map((u) => analyzeUnit(u, o));
  // Wholesale-now units first (they free line today), then the units that
  // earn the least per $1,000 of line per day, so the top of the list is the
  // first place to look for line.
  const ranked = [...rows].sort((a, b) => {
    const an = a.wholesaleIn === 0 ? 0 : 1;
    const bn = b.wholesaleIn === 0 ? 0 : 1;
    if (an !== bn) return an - bn;
    const av = a.perLineDay ?? Infinity;
    const bv = b.perLineDay ?? Infinity;
    return av - bv || a.holdGain - b.holdGain;
  });
  const sum = (f) => rows.reduce((s, r) => s + f(r), 0);
  const now = rows.filter((r) => r.wholesaleIn === 0);
  const findings = [];
  for (const r of rows) {
    if (r.forcedNow) findings.push({ severity: "warn", rule: "limit", message: `${r.stock}: already at or past the ${o.maxAge}-day floorplan limit, so the plan pays it off by wholesaling now.` });
    else if (r.wholesaleIn === 0) findings.push({ severity: "warn", rule: "wholesale", message: `${r.stock}: wholesale now at ${money(r.wholesaleNow)} — the best plan that keeps it listed even one more day is expected to be worth ${money(r.keepCost)} less.` });
    if (r.expectedProfit < 0) findings.push({ severity: "info", rule: "loss", message: `${r.stock}: expected to finish ${money(r.expectedProfit)} under total cost plus carry to date; that money is already spent, so the plan ignores it when picking the day.` });
  }
  return {
    options: o,
    units: parsed.units,
    rows,
    ranked,
    totals: {
      units: rows.length,
      carryToDate: sum((r) => r.carryToDate),
      carryPerDay: sum((r) => r.carryPerDay),
      balance: sum((r) => r.today.balance),
      wholesaleNow: now.length,
      lineFreedNow: now.reduce((s, r) => s + r.today.balance, 0),
      planValue: sum((r) => r.expectedValue),
      waitValue: sum((r) => r.waitValue),
      leftByWaiting: sum((r) => r.leftByWaiting),
      planLineDays: sum((r) => r.lineDays),
      waitLineDays: sum((r) => r.waitLineDays),
      expectedProfit: sum((r) => r.expectedProfit),
    },
    findings,
  };
}

export function summarize(p) {
  const t = p.totals;
  if (!t.units) return { status: "none", text: "No units entered." };
  const gain = t.leftByWaiting;
  const text =
    `${t.units} units cost ${money(t.carryPerDay)} a day to carry (${money(t.carryToDate)} so far). ` +
    `Wholesale ${t.wholesaleNow} now${t.wholesaleNow ? `, freeing ${money(t.lineFreedNow)} of floorplan line` : ""}. ` +
    (gain > 0.005
      ? `Following the plan is worth ${money(gain)} more in expected dollars${p.options.lineValue > 0 ? " (counting your line value)" : ""} than holding every unit until it retails or hits ${p.options.maxAge} days.`
      : "Holding every unit until it retails does as well on these numbers.");
  return { status: gain > 0.005 ? "gain" : "ok", text };
}
