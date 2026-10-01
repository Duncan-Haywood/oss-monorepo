// Break-even ROAS, max CPA and LTV-adjusted ad economics. Pure functions, no I/O.
//
// Model (all money per order, USD or any single currency):
//   R   reported revenue = price * (1 - discount) + shipping charged. This is the
//       figure an ad platform reports as "purchase value", before returns.
//   Refunds: a share r of orders is refunded in full (R handed back).
//   Platform fee (marketplace / referral %) is charged on kept revenue only.
//   Payment fee (% of R plus a fixed amount) is charged on every order and is
//       NOT returned on a refund (card processors usually keep it).
//   COGS is spent on every order; a share `restock` of refunded units is resold,
//       so only (1 - r * restock) of COGS is lost. Outbound shipping is paid on
//       every order; return shipping only on refunded ones.
//   contribution = kept revenue - platform fee - payment fee - COGS - shipping
//   Break-even CPA = contribution (spend equal to contribution leaves profit 0).
//   Break-even ROAS = R / contribution, because ROAS = reported revenue / ad spend.
//   Target margin m is profit as a share of reported revenue (R for one order,
//       n * R across a customer's lifetime on the LTV basis).
//   LTV basis: a customer places n orders in total; the n - 1 repeat orders each
//       earn `repeatMarginPct` % of the first order's contribution with no ad
//       spend. The ad platform still only reports the first order's revenue, so
//       the LTV break-even ROAS is still R / (lifetime contribution).

export const DEFAULTS = Object.freeze({
  price: 80,
  discountPct: 10,
  cogs: 22,
  shippingCost: 7,
  shippingCharged: 0,
  paymentPct: 2.9,
  paymentFixed: 0.3,
  platformPct: 0,
  returnPct: 8,
  restockPct: 0,
  returnShipCost: 0,
  ordersPerCustomer: 1,
  repeatMarginPct: 100,
});

const FIELDS = {
  price: { label: "Price", min: 0, exclusiveMin: true },
  discountPct: { label: "Average discount", min: 0, max: 99.99 },
  cogs: { label: "Cost of goods per order", min: 0 },
  shippingCost: { label: "Shipping you pay per order", min: 0 },
  shippingCharged: { label: "Shipping charged to the customer", min: 0 },
  paymentPct: { label: "Payment fee %", min: 0, max: 100 },
  paymentFixed: { label: "Payment fee per order", min: 0 },
  platformPct: { label: "Platform or marketplace fee %", min: 0, max: 100 },
  returnPct: { label: "Return or refund rate", min: 0, max: 100 },
  restockPct: { label: "Returned units you can resell", min: 0, max: 100 },
  returnShipCost: { label: "Return shipping you pay", min: 0 },
  ordersPerCustomer: { label: "Orders per customer", min: 1 },
  repeatMarginPct: { label: "Repeat-order margin vs first order", min: -100, max: 1000 },
};

// Accepts 12, "12", "$1,234.50", "20%", "  7 ". Returns NaN when not a number.
export function num(value) {
  if (typeof value === "number") return value;
  if (value === null || value === undefined) return NaN;
  const s = String(value).replace(/[\s,$€£%]/g, "");
  if (s === "" || !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
  return Number(s);
}

// Blank optional fields fall back to DEFAULTS only when `useDefaults` is set
// (the example loader); on the page a blank means zero except price.
export function normalizeInputs(raw = {}, { blankIsZero = true } = {}) {
  const inputs = {};
  const errors = [];
  for (const [key, spec] of Object.entries(FIELDS)) {
    const v = raw[key];
    const blank = v === undefined || v === null || String(v).trim() === "";
    let n;
    if (blank) {
      if (key === "price") { errors.push("Enter a price."); continue; }
      n = key === "ordersPerCustomer" ? 1 : key === "repeatMarginPct" ? 100 : blankIsZero ? 0 : DEFAULTS[key];
    } else {
      n = num(v);
      if (!Number.isFinite(n)) { errors.push(`${spec.label}: "${v}" is not a number.`); continue; }
    }
    if (spec.exclusiveMin ? n <= spec.min : n < spec.min) { errors.push(`${spec.label} must be ${spec.exclusiveMin ? "above" : "at least"} ${spec.min}.`); continue; }
    if (spec.max !== undefined && n > spec.max) { errors.push(`${spec.label} must be ${spec.max} or less.`); continue; }
    inputs[key] = n;
  }
  return { inputs, errors };
}

const finite = (x) => Number.isFinite(x);
export const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

// Per-order waterfall at the expected refund rate.
export function orderEconomics(i) {
  const d = i.discountPct / 100, r = i.returnPct / 100, rs = i.restockPct / 100;
  const sellPrice = i.price * (1 - d);
  const reported = sellPrice + i.shippingCharged;
  const refunds = r * reported;
  const kept = reported - refunds;
  const platformFee = (i.platformPct / 100) * kept;
  const paymentFee = (i.paymentPct / 100) * reported + i.paymentFixed;
  const cogs = i.cogs * (1 - r * rs);
  const shipping = i.shippingCost + r * i.returnShipCost;
  const contribution = kept - platformFee - paymentFee - cogs - shipping;
  return { sellPrice, reported, refunds, kept, platformFee, paymentFee, cogs, shipping, contribution, contributionPct: reported > 0 ? contribution / reported : 0 };
}

// Contribution of one repeat order (no ad spend).
export function repeatContribution(i) {
  return orderEconomics(i).contribution * (i.repeatMarginPct / 100);
}

export function lifetime(i) {
  const e = orderEconomics(i);
  const n = i.ordersPerCustomer;
  const repeat = repeatContribution(i);
  return { orders: n, revenue: n * e.reported, contribution: e.contribution + (n - 1) * repeat, repeatContribution: repeat };
}

// CPA and ROAS needed for profit = marginPct of reported revenue.
// basis "first": one order. basis "ltv": the customer's lifetime.
export function targetFor(i, marginPct, basis = "first") {
  const e = orderEconomics(i);
  const m = marginPct / 100;
  let contribution, revenueBase;
  if (basis === "ltv") {
    const l = lifetime(i);
    contribution = l.contribution;
    revenueBase = l.revenue;
  } else {
    contribution = e.contribution;
    revenueBase = e.reported;
  }
  const maxCpa = contribution - m * revenueBase;
  const feasible = maxCpa > 0;
  return { marginPct, basis, maxCpa: feasible ? maxCpa : 0, rawMaxCpa: maxCpa, feasible, roas: feasible ? e.reported / maxCpa : Infinity };
}

export function breakEven(i) {
  const e = orderEconomics(i);
  const first = targetFor(i, 0, "first");
  const ltv = targetFor(i, 0, "ltv");
  const l = lifetime(i);
  return {
    economics: e,
    lifetime: l,
    maxCpa: first.maxCpa,
    roas: first.roas,
    maxCpaLtv: ltv.maxCpa,
    roasLtv: ltv.roas,
    losesBeforeAds: e.contribution <= 0,
    // The highest net margin on reported revenue reachable even with free ads.
    ceilingMarginPct: e.reported > 0 ? (e.contribution / e.reported) * 100 : 0,
  };
}

export const DEFAULT_MARGINS = [0, 10, 20];
export const DEFAULT_RETURN_RATES = [0, 5, 10, 15, 20, 30];
export const DEFAULT_COGS_CHANGES = [-20, -10, 0, 10, 20];

export function scenarioTable(i, margins = DEFAULT_MARGINS) {
  return margins.map((m) => ({ marginPct: m, first: targetFor(i, m, "first"), ltv: targetFor(i, m, "ltv") }));
}

// Break-even ROAS across return rates (rows) and COGS changes (columns).
export function sensitivity(i, returnRates = DEFAULT_RETURN_RATES, cogsChanges = DEFAULT_COGS_CHANGES) {
  return {
    returnRates,
    cogsChanges,
    rows: returnRates.map((rr) => ({
      returnPct: rr,
      cells: cogsChanges.map((c) => {
        const v = { ...i, returnPct: rr, cogs: i.cogs * (1 + c / 100) };
        const b = breakEven(v);
        return { cogsChangePct: c, roas: b.roas, roasLtv: b.roasLtv, maxCpa: b.maxCpa, maxCpaLtv: b.maxCpaLtv };
      }),
    })),
  };
}

// Campaign check. `revenue` is what the ad platform reports; `orders` is optional
// (estimated from revenue / R when blank). Revenue-proportional costs scale with the
// reported revenue and per-order costs with the order count, so an average order value
// different from the calculator's price is handled instead of ignored.
export function checkCampaign(i, { spend, revenue, orders, targetMarginPct = 0 }) {
  const s = num(spend), rev = num(revenue);
  if (!(s > 0)) return { error: "Enter the ad spend (more than 0)." };
  if (!(rev >= 0)) return { error: "Enter the revenue the platform reports (0 or more)." };
  const e = orderEconomics(i);
  const d = i.discountPct / 100, r = i.returnPct / 100, rs = i.restockPct / 100;
  const ordersGiven = num(orders);
  const hasOrders = finite(ordersGiven) && ordersGiven > 0;
  const n = hasOrders ? ordersGiven : e.reported > 0 ? rev / e.reported : 0;
  const revCoef = (1 - r) * (1 - i.platformPct / 100) - i.paymentPct / 100;
  const perOrder = i.cogs * (1 - r * rs) + i.shippingCost + r * i.returnShipCost + i.paymentFixed;
  const contribution = rev * revCoef - n * perOrder;
  const profit = contribution - s;
  const be = breakEven(i);
  const repeatPerCustomer = (i.ordersPerCustomer - 1) * repeatContribution(i);
  const ltvProfit = profit + n * repeatPerCustomer;
  const roas = rev / s;
  const target = targetFor(i, targetMarginPct, "first");
  const out = {
    spend: s, revenue: rev, orders: n, ordersEstimated: !hasOrders,
    roas, cpa: n > 0 ? s / n : null,
    contribution, profit, profitPerDollar: profit / s,
    ltvProfit, ltvProfitPerDollar: ltvProfit / s,
    marginOfRevenuePct: rev > 0 ? (profit / rev) * 100 : null,
    breakEvenRoas: be.roas, breakEvenRoasLtv: be.roasLtv, targetRoas: target.roas, targetMarginPct,
    roasGap: finite(be.roas) ? roas - be.roas : null,
  };
  const meetsTarget = rev > 0 && profit / rev >= targetMarginPct / 100 && profit >= 0;
  out.meetsTarget = targetMarginPct > 0 ? meetsTarget : profit >= 0;
  if (profit >= 0) out.verdict = "profit";
  else if (ltvProfit >= 0 && i.ordersPerCustomer > 1) out.verdict = "ltv-only";
  else out.verdict = "loss";
  return out;
}

// MER = total store revenue / total ad spend across every channel. It includes organic
// and repeat revenue, so it flatters a platform's own ROAS; compare it to break-even
// as a blended sanity check, not as proof that one campaign pays.
export function checkMer(i, { totalRevenue, totalSpend }) {
  const rev = num(totalRevenue), sp = num(totalSpend);
  if (!(sp > 0)) return { error: "Enter total ad spend across all channels (more than 0)." };
  if (!(rev >= 0)) return { error: "Enter total store revenue (0 or more)." };
  const be = breakEven(i);
  const mer = rev / sp;
  return { mer, breakEvenRoas: be.roas, clears: finite(be.roas) && mer >= be.roas, headroom: finite(be.roas) ? mer - be.roas : null };
}

// ---- formatting -------------------------------------------------------------

export function fmtMoney(x, digits = 2) {
  if (!finite(x)) return "n/a";
  const s = Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${x < 0 ? "-" : ""}$${s}`;
}
export function fmtRoas(x) {
  return finite(x) ? `${x.toFixed(2)}x` : "not reachable";
}
export function fmtPct(x, digits = 1) {
  return finite(x) ? `${x.toFixed(digits)}%` : "n/a";
}

// ---- CSV --------------------------------------------------------------------

function csvCell(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const csvRow = (cells) => cells.map(csvCell).join(",");
const numCell = (x) => (finite(x) ? round2(x) : "n/a");

export function scenarioCsv(rows) {
  const lines = [csvRow(["Target net margin %", "Max CPA first order", "Target ROAS first order", "Reachable first order", "Max CPA LTV basis", "Target ROAS LTV basis", "Reachable LTV basis"])];
  for (const r of rows) {
    lines.push(csvRow([r.marginPct, numCell(r.first.maxCpa), numCell(r.first.roas), r.first.feasible ? "yes" : "no", numCell(r.ltv.maxCpa), numCell(r.ltv.roas), r.ltv.feasible ? "yes" : "no"]));
  }
  return lines.join("\n") + "\n";
}

export function sensitivityCsv(s) {
  const head = ["Return rate %", ...s.cogsChanges.map((c) => `Break-even ROAS (COGS ${c > 0 ? "+" : ""}${c}%)`), ...s.cogsChanges.map((c) => `Break-even ROAS LTV (COGS ${c > 0 ? "+" : ""}${c}%)`)];
  const lines = [csvRow(head)];
  for (const r of s.rows) lines.push(csvRow([r.returnPct, ...r.cells.map((c) => numCell(c.roas)), ...r.cells.map((c) => numCell(c.roasLtv))]));
  return lines.join("\n") + "\n";
}

export function exampleInputs() {
  return { ...DEFAULTS, ordersPerCustomer: 1.6, repeatMarginPct: 100 };
}
