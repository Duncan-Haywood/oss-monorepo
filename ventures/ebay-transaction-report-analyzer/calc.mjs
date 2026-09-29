// eBay seller analysis from one file the seller already has: Seller Hub ->
// Payments -> Reports -> Transaction report. One row per order line, label,
// refund, fee or payout. Output is the fee waterfall, profit per item after fees,
// shipping labels, refunds and the seller's own cost of goods, and plain-language
// findings. Pure functions, no DOM, no network.

const ALIASES = {
  date: ["transaction creation date", "transaction date", "date"],
  type: ["type", "transaction type"],
  orderId: ["order number", "order id", "legacy order id"],
  net: ["net amount", "net"],
  itemId: ["item id"],
  title: ["item title", "title"],
  label: ["custom label", "sku", "custom label (sku)"],
  quantity: ["quantity"],
  subtotal: ["item subtotal", "item price"],
  shipping: ["shipping and handling", "shipping & handling", "shipping and handling amount"],
  fvfFixed: ["final value fee - fixed", "final value fee – fixed", "final value fee fixed"],
  fvfVariable: ["final value fee - variable", "final value fee – variable", "final value fee variable"],
  vhFee: ["very high \"item not as described\" fee", "very high 'item not as described' fee", "very high item not as described fee"],
  belowStd: ["below standard performance fee"],
  intlFee: ["international fee"],
  description: ["description", "reference id"],
};

export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  const src = String(text ?? "").replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

// eBay writes "Sep 28, 2026", "28 Sep 2026", "28-Sep-26", "09/28/2026" or ISO.
export function parseDate(value) {
  const s = String(value ?? "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return { y: +m[1], mo: +m[2] - 1, d: +m[3] };
  m = s.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m && MONTHS[m[1].toLowerCase()] !== undefined) return { y: +m[3], mo: MONTHS[m[1].toLowerCase()], d: +m[2] };
  m = s.match(/^(\d{1,2})[\s-]+([A-Za-z]{3})[a-z]*\.?[\s,-]+(\d{2,4})/);
  if (m && MONTHS[m[2].toLowerCase()] !== undefined) return { y: +m[3] < 100 ? 2000 + +m[3] : +m[3], mo: MONTHS[m[2].toLowerCase()], d: +m[1] };
  m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/);
  if (m) return { y: +m[3], mo: +m[1] - 1, d: +m[2] }; // US month-first
  return null;
}
const monthKeyOf = (p) => `${p.y}-${String(p.mo + 1).padStart(2, "0")}`;

// "--" and "" are how eBay writes "nothing here"; both are zero, not errors.
export function parseMoney(value) {
  let s = String(value ?? "").trim();
  if (!s || /^-+$/.test(s)) return 0;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/^\s*-/.test(s)) neg = true;
  s = s.replace(/[^0-9.,]/g, "");
  if (s.includes(",") && s.includes(".")) {
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (s.includes(",")) {
    s = /,\d{1,2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  }
  const n = parseFloat(s);
  if (Number.isNaN(n)) return NaN;
  return neg ? -n : n;
}

function findColumns(header) {
  const norm = header.map((h) => h.trim().toLowerCase().replace(/[“”]/g, '"').replace(/[‘’]/g, "'"));
  const cols = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    for (const n of names) {
      const at = norm.indexOf(n);
      if (at !== -1) { cols[field] = at; break; }
    }
  }
  return cols;
}

// The real export starts with a few lines of account and date-range text
// before the header row, so the header is searched for rather than assumed.
function headerRowIndex(table) {
  for (let i = 0; i < Math.min(table.length, 40); i++) {
    const norm = table[i].map((h) => h.trim().toLowerCase());
    if (norm.includes("type") && norm.includes("net amount") && (norm.some((h) => h.includes("date")))) return i;
  }
  return -1;
}

export function normalizeReport(table) {
  if (!table.length) return { rows: [], skipped: [], error: "The file is empty." };
  const h = headerRowIndex(table);
  if (h === -1) return { rows: [], skipped: [], error: "No header row found. Expected the Seller Hub Transaction report with columns like “Transaction creation date”, “Type”, “Order number”, “Net amount”, “Item title” and “Final value fee - variable”." };
  const cols = findColumns(table[h]);
  if (cols.date === undefined || cols.type === undefined || cols.net === undefined) return { rows: [], skipped: [], error: "The Transaction report needs “Transaction creation date”, “Type” and “Net amount” columns." };
  const get = (r, f) => (cols[f] === undefined ? "" : (r[cols[f]] ?? "")).trim();
  const rows = [], skipped = [];
  for (let i = h + 1; i < table.length; i++) {
    const r = table[i];
    const line = i + 1;
    const first = (r[0] ?? "").trim().toLowerCase();
    if (/^(total|summary|report generated|records? found|-+)/.test(first)) continue; // footer lines
    const date = parseDate(get(r, "date"));
    if (!date) { skipped.push({ line, reason: `unreadable date “${get(r, "date")}”` }); continue; }
    const money = (f) => parseMoney(get(r, f));
    const net = money("net"), subtotal = money("subtotal"), shipping = money("shipping");
    const fvfFixed = money("fvfFixed"), fvfVariable = money("fvfVariable"), vhFee = money("vhFee"), belowStd = money("belowStd"), intlFee = money("intlFee");
    if ([net, subtotal, shipping, fvfFixed, fvfVariable, vhFee, belowStd, intlFee].some(Number.isNaN)) { skipped.push({ line, reason: "unreadable amount" }); continue; }
    rows.push({
      line, date, month: monthKeyOf(date),
      type: get(r, "type"), typeKey: get(r, "type").toLowerCase(),
      orderId: get(r, "orderId"), itemId: get(r, "itemId"),
      title: get(r, "title"), label: get(r, "label"),
      quantity: parseInt(get(r, "quantity"), 10) || 0,
      description: get(r, "description"), descKey: get(r, "description").toLowerCase(),
      net, subtotal, shipping,
      // eBay writes fees as negatives in some exports and positives in others;
      // they are costs either way.
      fvfFixed: Math.abs(fvfFixed), fvfVariable: Math.abs(fvfVariable),
      vhFee: Math.abs(vhFee), belowStd: Math.abs(belowStd), intlFee: Math.abs(intlFee),
    });
  }
  return { rows, skipped, error: null };
}

const round2 = (n) => Math.round(n * 100) / 100;

// Every row lands in exactly one bucket.
export function classify(r) {
  const y = r.typeKey, d = r.descKey;
  if (y === "payout" || y === "transfer" || /^payout|^transfer to/.test(y)) return "payout";
  if (y === "order" || y === "sale") return "order";
  if (y === "refund") return "refund";
  if (y === "shipping label" || /shipping label/.test(y)) return "labels";
  if (/dispute|claim|hold|chargeback|return/.test(y)) return "disputes";
  if (/promoted|advert|ads?\b/.test(d) || /promoted|advert/.test(y)) return "ads";
  if (/insertion|listing fee|relist/.test(d)) return "listing";
  if (/store|subscription/.test(d)) return "subscription";
  if (/international/.test(d)) return "international";
  return "other";
}

const COST_BUCKETS = ["fvf", "extraFees", "ads", "listing", "subscription", "labels", "disputes", "other"];

const nameOf = (r) => r.title || (r.itemId ? `Item ${r.itemId}` : "(unnamed item)");

// costs: { [item title or custom label]: unitCost }
export function analyze(rows, { costs = {}, returnsResellable = true } = {}) {
  if (!rows.length) return { invalid: "No usable rows." };
  const b = { sales: 0, refunds: 0, taxAndAdjustments: 0 };
  for (const k of COST_BUCKETS) b[k] = 0;
  const counts = {};
  const months = new Map();
  let payouts = 0, shippingCollected = 0;
  const month = (k) => {
    if (!months.has(k)) months.set(k, { key: k, sales: 0, fees: 0, refunds: 0, net: 0 });
    return months.get(k);
  };

  // Index items by order and by item id so label, refund and ad rows, which
  // carry no title, can be tied back to what was sold.
  const orderItems = new Map(), itemNames = new Map();
  for (const r of rows) {
    if (classify(r) !== "order") continue;
    const name = nameOf(r);
    if (r.itemId) itemNames.set(r.itemId, name);
    if (r.orderId) {
      if (!orderItems.has(r.orderId)) orderItems.set(r.orderId, new Map());
      const m = orderItems.get(r.orderId);
      m.set(name, (m.get(name) || 0) + Math.max(r.subtotal, 0.01));
    }
  }

  const items = new Map();
  const item = (name, label = "") => {
    if (!items.has(name)) items.set(name, { name, label, units: 0, unitsRefunded: 0, orders: 0, sales: 0, fees: 0, labels: 0, refunds: 0, net: 0 });
    const it = items.get(name);
    if (label && !it.label) it.label = label;
    return it;
  };
  const orderSet = new Set(), refundedOrders = new Map();
  let attributedNet = 0;
  const attribute = (r, fn) => {
    const shares = orderItems.get(r.orderId);
    if (shares) {
      const total = [...shares.values()].reduce((a, x) => a + x, 0);
      for (const [name, w] of shares) fn(item(name), w / total);
      return true;
    }
    if (r.itemId && itemNames.has(r.itemId)) { fn(item(itemNames.get(r.itemId)), 1); return true; }
    return false;
  };

  for (const r of rows) {
    const cat = classify(r);
    counts[cat] = (counts[cat] || 0) + 1;
    if (cat === "payout") { payouts += Math.abs(r.net); continue; }
    const m = month(r.month);
    m.net += r.net;
    if (cat === "order") {
      const gross = r.subtotal + r.shipping;
      const fvf = r.fvfFixed + r.fvfVariable;
      const extra = r.vhFee + r.belowStd + r.intlFee;
      const residual = r.net - (gross - fvf - extra);
      b.sales += gross; shippingCollected += r.shipping;
      b.fvf -= fvf; b.extraFees -= extra; b.taxAndAdjustments += residual;
      m.sales += gross; m.fees -= fvf + extra;
      if (r.orderId) orderSet.add(r.orderId);
      const it = item(nameOf(r), r.label);
      it.units += r.quantity || 1; it.orders += 1; it.sales += gross;
      it.fees -= fvf + extra; it.net += r.net;
      attributedNet += r.net;
      continue;
    }
    if (cat === "refund") {
      b.refunds += r.net; m.refunds += r.net;
      refundedOrders.set(r.orderId, (refundedOrders.get(r.orderId) || 0) + r.net);
    } else {
      b[cat === "international" ? "extraFees" : cat] += r.net;
      if (cat !== "labels") m.fees += r.net;
    }
    if (r.orderId || r.itemId) {
      const done = attribute(r, (it, share) => {
        it.net += r.net * share; attributedNet += r.net * share;
        if (cat === "refund") it.refunds += r.net * share;
        else if (cat === "labels") it.labels += r.net * share;
        else it.fees += r.net * share;
      });
      if (!done) counts.unattributed = (counts.unattributed || 0) + 1;
    }
  }

  // An order refunded for ~all of what was paid returns its units to stock.
  const fullyRefunded = new Set();
  for (const [id, amt] of refundedOrders) {
    if (!id) continue;
    let paid = 0;
    for (const r of rows) if (r.orderId === id && classify(r) === "order") paid += r.subtotal + r.shipping;
    if (paid > 0 && -amt >= paid * 0.95) fullyRefunded.add(id);
  }
  for (const r of rows) {
    if (classify(r) === "order" && fullyRefunded.has(r.orderId)) item(nameOf(r), r.label).unitsRefunded += r.quantity || 1;
  }

  const costTotal = COST_BUCKETS.reduce((a, k) => a + b[k], 0);
  const operating = b.sales + b.refunds + b.taxAndAdjustments + costTotal;
  const platformFees = b.fvf + b.extraFees + b.ads + b.listing + b.subscription;

  const itemList = [...items.values()].map((l) => {
    const netUnits = l.units - l.unitsRefunded;
    const cost = costs[l.name] ?? (l.label ? costs[l.label] : undefined);
    const hasCost = typeof cost === "number" && !Number.isNaN(cost);
    const costedUnits = returnsResellable ? Math.max(0, netUnits) : l.units;
    const cogs = hasCost ? cost * costedUnits : null;
    return {
      ...l, netUnits, cost: hasCost ? cost : null,
      refundRate: l.units ? l.unitsRefunded / l.units : 0,
      feeRate: l.sales ? -l.fees / l.sales : 0,
      cogs,
      profit: hasCost ? l.net - cogs : null,
      profitPerUnit: hasCost && netUnits > 0 ? (l.net - cogs) / netUnits : null,
      margin: hasCost && l.sales ? (l.net - cogs) / l.sales : null,
    };
  }).sort((a, c) => c.sales - a.sales);

  const monthList = [...months.values()].sort((a, c) => a.key.localeCompare(c.key));
  const anyCosted = itemList.some((l) => l.profit !== null);
  const allCosted = itemList.length > 0 && itemList.every((l) => l.profit !== null);
  const cogsTotal = itemList.reduce((a, l) => a + (l.cogs ?? 0), 0);
  const orderCount = orderSet.size || counts.order || 0;

  const summary = {
    firstMonth: monthList[0]?.key ?? "", lastMonth: monthList[monthList.length - 1]?.key ?? "",
    sales: b.sales, refunds: b.refunds, buckets: b, costTotal, operating, payouts, counts, orderCount,
    platformFees, shippingCollected,
    takeRate: b.sales ? -platformFees / b.sales : 0,
    refundRate: b.sales ? -b.refunds / b.sales : 0,
    adRate: b.sales ? -b.ads / b.sales : 0,
    labelGap: shippingCollected + b.labels, // shipping paid by buyers minus labels bought
    avgOrder: orderCount ? b.sales / orderCount : 0,
    shopLevel: operating - attributedNet - b.taxAndAdjustments,
    attributedNet, cogsTotal, allCosted, anyCosted, itemCount: itemList.length,
    profit: anyCosted ? operating - cogsTotal : null,
  };
  return { summary, items: itemList, months: monthList, findings: findings(summary, itemList, monthList) };
}

const $ = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const P = (x, d = 1) => (x * 100).toFixed(d) + "%";

function findings(s, list, months) {
  const out = [];
  const add = (severity, title, detail) => out.push({ severity, title, detail });
  const b = s.buckets;

  if (s.sales > 0) {
    add(s.takeRate > 0.18 ? "medium" : "info", `eBay kept ${P(s.takeRate)} of sales in fees and ads`,
      `${$(-s.platformFees)} against ${$(s.sales)} of sales: final value fees ${$(-b.fvf)}, other per-order fees ${$(-b.extraFees)}, Promoted Listings ${$(-b.ads)}, insertion fees ${$(-b.listing)}, store subscription ${$(-b.subscription)}. Most categories charge a percentage of the whole order (item, shipping and tax where collected) plus a small fixed fee per order, so cheap items pay proportionally more.`);
  }

  if (s.adRate > 0.03) {
    add(s.adRate > 0.08 ? "high" : "medium", `Promoted Listings cost ${P(s.adRate)} of sales (${$(-b.ads)})`,
      `${s.counts.ads || 0} ad charge${s.counts.ads === 1 ? "" : "s"}. Promoted Listings Standard charges the ad rate only when the buyer clicked the ad and bought within 30 days. Compare the rate with your margin on the items involved: at a 10% ad rate an item earning 12% after costs keeps 2%.`);
  }

  if (s.refundRate > 0.05) {
    add(s.refundRate > 0.1 ? "high" : "medium", `Refunds are ${P(s.refundRate)} of sales (${$(-s.refunds)})`,
      "Returns cost the sale and the outbound label, and eBay does not always return every fee. Read the return reasons on the top items and fix the listing photos, condition wording or size information behind them.");
  }

  if (s.labelGap < -50 && s.sales > 0) {
    add(s.labelGap / s.sales < -0.03 ? "high" : "medium", `You spent ${$(-s.labelGap)} more on shipping labels than buyers paid for shipping`,
      `Buyers paid ${$(s.shippingCollected)} shipping and handling; labels cost ${$(-b.labels)}. Free-shipping listings show up here by design, and the loss is real margin. Re-check weight and package size on the items with the biggest gap, or fold the difference into the price.`);
  }

  if (b.disputes < -1) {
    add("medium", `${$(-b.disputes)} lost to disputes, holds and claims`, `${s.counts.disputes || 0} row${s.counts.disputes === 1 ? "" : "s"}. Check each for a case you can still appeal with tracking or photos.`);
  }

  const perfFees = list.length ? rowsOfExtra(b) : 0;
  if (perfFees > 0) add("medium", `${$(perfFees)} in performance and international fees`, "Below-standard performance, very-high “item not as described” and international fees are avoidable: they follow seller metrics and cross-border sales. Check the Seller Hub performance dashboard.");

  const avgOrder = s.avgOrder;
  if (avgOrder > 0 && avgOrder < 15 && s.sales > 200) {
    add("medium", `Average order is only ${$(avgOrder)}`,
      "Fixed per-order fees and label costs are a much larger share of a small order. Consider multi-item bundles, combined shipping and a minimum price for items that barely clear it.");
  }

  const losers = list.filter((x) => x.profit !== null && x.profit < 0 && x.units >= 2);
  if (losers.length) {
    const worst = [...losers].sort((a, c) => a.profit - c.profit).slice(0, 3);
    add("high", `${losers.length} item${losers.length > 1 ? "s" : ""} lose money after cost of goods`,
      `Worst: ${worst.map((x) => `${x.name} (${$(x.profit)} on ${x.units} units)`).join("; ")}. Raise the price, cut the cost, drop free shipping or stop promoting them.`);
  }

  const thin = list.filter((x) => x.margin !== null && x.margin >= 0 && x.margin < 0.15 && x.units >= 5);
  if (thin.length) {
    add("medium", `${thin.length} item${thin.length > 1 ? "s" : ""} earn under 15% after cost of goods`,
      `${thin.slice(0, 4).map((x) => `${x.name} ${P(x.margin)}`).join("; ")}. Your time and packaging are not in the cost figure, so a thin margin here is thinner than it looks.`);
  }

  const refunded = list.filter((x) => x.units >= 5 && x.refundRate >= 0.1).sort((a, c) => c.refundRate - a.refundRate);
  if (refunded.length) {
    add("high", `${refunded.length} item${refunded.length > 1 ? "s" : ""} with 10%+ of units in fully refunded orders`,
      `${refunded.slice(0, 4).map((x) => `${x.name} ${P(x.refundRate)}`).join("; ")}.`);
  }

  if (months.length >= 4) {
    const rate = (m) => (m.sales ? -m.fees / m.sales : null);
    const first = months.slice(0, 2).map(rate).filter((x) => x !== null);
    const last = months.slice(-2).map(rate).filter((x) => x !== null);
    if (first.length && last.length) {
      const a = first.reduce((x, y) => x + y) / first.length, c = last.reduce((x, y) => x + y) / last.length;
      if (c - a > 0.03) add("medium", `Fees rose from ${P(a)} to ${P(c)} of sales`,
        `Comparing the first two and last two months. That is ${P(c - a)} of every sale gone to more ads, more fees or a category mix change. If prices did not move with it, margin fell by the same amount.`);
    }
  }

  const costed = list.filter((x) => x.profit !== null);
  if (costed.length >= 4) {
    const total = costed.reduce((a, x) => a + Math.max(0, x.profit), 0);
    const top = [...costed].sort((a, c) => c.profit - a.profit)[0];
    if (total > 0 && top.profit / total > 0.6) {
      add("medium", `${top.name} earns ${P(top.profit / total)} of your item profit`,
        "One item carrying most of the profit is a risk: a supplier problem, a policy change or a competitor hits the whole store.");
    }
  }

  if (s.itemCount > 0 && !s.anyCosted) {
    add("info", "Enter your unit costs to see real profit",
      "What you paid for the stock is not in the eBay file. Type a cost per unit next to each item (or paste name,cost lines) and profit, margin and loss-maker findings appear.");
  } else if (s.itemCount > 0 && !s.allCosted) {
    add("info", "Some items have no unit cost yet", "Profit for those items is left out rather than counted as free.");
  }

  const rank = { high: 0, medium: 1, info: 2 };
  return out.sort((a, c) => rank[a.severity] - rank[c.severity]);
}

// Performance, very-high-INAD and international fees live inside extraFees;
// this is the total, shown only when it is worth a finding.
function rowsOfExtra(b) {
  const v = -b.extraFees;
  return v >= 20 ? v : 0;
}

export function parseCosts(text) {
  const costs = {};
  const bad = [];
  String(text ?? "").split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const cells = parseCsv(line)[0] || [];
    if (cells.length < 2) { bad.push(i + 1); return; }
    const v = parseMoney(cells[cells.length - 1]);
    const k = cells.slice(0, -1).join(",").trim();
    if (!k || Number.isNaN(v) || v < 0) { if (i > 0 || !/^(name|item|title|sku)/i.test(k)) bad.push(i + 1); return; }
    costs[k] = v;
  });
  return { costs, bad };
}

const PRODUCTS = [
  { name: "Vintage Nikon FE2 35mm Film Camera Body", price: 145, per: 4, cost: 78, refund: 0.15, ship: 0, weight: 14 },
  { name: "Lot of 12 Hot Wheels Cars Mint on Card", price: 34, per: 14, cost: 14, refund: 0.05, ship: 0, weight: 9 },
  { name: "Nintendo Switch Joy-Con Charging Grip", price: 19.99, per: 18, cost: 9.5, refund: 0.04, ship: 4.5, weight: 5 },
  { name: "Carhartt Detroit Jacket Mens Large Brown", price: 72, per: 8, cost: 31, refund: 0.1, ship: 0, weight: 13 },
];

// Deterministic synthetic store, in the Transaction report layout with the
// preamble lines the real export carries. Returns { report, costs } as text.
export function sampleData() {
  const head = 'Transaction creation date,Type,Order number,Legacy order ID,Buyer username,Net amount,Payout currency,Payout date,Payout ID,Item ID,Transaction ID,Item title,Custom label,Quantity,Item subtotal,Shipping and handling,Seller collected tax,eBay collected tax,Final value fee - fixed,Final value fee - variable,Very high "item not as described" fee,Below standard performance fee,International fee,Gross transaction amount,Transaction currency,Reference ID,Description';
  const out = [
    "Transaction report",
    '"Report period: Jun 1, 2026 - Sep 30, 2026"',
    "Seller: example_seller (synthetic data)",
    "",
    head,
  ];
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const m = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toFixed(2);
  const names = ["Jun", "Jul", "Aug", "Sep"];
  let n = 0;
  const orderRow = (date, oid, p, iid, qty, sub, ship, fixed, variable, net) =>
    out.push([q(date), "Order", oid, oid, "buyer" + n, m(net), "USD", "", "", iid, "T" + n, q(p.name), "SKU" + iid, qty, m(sub), m(ship), "$0.00", "$0.00", m(-fixed), m(-variable), "$0.00", "$0.00", "$0.00", m(sub + ship), "USD", "", ""].join(","));
  const other = (date, type, oid, iid, net, desc) =>
    out.push([q(date), type, oid, oid, "", m(net), "USD", "", "", iid, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "USD", "", q(desc)].join(","));
  names.forEach((mn, mi) => {
    PRODUCTS.forEach((p, pi) => {
      const count = Math.round(p.per * (1 + mi * 0.1));
      for (let i = 0; i < count; i++) {
        n++;
        const day = 1 + ((i * 3 + pi + mi) % 27);
        const date = `${mn} ${day}, 2026`;
        const oid = `${10 - 1}-${String(10000 + n * 7).padStart(5, "0")}-${String(20000 + n).padStart(5, "0")}`;
        const iid = String(300000000000 + pi);
        const gross = p.price + p.ship;
        const fixed = gross > 10 ? 0.4 : 0.3;
        const variable = round2(gross * 0.136);
        const net = round2(gross - fixed - variable);
        orderRow(date, oid, p, iid, 1, p.price, p.ship, fixed, variable, net);
        const label = round2(2.8 + p.weight * 0.34);
        other(date, "Shipping label", oid, iid, -label, "Shipping label - USPS Ground Advantage");
        if ((i + pi) % 5 === 0) other(date, "Other fee", oid, iid, -round2(p.price * 0.09), "Promoted Listings - Standard fee");
        if (i > 0 && (i + mi * 2) % Math.round(1 / p.refund) === 0) other(date, "Refund", oid, iid, -round2(gross), "Refund to buyer");
      }
    });
    other(`${mn} 5, 2026`, "Other fee", "", "", -4.95, "Store subscription fee");
    other(`${mn} 12, 2026`, "Other fee", "", "", -1.2, "Insertion fee");
    other(`${mn} 28, 2026`, "Payout", "", "", -300, "Payout");
  });
  const costs = PRODUCTS.map((p) => `${p.name},${p.cost.toFixed(2)}`);
  return { report: out.join("\n"), costs: "name,cost\n" + costs.join("\n") };
}

export const money = $;
export const pct = P;
