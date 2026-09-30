// Gabor-Granger willingness-to-pay analysis. Pure functions, no I/O, no imports.
//
// Each respondent is shown a ladder of prices and asked "would you buy at this
// price?". What is recorded per respondent is the highest price they said yes
// to, or none if they refused even the lowest price. Demand at price p is the
// share of ALL respondents (refusers included) whose highest yes is at least p.
// Revenue per respondent at p is p * demand(p); profit is (p - unit cost) *
// demand(p). Demand is a step function, so the best price is always one of the
// prices that appear in the data.

const NONE = /^(none|no|never|n\/a|na|-)$/i;

const num = (s) => {
  const t = String(s ?? "").trim().replace(/[$€£,\s]/g, "");
  if (t === "" || !/^\d*\.?\d+$/.test(t)) return NaN;
  return Number(t);
};

// One respondent per line; the first cell is the highest accepted price.
// 0, none, no, never all mean "would not buy at any tested price".
export function parseResponses(text) {
  const lines = String(text ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const values = [];
  let skippedHeader = false;
  let unparseable = 0;
  lines.forEach((line, i) => {
    const cell = line.split(/[,;\t]/)[0].trim();
    if (NONE.test(cell)) { values.push(0); return; }
    const v = num(cell);
    if (Number.isNaN(v)) {
      if (i === 0) skippedHeader = true; else unparseable++;
      return;
    }
    values.push(v);
  });
  return { values, skippedHeader, unparseable };
}

export const prices = (values) => [...new Set(values.filter((v) => v > 0))].sort((a, b) => a - b);

export function demandAt(values, p) {
  return values.filter((v) => v >= p).length / values.length;
}

// Table of every price that appears in the data.
export function demandTable(values, unitCost = 0) {
  const ps = prices(values);
  const rows = ps.map((p) => {
    const d = demandAt(values, p);
    return { price: p, buyers: values.filter((v) => v >= p).length, demand: d, revenue: p * d, profit: (p - unitCost) * d, elasticity: null };
  });
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i];
    const dAvg = (a.demand + b.demand) / 2, pAvg = (a.price + b.price) / 2;
    b.elasticity = dAvg > 0 ? ((b.demand - a.demand) / dAvg) / ((b.price - a.price) / pAvg) : null;
  }
  return rows;
}

// Highest metric wins; on a tie the lower price wins (it has more buyers).
function best(rows, key) {
  let top = null;
  for (const r of rows) if (r[key] > 0 && (top === null || r[key] > top[key] + 1e-12)) top = r;
  return top;
}

export function bestPrices(values, unitCost = 0) {
  const rows = demandTable(values, unitCost);
  return { revenue: best(rows, "revenue"), profit: best(rows, "profit"), rows };
}

// Deterministic PRNG so a shared result reproduces.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const quantile = (sorted, q) => {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

// Percentile bootstrap: resample respondents with replacement, find the best
// price each time, and report the 5th-95th band and how often each price won.
export function bootstrapBest(values, unitCost = 0, { resamples = 300, seed = 12345 } = {}) {
  const rand = mulberry32(seed);
  const wins = { revenue: new Map(), profit: new Map() };
  const picks = { revenue: [], profit: [] };
  for (let i = 0; i < resamples; i++) {
    const s = Array.from({ length: values.length }, () => values[Math.floor(rand() * values.length)]);
    const b = bestPrices(s, unitCost);
    for (const k of ["revenue", "profit"]) {
      if (!b[k]) continue;
      picks[k].push(b[k].price);
      wins[k].set(b[k].price, (wins[k].get(b[k].price) || 0) + 1);
    }
  }
  const out = {};
  for (const k of ["revenue", "profit"]) {
    const v = picks[k].sort((a, b) => a - b);
    const top = [...wins[k].entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
    out[k] = v.length >= resamples * 0.5 ? { low: quantile(v, 0.05), high: quantile(v, 0.95), modal: top[0], modalShare: top[1] / resamples } : null;
  }
  return out;
}

export const money = (n) => (Math.round(n * 100) / 100).toFixed(2);
export const pct = (n) => `${Math.round(n * 1000) / 10}%`;

export const MIN_RESPONDENTS = 30;

export function analyze(text, opts = {}) {
  const unitCost = Number.isFinite(opts.unitCost) && opts.unitCost > 0 ? opts.unitCost : 0;
  const parsed = parseResponses(text);
  const values = parsed.values;
  if (values.length < 5 || prices(values).length < 2) {
    return { error: `Need at least 5 respondents and 2 different prices; found ${values.length} respondents and ${prices(values).length} distinct price(s). Paste one highest-accepted price per line.` };
  }
  const { revenue, profit, rows } = bestPrices(values, unitCost);
  const bands = bootstrapBest(values, unitCost, opts);
  const refusers = values.filter((v) => v === 0).length;
  const lo = rows[0].price, hi = rows[rows.length - 1].price;
  const findings = [];
  const add = (severity, title, detail) => findings.push({ severity, title, detail });

  if (values.length < MIN_RESPONDENTS) {
    add("medium", "Small sample", `${values.length} respondents. Demand curves from fewer than ${MIN_RESPONDENTS} are noisy; read the band and the win share, not the single price.`);
  }
  if (revenue) {
    if (revenue.price === hi) add("medium", "Best price is the top of the ladder", `Revenue is highest at ${money(hi)}, the highest price you tested. The real optimum may be higher; test a wider ladder before trusting this.`);
    if (revenue.price === lo && rows.length > 2) add("medium", "Best price is the bottom of the ladder", `Revenue is highest at ${money(lo)}, the lowest price you tested. The real optimum may be lower, or the tested range starts too high.`);
    const near = rows.filter((r) => r.revenue >= revenue.revenue * 0.98).map((r) => r.price);
    if (near.length > 1) add("info", "Revenue is flat across a range", `Prices ${near.map(money).join(", ")} are within 2% of the best revenue. Choose within that set on other grounds, such as margin, positioning or capacity.`);
    add("info", "Revenue-maximising price", `${money(revenue.price)}: ${pct(revenue.demand)} of respondents say yes, giving ${money(revenue.revenue)} per respondent surveyed.`);
  }
  if (unitCost > 0) {
    if (profit) add("info", "Profit-maximising price", `With a unit cost of ${money(unitCost)}: ${money(profit.price)}, with ${pct(profit.demand)} saying yes and ${money(profit.profit)} profit per respondent surveyed.${revenue && profit.price !== revenue.price ? " This differs from the revenue-maximising price because cost pushes the best price up." : ""}`);
    else add("medium", "No price covers the unit cost", `Every tested price is at or below the unit cost of ${money(unitCost)}.`);
  }
  if (refusers > 0) add("info", "Would not buy at any tested price", `${refusers} of ${values.length} respondents (${pct(refusers / values.length)}) refused even the lowest price, ${money(lo)}. They count as zero demand at every price.`);
  if (bands.revenue) add("info", "Uncertainty", `Bootstrap 5th-95th percentile of the revenue-maximising price: ${money(bands.revenue.low)} to ${money(bands.revenue.high)}. The most common winner, ${money(bands.revenue.modal)}, won ${pct(bands.revenue.modalShare)} of resamples.`);
  add("info", "What this does not tell you", "Stated intent overstates real purchases, often by a wide margin, and the overstatement is not the same at every price. Treat the curve's shape and the ranking of prices as the signal, not the absolute share who say yes. It ignores competitors, discounts, churn and who was surveyed. Test the price with real buyers.");

  return { n: values.length, refusers, unparseable: parsed.unparseable, unitCost, revenue, profit, bands, findings, rows };
}

export function reportCsv(a) {
  const lines = ["price,buyers,demand,revenue_per_respondent,profit_per_respondent,elasticity"];
  for (const r of a.rows) lines.push([r.price, r.buyers, Number(r.demand.toFixed(4)), Number(r.revenue.toFixed(4)), Number(r.profit.toFixed(4)), r.elasticity == null ? "" : Number(r.elasticity.toFixed(3))].join(","));
  lines.push("", "metric,price,band_low,band_high,modal_price,modal_win_share");
  for (const [k, label] of [["revenue", "revenue_maximising"], ["profit", "profit_maximising"]]) {
    const b = a[k], band = a.bands[k];
    lines.push([label, b ? money(b.price) : "", band ? money(band.low) : "", band ? money(band.high) : "", band ? money(band.modal) : "", band ? Number(band.modalShare.toFixed(3)) : ""].join(","));
  }
  return lines.join("\n");
}

// Invented sample: a subscription tool, highest-accepted price clustered near 30.
export function sampleText() {
  const rand = mulberry32(11);
  const ladder = [9, 12, 15, 19, 24, 29, 35, 45, 59];
  const lines = ["highest price accepted"];
  for (let i = 0; i < 80; i++) {
    const wtp = 30 * Math.exp((rand() + rand() + rand() - 1.5) * 1.1);
    const acc = ladder.filter((p) => p <= wtp);
    lines.push(acc.length ? String(acc[acc.length - 1]) : "none");
  }
  return lines.join("\n");
}
