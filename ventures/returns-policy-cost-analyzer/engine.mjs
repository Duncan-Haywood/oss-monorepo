// Zero-dependency, deterministic returns-cost analyzer. One row per order
// (category, merchandise subtotal, amount refunded, optional return-label cost)
// in; what returns really cost you per return and per category, the margin left
// after them, and what a return fee or restocking fee would earn against free
// returns out.
//
// What is arithmetic and what is a model. Arithmetic: each order's contribution
// is revenue kept - cost of goods - payment fee (which is not refunded) -
// outbound shipping - (if refunded) return label + handling + the cost of goods
// that cannot be resold. Two behaviours are modelled and are NOT observable in a
// list of past orders, so both are inputs you set:
//   deterrence - how strongly a fee talks buyers out of returning: a fee worth
//                10% of the order removes `deterrence` x 10% of that order's
//                returns (they keep the item);
//   drag       - the share of would-be buyers who do not check out at all once
//                a return fee worth 10% of the order is shown (scaled up or down
//                for bigger or smaller fees). Past orders are the buyers who
//                survived free returns, so a fee policy keeps (1 - drag) of them.
// The tool also reports the drag at which each policy breaks even and the policy
// that loses least across a grid of both assumptions. Exchanges, store credit,
// repeat purchases and lifetime value are NOT modelled.

export const MODEL_NOTE = "Deterrence and checkout drop-off are assumptions you set (defaults: a fee worth 10% of the order prevents 10% of its returns; 3% of buyers do not check out when a return fee worth 10% of the order is shown, more for bigger fees); exchanges, store credit, repeat purchases and lifetime value are not modelled; margin is the profit share of merchandise before shipping and fees";
export const DEFAULTS = { margin: 0.4, outShip: 7, returnShip: 6, handling: 2, resale: 0.85, feePct: 0.029, feeFixed: 0.3, deterrence: 1, drag: 0.03, days: 30, minAnnualGain: 100 };

const toNum = (s) => {
  const t = String(s ?? "").trim().replace(/^\$/, "").replace(/,/g, "");
  const n = Number(t);
  return t !== "" && Number.isFinite(n) && n >= 0 ? n : NaN;
};

/** Parses `category,subtotal,refund[,return_label]` per line; a header row maps columns by name. */
export function parseOrders(text) {
  const rows = [];
  let skipped = 0;
  let col = { cat: 0, subtotal: 1, refund: 2, label: 3 };
  let sawHeader = false;
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const cells = line.split(/\s*[,\t]\s*/);
    if (!sawHeader && rows.length === 0 && /subtotal|refund|return|total|amount/i.test(line) && cells.every((c) => Number.isNaN(toNum(c)))) {
      sawHeader = true;
      const find = (re) => cells.findIndex((c) => re.test(c));
      col = {
        cat: find(/categor|sku|product|type|collection|item/i),
        subtotal: find(/subtotal|order_?(?:value|total)|merch|amount|total|price/i),
        refund: find(/refund|returned?(?:_amount)?$|credit/i),
        label: find(/label|return_?ship|return_?cost|postage/i),
      };
      if (col.subtotal < 0) col.subtotal = 1;
      if (col.refund < 0) col.refund = 2;
      continue;
    }
    const subtotal = toNum(cells[col.subtotal]);
    const refundRaw = String(cells[col.refund] ?? "").trim();
    const refund = refundRaw === "" ? 0 : toNum(refundRaw);
    const labelRaw = col.label >= 0 ? String(cells[col.label] ?? "").trim() : "";
    const label = labelRaw === "" ? null : toNum(labelRaw);
    if (!(subtotal > 0) || Number.isNaN(refund) || Number.isNaN(label) || refund > subtotal * 1.0001) { skipped += 1; continue; }
    const cat = col.cat >= 0 && col.cat !== col.subtotal && col.cat !== col.refund ? String(cells[col.cat] ?? "").trim() || "(none)" : "(all)";
    rows.push({ cat, subtotal, refund: Math.min(refund, subtotal), label });
  }
  return { rows, skipped };
}

/** Contribution of one order, given the cost assumptions. `extra` is cash collected from the customer on a return. */
export function contribution(r, o, extra = 0) {
  const fee = o.feePct * r.subtotal + o.feeFixed;
  const cogs = r.subtotal * (1 - o.margin);
  if (r.refund <= 0) return r.subtotal - cogs - fee - o.outShip;
  const label = r.label ?? o.returnShip;
  // Goods that come back are put on the shelf at cost if resellable and written off otherwise.
  return r.subtotal - r.refund - cogs + o.resale * r.refund * (1 - o.margin) - fee - o.outShip - label - o.handling + extra;
}

const keptContribution = (r, o) => contribution({ ...r, refund: 0 }, o);

/** The fee a policy collects on a return of this order. */
const feeFor = (p, r) => (p.kind === "flat" ? Math.min(p.value, r.refund) : Math.min(r.refund, r.refund * p.value));

/** A policy's fee as a share of the average order. */
const severity = (rows, p) => (p.kind === "pct" ? p.value : p.value / (rows.reduce((s, r) => s + r.subtotal, 0) / rows.length));

/**
 * Expected profit under return policy `p` (null = current), deterrence k and drag a.
 * Returners become keepers with chance min(0.6, k x fee / order); the rest pay the fee.
 */
export function profitUnder(rows, p, o, k, a0) {
  let total = 0;
  // `a0` is the drop-off at a fee worth 10% of the order; a bigger fee loses proportionally more buyers.
  const a = p ? Math.min(0.9, (a0 * severity(rows, p)) / 0.1) : 0;
  for (const r of rows) {
    if (!p) { total += contribution(r, o); continue; }
    if (r.refund <= 0) { total += (1 - a) * keptContribution(r, o); continue; }
    const f = feeFor(p, r);
    const d = Math.min(0.6, (k * f) / r.subtotal);
    total += (1 - a) * (d * keptContribution(r, o) + (1 - d) * contribution(r, o, f));
  }
  return total;
}

export const POLICIES = [
  { id: "flat3", kind: "flat", value: 3, label: "$3 return fee" },
  { id: "flat5", kind: "flat", value: 5, label: "$5 return fee" },
  { id: "flat8", kind: "flat", value: 8, label: "$8 return fee" },
  { id: "flat12", kind: "flat", value: 12, label: "$12 return fee" },
  { id: "pct10", kind: "pct", value: 0.1, label: "10% restocking fee" },
  { id: "pct15", kind: "pct", value: 0.15, label: "15% restocking fee" },
  { id: "pct20", kind: "pct", value: 0.2, label: "20% restocking fee" },
];

export function analyze(parsed, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const rows = parsed.rows;
  if (!rows.length) return { count: 0, findings: [], skipped: parsed.skipped ?? 0 };
  const findings = [];
  const add = (rule, severity, message) => findings.push({ rule, severity, message });
  const usd = (n) => {
    const format = (n) => `$${Math.abs(n).toFixed(2)}`;
    const text = format(Math.abs(n));
    return n < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const pct = (x) => `${Math.round(x * 100)}%`;
  const annual = (v) => (v * 365) / o.days;

  const returned = rows.filter((r) => r.refund > 0);
  const revenue = rows.reduce((s, r) => s + r.subtotal, 0);
  const refunds = rows.reduce((s, r) => s + r.refund, 0);
  const profit = rows.reduce((s, r) => s + contribution(r, o), 0);
  const profitIfNoReturns = rows.reduce((s, r) => s + keptContribution(r, o), 0);
  const returnCost = profitIfNoReturns - profit;
  const totals = {
    orders: rows.length, returns: returned.length, returnRate: returned.length / rows.length, dollarReturnRate: refunds / revenue,
    revenue, refunds, profit, profitIfNoReturns, returnCost,
    costPerReturn: returned.length ? returnCost / returned.length : 0,
    marginAfterReturns: profit / revenue, marginBeforeReturns: profitIfNoReturns / revenue,
  };

  // Per-category view.
  const cats = new Map();
  for (const r of rows) {
    const c = cats.get(r.cat) ?? { cat: r.cat, orders: 0, returns: 0, revenue: 0, profit: 0, kept: 0 };
    c.orders += 1; c.returns += r.refund > 0 ? 1 : 0; c.revenue += r.subtotal;
    c.profit += contribution(r, o); c.kept += keptContribution(r, o);
    cats.set(r.cat, c);
  }
  const categories = [...cats.values()].map((c) => ({ ...c, rate: c.returns / c.orders, margin: c.profit / c.revenue, marginBefore: c.kept / c.revenue, cost: c.kept - c.profit, costPerReturn: c.returns ? (c.kept - c.profit) / c.returns : 0 })).sort((a, b) => b.cost - a.cost);

  // Policy sweep with a grid of the two behavioural assumptions.
  const ks = [...new Set([0, o.deterrence / 2, o.deterrence, o.deterrence * 1.5])];
  const ds = [...new Set([0, o.drag / 2, o.drag, Math.min(0.3, o.drag * 2), Math.min(0.3, o.drag * 3)])];
  const scenarios = ks.flatMap((k) => ds.map((a) => [k, a]));
  const baseline = profit;
  const gainAt = (p, k, a) => profitUnder(rows, p, o, k, a) - baseline;
  const table = POLICIES.map((p) => {
    const g = gainAt(p, o.deterrence, o.drag);
    const lo = gainAt(p, o.deterrence, 0), hi = gainAt(p, o.deterrence, 0.3);
    let breakEven;
    if (lo <= 0) breakEven = { kind: "never" };
    else if (hi >= 0) breakEven = { kind: "always" };
    else {
      let a = 0, z = 0.3;
      for (let i = 0; i < 40; i += 1) { const m = (a + z) / 2; if (gainAt(p, o.deterrence, m) >= 0) a = m; else z = m; }
      breakEven = { kind: "atMost", drag: (a + z) / 2 };
    }
    return { ...p, gain: g, annualGain: annual(g), gainByScenario: scenarios.map(([k, a]) => gainAt(p, k, a)), breakEven };
  });
  const bestAt = scenarios.map((_, i) => Math.max(0, ...table.map((t) => t.gainByScenario[i])));
  for (const t of table) t.maxRegret = Math.max(...t.gainByScenario.map((g, i) => bestAt[i] - g));
  const best = [...table].sort((a, b) => b.gain - a.gain)[0];
  const robust = [...table].sort((a, b) => a.maxRegret - b.maxRegret || b.gain - a.gain)[0];
  const be = (b) => (b.kind === "always" ? "It pays even at the highest drop-off tested (30% of buyers at a fee worth 10% of the order)." : b.kind === "never" ? "It does not pay at any drop-off." : `It pays as long as a fee worth 10% of the order costs you no more than ${pct(b.drag)} of buyers.`);

  if (rows.length < 100 || returned.length < 15) add("thin-data", "warn", `${rows.length} orders with ${returned.length} returns is a thin sample: category rates and the policy comparison mostly fit noise. Use a quarter of orders, or at least 100 orders and 15 returns, if you can.`);
  if (!returned.length) {
    add("no-returns", "info", "No refunded orders in this file, so there is nothing to price. Check that the refund column holds the amount refunded per order.");
  } else {
    add("returns-cost", totals.marginAfterReturns < totals.marginBeforeReturns * 0.75 ? "warn" : "info", `Returns take ${pct(totals.returnRate)} of orders (${pct(totals.dollarReturnRate)} of dollars) and cost you ${usd(totals.returnCost)} on these orders: about ${usd(totals.costPerReturn)} per return once the outbound shipping, return label, handling, unsellable stock and unrefunded payment fees are counted. Profit margin after shipping and card fees falls from ${pct(totals.marginBeforeReturns)} to ${pct(totals.marginAfterReturns)} of revenue.`);
    const overall = totals.returnRate;
    for (const c of categories) {
      if (c.orders >= 10 && c.rate >= Math.max(0.15, overall * 1.5)) add("high-return-category", "warn", `${c.cat}: ${pct(c.rate)} of ${c.orders} orders come back (overall ${pct(overall)}), costing ${usd(c.cost)}; its margin after returns is ${pct(c.margin)} against ${pct(c.marginBefore)} before.`);
      if (c.orders >= 10 && c.profit < 0) add("category-loses-money", "error", `${c.cat} loses ${usd(c.profit)} on ${c.orders} orders once returns are counted. Reprice it, fix what drives its returns, or stop selling it free-returns.`);
    }
    if (best.annualGain >= o.minAnnualGain && best.gain > 0) add("better-policy", "warn", `${best.label} beats free returns by about ${usd(best.gain)} on these orders (${usd(best.annualGain)}/year at ${o.days} days of data), assuming each fee removes ${pct(Math.min(0.6, o.deterrence * 0.1))} of returns per 10% of the order and ${pct(o.drag)} of buyers do not check out when a fee worth 10% of the order is shown (scaled for this fee). ${be(best.breakEven)}`);
    if (robust.id !== best.id && robust.maxRegret < best.maxRegret) add("robust-policy", "info", `${robust.label} is the safer pick: across the grid of assumptions it is never more than ${usd(robust.maxRegret)} behind the best policy for that scenario, versus ${usd(best.maxRegret)} for ${best.label}.`);
    if (!findings.some((f) => f.rule === "better-policy")) add("free-returns-fine", "info", `No fee beats free returns by more than ${usd(o.minAnnualGain)}/year at these assumptions.`);
  }
  return { count: rows.length, skipped: parsed.skipped ?? 0, totals, categories, table, best, robust, scenarios, options: o, findings };
}

export function summarize(report) {
  if (!report.count) return { status: "none", errors: 0, warns: 0, text: "No usable rows found. Expected lines like: Dresses,64.00,64.00 (category, order subtotal, amount refunded or 0, optional return label cost)." };
  const errors = report.findings.filter((f) => f.severity === "error").length;
  const warns = report.findings.filter((f) => f.severity === "warn").length;
  const t = report.totals;
  return { status: errors ? "error" : warns ? "warn" : "ok", errors, warns, text: `${report.count} order(s), ${t.returns} returned (${(t.returnRate * 100).toFixed(0)}%). Returns cost about $${t.costPerReturn.toFixed(2)} each and $${t.returnCost.toFixed(2)} in total; profit margin ${(t.marginBeforeReturns * 100).toFixed(0)}% before returns, ${(t.marginAfterReturns * 100).toFixed(0)}% after.` };
}

export const INPUT_NOTES = [
  { what: "category,subtotal,refund[,return_label]", detail: "One row per order. Category is any product group or SKU; subtotal is merchandise before shipping and tax; refund is the amount refunded for that order (0 or blank if kept); the optional label column is what you paid for the return label." },
  { what: "header row", detail: "One optional header; columns named category/sku/product, subtotal/total, refund/returned and label/return_ship are picked out in any order." },
  { what: "margin", detail: "Profit share of merchandise after product cost, before shipping and payment fees. 40% if you do not know." },
  { what: "outbound shipping / return label / handling", detail: "What you paid to ship the order out (lost when it comes back), the default return label when a row has none, and the cost of receiving and inspecting a return." },
  { what: "resale rate", detail: "Share of returned goods you can sell again at full price. The rest is written off at cost. 85% if you do not know." },
  { what: "payment fee", detail: "Card fee (2.9% + $0.30 by default). Processors generally keep it when you refund, so it is a cost of every return." },
  { what: "deterrence / checkout drop-off", detail: "How a return fee changes behaviour. Not knowable from past orders; the result shows the drop-off at which each fee breaks even." },
  { what: "# comment / blank lines", detail: "Ignored." },
  { what: "other lines", detail: "Counted as skipped, never guessed at (including refunds larger than the order)." },
];
