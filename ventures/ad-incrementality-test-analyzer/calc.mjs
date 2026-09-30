// Ad incrementality test analyzer: did the campaign cause extra sales?
// Geo / store holdout read with a weighted-control counterfactual and
// rolling-origin placebo windows for the uncertainty. Pure functions, no I/O.

export const num = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "n/a");
export const money = (v) => (Number.isFinite(v) ? (v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "n/a");
export const pct = (v, d = 1) => (Number.isFinite(v) ? (v * 100).toFixed(d) + "%" : "n/a");

const MIN_PRE = 14;
const MIN_POST = 3;
const ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})/;
const US = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/;

// Returns a day number (days since 1970-01-01, UTC) or null.
export function parseDate(s) {
  const t = String(s).trim();
  let y, m, d;
  let x = t.match(ISO);
  if (x) [y, m, d] = [+x[1], +x[2], +x[3]];
  else if ((x = t.match(US))) [m, d, y] = [+x[1], +x[2], +x[3]];
  else return null;
  const ms = Date.UTC(y, m - 1, d);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return null;
  return Math.round(ms / 864e5);
}
export const isoDay = (n) => new Date(n * 864e5).toISOString().slice(0, 10);

const cleanNum = (s) => {
  const v = Number(String(s).replace(/[$,\s]/g, ""));
  return Number.isFinite(v) && String(s).trim() !== "" ? v : NaN;
};
const UNIT_COLS = ["unit", "geo", "region", "store", "market", "location", "dma", "city", "site", "group"];
const VALUE_COLS = ["value", "revenue", "sales", "orders", "conversions", "y", "amount", "units"];

// Accepts long (date, unit, value) or wide (date, A, B, C ...) tables.
export function parseTable(text) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return { error: "Paste or upload a table with a header row and at least two rows of data." };
  const delim = [",", "\t", ";"].map((d) => [d, lines[0].split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const split = (l) => l.split(delim).map((c) => c.trim().replace(/^"|"$/g, ""));
  const head = split(lines[0]).map((h) => h.toLowerCase());
  if (head.length < 3) return { error: "Need a date column and at least two more columns: either one column per store or region, or long rows of date, unit, value." };
  const warnings = [];
  const body = lines.slice(1).map(split);
  const byDate = new Map();
  const unitSet = [];
  const add = (day, unit, v) => {
    if (!byDate.has(day)) byDate.set(day, new Map());
    const m = byDate.get(day);
    m.set(unit, (m.get(unit) || 0) + v);
    if (!unitSet.includes(unit)) unitSet.push(unit);
  };
  const uc = head.findIndex((h, i) => i > 0 && UNIT_COLS.includes(h));
  let vc = head.findIndex((h, i) => i > 0 && i !== uc && VALUE_COLS.includes(h));
  let bad = 0;
  if (uc >= 0 && head.length >= 3) {
    if (vc < 0) vc = head.findIndex((h, i) => i > 0 && i !== uc);
    for (const r of body) {
      const day = parseDate(r[0]);
      const v = cleanNum(r[vc]);
      const unit = (r[uc] || "").trim();
      if (day === null || !Number.isFinite(v) || !unit) { bad++; continue; }
      add(day, unit, v);
    }
  } else {
    const names = split(lines[0]).slice(1);
    if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) return { error: "Two columns share a name. Give each store or region its own header." };
    for (const r of body) {
      const day = parseDate(r[0]);
      if (day === null) { bad++; continue; }
      let ok = true;
      const vals = names.map((_, i) => cleanNum(r[i + 1]));
      if (vals.some((v) => !Number.isFinite(v))) ok = false;
      if (!ok) { bad++; continue; }
      names.forEach((n, i) => add(day, n, vals[i]));
    }
  }
  if (bad) warnings.push(`${bad} row${bad === 1 ? " was" : "s were"} skipped because the date or a number could not be read.`);
  if (unitSet.length < 2) return { error: "Found fewer than two stores or regions. A holdout needs at least one test and one comparison unit." };
  const allDays = [...byDate.keys()].sort((a, b) => a - b);
  if (allDays.length < MIN_PRE + MIN_POST) return { error: `Only ${allDays.length} dates were readable. You need at least ${MIN_PRE} before the campaign and ${MIN_POST} after.` };
  const days = allDays.filter((d) => unitSet.every((u) => byDate.get(d).has(u)));
  if (days.length < allDays.length) warnings.push(`${allDays.length - days.length} date${allDays.length - days.length === 1 ? "" : "s"} dropped because a store or region had no value on it.`);
  if (days.length < MIN_PRE + MIN_POST) return { error: "After dropping dates with gaps too few complete dates remain. Fill the missing days (0 is fine when nothing was sold)." };
  const gaps = days.slice(1).map((d, i) => d - days[i]);
  const step = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
  if (gaps.some((g) => g > step * 1.5)) warnings.push("Dates are unevenly spaced (gaps in the calendar). Each date is treated as one period.");
  const series = {};
  for (const u of unitSet) series[u] = days.map((d) => byDate.get(d).get(u));
  return { days, dates: days.map(isoDay), units: unitSet, series, warnings };
}

// Non-negative least squares by coordinate descent: min ||y - Xw||^2, w >= 0.
export function nnls(X, y, iters = 3000) {
  const n = X.length, J = X[0].length;
  const G = Array.from({ length: J }, () => new Array(J).fill(0));
  const b = new Array(J).fill(0);
  for (let i = 0; i < n; i++) for (let j = 0; j < J; j++) {
    b[j] += X[i][j] * y[i];
    for (let k = j; k < J; k++) G[j][k] += X[i][j] * X[i][k];
  }
  for (let j = 0; j < J; j++) for (let k = 0; k < j; k++) G[j][k] = G[k][j];
  for (let j = 0; j < J; j++) G[j][j] *= 1 + 1e-9;
  const w = new Array(J).fill(0);
  for (let it = 0; it < iters; it++) {
    let moved = 0;
    for (let j = 0; j < J; j++) {
      if (G[j][j] <= 0) continue;
      let s = b[j];
      for (let k = 0; k < J; k++) if (k !== j) s -= G[j][k] * w[k];
      const nw = Math.max(0, s / G[j][j]);
      moved = Math.max(moved, Math.abs(nw - w[j]));
      w[j] = nw;
    }
    if (moved < 1e-12) break;
  }
  return w;
}

const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const sum = (a) => a.reduce((s, v) => s + v, 0);
function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function fitWeights(rows, y, idx) {
  return nnls(idx.map((i) => rows[i]), idx.map((i) => y[i]));
}

export function analyze(panel, opts = {}) {
  if (!panel || panel.error) return { error: panel?.error || "No data." };
  const { testUnits = [], start, spend = null, marginPct = null, valueKind = "revenue" } = opts;
  const lower = new Map(panel.units.map((u) => [u.toLowerCase(), u]));
  const tests = [...new Set(testUnits.map((t) => String(t).trim()).filter(Boolean).map((t) => lower.get(t.toLowerCase())))];
  if (!tests.length) return { error: "Name at least one test store or region, exactly as it appears in your header or unit column." };
  if (tests.includes(undefined)) {
    const missing = testUnits.filter((t) => !lower.has(String(t).trim().toLowerCase()));
    return { error: `Not found in your data: ${missing.join(", ")}. Available: ${panel.units.join(", ")}.` };
  }
  const controls = panel.units.filter((u) => !tests.includes(u));
  if (!controls.length) return { error: "Every unit is marked as a test unit, so nothing is left to compare against. Keep some regions with no campaign." };
  const startDay = parseDate(start || "");
  if (startDay === null) return { error: "Enter the campaign start date as YYYY-MM-DD." };
  const s = panel.days.findIndex((d) => d >= startDay);
  if (s < 0) return { error: "The campaign start date is after the last date in your data." };
  const T = panel.days.length, preN = s, postN = T - s;
  if (preN < MIN_PRE) return { error: `Only ${preN} periods before the start date. At least ${MIN_PRE} are needed to learn how the test and comparison units move together.` };
  if (postN < MIN_POST) return { error: `Only ${postN} periods from the start date on. At least ${MIN_POST} are needed.` };

  const y = panel.dates.map((_, i) => sum(tests.map((u) => panel.series[u][i])));
  const X = panel.dates.map((_, i) => controls.map((u) => panel.series[u][i]));
  const warnings = [];
  const preIdx = Array.from({ length: preN }, (_, i) => i);
  const postIdx = Array.from({ length: postN }, (_, i) => s + i);
  if (sum(y.slice(0, preN)) <= 0) return { error: "The test units have no value before the campaign, so there is nothing to compare with." };

  const w = fitWeights(X, y, preIdx);
  const cf = X.map((r) => dot(r, w));
  const gap = y.map((v, i) => v - cf[i]);
  const preMean = sum(y.slice(0, preN)) / preN;
  const sse = sum(preIdx.map((i) => gap[i] ** 2));
  const sst = sum(preIdx.map((i) => (y[i] - preMean) ** 2));
  const r2 = sst > 0 ? 1 - sse / sst : 0;
  const mape = sum(preIdx.map((i) => Math.abs(gap[i]) / Math.max(Math.abs(y[i]), 1e-9))) / preN;
  const actualPost = sum(postIdx.map((i) => y[i]));
  const cfPost = sum(postIdx.map((i) => cf[i]));
  const lift = actualPost - cfPost;
  const liftRel = cfPost > 0 ? lift / cfPost : NaN;

  // Placebo windows: pretend the campaign started earlier, refit without the
  // window, and record how large a fake cumulative gap can look by chance.
  const L = postN;
  const minTrain = Math.max(10, Math.ceil(preN / 2));
  const placebo = [];
  let kind = "forward";
  const starts = [];
  for (let p = minTrain; p + L <= preN; p++) starts.push(p);
  const pickEvenly = (arr, k) => (arr.length <= k ? arr : Array.from({ length: k }, (_, i) => arr[Math.round((i * (arr.length - 1)) / (k - 1))]));
  let chosen = pickEvenly(starts, 40);
  if (chosen.length < 5) {
    kind = "leave-out";
    const all = [];
    for (let p = 0; p + L <= preN; p++) all.push(p);
    chosen = pickEvenly(all, 40);
  }
  for (const p of chosen) {
    const win = Array.from({ length: L }, (_, i) => p + i);
    const train = kind === "forward" ? Array.from({ length: p }, (_, i) => i) : preIdx.filter((i) => i < p || i >= p + L);
    if (train.length < 8) continue;
    const pw = fitWeights(X, y, train);
    placebo.push(sum(win.map((i) => y[i] - dot(X[i], pw))));
  }
  let ci90 = null, pValue = null, mde = null;
  if (placebo.length >= 5) {
    const sorted = [...placebo].sort((a, b) => a - b);
    ci90 = [lift - quantile(sorted, 0.95), lift - quantile(sorted, 0.05)];
    pValue = (1 + placebo.filter((d) => Math.abs(d) >= Math.abs(lift)).length) / (placebo.length + 1);
    const half = (quantile(sorted, 0.95) - quantile(sorted, 0.05)) / 2;
    mde = cfPost > 0 ? half / cfPost : NaN;
  } else {
    warnings.push("Too little history before the campaign to build placebo windows, so no interval is shown. Add more pre-campaign days.");
  }
  if (kind === "leave-out") warnings.push("Placebo windows reuse days on both sides of each fake campaign because the pre-campaign history is short. The interval is a little optimistic; more history before the start date fixes it.");
  if (placebo.length >= 5 && placebo.length < 15) warnings.push(`Only ${placebo.length} placebo windows were available, so the interval and p-value are coarse.`);

  // Plain difference-in-differences on the control total as a second opinion.
  const ctlTot = X.map((r) => sum(r));
  const ratio = sum(y.slice(0, preN)) / Math.max(sum(ctlTot.slice(0, preN)), 1e-9);
  const cfDid = sum(postIdx.map((i) => ctlTot[i] * ratio));
  const liftDid = actualPost - cfDid;
  const liftDidRel = cfDid > 0 ? liftDid / cfDid : NaN;
  if (Math.sign(lift) !== Math.sign(liftDid) && Math.abs(liftRel) > 0.01 && Math.abs(liftDidRel) > 0.01) warnings.push("The simple before-and-after comparison against the pooled comparison units points the opposite way. The two methods disagree, so treat the result as unsettled.");
  if (controls.length === 1) warnings.push("Only one comparison unit. The counterfactual is that single series scaled; one unusual week there moves the answer.");
  const active = controls.filter((_, j) => w[j] > 1e-9).length;
  const maxW = Math.max(...w.map((v, j) => v * sum(X.slice(0, preN).map((r) => r[j]))));
  const share = sum(w.map((v, j) => v * sum(X.slice(0, preN).map((r) => r[j]))));
  if (share > 0 && maxW / share > 0.8 && controls.length > 2) warnings.push("One comparison unit carries over 80% of the counterfactual. The result leans on a single region.");
  const spendN = spend === null || spend === "" || !Number.isFinite(Number(spend)) ? null : Number(spend);
  const margin = marginPct === null || marginPct === "" || !Number.isFinite(Number(marginPct)) ? null : Number(marginPct) / 100;

  let money_ = null;
  if (spendN !== null && spendN > 0) {
    if (valueKind === "revenue") {
      money_ = {
        kind: "revenue",
        iroas: lift / spendN,
        iroasRange: ci90 ? [ci90[0] / spendN, ci90[1] / spendN] : null,
        profit: margin === null ? null : lift * margin - spendN,
        profitRange: margin === null || !ci90 ? null : [ci90[0] * margin - spendN, ci90[1] * margin - spendN],
        breakEvenIroas: margin === null || margin <= 0 ? null : 1 / margin,
      };
    } else {
      money_ = {
        kind: "orders",
        costPerIncremental: lift > 0 ? spendN / lift : null,
        costRange: ci90 && ci90[0] > 0 ? [spendN / ci90[1], spendN / ci90[0]] : null,
        incremental: lift,
      };
    }
  }
  let verdict = "unclear";
  if (r2 < 0.5 || !Number.isFinite(r2)) verdict = "unreliable";
  else if (ci90 && ci90[0] > 0 && pValue <= 0.1) verdict = "lift";
  else if (ci90 && ci90[1] < 0 && pValue <= 0.1) verdict = "negative";
  if (verdict === "unreliable") warnings.push("The comparison units do not track the test units well before the campaign (R² under 0.5), so any counterfactual is weak. Add comparison regions that behave like the test ones, or test in steadier markets.");
  if (pValue === null && verdict !== "unreliable") verdict = "unclear";

  const weights = controls.map((u, j) => ({ unit: u, weight: w[j] })).filter((x) => x.weight > 1e-9).sort((a, b) => b.weight - a.weight);
  return {
    tests, controls, weights, active, preN, postN, start: panel.dates[s], end: panel.dates[T - 1],
    r2, mape, actualPost, cfPost, lift, liftRel, ci90, pValue, mde, placeboN: placebo.length, placeboKind: kind,
    did: { lift: liftDid, rel: liftDidRel }, money: money_, valueKind, spend: spendN, marginPct: margin === null ? null : margin * 100,
    verdict, warnings,
    series: panel.dates.map((d, i) => ({ date: d, actual: y[i], counterfactual: cf[i], post: i >= s })),
  };
}

export function reportCsv(r) {
  const lines = ["date,period,actual,counterfactual,gap,cumulative_gap_since_start"];
  let cum = 0;
  for (const p of r.series) {
    if (p.post) cum += p.actual - p.counterfactual;
    lines.push([p.date, p.post ? "campaign" : "before", p.actual.toFixed(2), p.counterfactual.toFixed(2), (p.actual - p.counterfactual).toFixed(2), p.post ? cum.toFixed(2) : ""].join(","));
  }
  return lines.join("\n") + "\n";
}

// Invented example: 8 regions, 90 days, two test regions get +8% from day 61.
export function sampleText() {
  let a = 7;
  const rnd = () => { a = (a * 1664525 + 1013904223) % 4294967296; return a / 4294967296; };
  const names = ["Austin", "Denver", "Boise", "Tulsa", "Omaha", "Reno", "Dayton", "Fresno"];
  const scale = [1.0, 0.8, 0.5, 0.6, 0.55, 0.45, 0.65, 0.9];
  const lines = ["date," + names.join(",")];
  const t0 = Date.UTC(2026, 0, 1);
  for (let d = 0; d < 90; d++) {
    const day = new Date(t0 + d * 864e5);
    const dow = day.getUTCDay();
    const common = 1000 * (1 + 0.0015 * d) * (1 + 0.12 * Math.sin((2 * Math.PI * dow) / 7)) * (1 + 0.06 * Math.sin(d / 9));
    const row = names.map((n, i) => {
      let v = common * scale[i] * (1 + 0.05 * (rnd() - 0.5) * 2);
      if (d >= 60 && i < 2) v *= 1.08;
      return v.toFixed(0);
    });
    lines.push(day.toISOString().slice(0, 10) + "," + row.join(","));
  }
  return lines.join("\n");
}
