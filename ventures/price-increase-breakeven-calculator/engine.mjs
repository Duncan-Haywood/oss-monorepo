// Price-increase break-even engine, shared by cli.mjs and index.html.
// Input: items (name, price, unit cost, units sold per period). For a proposed
// increase it computes, per item, how much volume can be lost before profit
// falls (break-even volume loss) and the price elasticity at which the raise
// stops paying. Elasticity is an assumption the user sets, never a measurement.
// Pure arithmetic; no network call.

export const MODEL_NOTE = "Constant-elasticity demand: units change by (1 + increase)^-elasticity. Elasticity, costs staying flat and no effect on other items are assumptions, not measurements";

export const INPUT_NOTES = [
  { what: "name,price,unit_cost,units", detail: "One item per line. Price and cost are per unit, in the same currency; units is how many you sell in the period you care about. Comma, tab or semicolon separated." },
  { what: "$12.50 / 1,200", detail: "A leading $ and thousands separators in tab- or semicolon-separated files are ignored." },
  { what: "header row", detail: "Skipped when its price column is not a number." },
  { what: "price <= unit cost", detail: "Reported as below-cost and left out of every total: a raise on an item that loses money per sale is a different question." },
];

const num = (s) => {
  const t = String(s ?? "").replace(/[$€£\s]/g, "").replace(/,(?=\d{3}(\D|$))/g, "");
  if (t === "" || !/^-?\d*\.?\d+$/.test(t)) return NaN;
  return Number(t);
};

export function parseItems(text) {
  const items = [];
  let skipped = 0;
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const sep = line.includes("\t") ? "\t" : line.includes(";") ? ";" : ",";
    const cols = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (cols.length < 4) { if (items.length || cols.length > 1) skipped += 1; continue; }
    const [name, price, cost, units] = [cols[0], num(cols[1]), num(cols[2]), num(cols[3])];
    if (![price, cost, units].every(Number.isFinite)) { if (items.length) skipped += 1; continue; }
    if (price < 0 || cost < 0 || units < 0) { skipped += 1; continue; }
    items.push({ name: name || `item ${items.length + 1}`, price, cost, units });
  }
  items.skipped = skipped;
  return items;
}

const demand = (increase, elasticity) => (1 + increase) ** -elasticity;

function profitDelta(it, increase, elasticity) {
  const q2 = it.units * demand(increase, elasticity);
  return (it.price * (1 + increase) - it.cost) * q2 - (it.price - it.cost) * it.units;
}

// Elasticity at which a raise of `increase` is exactly profit-neutral for one item.
function neutralElasticity(price, cost, increase) {
  if (!(increase > 0) || price <= cost) return NaN;
  return Math.log((price * (1 + increase) - cost) / (price - cost)) / Math.log(1 + increase);
}

export function analyze(items, options = {}) {
  const increase = options.increase ?? 0.05;
  const elasticity = options.elasticity ?? 1;
  const valid = items.filter((i) => i.price > i.cost);
  const rows = valid.map((it) => {
    const newPrice = it.price * (1 + increase);
    const unitMargin = it.price - it.cost;
    const breakEvenLoss = increase > 0 ? (newPrice - it.price) / (newPrice - it.cost) : 0;
    const unitsAfter = it.units * demand(increase, elasticity);
    const delta = profitDelta(it, increase, elasticity);
    const optimal = elasticity > 1 ? (it.cost * elasticity) / (elasticity - 1) : null;
    return {
      name: it.name, price: it.price, cost: it.cost, units: it.units, newPrice,
      marginPct: unitMargin / it.price, breakEvenLoss, neutralElasticity: neutralElasticity(it.price, it.cost, increase),
      unitsAfter, delta, profit: unitMargin * it.units, optimalPrice: optimal,
    };
  }).sort((a, b) => b.neutralElasticity - a.neutralElasticity);

  const totals = rows.reduce((t, r) => ({ profit: t.profit + r.profit, delta: t.delta + r.delta, revenue: t.revenue + r.price * r.units }), { profit: 0, delta: 0, revenue: 0 });
  // Portfolio neutral elasticity: bisection, since total delta falls as elasticity rises.
  let portfolioNeutral = NaN;
  if (rows.length && increase > 0) {
    const f = (e) => valid.reduce((s, it) => s + profitDelta(it, increase, e), 0);
    if (f(20) > 0) portfolioNeutral = Infinity;
    else { let lo = 0, hi = 20; for (let k = 0; k < 60; k += 1) { const mid = (lo + hi) / 2; if (f(mid) > 0) lo = mid; else hi = mid; } portfolioNeutral = lo; }
  }

  const findings = [];
  for (const it of items.filter((i) => i.price <= i.cost)) findings.push({ rule: "below-cost", severity: "error", message: `${it.name}: price ${it.price} does not exceed unit cost ${it.cost}, so it is left out of the totals.` });
  if (rows.length && totals.delta < 0) findings.push({ rule: "portfolio-loses-money", severity: "error", message: `At elasticity ${elasticity}, a ${(increase * 100).toFixed(1)}% increase across everything lowers profit by ${Math.abs(totals.delta).toFixed(2)} per period. It only pays below elasticity ${fmtE(portfolioNeutral)}.` });
  for (const r of rows) if (r.delta < 0) findings.push({ rule: "item-loses-money", severity: "warn", message: `${r.name}: at elasticity ${elasticity} the raise lowers profit by ${Math.abs(r.delta).toFixed(2)}. It breaks even if you lose ${(r.breakEvenLoss * 100).toFixed(1)}% of units (elasticity ${fmtE(r.neutralElasticity)}).` });
  for (const r of rows) if (r.delta >= 0 && r.breakEvenLoss < 0.1 && increase > 0) findings.push({ rule: "low-cushion", severity: "info", message: `${r.name}: only ${(r.breakEvenLoss * 100).toFixed(1)}% of units may be lost before the raise stops paying (margin ${(r.marginPct * 100).toFixed(0)}%).` });
  if (rows.length && rows.every((r) => r.delta >= 0) && increase > 0) findings.push({ rule: "all-items-pay", severity: "info", message: `Every item still earns more at elasticity ${elasticity}; the whole list breaks even at ${fmtE(portfolioNeutral)}.` });
  return { options: { increase, elasticity }, count: rows.length, skipped: items.skipped || 0, rows, totals, portfolioNeutral, findings };
}

export function fmtE(e) { return e === Infinity ? "20+" : Number.isFinite(e) ? e.toFixed(2) : "n/a"; }

export function summarize(report) {
  const errors = report.findings.filter((f) => f.severity === "error").length;
  const warns = report.findings.filter((f) => f.severity === "warn").length;
  if (!report.count) return { status: "none", errors, warns, text: "No usable item rows found. Expected name,price,unit_cost,units with price above cost." };
  const { increase, elasticity } = report.options;
  const sign = report.totals.delta >= 0 ? "adds" : "removes";
  const text = `A ${(increase * 100).toFixed(1)}% increase on ${report.count} item(s) ${sign} ${Math.abs(report.totals.delta).toFixed(2)} of profit per period at elasticity ${elasticity} (now ${report.totals.profit.toFixed(2)}); it stops paying above elasticity ${fmtE(report.portfolioNeutral)}.`;
  return { status: errors ? "error" : warns ? "warn" : "ok", errors, warns, text };
}
