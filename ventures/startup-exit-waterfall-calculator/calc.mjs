// Startup exit waterfall: who gets paid what when a company is sold.
// Pure arithmetic on the terms the visitor types in; no I/O, no imports.

export const money = (v) => (v == null || !Number.isFinite(v) ? "n/a" : (v < 0 ? "-" : "") + "$" + Math.round(Math.abs(v)).toLocaleString("en-US"));
export const money2 = (v) => (v == null || !Number.isFinite(v) ? "n/a" : (v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const pct = (v) => (v == null || !Number.isFinite(v) ? "n/a" : (Math.round(v * 1000) / 10) + "%");
export const shares = (v) => (v == null || !Number.isFinite(v) ? "n/a" : Math.round(v).toLocaleString("en-US"));

const num = (v) => {
  if (typeof v === "number") return v;
  const s = String(v ?? "").replace(/[$,%\s]/g, "");
  if (s === "") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

const EPS = 1e-6;

// Turns the raw form values into a validated model, or { error }.
export function normalize(raw) {
  const exit = num(raw.exit), debt = num(raw.debt), feePct = num(raw.feePct), carvePct = num(raw.carvePct);
  if (![exit, debt, feePct, carvePct].every(Number.isFinite)) return { error: "Exit price, debt, fees and carve-out must be numbers." };
  if (exit < 0 || debt < 0) return { error: "Exit price and debt cannot be negative." };
  if (feePct < 0 || feePct > 50 || carvePct < 0 || carvePct > 50) return { error: "Fees and the carve-out must be between 0% and 50%." };

  const common = [], options = [], preferred = [];
  for (const r of raw.common || []) {
    const s = num(r.shares);
    if (!Number.isFinite(s) || s < 0) return { error: `Common shares for "${r.name || "a holder"}" must be a number of zero or more.` };
    if (s > 0) common.push({ name: String(r.name || "").trim() || "Common", shares: s });
  }
  for (const r of raw.options || []) {
    const s = num(r.shares), k = num(r.strike);
    if (!Number.isFinite(s) || s < 0 || !Number.isFinite(k) || k < 0) return { error: `Options for "${r.name || "a holder"}" need a share count and a strike price of zero or more.` };
    if (s > 0) options.push({ name: String(r.name || "").trim() || "Options", shares: s, strike: k });
  }
  for (const r of raw.preferred || []) {
    const s = num(r.shares), inv = num(r.invested);
    if (!(s > 0) && !(inv > 0)) continue;
    const name = String(r.name || "").trim() || "Preferred";
    const multiple = r.multiple === "" || r.multiple == null ? 1 : num(r.multiple);
    const div = num(r.dividend), years = num(r.years), cap = num(r.cap), rank = r.rank === "" || r.rank == null ? 1 : num(r.rank);
    const part = r.participation === "full" || r.participation === "capped" ? r.participation : "none";
    if (!(s > 0)) return { error: `${name}: enter the number of shares (as converted to common).` };
    if (!Number.isFinite(inv) || inv < 0) return { error: `${name}: amount invested must be a number of zero or more.` };
    if (!Number.isFinite(multiple) || multiple < 0 || multiple > 20) return { error: `${name}: liquidation multiple must be between 0 and 20.` };
    if (!Number.isFinite(div) || div < 0 || div > 50 || !Number.isFinite(years) || years < 0 || years > 30) return { error: `${name}: dividend must be 0-50% a year over 0-30 years.` };
    if (part === "capped" && !(cap > 0)) return { error: `${name}: a capped participation needs a total cap multiple above zero (for example 3).` };
    if (!Number.isFinite(rank) || rank < 1) return { error: `${name}: seniority must be 1 or higher (1 is paid first, equal numbers share pari passu).` };
    preferred.push({ name, shares: s, invested: inv, multiple, claim: inv * multiple + inv * (div / 100) * years, participation: part, capTotal: part === "capped" ? cap * inv : Infinity, rank });
  }
  if (common.length + options.length === 0) return { error: "Enter at least one common holder or option pool." };
  return { exit, debt, feePct, carvePct, common, options, preferred };
}

export function netProceeds(m, exit = m.exit) {
  const fees = exit * m.feePct / 100;
  const afterDebt = Math.max(0, exit - m.debt - fees);
  const carve = afterDebt * m.carvePct / 100;
  return { fees, debtPaid: Math.min(m.debt, exit), carve, net: Math.max(0, afterDebt - carve) };
}

// Sum of what participants take at a per-share price p.
function taken(parts, p) {
  let t = 0;
  for (const x of parts) t += x.w * Math.min(Math.max(p - x.strike, 0), x.capPS);
  return t;
}

// Finds the per-share price p at which the participants absorb exactly `pot`.
function solvePrice(parts, pot) {
  if (pot <= 0 || parts.length === 0) return 0;
  let hi = 1;
  while (taken(parts, hi) < pot && hi < 1e15) hi *= 2;
  if (taken(parts, hi) < pot) return Infinity;
  let lo = 0;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (taken(parts, mid) < pot) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// Pay everyone given a fixed set of converting preferred series.
function distribute(m, net, converts) {
  const out = { pref: m.preferred.map(() => 0), partic: m.preferred.map(() => 0), common: m.common.map(() => 0), options: m.options.map(() => 0), price: 0, unallocated: 0 };
  let left = net;
  const ranks = [...new Set(m.preferred.map((p, i) => (converts[i] ? null : p.rank)).filter((r) => r != null))].sort((a, b) => a - b);
  for (const r of ranks) {
    const idx = m.preferred.map((p, i) => i).filter((i) => !converts[i] && m.preferred[i].rank === r);
    const claim = idx.reduce((s, i) => s + m.preferred[i].claim, 0);
    const pay = Math.min(left, claim);
    for (const i of idx) out.pref[i] = claim > 0 ? pay * m.preferred[i].claim / claim : 0;
    left -= pay;
  }
  const parts = [];
  m.common.forEach((c, i) => parts.push({ kind: "common", i, w: c.shares, strike: 0, capPS: Infinity }));
  m.options.forEach((o, i) => parts.push({ kind: "options", i, w: o.shares, strike: o.strike, capPS: Infinity }));
  m.preferred.forEach((p, i) => {
    if (converts[i]) parts.push({ kind: "conv", i, w: p.shares, strike: 0, capPS: Infinity });
    else if (p.participation !== "none") {
      const room = Math.max(0, p.capTotal - out.pref[i]);
      parts.push({ kind: "partic", i, w: p.shares, strike: 0, capPS: room / p.shares });
    }
  });
  const price = solvePrice(parts, left);
  if (!Number.isFinite(price)) {
    // Every remaining participant is capped and cannot absorb the rest.
    for (const x of parts) {
      const v = x.w * Math.min(Math.max(1e15 - x.strike, 0), x.capPS);
      if (x.kind === "partic") out.partic[x.i] = v; else if (x.kind === "conv") out.partic[x.i] = v;
    }
    out.unallocated = left - taken(parts, 1e15);
    out.price = Infinity;
    return out;
  }
  out.price = price;
  for (const x of parts) {
    const v = x.w * Math.min(Math.max(price - x.strike, 0), x.capPS);
    if (x.kind === "common") out.common[x.i] = v;
    else if (x.kind === "options") out.options[x.i] = v;
    else out.partic[x.i] = v; // participation, or the whole as-converted payout
  }
  return out;
}

const seriesTotal = (d, i) => d.pref[i] + d.partic[i];

// Every series picks convert-or-not to maximise its own payout; iterate to a stable set.
export function waterfallAt(m, exit = m.exit) {
  const n = netProceeds(m, exit);
  const converts = m.preferred.map(() => false);
  let d = distribute(m, n.net, converts);
  for (let step = 0; step < 4 * (m.preferred.length + 1); step++) {
    let bestI = -1, bestGain = EPS;
    for (let i = 0; i < m.preferred.length; i++) {
      const flipped = converts.slice(); flipped[i] = !flipped[i];
      const gain = seriesTotal(distribute(m, n.net, flipped), i) - seriesTotal(d, i);
      if (gain > bestGain) { bestGain = gain; bestI = i; }
    }
    if (bestI < 0) break;
    converts[bestI] = !converts[bestI];
    d = distribute(m, n.net, converts);
  }
  const rows = [];
  m.preferred.forEach((p, i) => {
    const total = seriesTotal(d, i);
    rows.push({ group: "preferred", name: p.name, shares: p.shares, invested: p.invested, payout: total, pref: d.pref[i], participation: d.partic[i], converted: converts[i], perShare: total / p.shares });
  });
  m.common.forEach((c, i) => rows.push({ group: "common", name: c.name, shares: c.shares, payout: d.common[i], perShare: d.common[i] / c.shares }));
  m.options.forEach((o, i) => rows.push({ group: "options", name: o.name, shares: o.shares, strike: o.strike, payout: d.options[i], perShare: d.options[i] / o.shares, underwater: d.options[i] <= EPS }));
  const distributed = rows.reduce((s, r) => s + r.payout, 0);
  return { exit, ...n, rows, price: d.price, unallocated: d.unallocated, distributed, converts };
}

// Smallest exit price at which predicate(waterfallAt(exit)) holds; the
// predicates used here are monotone in exit price.
function firstExit(m, predicate, cap) {
  if (predicate(waterfallAt(m, 0))) return 0;
  let hi = Math.max(1, m.exit);
  while (!predicate(waterfallAt(m, hi))) { hi *= 2; if (hi > cap) return null; }
  let lo = 0;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (predicate(waterfallAt(m, mid))) hi = mid; else lo = mid;
  }
  return hi;
}

export function breakpoints(m) {
  const invested = m.preferred.reduce((s, p) => s + p.invested, 0);
  const cap = Math.max(1e9, (m.exit + m.debt + invested) * 1000);
  const gross = (x) => x; // predicates are on the headline exit price
  const list = [];
  const anyCommon = (w) => w.rows.some((r) => (r.group === "common") && r.payout > 0.005);
  const first = firstExit(m, anyCommon, cap);
  if (first != null && m.common.length) list.push({ label: "Common stockholders receive their first dollar", exit: gross(first), kind: "common" });
  m.preferred.forEach((p, i) => {
    if (p.participation === "full") return;
    const e = firstExit(m, (w) => w.converts[i], cap);
    if (e != null) list.push({ label: `${p.name} is better off converting to common`, exit: gross(e), kind: "convert" });
  });
  return list.sort((a, b) => a.exit - b.exit);
}

export const SWEEP = [0.25, 0.5, 1, 1.5, 2, 3, 5, 10];

export function sweep(m) {
  return SWEEP.map((k) => {
    const w = waterfallAt(m, m.exit * k);
    return { mult: k, exit: m.exit * k, net: w.net, groups: Object.fromEntries(w.rows.map((r) => [r.name + "|" + r.group, r.payout])), rows: w.rows, price: w.price };
  });
}

export function analyze(raw) {
  const m = normalize(raw);
  if (m.error) return m;
  const w = waterfallAt(m);
  const totalShares = m.common.reduce((s, c) => s + c.shares, 0) + m.options.reduce((s, o) => s + o.shares, 0) + m.preferred.reduce((s, p) => s + p.shares, 0);
  const commonRows = w.rows.filter((r) => r.group === "common");
  const commonPay = commonRows.reduce((s, r) => s + r.payout, 0);
  const commonShares = commonRows.reduce((s, r) => s + r.shares, 0);
  const commonOwn = totalShares > 0 ? commonShares / totalShares : 0;
  const commonShare = w.net > 0 ? commonPay / w.net : 0;
  const stack = m.preferred.reduce((s, p) => s + p.claim, 0);
  const points = breakpoints(m);
  const findings = [];

  if (commonShares > 0) {
    findings.push({
      severity: commonShare + 0.02 < commonOwn ? "medium" : "info",
      title: `Common stock takes ${pct(commonShare)} of net proceeds against ${pct(commonOwn)} of the fully diluted shares`,
      detail: commonShare + 0.02 < commonOwn
        ? `Preferred terms move ${money(Math.max(0, commonOwn * w.net - commonPay))} away from common stock at this price compared with a plain pro-rata split of the ${money(w.net)} that reaches shareholders.`
        : `At this price preferred terms cost common stock little compared with a plain pro-rata split of the ${money(w.net)} that reaches shareholders.`,
    });
  }
  if (stack > 0) {
    findings.push({
      severity: w.net < stack ? "medium" : "info",
      title: `Preference stack: ${money(stack)} (${m.preferred.length} series)`,
      detail: w.net < stack
        ? `Net proceeds of ${money(w.net)} do not cover the full stack, so nothing reaches common stock or options at this price and junior series may be paid in part.`
        : `Net proceeds of ${money(w.net)} cover the stack ${(w.net / stack).toFixed(1)} times. Series that are better off converting give up their preference and share as common.`,
    });
  }
  const firstCommon = points.find((p) => p.kind === "common");
  if (firstCommon && firstCommon.exit > 0) findings.push({ severity: "info", title: `Common stock sees its first dollar at an exit price of about ${money(firstCommon.exit)}`, detail: `That is the headline sale price at which debt, fees, any carve-out and every preference have been paid. Below it, the people who hold common stock and options are paid nothing.` });
  for (const r of w.rows.filter((x) => x.group === "preferred")) {
    const p = m.preferred.find((x) => x.name === r.name);
    if (p && p.participation !== "none" && !r.converted) findings.push({ severity: "medium", title: `${p.name} is paid twice: its preference and its share of the rest`, detail: `${p.participation === "capped" ? `Participation stops when its total reaches ${money(p.capTotal)} (${(p.capTotal / p.invested).toFixed(1)}x invested). ` : ""}It collects ${money(r.pref)} as preference plus ${money(r.participation)} from participating, ${money(r.payout)} in all, against ${pct(r.shares / totalShares)} fully diluted ownership.` });
  }
  const dead = w.rows.filter((r) => r.group === "options" && r.underwater);
  if (dead.length) findings.push({ severity: "medium", title: `Options underwater at this price: ${dead.map((r) => r.name).join(", ")}`, detail: `The value per common share (${w.price === Infinity ? "n/a" : money2(w.price)}) is below their strike price, so they are worth nothing at this exit.` });
  if (m.carvePct > 0) findings.push({ severity: "info", title: `Management carve-out takes ${money(w.carve)}`, detail: `A carve-out of ${m.carvePct}% comes off the top before any preference is paid, so every stockholder, preferred included, bears it.` });
  if (w.unallocated > 1) findings.push({ severity: "medium", title: `${money(w.unallocated)} cannot be allocated`, detail: "Every participating series is capped and no common or option holder is left to absorb the remainder. Check that the terms you entered are complete." });

  return { model: m, waterfall: w, totalShares, commonOwn, commonShare, stack, points, sweep: sweep(m), findings };
}

export function reportCsv(r) {
  const lines = [["Holder", "Group", "Shares", "Invested", "Payout", "Per share", "Share of net proceeds"]];
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  for (const x of r.waterfall.rows) lines.push([q(x.name), x.group, Math.round(x.shares), x.invested != null ? Math.round(x.invested) : "", Math.round(x.payout), x.perShare.toFixed(4), r.waterfall.net > 0 ? (x.payout / r.waterfall.net).toFixed(4) : "0"]);
  lines.push([]);
  lines.push(["Exit price", Math.round(r.waterfall.exit)], ["Debt repaid", Math.round(r.waterfall.debtPaid)], ["Fees", Math.round(r.waterfall.fees)], ["Carve-out", Math.round(r.waterfall.carve)], ["Net to shareholders", Math.round(r.waterfall.net)]);
  lines.push([]);
  lines.push(["Breakpoint", "Exit price"]);
  for (const p of r.points) lines.push([q(p.label), Math.round(p.exit)]);
  return lines.map((l) => l.join(",")).join("\n");
}

export const sampleTerms = () => ({
  exit: "60000000", debt: "1500000", feePct: "2", carvePct: "0",
  common: [{ name: "Founders", shares: "6000000" }, { name: "Employees (exercised)", shares: "300000" }],
  options: [{ name: "Employee options", shares: "1200000", strike: "0.40" }],
  preferred: [
    { name: "Seed", invested: "2000000", shares: "1100000", multiple: "1", participation: "none", cap: "", rank: "3", dividend: "0", years: "0" },
    { name: "Series A", invested: "8000000", shares: "1600000", multiple: "1", participation: "none", cap: "", rank: "2", dividend: "0", years: "0" },
    { name: "Series B", invested: "20000000", shares: "2000000", multiple: "1", participation: "capped", cap: "3", rank: "1", dividend: "8", years: "2" },
  ],
});
