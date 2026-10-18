// Zero-dependency, deterministic ticket-resale economics. Two jobs:
//   1. price ONE listing: what you net after the marketplace's seller fee,
//      a per-ticket flat fee and delivery cost, the list price that breaks
//      even or hits a profit target, and what the listing is worth once you
//      allow for the chance it does not sell.
//   2. audit a LOG of past sales: profit, ROI and effective fee rate per
//      marketplace, so "which platform actually pays me best" is a number.
//
// What is arithmetic and what is an assumption. Arithmetic: every net,
// break-even and ROI figure. Assumptions the user supplies: the sale
// probability and the value of an unsold ticket. Fee presets are published
// seller-fee rates as we last read them -- marketplaces change them, charge
// buyers separately, and vary by country, event and account -- so they are
// starting points to overwrite, never a statement of what a platform will
// charge you.

export const MODEL_NOTE = "Fee presets are typical seller-side rates as last checked and marketplaces change them without notice, so confirm yours on the listing screen; buyer-side fees are paid by the buyer and are not modelled; income tax, sales tax and chargebacks are not modelled; sale probability is your own estimate, not a forecast";

export const PLATFORMS = {
  stubhub: { label: "StubHub", sellerFeePct: 10 },
  seatgeek: { label: "SeatGeek", sellerFeePct: 10 },
  vividseats: { label: "Vivid Seats", sellerFeePct: 10 },
  ticketmaster: { label: "Ticketmaster resale", sellerFeePct: 15 },
  custom: { label: "Custom", sellerFeePct: 10 },
};

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const finite = (n) => typeof n === "number" && Number.isFinite(n);

function clean(input) {
  const o = { qty: 1, costPerTicket: 0, feePct: 10, flatFeePerTicket: 0, deliveryPerOrder: 0, ...input };
  for (const k of ["qty", "costPerTicket", "feePct", "flatFeePerTicket", "deliveryPerOrder"]) {
    if (!finite(o[k]) || o[k] < 0) throw new RangeError(`${k} must be a non-negative number`);
  }
  if (!Number.isInteger(o.qty) || o.qty < 1) throw new RangeError("qty must be a whole number of at least 1");
  if (o.feePct >= 100) throw new RangeError("feePct must be below 100");
  return o;
}

/** Net money in hand if all `qty` tickets sell at `listPerTicket` (the price the buyer sees before their own fees). */
export function netIfSold(listPerTicket, input) {
  const o = clean(input);
  if (!finite(listPerTicket) || listPerTicket < 0) throw new RangeError("listPerTicket must be a non-negative number");
  const gross = listPerTicket * o.qty;
  const sellerFee = gross * (o.feePct / 100) + o.flatFeePerTicket * o.qty;
  const payout = gross - sellerFee - o.deliveryPerOrder;
  const cost = o.costPerTicket * o.qty;
  const profit = payout - cost;
  return {
    gross: round2(gross), sellerFee: round2(sellerFee), delivery: round2(o.deliveryPerOrder), payout: round2(payout),
    cost: round2(cost), profit: round2(profit), roi: cost > 0 ? round2((profit / cost) * 100) : null,
    effectiveFeePct: gross > 0 ? round2(((sellerFee + o.deliveryPerOrder) / gross) * 100) : null,
  };
}

/** List price per ticket that leaves `targetProfit` (total, for the whole order) after fees and delivery. */
export function listForProfit(targetProfit, input) {
  const o = clean(input);
  if (!finite(targetProfit)) throw new RangeError("targetProfit must be a number");
  const need = targetProfit + o.costPerTicket * o.qty + o.deliveryPerOrder + o.flatFeePerTicket * o.qty;
  return round2(need / (o.qty * (1 - o.feePct / 100)));
}

/** The list price at which a sale only just gets your money back. */
export const breakEvenList = (input) => listForProfit(0, input);

/**
 * Expected profit of a listing when it may not sell. Unsold tickets are
 * worth `salvagePerTicket` each (0 if the event passes; a resale at face
 * or the value of going yourself otherwise). `pSell` is 0-1, your estimate.
 */
export function expectedProfit(listPerTicket, input, { pSell, salvagePerTicket = 0 }) {
  const o = clean(input);
  if (!finite(pSell) || pSell < 0 || pSell > 1) throw new RangeError("pSell must be between 0 and 1");
  if (!finite(salvagePerTicket) || salvagePerTicket < 0) throw new RangeError("salvagePerTicket must be non-negative");
  const sold = netIfSold(listPerTicket, o);
  const unsold = salvagePerTicket * o.qty - sold.cost;
  const ev = pSell * sold.profit + (1 - pSell) * unsold;
  const spread = sold.payout - salvagePerTicket * o.qty;
  return {
    ifSold: sold.profit, ifUnsold: round2(unsold), expected: round2(ev),
    breakEvenPSell: spread > 0 ? round2(Math.min(1, Math.max(0, (sold.cost - salvagePerTicket * o.qty) / spread))) : null,
  };
}

/** Profit/ROI table across a range of list prices around break-even. */
export function priceSweep(input, { steps = 9, stepPct = 10 } = {}) {
  const o = clean(input);
  const base = breakEvenList(o) || o.costPerTicket || 1;
  const rows = [];
  for (let i = 0; i < steps; i += 1) {
    const price = round2(base * (1 + (i * stepPct) / 100));
    rows.push({ price, ...netIfSold(price, o) });
  }
  return rows;
}

/** Same order on every marketplace, best payout first. */
export function comparePlatforms(listPerTicket, input, feeOverrides = {}) {
  return Object.entries(PLATFORMS).filter(([k]) => k !== "custom").map(([key, p]) => {
    const feePct = finite(feeOverrides[key]) ? feeOverrides[key] : p.sellerFeePct;
    return { key, label: p.label, feePct, ...netIfSold(listPerTicket, { ...input, feePct }) };
  }).sort((a, b) => b.profit - a.profit);
}

// ---- sales log ----------------------------------------------------------

const HEADERS = {
  event: /^(event|show|game|name|description)/i,
  platform: /^(platform|marketplace|site|sold.?on|venue.?site)/i,
  qty: /^(qty|quantity|tickets|count)/i,
  cost: /^(cost|paid|buy|purchase|cost.?total|total.?cost)/i,
  sale: /^(sale|sold|price|gross|sale.?price|list)/i,
  fees: /^(fees?|seller.?fees?|total.?fees?)/i,
  payout: /^(payout|net|proceeds|received)/i,
};
const toNumber = (s) => {
  const t = String(s ?? "").trim().replace(/^\(\s*(.*)\)$/, "-$1").replace(/[$,]/g, "");
  const n = Number(t);
  return t !== "" && Number.isFinite(n) ? n : NaN;
};
function splitLine(line) {
  const cells = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i += 1; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === "," || c === "\t") { cells.push(cur.trim()); cur = ""; }
    else cur += c;
  }
  cells.push(cur.trim());
  return cells;
}

/**
 * Parses a sales log. Header row (read by name) needs: event, platform,
 * cost (total you paid for the lot) and either payout (what the marketplace
 * paid you) or sale (gross) with fees. Optional: qty. Without a header the
 * order is event,platform,qty,cost,sale,fees.
 */
export function parseSales(text) {
  const rows = []; let skipped = 0; let col = null;
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const cells = splitLine(line);
    if (!col && cells.some((c) => HEADERS.platform.test(c)) && cells.some((c) => HEADERS.cost.test(c))) {
      col = {};
      for (const k of Object.keys(HEADERS)) col[k] = cells.findIndex((c) => HEADERS[k].test(c));
      continue;
    }
    const m = col || { event: 0, platform: 1, qty: 2, cost: 3, sale: 4, fees: 5, payout: -1 };
    const at = (k) => (m[k] >= 0 ? cells[m[k]] : undefined);
    const cost = toNumber(at("cost"));
    const payoutCell = toNumber(at("payout"));
    const sale = toNumber(at("sale"));
    const fees = Number.isNaN(toNumber(at("fees"))) ? 0 : toNumber(at("fees"));
    const gross = Number.isNaN(sale) ? (Number.isNaN(payoutCell) ? NaN : payoutCell + fees) : sale;
    const payout = Number.isNaN(payoutCell) ? gross - fees : payoutCell;
    const platform = String(at("platform") ?? "").trim();
    if (!platform || Number.isNaN(cost) || Number.isNaN(gross) || Number.isNaN(payout)) { skipped += 1; continue; }
    const qty = toNumber(at("qty"));
    rows.push({ event: String(at("event") ?? "").trim(), platform, qty: Number.isFinite(qty) && qty > 0 ? qty : 1, cost, gross, payout });
  }
  return { rows, skipped };
}

/** Per-platform and overall results for a parsed log. */
export function analyzeSales({ rows, skipped = 0 }) {
  const by = new Map();
  for (const r of rows) {
    const key = r.platform.toLowerCase();
    const e = by.get(key) || { platform: r.platform, sales: 0, tickets: 0, gross: 0, payout: 0, cost: 0 };
    e.sales += 1; e.tickets += r.qty; e.gross += r.gross; e.payout += r.payout; e.cost += r.cost;
    by.set(key, e);
  }
  const fin = (e) => ({
    ...e, gross: round2(e.gross), payout: round2(e.payout), cost: round2(e.cost),
    fees: round2(e.gross - e.payout), profit: round2(e.payout - e.cost),
    feePct: e.gross > 0 ? round2(((e.gross - e.payout) / e.gross) * 100) : null,
    roi: e.cost > 0 ? round2(((e.payout - e.cost) / e.cost) * 100) : null,
  });
  const platforms = [...by.values()].map(fin).sort((a, b) => b.profit - a.profit);
  const total = fin(rows.reduce((t, r) => ({ ...t, sales: t.sales + 1, tickets: t.tickets + r.qty, gross: t.gross + r.gross, payout: t.payout + r.payout, cost: t.cost + r.cost }), { platform: "All", sales: 0, tickets: 0, gross: 0, payout: 0, cost: 0 }));
  const losers = rows.filter((r) => r.payout < r.cost).map((r) => ({ event: r.event, platform: r.platform, loss: round2(r.cost - r.payout) })).sort((a, b) => b.loss - a.loss);
  return { count: rows.length, skipped, platforms, total, losers };
}

export function summarizeSales(report) {
  if (!report.count) return { status: "none", text: "No sales rows could be read." };
  const t = report.total;
  const best = report.platforms[0];
  const loseNote = report.losers.length ? `; ${report.losers.length} sale${report.losers.length === 1 ? "" : "s"} lost money (worst ${report.losers[0].event || report.losers[0].platform}, $${report.losers[0].loss})` : "";
  return { status: t.profit >= 0 ? "ok" : "loss", text: `${t.sales} sales netted $${t.profit} on $${t.cost} paid (${t.roi ?? "n/a"}% ROI), ${t.feePct ?? "n/a"}% of gross went to fees; best platform ${best.platform} ($${best.profit})${loseNote}.` };
}

export const INPUT_NOTES = [
  { what: "event,platform,qty,cost,sale,fees", detail: "One sale per line, in this order if there is no header row. cost is the total you paid for the lot; sale is the gross price; fees is what the marketplace kept." },
  { what: "event,platform,cost,payout", detail: "With a header row, columns are found by name. payout (what the marketplace paid you) can replace sale + fees." },
  { what: "$1,200.00 and (45.00)", detail: "Dollar signs and thousands separators are ignored; parentheses mean negative." },
  { what: "Blank lines and # comments", detail: "Skipped. A row with no platform or no readable numbers is counted as skipped, not guessed." },
];
