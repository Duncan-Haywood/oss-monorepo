// Property tax appeal calculator: pure functions, no I/O, no network.
//
// Two arguments a county board of review hears, both computed from figures the
// homeowner types in:
//   1. Market value: adjust each recent comparable sale to the subject, and
//      compare the indicated value with the market value the assessment implies.
//   2. Equity (uniformity): compare the subject's assessment per square foot
//      with the assessments of the same comparables.
// Then the money: yearly tax saved, cost to file, break-even odds, and what a
// contingency appeal firm would keep out of the same saving.
//
// It never says how a board will rule. Adjustment rates are the user's to set.

export const DEFAULTS = {
  ratioPct: 100,        // assessed value as % of market value in this jurisdiction
  monthlyTimePct: 0.25, // market drift adjustment, % of price per month since sale
  bedAdj: 4000,
  bathAdj: 6000,
  lotPer1000: 1500,
  yearAdj: 400,
  sqftShare: 0.4,       // share of a comp's own $/sqft used as the marginal $/sqft
  yearsHeld: 3,         // how many tax years the reduction is expected to hold
  fee: 0,
  contingencyPct: 33,
  grossLimitPct: 25,    // appraisal rule of thumb: gross adjustments above this weaken a comp
  netLimitPct: 15,
};

const num = (v) => {
  if (v === null || v === undefined || v === "") return NaN;
  if (typeof v === "number") return v;
  const s = String(v).trim().replace(/[$,\s]/g, "");
  return s === "" ? NaN : Number(s);
};
const has = (v) => Number.isFinite(v);
export const round2 = (n) => Math.round(n * 100) / 100;
export const money = (n) => Math.round(n).toLocaleString("en-US");

function median(a) {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function quantile(a, q) {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y), pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

function splitLine(line) {
  const delim = line.includes("\t") ? "\t" : line.includes(";") ? ";" : ",";
  const out = [];
  let cur = "", q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === delim && !q) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

// One comparable per line: label, price, sqft, beds, baths, lot sqft, year built,
// months since sale, assessed value. Blank fields are skipped, not zeroed.
export function parseComps(text) {
  const comps = [], skipped = [];
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const f = splitLine(line);
    const label = f[0] && !has(num(f[0])) ? f.shift() : `Comp ${comps.length + 1}`;
    if (!f.some((x) => has(num(x))) ) { if (comps.length) skipped.push({ line: i + 1, reason: "no numbers" }); return; }
    const [price, sqft, beds, baths, lot, year, months, assessed] = f.map(num);
    if (!(price > 0)) { skipped.push({ line: i + 1, reason: "no sale price" }); return; }
    if (has(sqft) && sqft <= 0) { skipped.push({ line: i + 1, reason: "square feet must be above 0" }); return; }
    comps.push({ label, price, sqft, beds, baths, lot, year, months, assessed });
  });
  return { comps, skipped };
}

// Rate of change in $/sqft is set from the comps themselves unless overridden.
export function defaultSqftRate(comps, share = DEFAULTS.sqftShare) {
  const ppsf = comps.filter((c) => has(c.sqft) && c.sqft > 0).map((c) => c.price / c.sqft);
  return ppsf.length ? median(ppsf) * share : 0;
}

export function analyze(subject, comps, opts = {}) {
  const o = { ...DEFAULTS, ...Object.fromEntries(Object.entries(opts).filter(([, v]) => has(v))) };
  const s = { assessed: num(subject.assessed), sqft: num(subject.sqft), beds: num(subject.beds), baths: num(subject.baths), lot: num(subject.lot), year: num(subject.year) };
  if (!(s.assessed > 0)) return { invalid: "Enter the assessed value from your notice." };
  if (!(o.ratioPct > 0 && o.ratioPct <= 200)) return { invalid: "Assessment ratio must be between 0 and 200 percent." };
  const rate = has(num(opts.taxRatePct)) ? num(opts.taxRatePct) : NaN;
  if (!(comps && comps.length)) return { invalid: "Add at least one comparable sale." };
  const sqftRate = has(o.sqftRate) ? o.sqftRate : defaultSqftRate(comps, o.sqftShare);
  const ratio = o.ratioPct / 100;

  const rows = comps.map((c) => {
    const adj = { time: 0, sqft: 0, beds: 0, baths: 0, lot: 0, age: 0 };
    if (has(c.months)) adj.time = c.price * (o.monthlyTimePct / 100) * c.months;
    if (has(s.sqft) && has(c.sqft)) adj.sqft = (s.sqft - c.sqft) * sqftRate;
    if (has(s.beds) && has(c.beds)) adj.beds = (s.beds - c.beds) * o.bedAdj;
    if (has(s.baths) && has(c.baths)) adj.baths = (s.baths - c.baths) * o.bathAdj;
    if (has(s.lot) && has(c.lot)) adj.lot = ((s.lot - c.lot) / 1000) * o.lotPer1000;
    if (has(s.year) && has(c.year)) adj.age = (s.year - c.year) * o.yearAdj;
    const vals = Object.values(adj);
    const gross = vals.reduce((a, b) => a + Math.abs(b), 0), net = vals.reduce((a, b) => a + b, 0);
    return { ...c, adj, adjusted: c.price + net, grossPct: (gross / c.price) * 100, netPct: (net / c.price) * 100 };
  });
  for (const r of rows) r.weak = r.grossPct > o.grossLimitPct || Math.abs(r.netPct) > o.netLimitPct;
  // Weight by how little each comp had to be adjusted.
  for (const r of rows) r.weight = 1 / (0.05 + r.grossPct / 100);
  const wsum = rows.reduce((a, r) => a + r.weight, 0);
  const adjusted = rows.map((r) => r.adjusted);
  const market = {
    weighted: rows.reduce((a, r) => a + r.adjusted * r.weight, 0) / wsum,
    median: median(adjusted),
    low: Math.min(...adjusted),
    high: Math.max(...adjusted),
    conservative: quantile(adjusted, 0.25),
  };
  const impliedMarket = s.assessed / ratio;
  const saving = (assessedCut) => (has(rate) && assessedCut > 0 ? (assessedCut * rate) / 100 : has(rate) ? 0 : NaN);
  const scenario = (indicated) => {
    const overMarket = impliedMarket - indicated;
    const cut = Math.max(0, overMarket * ratio);
    return { indicated, overMarket, overPct: (overMarket / impliedMarket) * 100, assessedCut: cut, taxSaved: saving(cut) };
  };
  const scenarios = { likely: scenario(market.weighted), conservative: scenario(market.conservative) };

  // Equity: assessed value per sqft on the comps that carry one.
  let equity = null;
  const eq = rows.filter((r) => has(r.assessed) && r.assessed > 0 && has(r.sqft) && r.sqft > 0);
  if (eq.length >= 3 && has(s.sqft) && s.sqft > 0) {
    const perSqft = eq.map((r) => r.assessed / r.sqft), med = median(perSqft);
    const target = med * s.sqft, cut = Math.max(0, s.assessed - target);
    equity = { comps: eq.length, medianPerSqft: med, subjectPerSqft: s.assessed / s.sqft, target, over: s.assessed - target, overPct: ((s.assessed - target) / s.assessed) * 100, assessedCut: cut, taxSaved: saving(cut) };
  }

  const best = Math.max(scenarios.likely.assessedCut, equity ? equity.assessedCut : 0);
  const yearly = (x) => (has(x.taxSaved) ? x.taxSaved : NaN);
  const money_ = {};
  if (has(rate)) {
    const yl = yearly(scenarios.likely), yc = yearly(scenarios.conservative);
    const cost = has(o.fee) ? o.fee : 0;
    money_.likelyNet = yl * o.yearsHeld - cost;
    money_.conservativeNet = yc * o.yearsHeld - cost;
    money_.breakEvenOdds = yl > 0 && yl * o.yearsHeld > 0 ? Math.min(1, cost / (yl * o.yearsHeld)) : cost > 0 ? 1 : 0;
    money_.contingencyKeeps = yl * (o.contingencyPct / 100);
    money_.contingencyNet = yl * o.yearsHeld - money_.contingencyKeeps * 1; // firm keeps its share of first-year saving
  }

  const findings = [];
  const add = (severity, title, detail) => findings.push({ severity, title, detail });
  if (rows.length < 3) add("high", "Fewer than three comparable sales", "Boards rarely move on one or two sales. Three to six recent, similar, nearby sales is the usual ask.");
  const stale = rows.filter((r) => has(r.months) && r.months > 12);
  if (stale.length) add("medium", `${stale.length} sale(s) older than 12 months`, "Older sales lean on the monthly market adjustment you chose. Many boards want sales within 12 months of the assessment date.");
  const weak = rows.filter((r) => r.weak);
  if (weak.length) add("medium", `${weak.length} comparable(s) needed heavy adjustment`, `${weak.map((r) => r.label).join(", ")} moved more than ${o.grossLimitPct}% gross or ${o.netLimitPct}% net. Weak comps are easy for the other side to dismiss; look for closer ones.`);
  if (rows.some((r) => !has(r.months))) add("info", "Some sales have no age", "Blank months-since-sale means no market drift adjustment was applied to that sale.");
  const spread = market.high > 0 ? ((market.high - market.low) / market.weighted) * 100 : 0;
  if (rows.length >= 3 && spread > 25) add("medium", "Adjusted values are far apart", `The highest and lowest adjusted comps differ by ${Math.round(spread)}% of the indicated value. Either the comps are not alike or an adjustment rate is off.`);
  if (scenarios.likely.overMarket <= 0) add("high", "Your comps do not show an over-assessment", `The indicated value is at or above the market value implied by your assessment (${money(impliedMarket)}). On these figures the market-value argument does not help.`);
  else if (scenarios.likely.overPct < 5) add("medium", "Margin is thin", `The gap is ${scenarios.likely.overPct.toFixed(1)}% of implied market value. Adjustment rates alone can move it that much, and some boards ignore gaps under about 5-10%.`);
  if (scenarios.likely.overMarket > 0 && scenarios.conservative.overMarket <= 0) add("info", "Case depends on the comp set", "Using only the lower quartile of adjusted values would erase the gap; the outcome depends on which comps a board accepts.");
  if (equity && equity.over > 0) add("info", "Equity argument available", `Similar homes are assessed at ${money(equity.medianPerSqft)} per sq ft against ${money(equity.subjectPerSqft)} for yours. Uniformity is a separate ground in many jurisdictions.`);
  if (!has(rate)) add("info", "No tax rate entered", "Enter your total tax rate to convert the assessment reduction into dollars.");
  if (has(rate) && has(o.fee) && money_.likelyNet < 0 && scenarios.likely.assessedCut > 0) add("medium", "Filing costs more than the gain over the years entered", "Fee exceeds the tax saved across the years you expect the reduction to last, even if the appeal wins in full.");

  let verdict;
  if (scenarios.likely.overMarket <= 0 && !(equity && equity.over > 0)) verdict = "No case on these numbers";
  else if (best / s.assessed * 100 >= 10 && rows.length >= 3 && weak.length <= rows.length / 2) verdict = "Numbers support an appeal";
  else if (best / s.assessed * 100 >= 5) verdict = "Possible, but thin or contestable";
  else verdict = "Weak on these numbers";

  return { subject: s, options: { ...o, sqftRate, taxRatePct: rate }, rows, market, impliedMarket, scenarios, equity, money: money_, findings, verdict };
}

export function reportCsv(a) {
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const head = ["Comparable", "Sale price", "Months since sale", "Time adj", "Sqft adj", "Bed adj", "Bath adj", "Lot adj", "Age adj", "Adjusted value", "Gross adj %", "Net adj %", "Weak comp"];
  const lines = [head.map(q).join(",")];
  for (const r of a.rows) lines.push([q(r.label), round2(r.price), has(r.months) ? r.months : "", round2(r.adj.time), round2(r.adj.sqft), round2(r.adj.beds), round2(r.adj.baths), round2(r.adj.lot), round2(r.adj.age), round2(r.adjusted), round2(r.grossPct), round2(r.netPct), r.weak ? "yes" : "no"].join(","));
  return lines.join("\n") + "\n";
}

export function summaryText(a) {
  const L = [];
  const sc = a.scenarios;
  L.push(`Property tax appeal worksheet: ${a.verdict}.`);
  L.push(`Assessed ${money(a.subject.assessed)} at ${a.options.ratioPct}% of market implies ${money(a.impliedMarket)}.`);
  L.push(`${a.rows.length} comparable sale(s), adjusted to the subject: indicated ${money(a.market.weighted)} (median ${money(a.market.median)}, range ${money(a.market.low)}-${money(a.market.high)}).`);
  L.push(`Over-assessment on market value: ${money(sc.likely.overMarket)} (${sc.likely.overPct.toFixed(1)}%); on the lower quartile ${money(sc.conservative.overMarket)}.`);
  if (a.equity) L.push(`Equity: similar homes assessed at ${money(a.equity.medianPerSqft)}/sq ft vs ${money(a.equity.subjectPerSqft)}/sq ft for the subject.`);
  if (has(sc.likely.taxSaved)) L.push(`Estimated tax saved per year: ${money(sc.likely.taxSaved)} (conservative ${money(sc.conservative.taxSaved)}).`);
  L.push("Estimates from figures typed in by the user; not an appraisal, not tax or legal advice.");
  return L.join("\n");
}

export function sampleData() {
  return {
    subject: { assessed: 412000, sqft: 1850, beds: 3, baths: 2, lot: 7200, year: 1994 },
    opts: { ratioPct: 100, taxRatePct: 1.85, fee: 0 },
    comps: [
      "# label, price, sqft, beds, baths, lot sqft, year built, months since sale, assessed value",
      "14 Maple Ct, 375000, 1900, 3, 2, 7000, 1992, 3, 371000",
      "22 Birch Ln, 362000, 1780, 3, 2, 7500, 1996, 5, 360000",
      "9 Cedar Dr, 388000, 2010, 4, 2, 7200, 1995, 7, 380000",
      "31 Elm St, 351000, 1720, 3, 2, 6800, 1990, 9, 349000",
      "5 Willow Way, 379000, 1880, 3, 2.5, 7400, 1993, 4, 377000",
    ].join("\n"),
  };
}
