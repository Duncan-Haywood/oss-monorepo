// AWS commitment break-even: given a usage profile (on-demand-equivalent
// dollars per hour) and the discount of each commitment option, find the
// hourly commitment that minimises cost and stress it against usage falling.
//
// Model (Savings-Plan style, and Reserved Instances for a single instance
// type): the commitment C dollars/hour is paid every hour whether used or not.
// Usage U (priced at on-demand) costs U*(1-d) when covered, so C covers
// x = C/(1-d) of on-demand-equivalent usage per hour; the rest is billed on
// demand. Hourly cost = C + max(0, U - x). That is convex in x, and the
// optimum satisfies P(U > x) = 1 - d, i.e. x is the d-quantile of usage.
// No prices are fetched or assumed: every rate is typed in by the user.

export const HOURS_PER_MONTH = 730;

export function pct(v, digits = 1) {
  if (!Number.isFinite(v)) return "n/a";
  return `${(v * 100).toFixed(digits)}%`;
}
export function signedPct(v, digits = 1) {
  if (!Number.isFinite(v)) return "n/a";
  return `${v >= 0 ? "+" : "-"}${Math.abs(v * 100).toFixed(digits)}%`;
}
export function money(v) {
  if (!Number.isFinite(v)) return "n/a";
  const s = Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: v !== 0 && Math.abs(v) < 100 ? 2 : 0, minimumFractionDigits: 0 });
  return `${v < 0 ? "-" : ""}$${s}`;
}

// Present-value adjusted discount. A commitment paying `upfrontShare` of its
// total on day one costs more in today's money than the same nominal spend
// spread over the term, by the cost of capital. Returns the discount that
// makes the commitment's PV per covered on-demand dollar equal to 1 - result.
export function effectiveDiscount({ discount, upfrontShare = 0, termMonths = 12, annualRate = 0 }) {
  const T = Math.max(1, Math.round(termMonths));
  const f = Math.min(1, Math.max(0, upfrontShare));
  const monthly = Math.pow(1 + Math.max(0, annualRate), 1 / 12) - 1;
  let A = 0;
  for (let m = 1; m <= T; m++) A += Math.pow(1 + monthly, -m);
  const k = f * (T / A) + (1 - f);
  return 1 - (1 - discount) * k;
}

// One number per line, or comma/space/semicolon separated. A line such as
// "2026-08-01,12.40" (a cost-explorer style export) contributes its last
// numeric field; a leading header row is skipped; blanks and negatives are
// counted and dropped.
export function parseProfile(text, unit = "hour") {
  const perHour = unit === "day" ? 1 / 24 : 1;
  const values = [];
  let skipped = 0;
  const lines = String(text || "").split(/\r?\n/);
  let seenNumber = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const fields = line.split(/[,;\t]+/).map((s) => s.trim().replace(/^\$/, "")).filter((s) => s !== "");
    let took = false;
    // last numeric field wins; a single-line "1 2 3" list is also accepted
    if (fields.length === 1 && /\s/.test(fields[0])) {
      for (const p of fields[0].split(/\s+/)) {
        const v = Number(p.replace(/^\$/, ""));
        if (Number.isFinite(v)) { pushValue(v); took = true; }
      }
    } else {
      for (let i = fields.length - 1; i >= 0; i--) {
        const v = Number(fields[i]);
        if (fields[i] !== "" && Number.isFinite(v)) { pushValue(v); took = true; break; }
      }
    }
    if (!took && seenNumber) skipped++;
  }
  function pushValue(v) {
    seenNumber = true;
    if (v < 0) { skipped++; return; }
    values.push(v * perHour);
  }
  return { values, skipped };
}

export function steadyProfile(ratePerHour, shareOfHours) {
  const n = 100;
  const on = Math.round(Math.min(1, Math.max(0, shareOfHours)) * n);
  const values = [];
  for (let i = 0; i < n; i++) values.push(i < on ? ratePerHour : 0);
  return values;
}

function prepare(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const prefix = new Float64Array(sorted.length + 1);
  for (let i = 0; i < sorted.length; i++) prefix[i + 1] = prefix[i] + sorted[i];
  return { sorted, prefix, n: sorted.length };
}

// number of values strictly greater than x
function upperCount(p, x) {
  let lo = 0, hi = p.n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (p.sorted[mid] <= x) lo = mid + 1; else hi = mid;
  }
  return p.n - lo;
}

// Mean hourly cost when covering x on-demand-equivalent dollars/hour.
function meanCost(p, x, d) {
  const above = upperCount(p, x);
  const sumAbove = p.prefix[p.n] - p.prefix[p.n - above];
  return (x * (1 - d) * p.n + sumAbove - x * above) / p.n;
}

export function optimalCoverage(values, d) {
  const p = prepare(values);
  const mean = p.prefix[p.n] / p.n;
  if (!(d > 0)) return { x: 0, meanCost: mean, meanOnDemand: mean };
  let bestX = 0, best = meanCost(p, 0, d);
  let prev = -1;
  for (const x of p.sorted) {
    if (x === prev) continue;
    prev = x;
    const c = meanCost(p, x, d);
    if (c < best - 1e-12) { best = c; bestX = x; }
  }
  return { x: bestX, meanCost: best, meanOnDemand: mean };
}

export function evaluate(values, x, d, dNominal = d) {
  const p = prepare(values);
  const mean = p.prefix[p.n] / p.n;
  const cost = meanCost(p, x, d);
  const costNominal = meanCost(p, x, dNominal);
  let covered = 0;
  for (const v of values) covered += Math.min(v, x);
  const usedShare = x > 0 ? covered / (x * p.n) : 0;
  return {
    x,
    commitPerHour: x * (1 - dNominal),
    meanOnDemand: mean,
    meanCost: cost,
    savingsPerHour: mean - cost,
    savingsPct: mean > 0 ? (mean - cost) / mean : 0,
    savingsNominalPerHour: mean - costNominal,
    coverage: mean > 0 ? covered / (mean * p.n) : 0,
    utilization: usedShare,
    meanNominalCost: costNominal,
  };
}

export const STRESS_SCALES = [0.5, 0.7, 0.85, 1, 1.15, 1.3];

export function stress(values, x, d) {
  return STRESS_SCALES.map((s) => {
    const scaled = values.map((v) => v * s);
    const e = evaluate(scaled, x, d);
    return { scale: s, savingsPct: e.savingsPct, savingsPerHour: e.savingsPerHour };
  });
}

export function curve(values, d, points = 40) {
  const p = prepare(values);
  const max = p.sorted[p.n - 1] || 0;
  const out = [];
  for (let i = 0; i <= points; i++) {
    const x = (max * i) / points;
    const mean = p.prefix[p.n] / p.n;
    out.push({ x, savingsPct: mean > 0 ? (mean - meanCost(p, x, d)) / mean : 0 });
  }
  return out;
}

function num(v) { return typeof v === "number" ? v : Number(v); }

// Cash payback of the upfront payment, in months of running the commitment.
function paybackMonths({ evalNominal, upfrontShare, termMonths }) {
  const f = Math.min(1, Math.max(0, upfrontShare));
  if (f === 0) return evalNominal.savingsNominalPerHour > 0 ? 0 : null;
  const upfront = f * evalNominal.commitPerHour * HOURS_PER_MONTH * termMonths;
  const monthlyBenefit = evalNominal.savingsNominalPerHour * HOURS_PER_MONTH + f * evalNominal.commitPerHour * HOURS_PER_MONTH;
  if (evalNominal.savingsNominalPerHour <= 0 || monthlyBenefit <= 0) return null;
  return upfront / monthlyBenefit;
}

export function analyze({ values, options, annualRate = 0 }) {
  const clean = (values || []).filter((v) => Number.isFinite(v) && v >= 0);
  if (clean.length < 2) return { error: "Need at least two usage values (one per hour or per day)." };
  const mean = clean.reduce((a, b) => a + b, 0) / clean.length;
  if (!(mean > 0)) return { error: "Usage is all zero, so there is nothing to commit to." };
  const opts = (options || []).filter((o) => o && Number.isFinite(num(o.discount)));
  if (!opts.length) return { error: "Enter at least one commitment option with a discount." };
  for (const o of opts) {
    const dd = num(o.discount);
    if (dd < 0 || dd >= 0.95) return { error: `Discount for "${o.label}" must be between 0% and 95%.` };
    if (!(num(o.termMonths) >= 1)) return { error: `Term for "${o.label}" must be at least 1 month.` };
    const u = num(o.upfrontShare || 0);
    if (u < 0 || u > 1) return { error: `Upfront share for "${o.label}" must be between 0% and 100%.` };
  }
  const results = opts.map((o) => {
    const discount = num(o.discount), termMonths = Math.round(num(o.termMonths)), upfrontShare = num(o.upfrontShare || 0);
    const dEff = effectiveDiscount({ discount, upfrontShare, termMonths, annualRate });
    const opt = optimalCoverage(clean, dEff);
    const x = opt.x;
    const ev = evaluate(clean, x, dEff, discount);
    const st = stress(clean, x, dEff);
    return {
      label: o.label, discount, termMonths, upfrontShare, dEff,
      x, commitPerHour: ev.commitPerHour, commitPerMonth: ev.commitPerHour * HOURS_PER_MONTH,
      coverage: ev.coverage, utilization: ev.utilization,
      onDemandPerMonth: ev.meanOnDemand * HOURS_PER_MONTH,
      costPerMonth: ev.meanCost * HOURS_PER_MONTH,
      savingsPerMonth: ev.savingsPerHour * HOURS_PER_MONTH,
      savingsPct: ev.savingsPct,
      totalCommitted: ev.commitPerHour * HOURS_PER_MONTH * termMonths,
      paybackMonths: paybackMonths({ evalNominal: ev, upfrontShare, termMonths }),
      stress: st,
      downside30: st.find((s) => s.scale === 0.7),
      meanOnDemand: ev.meanOnDemand,
    };
  });
  const ranked = [...results].sort((a, b) => b.savingsPerMonth - a.savingsPerMonth);
  const best = ranked[0];
  const findings = [];
  const p = prepare(clean);
  if (clean.length < 168) findings.push({ severity: "medium", title: "Less than a week of usage", detail: `You gave ${clean.length} values. Weekday and weekend patterns, month-end jobs and traffic peaks are invisible in so little data, so the optimum could move a lot. Use at least four weeks of hourly usage if you can.` });
  if (best.savingsPerMonth <= 0) {
    findings.push({ severity: "high", title: "No commitment beats on-demand here", detail: "With these discounts (after your cost of capital) and this usage pattern, committing loses money at every level. Either usage is too spiky for the discount, or the discount is too small." });
  } else {
    findings.push({ severity: "info", title: `Best option: ${best.label}`, detail: `Commit ${money(best.commitPerHour)}/hour (${money(best.commitPerMonth)}/month), which covers ${pct(best.coverage, 0)} of your usage and is used ${pct(best.utilization, 0)} of the time. Estimated saving ${money(best.savingsPerMonth)}/month (${pct(best.savingsPct)}) against on-demand.` });
    const peak = p.sorted[p.n - 1];
    findings.push({ severity: "info", title: "Why not commit to the peak?", detail: `Every hour of commitment is paid whether used or not. The optimum sits where usage exceeds the covered level exactly ${pct(1 - best.dEff, 0)} of the time, which here is ${money(best.x)}/hour on-demand-equivalent against a peak of ${money(peak)}/hour.` });
    if (best.downside30 && best.downside30.savingsPct < 0) {
      findings.push({ severity: "medium", title: "A 30% drop in usage would cost you", detail: `If usage falls 30% after you commit, the commitment would cost ${pct(-best.downside30.savingsPct)} more than staying on-demand, and you cannot cancel it. Consider committing less than the optimum, or a shorter term.` });
    } else if (best.downside30) {
      findings.push({ severity: "info", title: "Downside check", detail: `If usage fell 30% after you committed, you would still save about ${pct(best.downside30.savingsPct)}.` });
    }
  }
  const upfronts = results.filter((r) => r.upfrontShare > 0 && r.paybackMonths != null);
  if (annualRate > 0 && upfronts.length) {
    findings.push({ severity: "info", title: "Upfront payments priced at your cost of capital", detail: `Savings above are discounted at ${pct(annualRate, 1)} a year, so an all-upfront option needs a larger headline discount than a no-upfront one to win.` });
  }
  const longer = results.filter((r) => r.termMonths >= 36 && r.downside30 && r.downside30.savingsPct < 0);
  if (longer.length) findings.push({ severity: "medium", title: "Three-year terms carry the most risk", detail: `${longer.map((r) => r.label).join("; ")}: savings turn negative if usage falls 30%, and you cannot exit early for three years.` });
  return { mean, n: clean.length, peak: p.sorted[p.n - 1], results, ranked, best, findings, annualRate };
}

// An invented month of hourly usage: a steady base, business-hours load on
// weekdays, a quiet weekend. Deterministic so the example is reproducible.
export function sampleText() {
  const out = [];
  let seed = 7;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let h = 0; h < 24 * 28; h++) {
    const hour = h % 24, day = Math.floor(h / 24) % 7;
    const weekday = day < 5;
    let v = 4.0;
    if (weekday && hour >= 8 && hour < 19) v += 5.5 + 1.5 * Math.sin(((hour - 8) / 11) * Math.PI);
    else if (weekday) v += 1.0;
    v += (rnd() - 0.5) * 0.8;
    out.push(v.toFixed(2));
  }
  return out.join("\n");
}

export const DEFAULT_OPTIONS = [
  { label: "1-year, no upfront", termMonths: 12, discount: 0.25, upfrontShare: 0 },
  { label: "1-year, all upfront", termMonths: 12, discount: 0.30, upfrontShare: 1 },
  { label: "3-year, no upfront", termMonths: 36, discount: 0.42, upfrontShare: 0 },
  { label: "3-year, all upfront", termMonths: 36, discount: 0.52, upfrontShare: 1 },
];

export function reportCsv(a) {
  const rows = [["option", "term_months", "discount", "upfront_share", "effective_discount", "commit_per_hour", "commit_per_month", "coverage", "utilization", "on_demand_per_month", "cost_per_month", "savings_per_month", "savings_pct", "payback_months", "savings_pct_if_usage_-30%"]];
  for (const r of a.results) {
    rows.push([r.label, r.termMonths, r.discount, r.upfrontShare, r.dEff.toFixed(4), r.commitPerHour.toFixed(4), r.commitPerMonth.toFixed(2), r.coverage.toFixed(4), r.utilization.toFixed(4), r.onDemandPerMonth.toFixed(2), r.costPerMonth.toFixed(2), r.savingsPerMonth.toFixed(2), r.savingsPct.toFixed(4), r.paybackMonths == null ? "" : r.paybackMonths.toFixed(1), r.downside30.savingsPct.toFixed(4)]);
  }
  return rows.map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(",")).join("\n") + "\n";
}

export function defaultOptions() { return DEFAULT_OPTIONS.map((o) => ({ ...o })); }
