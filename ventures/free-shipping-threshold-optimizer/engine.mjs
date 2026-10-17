// Zero-dependency, deterministic free-shipping-threshold optimizer. One row per
// past order (merchandise subtotal, optional shipping cost) in; for every
// candidate threshold the expected profit, the gain over the current policy,
// the share of orders that ship free, the checkout drop-off at which the
// threshold breaks even, and a recommended and a robust threshold out.
//
// What is arithmetic and what is a model. Arithmetic: each order's contribution
// is subtotal x margin - shipping cost (+ the shipping fee the customer pays
// when the order is under the threshold). Two behaviours are modelled and are
// NOT observable in a list of past orders, so both are inputs you set:
//   topUp  - of orders just under a threshold, the share who add items to reach
//            it (chance `topUp` at zero gap, fading linearly to none at `reach`
//            x threshold);
//   drag   - the share of would-be buyers who abandon when they must pay a
//            shipping fee. Past orders are the buyers who survived whatever fee
//            applied to them, so each is scaled back up by 1/(1-drag) when a
//            different threshold would have waived that fee.
// The tool also reports the drag at which each threshold breaks even and the
// threshold that loses least across a grid of both assumptions. Returns,
// repeat purchases and customer lifetime value are NOT modelled.

export const MODEL_NOTE = "Top-up and checkout drop-off are assumptions you set (defaults: 25% of orders right under a threshold add items, fading to none 30% below it; 10% of buyers abandon when charged shipping); returns, repeat purchases and lifetime value are not modelled; margin is the profit share of merchandise before shipping";
export const DEFAULTS = { margin: 0.4, shipCost: 7, fee: null, current: null, topUp: 0.25, reach: 0.3, drag: 0.1, days: 30, minAnnualGain: 100 };

const toNum = (s) => {
  const t = String(s ?? "").trim().replace(/^\$/, "").replace(/,/g, "");
  const n = Number(t);
  return t !== "" && Number.isFinite(n) && n >= 0 ? n : NaN;
};

/** Parses `subtotal[,shipping_cost]` per line; a header row maps columns by name. */
export function parseOrders(text) {
  const rows = [];
  let skipped = 0;
  const col = { subtotal: 0, ship: 1 };
  let sawHeader = false;
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const cells = line.split(/\s*[,\t]\s*/);
    if (!sawHeader && rows.length === 0 && /subtotal|order|total|amount|merch/i.test(line) && Number.isNaN(toNum(cells[0]))) {
      sawHeader = true;
      const find = (re) => cells.findIndex((c) => re.test(c));
      const s = find(/subtotal|order_?(?:value|total)|merch|amount|total/i);
      const c = find(/ship|postage|freight|label/i);
      if (s >= 0) col.subtotal = s;
      col.ship = c >= 0 ? c : -1;
      continue;
    }
    const subtotal = toNum(cells[col.subtotal]);
    const shipRaw = col.ship >= 0 ? String(cells[col.ship] ?? "").trim() : "";
    const ship = shipRaw === "" ? null : toNum(shipRaw);
    if (!(subtotal > 0) || Number.isNaN(ship)) { skipped += 1; continue; }
    rows.push({ subtotal, ship });
  }
  return { rows, skipped };
}

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))];
const NICE = [1, 2, 5, 10, 25, 50, 100, 250, 500];

/** Candidate thresholds: round steps up to about the 95th percentile of order value, plus the current one. */
export function candidateThresholds(subtotals, current) {
  const sorted = [...subtotals].sort((a, b) => a - b);
  const p90 = quantile(sorted, 0.9);
  const step = NICE.find((n) => n >= p90 / 24) ?? 500;
  const top = quantile(sorted, 0.95);
  const set = new Set();
  for (let t = step; t <= top + step; t += step) set.add(Math.round(t * 100) / 100);
  if (Number.isFinite(current) && current > 0) set.add(current);
  return [...set].sort((a, b) => a - b);
}

const weight = (gap, threshold, reach) => (!Number.isFinite(threshold) || gap <= 0 ? 0 : Math.max(0, 1 - gap / (reach * threshold)));

/**
 * Expected profit of free-shipping threshold T (Infinity = shipping always charged)
 * given the observed policy T0, top-up rate b and checkout drag a.
 */
export function profitAt(orders, T, T0, o, b, a) {
  let profit = 0;
  for (const { subtotal: s, ship: c } of orders) {
    const net = s * o.margin - c;
    // Latent demand: an order seen under a fee stands for 1/(1-a) would-be buyers.
    const latent = s < T0 ? 1 / (1 - a) : 1;
    if (s >= T) { profit += latent * net; continue; }
    const w = latent * (1 - a);
    const inc = Math.max(0, weight(T - s, T, o.reach) - (s < T0 ? weight(T0 - s, T0, o.reach) : 0));
    const p = Math.min(1, b * inc);
    profit += w * (p > 0 ? (1 - p) * (net + o.fee) + p * (T * o.margin - c) : net + o.fee);
  }
  return profit;
}

export function analyze(parsed, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const rows = parsed.rows;
  if (!rows.length) return { count: 0, findings: [], skipped: parsed.skipped ?? 0 };
  const findings = [];
  const add = (rule, severity, message) => findings.push({ rule, severity, message });
  // Magnitude only: every caller words the direction itself ("beats", "behind").
  const usd = (n) => { const text = Math.abs(n).toFixed(2); return `$${text}`; };

  const known = rows.filter((r) => r.ship !== null);
  const meanShip = known.length ? known.reduce((a, r) => a + r.ship, 0) / known.length : o.shipCost;
  const orders = rows.map((r) => ({ subtotal: r.subtotal, ship: r.ship ?? meanShip }));
  const avgShip = orders.reduce((a, r) => a + r.ship, 0) / orders.length;
  o.fee = o.fee === null || o.fee === undefined ? Math.round(avgShip * 100) / 100 : o.fee;
  const T0 = Number.isFinite(o.current) && o.current > 0 ? o.current : Infinity;
  const annual = (v) => (v * 365) / o.days;

  const thresholds = [...candidateThresholds(orders.map((r) => r.subtotal), o.current), Infinity];
  const baseline = profitAt(orders, T0, T0, o, 0, 0);
  const gain = (T, b, a) => profitAt(orders, T, T0, o, b, a) - baseline;

  // Scenario grid for the robust pick: top-up and drag each from none to half again the assumed value.
  const bumps = [0, o.topUp / 2, o.topUp, Math.min(1, o.topUp * 1.5)];
  const drags = [...new Set([0, o.drag / 2, o.drag, Math.min(0.6, o.drag * 1.5)])];
  const scenarios = bumps.flatMap((b) => drags.map((a) => [b, a]));

  const table = thresholds.map((T) => {
    const g = gain(T, o.topUp, o.drag);
    // Drag at which this threshold equals the current policy, at the assumed top-up rate.
    let breakEven = null;
    if (T !== T0) {
      const lo = gain(T, o.topUp, 0), hi = gain(T, o.topUp, 0.6);
      if (lo >= 0 && hi >= 0) breakEven = { kind: "always" };
      else if (lo < 0 && hi < 0) breakEven = { kind: "never" };
      else {
        let a = 0, z = 0.6;
        for (let i = 0; i < 40; i += 1) { const m = (a + z) / 2; if ((gain(T, o.topUp, m) >= 0) === (hi >= 0)) z = m; else a = m; }
        breakEven = { kind: hi > lo ? "atLeast" : "atMost", drag: (a + z) / 2 };
      }
    }
    return { threshold: T, freePct: orders.filter((r) => r.subtotal >= T).length / orders.length, gain: g, annualGain: annual(g), gainByScenario: scenarios.map(([b, a]) => gain(T, b, a)), breakEven };
  });

  const bestAt = scenarios.map((_, i) => Math.max(...table.map((t) => t.gainByScenario[i])));
  for (const t of table) t.maxRegret = Math.max(...t.gainByScenario.map((g, i) => bestAt[i] - g));
  const best = [...table].sort((a, b) => b.gain - a.gain || a.threshold - b.threshold)[0];
  const robust = [...table].sort((a, b) => a.maxRegret - b.maxRegret || b.gain - a.gain)[0];
  const current = table.find((t) => t.threshold === T0);
  const label = (T) => (Number.isFinite(T) ? `$${T}` : "no free shipping");
  const pct = (x) => `${Math.round(x * 100)}%`;
  const be = (b) => (!b ? "" : b.kind === "always" ? "It pays at any checkout drop-off." : b.kind === "never" ? "It does not pay at any plausible drop-off." : b.kind === "atLeast" ? `It pays if shipping fees cost you at least ${pct(b.drag)} of buyers; below that it loses money.` : `It pays only if shipping fees cost you at most ${pct(b.drag)} of buyers.`);

  const totals = { orders: orders.length, revenue: orders.reduce((a, r) => a + r.subtotal, 0), aov: orders.reduce((a, r) => a + r.subtotal, 0) / orders.length, avgShip, fee: o.fee, baseline };

  if (rows.length < 30) add("thin-data", "warn", `Only ${rows.length} orders. A threshold chosen from this few orders mostly fits noise; use at least a month or 100 orders if you can.`);
  if (best.threshold !== T0 && best.annualGain >= o.minAnnualGain) {
    add("better-threshold", "warn", `${label(best.threshold)} beats ${label(T0)} by about ${usd(best.gain)} on these orders (${usd(best.annualGain)}/year at ${o.days} days of data), assuming ${pct(o.topUp)} of orders just under it add items and ${pct(o.drag)} of buyers abandon when charged shipping. ${be(best.breakEven)}`);
  }
  if (robust.threshold !== best.threshold && robust.threshold !== T0) add("robust-threshold", "info", `${label(robust.threshold)} is the safer pick: across the grid of top-up and drop-off assumptions it is never more than ${usd(robust.maxRegret)} behind the best choice for that scenario, versus ${usd(best.maxRegret)} for ${label(best.threshold)}.`);
  if (Number.isFinite(T0) && current) add("current-threshold", "info", `${label(T0)} currently ships ${pct(current.freePct)} of these orders free; waiving the ${usd(o.fee)} shipping fee on them is the price of the nudge.`);
  if (!findings.some((f) => f.severity === "warn")) add("threshold-fine", "info", best.threshold === T0 ? `${label(T0)} is the best of the candidates at these assumptions.` : `Nothing beats ${label(T0)} by more than ${usd(o.minAnnualGain)}/year at these assumptions.`);

  return { count: orders.length, skipped: parsed.skipped ?? 0, totals, current: T0, best, robust, table: table.sort((a, b) => a.threshold - b.threshold), scenarios, options: o, findings, label };
}

export function summarize(report) {
  if (!report.count) return { status: "none", errors: 0, warns: 0, text: "No usable rows found. Expected lines like: 54.20,6.85 (order subtotal before shipping, optional shipping cost you paid)." };
  const warns = report.findings.filter((f) => f.severity === "warn").length;
  const t = report.totals;
  const b = report.best;
  return { status: warns ? "warn" : "ok", errors: 0, warns, text: `${report.count} order(s), average order $${t.aov.toFixed(2)}, shipping costs you about $${t.avgShip.toFixed(2)} an order. Best threshold at your assumptions: ${report.label(b.threshold)}${b.threshold === report.current ? " (what you have now)" : ` (${b.gain >= 0 ? "+" : "-"}$${Math.abs(b.gain).toFixed(2)} on these orders vs ${report.label(report.current)})`}.` };
}

export const INPUT_NOTES = [
  { what: "subtotal[,shipping_cost]", detail: "One row per order. Subtotal is the merchandise total before shipping and tax (Shopify orders export: Subtotal; WooCommerce: order total minus shipping). Shipping cost is what you paid for the label or fulfilment; blank uses the average of the rows that have one." },
  { what: "header row", detail: "One optional header; a column named subtotal/order/total/amount and one named ship/postage/freight are picked out in any order." },
  { what: "current threshold", detail: "The free-shipping minimum you run today, so the file is read as orders that already faced it. Blank means you charge shipping on every order." },
  { what: "margin", detail: "Profit share of merchandise after product cost, payment fees and packaging, before shipping. 40% if you do not know." },
  { what: "shipping fee", detail: "What a customer pays when the order is under the threshold. Blank means they pay your average shipping cost (full pass-through)." },
  { what: "top-up rate", detail: "Of orders right under the threshold, the share who add items to reach it. Not knowable from past orders; the result shows how the answer moves with it." },
  { what: "checkout drop-off", detail: "The share of would-be buyers who abandon when charged shipping. Not knowable from past orders; the result shows the drop-off at which each threshold breaks even." },
  { what: "# comment / blank lines", detail: "Ignored." },
  { what: "other lines", detail: "Counted as skipped, never guessed at." },
];
