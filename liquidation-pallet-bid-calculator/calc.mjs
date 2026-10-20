// Liquidation pallet max bid from a manifest. Pure functions, no imports, no
// network. A seeded Monte Carlo over uncertain recovery rate, sell-through and
// damage gives the distribution of net profit; because the purchase cost enters
// profit linearly, one simulation prices every bid (max bid for a loss
// probability, for an expected ROI and for an expected profit are quantile and
// mean lookups, not a search).

export const CLASSES = ["new", "open-box", "used", "salvage"];
export const CLASS_LABEL = { "new": "New", "open-box": "Open box / like new", "used": "Used / returned", "salvage": "Salvage / damaged" };
const EXACT_LINES = 400; // lines simulated one by one; the smaller remainder is summed with a normal approximation

export const DEFAULTS = {
  bid: null, // hammer price to evaluate; blank = evaluate at the recommended max bid
  buyerPremiumPct: 10,
  freight: 350,
  handlingPerUnit: 0.75,
  channelFeePct: 14, // all-in fee on the sale price: marketplace commission plus payment processing
  outboundPerUnit: 2.5, // packaging and postage you pay per unit sold
  recovery: { "new": 45, "open-box": 35, "used": 25, "salvage": 8 }, // % of retail a sold unit fetches
  defaultClass: "open-box", // class for a line with no readable condition
  sellThroughPct: 80, // share of sellable units sold within the holding window
  damagePct: 6, // share of units that turn out unsellable
  months: 3,
  storagePerMonth: 25,
  capitalRatePct: 12, // annual cost of the money tied up
  targetProfit: 300,
  targetRoiPct: 30,
  maxLossProbPct: 10,
  marketSigmaPct: 20, // pallet-wide uncertainty in recovery (lognormal, mean-preserving)
  lineSigmaPct: 35, // extra per-line uncertainty, independent between lines
  concentration: 25, // higher = tighter sell-through and damage draws; Infinity = fixed
  trials: 4000,
  seed: 2026,
};

// ---------- random numbers ----------

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalSource(u) {
  let spare = null;
  return () => {
    if (spare !== null) { const z = spare; spare = null; return z; }
    let a = u(); if (a < 1e-12) a = 1e-12;
    const b = u();
    const r = Math.sqrt(-2 * Math.log(a));
    spare = r * Math.sin(2 * Math.PI * b);
    return r * Math.cos(2 * Math.PI * b);
  };
}

function gammaDraw(shape, u, z) {
  if (shape < 1) return gammaDraw(shape + 1, u, z) * Math.pow(u() || 1e-12, 1 / shape);
  const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do { x = z(); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const w = u();
    if (w < 1 - 0.0331 * x ** 4 || Math.log(w || 1e-12) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function betaMean(mean, conc, u, z) {
  if (mean <= 0) return 0;
  if (mean >= 1) return 1;
  if (!Number.isFinite(conc)) return mean;
  const x = gammaDraw(mean * conc, u, z), y = gammaDraw((1 - mean) * conc, u, z);
  return x / (x + y);
}

// ---------- manifest parsing ----------

export function classifyCondition(raw) {
  const s = String(raw ?? "").toLowerCase().trim();
  if (!s) return null;
  if (/salvage|damag|broken|defect|for parts|parts only|scratch|dent|untested|as[- ]is|cracked|missing/.test(s)) return "salvage";
  if (/open[- ]?box|like new|refurb|renewed|excellent|grade a|\ba\b|opened/.test(s)) return "open-box";
  if (/used|return|good|fair|acceptable|grade b|grade c|pre[- ]?owned|worn/.test(s)) return "used";
  if (/\bnew\b|sealed|unopened|brand new|shelf[- ]?pull|overstock/.test(s)) return "new";
  return null;
}

function splitRows(text, delim) {
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"' && cell === "") q = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

function num(s) {
  if (s === undefined || s === null) return NaN;
  const t = String(s).replace(/[$£€,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (t === "" || !/^-?\d*\.?\d+(e-?\d+)?$/i.test(t)) return NaN;
  return Number(t);
}

const HEADERS = {
  item: /^(item|description|desc|product|title|name|item description|product name|product description)$/i,
  qty: /^(qty|quantity|units|unit qty|count|pieces|pcs)$/i,
  retail: /^(retail|msrp|price|unit retail|unit price|retail price|unit msrp|ext retail|extended retail|ext msrp|extended msrp|total retail|retail total|total msrp|list price)$/i,
  condition: /^(condition|cond|grade|status)$/i,
  category: /^(category|dept|department|cat|type|class)$/i,
};

export function parseManifest(text) {
  const src = String(text ?? "").replace(/^﻿/, "");
  if (!src.trim()) return { error: "Paste or upload a manifest first." };
  const first = src.split(/\r?\n/, 1)[0];
  const counts = [["\t", (first.match(/\t/g) || []).length], [";", (first.match(/;/g) || []).length], [",", (first.match(/,/g) || []).length]].sort((x, y) => y[1] - x[1]);
  const delim = counts[0][1] > 0 ? counts[0][0] : ",";
  const rows = splitRows(src, delim);
  if (!rows.length) return { error: "No rows found." };
  const head = rows[0].map((c) => c.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " "));
  const hasHeader = head.some((c) => Object.values(HEADERS).some((re) => re.test(c)) ) && !head.some((c) => num(c) > 0 && /^[\d.,$ ]+$/.test(c));
  const col = { item: 0, qty: 1, retail: 2, condition: 3, category: -1 };
  let extended = false, body = rows;
  if (hasHeader) {
    body = rows.slice(1);
    for (const k of Object.keys(col)) col[k] = -1;
    head.forEach((c, i) => {
      for (const k of Object.keys(HEADERS)) if (col[k] < 0 && HEADERS[k].test(c)) { col[k] = i; if (k === "retail") extended = /ext|total|line/i.test(c); }
    });
    if (col.retail < 0) return { error: "Could not find a retail or MSRP column. Name a header retail, msrp or price." };
    if (col.item < 0) col.item = head.findIndex((_, i) => i !== col.retail && i !== col.qty && i !== col.condition && i !== col.category);
  }
  const lines = [];
  let skipped = 0, defaultedQty = 0, unreadableCondition = 0;
  for (const r of body) {
    const cell = (i) => (i >= 0 && i < r.length ? r[i].trim() : "");
    const retail = num(cell(col.retail));
    let qty = col.qty >= 0 ? num(cell(col.qty)) : NaN;
    if (!(retail > 0)) { skipped++; continue; }
    if (col.qty >= 0 && cell(col.qty) !== "" && !(qty > 0)) { skipped++; continue; }
    if (!(qty > 0)) { qty = 1; defaultedQty++; }
    const rawCond = cell(col.condition);
    const cls = classifyCondition(rawCond);
    if (rawCond && !cls) unreadableCondition++;
    const unitRetail = extended ? retail / qty : retail;
    lines.push({
      item: cell(col.item) || `Line ${lines.length + 1}`,
      qty, unitRetail, ext: unitRetail * qty,
      condition: rawCond, cls, category: cell(col.category),
    });
  }
  if (!lines.length) return { error: "No usable rows: each line needs a retail price above zero." };
  return { lines, skipped, defaultedQty, unreadableCondition, hasHeader, extended, hasConditionColumn: col.condition >= 0, hasCategoryColumn: col.category >= 0 };
}

// ---------- parameters ----------

export function normalizeParams(input = {}) {
  const p = { ...DEFAULTS, ...input, recovery: { ...DEFAULTS.recovery, ...(input.recovery || {}) } };
  const errors = [];
  const chk = (name, v, lo, hi) => { if (!Number.isFinite(v) || v < lo || v > hi) errors.push(`${name} must be between ${lo} and ${hi}.`); };
  chk("Buyer premium", p.buyerPremiumPct, 0, 100);
  chk("Freight", p.freight, 0, 1e7);
  chk("Handling per unit", p.handlingPerUnit, 0, 1e5);
  chk("Channel fee", p.channelFeePct, 0, 60);
  chk("Outbound cost per unit", p.outboundPerUnit, 0, 1e5);
  chk("Sell-through", p.sellThroughPct, 0, 100);
  chk("Damage rate", p.damagePct, 0, 100);
  chk("Months to sell", p.months, 0, 60);
  chk("Storage per month", p.storagePerMonth, 0, 1e6);
  chk("Capital cost", p.capitalRatePct, 0, 100);
  chk("Target profit", p.targetProfit, -1e9, 1e9);
  chk("Target ROI", p.targetRoiPct, -100, 1e4);
  chk("Acceptable loss probability", p.maxLossProbPct, 0, 100);
  chk("Market uncertainty", p.marketSigmaPct, 0, 150);
  chk("Line uncertainty", p.lineSigmaPct, 0, 200);
  for (const c of CLASSES) chk(`${CLASS_LABEL[c]} recovery`, p.recovery[c], 0, 300);
  if (!CLASSES.includes(p.defaultClass)) errors.push("Unlabelled lines need a condition class.");
  if (!(p.concentration > 0)) errors.push("Sell-through tightness must be above zero.");
  if (!Number.isInteger(p.trials) || p.trials < 200 || p.trials > 40000) errors.push("Trials must be a whole number from 200 to 40000.");
  if (!Number.isInteger(p.seed)) errors.push("Seed must be a whole number.");
  if (p.bid !== null && p.bid !== undefined && !(Number.isFinite(p.bid) && p.bid >= 0)) errors.push("Bid must be zero or more, or blank.");
  return { p, errors };
}

// ---------- economics ----------

export function concentration(lines) {
  const total = lines.reduce((a, l) => a + l.ext, 0);
  const sorted = [...lines].sort((a, b) => b.ext - a.ext);
  const share = (k) => (total > 0 ? sorted.slice(0, k).reduce((a, l) => a + l.ext, 0) / total : 0);
  const hhi = total > 0 ? lines.reduce((a, l) => a + (l.ext / total) ** 2, 0) : 0;
  const cats = new Map();
  for (const l of lines) if (l.category) cats.set(l.category, (cats.get(l.category) || 0) + l.ext);
  let topCategory = null;
  for (const [k, v] of cats) if (!topCategory || v > topCategory.value) topCategory = { name: k, value: v, share: v / total };
  return { total, top1: share(1), top5: share(5), top10: share(10), hhi, effectiveLines: hhi > 0 ? 1 / hhi : 0, topLines: sorted.slice(0, 5), topCategory };
}

function classOf(l, p) { return l.cls || p.defaultClass; }

// Deterministic per-line quantities at the stated assumptions.
function baseLines(lines, p) {
  const d = p.damagePct / 100, s = p.sellThroughPct / 100, fee = p.channelFeePct / 100;
  return lines.map((l) => {
    const cls = classOf(l, p);
    const rec = p.recovery[cls] / 100;
    const base = l.ext * rec; // recovery per unit sold, before sell-through, damage, fees
    const sold = l.qty * (1 - d) * s;
    const netRevenue = base * (1 - d) * s * (1 - fee) - sold * p.outboundPerUnit;
    return { ...l, cls, rec, base, sold, netRevenue };
  });
}

export function costsAt(bid, units, p) {
  const purchase = bid * (1 + p.buyerPremiumPct / 100);
  const cash = purchase + p.freight + p.handlingPerUnit * units;
  const k = 1 + (p.capitalRatePct / 100) * (p.months / 12);
  const storage = p.storagePerMonth * p.months;
  return { purchase, cash, k, storage, total: k * cash + storage, holding: (k - 1) * cash + storage };
}

function quantileSorted(sorted, q) {
  const n = sorted.length;
  const pos = q * (n - 1), lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function simulate(lines, params) {
  const { p, errors } = normalizeParams(params);
  if (errors.length) return { errors };
  const bl = baseLines(lines, p).sort((a, b) => b.base - a.base);
  const units = lines.reduce((a, l) => a + l.qty, 0);
  const exact = bl.slice(0, EXACT_LINES).map((l) => l.base);
  const tail = bl.slice(EXACT_LINES);
  const sm = p.marketSigmaPct / 100, sl = p.lineSigmaPct / 100;
  const vLn = Math.exp(sl * sl) - 1;
  const tailMean = tail.reduce((a, l) => a + l.base, 0);
  const tailSd = Math.sqrt(vLn * tail.reduce((a, l) => a + l.base * l.base, 0));
  const u = rng(p.seed), z = normalSource(u);
  const n = p.trials, d0 = p.damagePct / 100, s0 = p.sellThroughPct / 100, fee = p.channelFeePct / 100;
  const A = new Float64Array(n), B = new Float64Array(n);
  for (let t = 0; t < n; t++) {
    const F = Math.exp(sm * z() - (sm * sm) / 2);
    const s = betaMean(s0, p.concentration, u, z);
    const d = betaMean(d0, p.concentration, u, z);
    let sum = 0;
    if (sl > 0) {
      for (let i = 0; i < exact.length; i++) sum += exact[i] * Math.exp(sl * z() - (sl * sl) / 2);
      if (tail.length) sum += Math.max(0, tailMean + tailSd * z());
    } else {
      for (let i = 0; i < exact.length; i++) sum += exact[i];
      sum += tailMean;
    }
    A[t] = (1 - fee) * F * (1 - d) * s * sum;
    B[t] = p.outboundPerUnit * units * (1 - d) * s;
  }
  return { p, A, B, units, n, bl };
}

function statsAt(sim, mult, cost) {
  const { A, B, n } = sim;
  const out = new Float64Array(n);
  let sum = 0;
  for (let t = 0; t < n; t++) { const v = mult * A[t] - B[t] - cost.total; out[t] = v; sum += v; }
  const sorted = Float64Array.from(out).sort();
  const mean = sum / n;
  let sq = 0;
  for (let t = 0; t < n; t++) sq += (out[t] - mean) ** 2;
  let profitable = 0, hitTarget = 0;
  for (let t = 0; t < n; t++) { if (out[t] >= 0) profitable++; if (out[t] >= sim.p.targetProfit) hitTarget++; }
  return {
    mean, sd: Math.sqrt(sq / (n - 1)),
    p10: quantileSorted(sorted, 0.1), p50: quantileSorted(sorted, 0.5), p90: quantileSorted(sorted, 0.9),
    pProfit: profitable / n, pLoss: 1 - profitable / n, pTarget: hitTarget / n,
    roi: cost.cash > 0 ? mean / cost.cash : null, worst: sorted[0], best: sorted[n - 1],
  };
}

// Budget for total cost (k*cash + storage) -> hammer bid.
function bidFromTotal(total, units, p) {
  const k = 1 + (p.capitalRatePct / 100) * (p.months / 12);
  const cash = (total - p.storagePerMonth * p.months) / k;
  const purchase = cash - p.freight - p.handlingPerUnit * units;
  return Math.max(0, purchase / (1 + p.buyerPremiumPct / 100));
}

function maxBids(sim, mult) {
  const { A, B, n, p, units } = sim;
  const V = Float64Array.from(A, (a, t) => mult * a - B[t]).sort();
  const meanV = V.reduce((a, v) => a + v, 0) / n;
  const x = p.maxLossProbPct / 100;
  const k = 1 + (p.capitalRatePct / 100) * (p.months / 12);
  const S = p.storagePerMonth * p.months;
  // P(V < total) <= x  <=>  total <= V[floor(x n)] (the floor(xn)+1-th smallest).
  const idx = Math.min(n - 1, Math.floor(x * n));
  const totalLoss = V[idx];
  // E[V] - total >= roi * cash, total = k cash + S  =>  cash <= (E[V]-S)/(k+roi)
  const roi = p.targetRoiPct / 100;
  const cashRoi = (meanV - S) / (k + roi);
  const totalRoi = k * cashRoi + S;
  const totalProfit = meanV - p.targetProfit;
  return {
    loss: bidFromTotal(totalLoss, units, p),
    roi: bidFromTotal(totalRoi, units, p),
    profit: bidFromTotal(totalProfit, units, p),
    meanV,
  };
}

export function analyze(lines, params) {
  const sim = simulate(lines, params);
  if (sim.errors) return { error: sim.errors[0], errors: sim.errors };
  const { p, units } = sim;
  const bids = maxBids(sim, 1);
  bids.recommended = Math.min(bids.loss, bids.roi, bids.profit);
  const bidUsed = p.bid !== null && p.bid !== undefined ? p.bid : bids.recommended;
  const cost = costsAt(bidUsed, units, p);
  const stats = statsAt(sim, 1, cost);
  const conc = concentration(lines);
  const totalRetail = conc.total;
  const blended = sim.bl.reduce((a, l) => a + l.base, 0) / totalRetail; // recovery per unit sold, % of retail
  // Break-even: scale every class's recovery by m so expected net = 0 at this bid.
  let meanA = 0, meanB = 0;
  for (let t = 0; t < sim.n; t++) { meanA += sim.A[t]; meanB += sim.B[t]; }
  meanA /= sim.n; meanB /= sim.n;
  const m = meanA > 0 ? (cost.total + meanB) / meanA : null;
  const breakEven = m === null ? null : { multiplier: m, blended: m * blended, assumedBlended: blended, headroom: 1 - m };
  const sensitivity = [0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4].map((mult) => {
    const s = statsAt(sim, mult, cost);
    return { mult, blended: blended * mult, mean: s.mean, roi: s.roi, pProfit: s.pProfit, p10: s.p10, maxBidLoss: maxBids(sim, mult).loss };
  });
  // Per-line contribution at the stated assumptions (deterministic), cost allocated by retail share.
  const perLine = sim.bl.map((l) => ({
    item: l.item, qty: l.qty, cls: l.cls, ext: l.ext, rec: l.rec, netRevenue: l.netRevenue,
    revenueShare: 0, allocatedCost: (cost.total * l.ext) / totalRetail, contribution: l.netRevenue - (cost.total * l.ext) / totalRetail,
  }));
  const revTotal = perLine.reduce((a, l) => a + l.netRevenue, 0);
  for (const l of perLine) l.revenueShare = revTotal > 0 ? l.netRevenue / revTotal : 0;
  perLine.sort((a, b) => b.contribution - a.contribution);
  const summary = {
    lines: lines.length, units, totalRetail, blended, bid: bidUsed, bidWasEntered: p.bid !== null && p.bid !== undefined,
    cashCost: cost.cash, holding: cost.holding, totalCost: cost.total, trials: p.trials, seed: p.seed,
    expectedNetRevenue: revTotal,
  };
  const res = { p, summary, bids, stats, cost, breakEven, sensitivity, perLine, concentration: conc };
  res.findings = findings(res, lines);
  return res;
}

function findings(res, lines) {
  const { p, summary: s, bids, stats, concentration: c, breakEven } = res;
  const out = [];
  const add = (severity, title, detail) => out.push({ severity, title, detail });
  if (s.bidWasEntered && s.bid > bids.recommended + 0.005) {
    add("high", "Your bid is above the recommended maximum", `Recommended max bid is ${money(bids.recommended)} (the lowest of the loss-probability, ROI and profit limits); you entered ${money(s.bid)}. At ${money(s.bid)} the chance of a loss is ${pct(stats.pLoss, 0)}.`);
  }
  if (bids.recommended <= 0) add("high", "No positive bid meets your limits", "Even a zero hammer price fails at least one limit once premium, freight, handling and holding costs are counted. Check freight and the recovery assumptions.");
  if (c.top5 >= 0.5) add("high", "Value is concentrated in a few lines", `The top 5 lines are ${pct(c.top5, 0)} of manifest retail value (largest single line ${pct(c.top1, 0)}). If those items are missing, damaged or worth less than assumed, the pallet cannot make it up elsewhere.`);
  else if (c.top5 >= 0.3) add("medium", "Moderate concentration in the top lines", `The top 5 lines are ${pct(c.top5, 0)} of manifest retail value, about ${c.effectiveLines.toFixed(0)} equivalent equal-sized lines.`);
  if (c.topCategory && c.topCategory.share >= 0.5) add("medium", "One category dominates", `${c.topCategory.name} is ${pct(c.topCategory.share, 0)} of retail value, so a soft market for it hits the whole pallet.`);
  if (breakEven && breakEven.multiplier > 0.9) add("medium", "Thin margin for error on recovery", `At this bid you need about ${pct(breakEven.blended, 1)} blended recovery to break even against ${pct(breakEven.assumedBlended, 1)} assumed, only ${pct(Math.max(0, breakEven.headroom), 0)} of headroom.`);
  if (breakEven && breakEven.multiplier > 1) add("high", "Expected loss at this bid", `Break-even needs ${pct(breakEven.blended, 1)} blended recovery, more than the ${pct(breakEven.assumedBlended, 1)} assumed.`);
  if (p.freight > 0 && s.totalRetail > 0 && p.freight / s.totalRetail > 0.08) add("medium", "Freight is a large share of retail value", `Freight of ${money(p.freight)} is ${pct(p.freight / s.totalRetail, 0)} of retail value; it comes off before any margin.`);
  if (p.sellThroughPct < 100 && p.months < 2) add("info", "Short holding window", "Sell-through applies to the holding window you set; units still unsold at the end are valued at zero here.");
  const defaulted = lines.filter((l) => !l.cls).length;
  if (defaulted) add("medium", "Some lines have no readable condition", `${defaulted} of ${lines.length} lines were treated as ${CLASS_LABEL[p.defaultClass]}. Add or fix a condition column if the pallet mixes conditions.`);
  if (lines.some((l) => l.unitRetail > 0 && l.qty > 1000)) add("info", "Very large quantities", "Check the quantity column; a stray extra digit changes the whole pallet.");
  add("info", "How to read the numbers", "Recovery rates are your assumptions, not observed prices. The simulation shows how far results can spread if they are wrong; it cannot show that your assumptions are right.");
  return out;
}

// ---------- formatting and export ----------

export function money(v) {
  if (!Number.isFinite(v)) return "n/a";
  const r = Math.round(Math.abs(v));
  return `${v < 0 && r > 0 ? "-" : ""}$${r.toLocaleString("en-US")}`;
}
export function money2(v) {
  if (!Number.isFinite(v)) return "n/a";
  return `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export function pct(v, d = 1) { return Number.isFinite(v) ? `${(v * 100).toFixed(d)}%` : "n/a"; }

export function csvCell(v) {
  let s = typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(4)) : String(v ?? "");
  // Spreadsheets evaluate a cell that starts with = + - @ (also after tabs, CR or spaces); a leading quote defuses it.
  if (typeof v !== "number" && /^[\t\r\n ]*[=+\-@]|^[\t\r\n]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function reportCsv(res) {
  const h = "item,qty,condition_class,retail_extended,assumed_recovery_pct,expected_net_revenue,share_of_net_revenue_pct,allocated_cost,expected_contribution";
  const rows = res.perLine.map((l) => [l.item, l.qty, l.cls, l.ext, l.rec * 100, l.netRevenue, l.revenueShare * 100, l.allocatedCost, l.contribution].map(csvCell).join(","));
  return [h, ...rows].join("\n") + "\n";
}

export function summaryCsv(res) {
  const { summary: s, bids, stats, breakEven, concentration: c, p } = res;
  const rows = [
    ["metric", "value"],
    ["bid_evaluated", s.bid], ["max_bid_recommended", bids.recommended], ["max_bid_loss_probability", bids.loss], ["max_bid_target_roi", bids.roi], ["max_bid_target_profit", bids.profit],
    ["expected_net_profit", stats.mean], ["p10_net_profit", stats.p10], ["p50_net_profit", stats.p50], ["p90_net_profit", stats.p90],
    ["probability_of_profit", stats.pProfit], ["expected_roi", stats.roi], ["break_even_blended_recovery_pct", breakEven ? breakEven.blended * 100 : ""],
    ["top5_share_of_retail_pct", c.top5 * 100], ["trials", s.trials], ["seed", s.seed], ["acceptable_loss_probability_pct", p.maxLossProbPct],
  ];
  const sens = [[], ["recovery_multiplier", "blended_recovery_pct", "expected_net_profit", "expected_roi", "probability_of_profit", "max_bid_loss_probability"],
    ...res.sensitivity.map((r) => [r.mult, r.blended * 100, r.mean, r.roi ?? "", r.pProfit, r.maxBidLoss])];
  return [...rows, ...sens].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

// ---------- sample manifest (invented items) ----------

const CATALOG = [
  ["Smart TV 55in", 480, "electronics"], ["Robot vacuum", 260, "home"], ["Cordless drill kit", 129, "tools"], ["Bluetooth speaker", 79, "electronics"],
  ["Air fryer 6qt", 99, "home"], ["Wireless earbuds", 59, "electronics"], ["Office chair", 189, "furniture"], ["Standing desk frame", 249, "furniture"],
  ["Blender", 69, "home"], ["Tool chest 5-drawer", 159, "tools"], ["Gaming headset", 89, "electronics"], ["Laptop bag", 39, "apparel"],
  ["Electric kettle", 34, "home"], ["Space heater", 55, "home"], ["Running shoes", 84, "apparel"], ["Kids ride-on toy", 119, "toys"],
  ["LED desk lamp", 29, "home"], ["Pressure washer", 229, "tools"], ["Security camera 2-pack", 119, "electronics"], ["Yoga mat set", 35, "sports"],
];

export function sampleManifestText(seed = 11) {
  const u = rng(seed);
  const conds = ["New", "New", "Open Box", "Customer Return", "Customer Return", "Used", "Damaged"];
  const rows = ["item,qty,unit_retail,condition,category"];
  rows.push("Curved gaming monitor 34in,1,799.00,Customer Return,electronics");
  rows.push("Mesh Wi-Fi system 3-pack,2,329.00,New,electronics");
  for (let i = 0; i < 48; i++) {
    const [name, price, cat] = CATALOG[Math.floor(u() * CATALOG.length)];
    const qty = 1 + Math.floor(u() * 4);
    const cond = conds[Math.floor(u() * conds.length)];
    rows.push(`${name},${qty},${(price * (0.9 + 0.2 * u())).toFixed(2)},${cond},${cat}`);
  }
  return rows.join("\n");
}
