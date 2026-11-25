// Front-loaded schedule of values check: each line's markup against the whole job's, which lines carry
// value pulled forward from later work, what a balanced SOV looks like, the least change that brings every
// line inside a tolerance, and (with start and finish months) what the front-loading does to the job's cash.
// Pure functions, no I/O. Money is integer cents.
//
//   job markup        M = total value / total cost - 1
//   balanced value    B_i = cost_i x total value / total cost   (same markup on every line, sums to the contract)
//   loading           L_i = value_i - B_i                         (> 0: value pulled onto this line from others)
//
// A line is "early" when it starts in the first third of the job (by start month, or by its place in the
// list when no months are given) and "late" when it finishes in the last third or its description reads
// like closeout work. Front-loading is value moved from late lines to early ones.

// csvCell (colog.mjs) is the formula-injection guard: a cell starting =, +, -, @, tab or CR gets an apostrophe.
import { parseCsv, parseMoney, dollars, csvCell } from "./colog.mjs";

const HEADERS = {
  item: /^(item|item no\.?|item #|no\.?|#|line|line item)$/,
  desc: /^(description|desc|description of work|scope|work)$/,
  value: /^(scheduled value|scheduled|value|sov value|sov|contract value|price|amount)$/,
  cost: /^(cost|estimated cost|est\.? cost|budget|budget cost|cost estimate|your cost|direct cost)$/,
  start: /^(start|start month|month start|begins|from month)$/,
  finish: /^(finish|finish month|end|end month|month end|ends|to month)$/,
};

// Lines whose work comes at the end of a job whatever their place in the list.
const CLOSEOUT = /close[- ]?out|punch|warrant|as[- ]?built|o\s*&\s*m|operation and maintenance|manuals|commission|start[- ]?up|testing|test and balance|tab\b|training|demobili|final clean|attic stock/i;
// Lines reviewers read first for front-loading.
const UPFRONT = /mobili[sz]|bond|insurance|permit|submittal|general conditions|shop drawing|engineering|design|layout/i;

function mapHeaders(row) {
  const idx = {};
  row.forEach((h, i) => {
    const t = String(h).trim().toLowerCase().replace(/\s+/g, " ");
    for (const [k, re] of Object.entries(HEADERS)) if (idx[k] == null && re.test(t)) { idx[k] = i; break; }
  });
  return idx;
}

const num = (s, fallback) => {
  const t = String(s ?? "").trim().replace(/%$/, "");
  if (t === "") return fallback;
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : null;
};

const ROUND = { cent: 1, dollar: 100, hundred: 10000 };

/**
 * Split `total` cents across lines in proportion to `weights`, each a multiple of `unit` cents, summing
 * exactly to `total` (largest remainder). If `total` is not a multiple of `unit`, the odd cents go to the
 * line with the largest share.
 */
export function apportion(total, weights, unit = 1) {
  const sum = weights.reduce((a, w) => a + w, 0);
  if (!weights.length) return [];
  if (sum <= 0) return weights.map((_, i) => (i === 0 ? total : 0));
  const units = Math.floor(total / unit);
  const odd = total - units * unit;
  const raw = weights.map((w) => (w / sum) * units);
  const out = raw.map(Math.floor);
  let left = units - out.reduce((a, x) => a + x, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) out[order[k][1]]++;
  const res = out.map((u) => u * unit);
  if (odd) res[weights.indexOf(Math.max(...weights))] += odd;
  return res;
}

/**
 * The smallest cost-weighted move from `values` that puts every line's markup within `tol` (a fraction,
 * e.g. 0.1 for 10 points) of the job markup and keeps the total: x_i = clamp(v_i + k x cost_i, low_i, high_i)
 * with k found by bisection. That is the least-squares answer when a dollar moved on a small line counts
 * for more than one on a big line. A line with no cost goes to zero and its value is spread on the rest.
 */
export function withinTolerance(values, costs, tol) {
  const V = values.reduce((a, x) => a + x, 0), C = costs.reduce((a, x) => a + x, 0);
  if (C <= 0) return values.slice();
  const M = V / C - 1;
  const lo = costs.map((c) => c * (1 + Math.max(M - tol, -1)));
  const hi = costs.map((c) => c * (1 + M + tol));
  const at = (k) => values.map((v, i) => Math.min(Math.max(v + k * costs[i], lo[i]), hi[i]));
  const sum = (k) => at(k).reduce((a, x) => a + x, 0);
  // sum(k) rises with k; values sum to V at the bounds' middle, so a root lies in [-span, span].
  const span = (V + values.reduce((a, v) => a + v, 0)) / Math.min(...costs.filter((c) => c > 0)) + 1;
  let a = -span, b = span;
  for (let i = 0; i < 200 && b - a > 1e-12; i++) { const m = (a + b) / 2; if (sum(m) < V) a = m; else b = m; }
  return at((a + b) / 2);
}

/**
 * Round real-valued cents to multiples of `unit` keeping the sum at `total` and, where the units allow,
 * each line inside [lo_i, hi_i]. Plain largest-remainder rounding moved lines that withinTolerance left on
 * the band's edge just outside it, so the "within tolerance" SOV failed its own check (red team, 2026-11-25).
 * Each line starts at its rounded-down value clamped to the whole units inside its band; the units left
 * over (or short) go to the lines with room, largest remainder first. A band too narrow to hold a whole
 * unit keeps the nearest unit. Odd cents (a total that is not a multiple of `unit`) go to a line with room.
 */
export function roundWithin(xs, total, unit, lo, hi) {
  const n = xs.length;
  if (!n) return [];
  const slack = 1e-6; // cents; well inside the check's 1e-9 of markup on any real line
  const U = Math.floor(total / unit), odd = total - U * unit;
  const lu = lo.map((l) => Math.max(Math.ceil((l - slack) / unit), 0));
  const hu = hi.map((h) => Math.floor((h + slack) / unit));
  const q = xs.map((x) => Math.max(x, 0) / unit);
  const out = q.map((v, i) => (lu[i] <= hu[i] ? Math.min(Math.max(Math.floor(v), lu[i]), hu[i]) : Math.round(v)));
  let left = U - out.reduce((a, x) => a + x, 0);
  const byRem = (dir) => q.map((v, i) => [v - out[i], i]).sort((a, b) => dir * (b[0] - a[0]) || a[1] - b[1]).map((p) => p[1]);
  while (left > 0) {
    const room = byRem(1).filter((i) => out[i] < hu[i]);
    const order = room.length ? room : byRem(1).filter((i) => hi[i] > 0);
    const pick = order.length ? order : byRem(1);
    for (const i of pick) { if (left <= 0) break; out[i]++; left--; }
  }
  while (left < 0) {
    const room = byRem(-1).filter((i) => out[i] > lu[i]);
    const pick = room.length ? room : byRem(-1).filter((i) => out[i] > 0);
    for (const i of pick) { if (left >= 0) break; out[i]--; left++; }
  }
  const res = out.map((u) => u * unit);
  if (odd) {
    const fits = res.map((v, i) => i).filter((i) => res[i] + odd <= hi[i] + slack);
    const i = fits.length ? fits.reduce((a, j) => (hi[j] - res[j] > hi[a] - res[a] ? j : a)) : xs.indexOf(Math.max(...xs));
    res[i] += odd;
  }
  return res;
}

/**
 * @param {string} text CSV or tab-separated schedule of values with a header row: Scheduled value and Cost
 *   required; Item, Description, Start and Finish (month numbers, 1 = first month of the job) optional.
 * @param {{tolerance?: string, round?: "cent"|"dollar"|"hundred", retainage?: string, rate?: string, mobilizationCap?: string}} settings
 */
export function compute(text, settings = {}) {
  const out = { lines: [], errors: [], findings: [], totals: null, months: null };
  const grid = parseCsv(text);
  if (grid.length < 2) { out.errors.push("Paste a header row and at least one line."); return out; }
  const idx = mapHeaders(grid[0]);
  if (idx.value == null) { out.errors.push("No scheduled value column. Name a column 'Scheduled value'."); return out; }
  if (idx.cost == null) { out.errors.push("No cost column. Name a column 'Cost' with your estimated cost for each line."); return out; }
  const tolPts = num(settings.tolerance, 10);
  const ret = num(settings.retainage, 10);
  const rate = num(settings.rate, 0);
  const mobCap = num(settings.mobilizationCap, null);
  if (tolPts == null || tolPts > 500) { out.errors.push("Tolerance must be a number of percentage points, 0 to 500."); return out; }
  if (ret == null || ret > 100) { out.errors.push("Retainage must be a percentage from 0 to 100."); return out; }
  if (rate == null || rate > 100) { out.errors.push("Cost of money must be a yearly percentage from 0 to 100."); return out; }
  if (String(settings.mobilizationCap ?? "").trim() !== "" && (mobCap == null || mobCap > 100)) { out.errors.push("The mobilization cap must be a percentage from 0 to 100, or blank."); return out; }
  const unit = Object.hasOwn(ROUND, settings.round ?? "") ? ROUND[settings.round] : 1;
  const hasMonths = idx.start != null && idx.finish != null;

  for (let r = 1; r < grid.length; r++) {
    const row = grid[r], get = (k) => (idx[k] == null ? "" : String(row[idx[k]] ?? "").trim());
    const item = get("item"), desc = get("desc");
    const label = item ? `Item ${item}${desc ? ` (${desc})` : ""}` : desc || `Row ${r + 1}`;
    const value = parseMoney(get("value")), cost = parseMoney(get("cost"));
    if (value == null || cost == null) { out.errors.push(`Row ${r + 1} (${label}): ${value == null ? "scheduled value" : "cost"} is not a dollar figure.`); continue; }
    if (value < 0 || cost < 0) { out.errors.push(`Row ${r + 1} (${label}): scheduled value and cost cannot be negative. Put deductive change orders in the change order log, not the original SOV.`); continue; }
    let start = null, finish = null;
    if (hasMonths) {
      start = num(get("start"), null); finish = num(get("finish"), null);
      if (start == null || finish == null || !Number.isInteger(start) || !Number.isInteger(finish) || start < 1 || finish < start || finish > 120) {
        out.errors.push(`Row ${r + 1} (${label}): start and finish must be whole month numbers from 1, with finish not before start.`); continue;
      }
    }
    out.lines.push({ item, desc, label, value, cost, start, finish, closeout: CLOSEOUT.test(desc), upfront: UPFRONT.test(desc) });
  }
  if (out.errors.length) return out;
  const L = out.lines;
  if (!L.length) { out.errors.push("No lines to check."); return out; }
  const V = L.reduce((a, x) => a + x.value, 0), C = L.reduce((a, x) => a + x.cost, 0);
  if (C <= 0) { out.errors.push("The cost column adds up to zero. Put your estimated cost on each line."); return out; }
  if (V <= 0) { out.errors.push("The scheduled values add up to zero."); return out; }
  const M = V / C - 1, tol = tolPts / 100;

  // Early / late by month, else by place in the list.
  const N = hasMonths ? Math.max(...L.map((x) => x.finish)) : L.length;
  L.forEach((x, i) => {
    const s = hasMonths ? x.start : i + 1, f = hasMonths ? x.finish : i + 1;
    x.early = !x.closeout && s <= Math.max(1, Math.ceil(N / 3));
    x.late = x.closeout || f > N - Math.floor(N / 3);
    if (x.early && x.late) x.early = x.late = false; // a line that runs the whole job is billed evenly: neither
  });

  const balanced = apportion(V, L.map((x) => x.cost), unit);
  const fitted = roundWithin(withinTolerance(L.map((x) => x.value), L.map((x) => x.cost), tol), V, unit,
    L.map((x) => x.cost * (1 + Math.max(M - tol, -1))), L.map((x) => x.cost * (1 + M + tol)));
  L.forEach((x, i) => {
    x.balanced = balanced[i];
    x.fitted = fitted[i];
    x.loading = x.value - x.balanced;
    x.markup = x.cost > 0 ? x.value / x.cost - 1 : null;
    x.off = x.cost > 0 ? x.markup - M : null;
    x.flag = x.cost === 0 ? x.value > 0 : Math.abs(x.off) > tol + 1e-9;
  });

  const material = Math.max(Math.round(V * 0.005), 1);
  const pulledForward = L.filter((x) => x.early && x.loading > 0).reduce((a, x) => a + x.loading, 0);
  const starved = L.filter((x) => x.late && x.loading < 0).reduce((a, x) => a - x.loading, 0);
  const belowCostLate = L.filter((x) => x.late && x.value < x.cost);
  const shifted = L.reduce((a, x) => a + Math.max(x.loading, 0), 0);
  out.totals = { value: V, cost: C, markup: M, pulledForward, starved, shifted, flagged: L.filter((x) => x.flag).length, changed: L.filter((x) => x.fitted !== x.value).length };

  const f = (severity, title) => out.findings.push({ severity, title });
  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  for (const x of L) {
    if (!x.flag) continue;
    if (x.cost === 0) f("high", `${x.label}: ${dollars(x.value)} of value with no cost against it. A reviewer reads that as pure front-loading unless the line is a real cost (bond, permit fee) you left out of the cost column.`);
    else if (x.off > 0) f(x.early ? "high" : "info", `${x.label}: marked up ${pct(x.markup)} against ${pct(M)} for the job, ${dollars(x.loading)} above a balanced value of ${dollars(x.balanced)}${x.early ? ", and it is billed early" : ""}.`);
    else f(x.late ? "high" : "info", `${x.label}: marked up ${pct(x.markup)} against ${pct(M)} for the job, ${dollars(-x.loading)} below a balanced value of ${dollars(x.balanced)}${x.late ? ", and it is work at the end of the job" : ""}.`);
  }
  if (pulledForward >= material) f("high", `${dollars(pulledForward)} of value sits on early lines above their balanced amount (${pct(pulledForward / V)} of the contract). That is the front-loading a GC's or owner's reviewer looks for.`);
  if (belowCostLate.length) f("high", `${belowCostLate.length === 1 ? "One late line is" : `${belowCostLate.length} late lines are`} priced below cost (${belowCostLate.map((x) => x.label).join("; ")}). If the job stops, or the final pay app is held, the work left is worth less than it costs you to finish.`);
  for (const x of L.filter((y) => /mobili[sz]/i.test(y.desc))) {
    if (mobCap != null && x.value > (V * mobCap) / 100) f("high", `${x.label}: ${dollars(x.value)} is ${pct(x.value / V)} of the contract, over the ${mobCap}% cap you entered from your contract.`);
  }
  if (!out.findings.some((y) => y.severity === "high")) f("info", `Every line is within ${tolPts} points of the job markup (${pct(M)}). Nothing here reads as front-loaded.`);

  if (hasMonths) out.months = cashCurve(L, N, ret / 100, rate / 100);
  return out;
}

/**
 * Billing and cash by month under the SOV as submitted and as balanced. Each line's work (and cost) is
 * spread evenly over its months; payment is assumed to arrive in the month billed, less retainage, so this
 * shows the shape of the job's cash, not the bank balance on any day.
 */
export function cashCurve(lines, N, retRate, yearRate) {
  const months = [];
  let billed = 0, bal = 0, cost = 0, interest = 0;
  for (let k = 1; k <= N; k++) {
    let dB = 0, dBal = 0, dC = 0;
    for (const x of lines) {
      if (k < x.start || k > x.finish) continue;
      const span = x.finish - x.start + 1;
      // Spread in whole cents; the last month takes the remainder so each line bills exactly its value.
      const share = (v) => (k === x.finish ? v - Math.round((v * (span - 1)) / span) : Math.round((v * k - v * (x.start - 1)) / span) - Math.round((v * (k - 1) - v * (x.start - 1)) / span));
      dB += share(x.value); dBal += share(x.balanced); dC += share(x.cost);
    }
    billed += dB; bal += dBal; cost += dC;
    const over = billed - bal;
    const cash = Math.round(billed * (1 - retRate)) - cost;
    const cashBal = Math.round(bal * (1 - retRate)) - cost;
    interest += (over * (1 - retRate) * yearRate) / 12;
    months.push({ month: k, billed, balanced: bal, cost, over, cash, cashBalanced: cashBal });
  }
  const peak = months.reduce((a, m) => (m.over > a.over ? m : a), months[0]);
  const low = Math.min(...months.map((m) => m.cash)), lowBal = Math.min(...months.map((m) => m.cashBalanced));
  return { rows: months, peakOver: peak.over, peakMonth: peak.month, lowestCash: low, lowestCashBalanced: lowBal, financingValue: Math.round(interest) };
}

const cents = (c) => (c / 100).toFixed(2);

/** A schedule of values in the columns the calculator and the pay application generator read. */
export function sovCsv(result, which = "balanced") {
  const head = "Item,Description,Scheduled value,Previous,This period,Stored";
  const rows = result.lines.map((x, i) => [x.item || String(i + 1), x.desc, cents(x[which]), "0.00", "0.00", "0.00"].map(csvCell).join(","));
  return [head, ...rows].join("\n");
}

/** Every line with its markup, the balanced value and the within-tolerance value. */
export function reportCsv(result) {
  const head = "Item,Description,Cost,Scheduled value,Markup %,Balanced value,Loading,Within tolerance,Early,Late,Flagged";
  const rows = result.lines.map((x, i) => [x.item || String(i + 1), x.desc, cents(x.cost), cents(x.value), x.markup == null ? "" : (x.markup * 100).toFixed(1), cents(x.balanced), cents(x.loading), cents(x.fitted), x.early ? "yes" : "", x.late ? "yes" : "", x.flag ? "yes" : ""].map(csvCell).join(","));
  return [head, ...rows].join("\n");
}

export function summaryText(result, s = {}) {
  const t = result.totals;
  if (!t) return "";
  const P = (k, v) => `${k.padEnd(38)}${String(v).padStart(16)}`;
  const lines = [
    "Schedule of values front-loading check",
    P("Contract (sum of scheduled values)", dollars(t.value)),
    P("Estimated cost", dollars(t.cost)),
    P("Job markup on cost", `${(t.markup * 100).toFixed(1)}%`),
    P("Lines outside tolerance", `${t.flagged} of ${result.lines.length}`),
    P("Value above balanced on early lines", dollars(t.pulledForward)),
    P("Value below balanced on late lines", dollars(t.starved)),
  ];
  const m = result.months;
  if (m) {
    lines.push(P(`Peak over-billing (month ${m.peakMonth})`, dollars(m.peakOver)));
    lines.push(P("Lowest job cash, as submitted", dollars(m.lowestCash)));
    lines.push(P("Lowest job cash, balanced", dollars(m.lowestCashBalanced)));
    if (m.financingValue) lines.push(P("Value of the early cash at your rate", dollars(m.financingValue)));
  }
  lines.push("", ...result.findings.filter((f) => f.severity === "high").map((f) => `- ${f.title}`));
  lines.push("", "Estimates from your own costs; the contract and the reviewer decide what is accepted.");
  return lines.join("\n");
}

export const SAMPLE_SETTINGS = { tolerance: "10", round: "dollar", retainage: "10", rate: "9", mobilizationCap: "" };
export function sampleSov() {
  return [
    "Item,Description,Scheduled value,Cost,Start,Finish",
    "1,Mobilization and bonds,38000,14000,1,1",
    "2,Submittals and shop drawings,22000,6000,1,2",
    "3,Underground conduit,64000,52000,1,3",
    "4,Rough-in (floors 1-3),148000,128000,2,6",
    "5,Switchgear and distribution,121000,104000,4,7",
    "6,Wire pull and terminations,96000,88000,5,8",
    "7,Lighting fixtures and devices,74000,70000,7,9",
    "8,Testing and commissioning,9000,16000,9,10",
    "9,Closeout: as-builts O&M manuals and training,4000,9000,10,10",
    "10,Punch list,4000,12000,10,10",
  ].join("\n");
}
