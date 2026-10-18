// eBay seller analysis from one CSV the seller already has: the Transaction
// report (Seller Hub -> Reports -> Downloads). Every order line carries its
// item, its fees and its net; shipping labels, refunds and Promoted Listings
// charges are separate rows joined back by order number. Output is the fee
// waterfall, profit per item after cost of goods, and plain-language
// findings. Pure functions, no DOM, no network.

const ALIASES = {
  date: ["transaction creation date", "date", "transaction date"],
  type: ["type", "transaction type"],
  orderId: ["order number", "order id", "order #"],
  legacyOrderId: ["legacy order id"],
  net: ["net amount", "net"],
  itemId: ["item id", "item number"],
  title: ["item title", "title", "description"],
  description: ["description"],
  label: ["custom label", "custom label (sku)", "sku"],
  quantity: ["quantity"],
  subtotal: ["item subtotal", "item price"],
  shipping: ["shipping and handling", "shipping & handling", "postage and packaging"],
  fvfFixed: ["final value fee - fixed", "final value fee – fixed", "final value fee fixed"],
  fvfVariable: ["final value fee - variable", "final value fee – variable", "final value fee variable"],
  notAsDescribed: ["very high \"not as described\" fee", "very high 'not as described' fee", "very high not as described fee"],
  belowStandard: ["below standard performance fee"],
  international: ["international fee"],
  depositProcessing: ["deposit processing fee"],
  gross: ["gross transaction amount"],
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

// eBay writes "Sep 1, 2026", "Sep 01, 2026", "1 Sep 2026", ISO or US slashes.
export function parseDate(value) {
  const s = String(value ?? "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return { y: +m[1], mo: +m[2] - 1, d: +m[3] };
  m = s.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m && MONTHS[m[1].toLowerCase()] !== undefined) return { y: +m[3], mo: MONTHS[m[1].toLowerCase()], d: +m[2] };
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})/);
  if (m && MONTHS[m[2].toLowerCase()] !== undefined) return { y: +m[3], mo: MONTHS[m[2].toLowerCase()], d: +m[1] };
  m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/);
  if (m) return { y: +m[3], mo: +m[1] - 1, d: +m[2] };
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
  const norm = header.map((h) => h.trim().toLowerCase().replace(/[“”]/g, '"'));
  const cols = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    for (const n of names) {
      const at = norm.indexOf(n);
      if (at !== -1) { cols[field] = at; break; }
    }
  }
  // "Description" is both the free-text reason on fee rows and, in older
  // exports, the item title: only treat it as the title when there is no
  // "Item title" column, and always keep it as the description.
  const d = norm.indexOf("description");
  if (d !== -1) cols.description = d;
  return cols;
}

// The report starts with a few lines of metadata (report name, seller,
// date range) before the header, so find the header instead of assuming row 0.
function headerRowIndex(table) {
  for (let i = 0; i < Math.min(table.length, 30); i++) {
    const norm = table[i].map((h) => h.trim().toLowerCase());
    if (norm.includes("type") && norm.includes("net amount") && (norm.includes("order number") || norm.includes("item id"))) return i;
  }
  return -1;
}

// One row per money movement. `net` is signed from the seller's point of view.
export function normalizeReport(table) {
  if (!table.length) return { rows: [], skipped: [], error: "The file is empty." };
  const h = headerRowIndex(table);
  if (h === -1) return { rows: [], skipped: [], error: "No header row found. Expected the Transaction report from Seller Hub (Reports → Downloads) with columns like “Type”, “Order number”, “Net amount”, “Item title” and “Final Value Fee - fixed”." };
  const cols = findColumns(table[h]);
  if (cols.date === undefined) return { rows: [], skipped: [], error: "No “Transaction creation date” column found." };
  const get = (r, f) => (cols[f] === undefined ? "" : (r[cols[f]] ?? "")).trim();
  const rows = [], skipped = [];
  for (let i = h + 1; i < table.length; i++) {
    const r = table[i];
    const line = i + 1;
    if (r.length < 3) continue; // trailing summary lines
    const date = parseDate(get(r, "date"));
    if (!date) { skipped.push({ line, reason: `unreadable date “${get(r, "date")}”` }); continue; }
    const num = (f) => parseMoney(get(r, f));
    const vals = { net: num("net"), subtotal: num("subtotal"), shipping: num("shipping"), fvfFixed: num("fvfFixed"), fvfVariable: num("fvfVariable"), notAsDescribed: num("notAsDescribed"), belowStandard: num("belowStandard"), international: num("international"), depositProcessing: num("depositProcessing") };
    if (Object.values(vals).some(Number.isNaN)) { skipped.push({ line, reason: "unreadable amount" }); continue; }
    const type = get(r, "type");
    const qty = parseInt(get(r, "quantity"), 10);
    rows.push({
      line, date, month: monthKeyOf(date), type, typeKey: type.toLowerCase(),
      orderId: get(r, "orderId") || get(r, "legacyOrderId"),
      itemId: get(r, "itemId"),
      title: cols.title !== undefined && cols.title !== cols.description ? get(r, "title") : "",
      description: get(r, "description"), label: get(r, "label"),
      quantity: Number.isNaN(qty) ? 1 : Math.max(1, qty),
      ...vals,
    });
  }
  return { rows, skipped, error: null };
}

const round2 = (n) => Math.round(n * 100) / 100;

// Every row lands in exactly one bucket. Ads are checked before the generic
// "fee" wording so "Promoted Listings - General fee" is not an "other fee".
export function classify(r) {
  const t = r.typeKey, d = r.description.toLowerCase();
  if (/^(payout|transfer|hold|release|payment to|withdrawal)/.test(t)) return "payout";
  if (t === "order" || t === "sale") return "sale";
  if (t === "refund" || /^refund/.test(d) && t !== "other fee") return "refund";
  if (t === "shipping label" || /shipping label|postage/.test(t)) return "labels";
  if (/^(claim|dispute)|payment dispute|chargeback|case/.test(t)) return "disputes";
  if (/promoted listing|promoted offsite|ad fee|advertis/.test(d)) return "ads";
  if (/insertion|listing fee|listing upgrade/.test(d)) return "listing";
  if (/store subscription|subscription/.test(d)) return "subscription";
  if (/international/.test(d)) return "international";
  if (/not as described|below standard|performance/.test(d)) return "penalty";
  if (/credit|reversal|adjust/.test(d) || t === "credit") return "credit";
  if (/fee|charge/.test(t) || /fee|charge/.test(d)) return "otherfee";
  return "other";
}

const FEE_BUCKETS = ["fvf", "international", "penalty", "depositfee", "ads", "listing", "subscription", "otherfee", "disputes", "labels", "credit", "other"];

const keyOf = (r) => r.itemId || r.title || "(unknown item)";

// costs: { [item title | custom label | item id]: unitCost }
export function analyze(rows, { costs = {}, returnsResellable = true } = {}) {
  if (!rows.length) return { invalid: "No usable transaction rows." };
  const buckets = { sale: 0, shippingCharged: 0, refund: 0, adjustments: 0 };
  for (const b of FEE_BUCKETS) buckets[b] = 0;
  const counts = {};
  const months = new Map();
  const orders = new Map();
  let payouts = 0;

  const month = (k) => {
    if (!months.has(k)) months.set(k, { key: k, sales: 0, fees: 0, refunds: 0, net: 0 });
    return months.get(k);
  };
  const order = (id) => {
    if (!orders.has(id)) orders.set(id, { id, lines: [], sale: 0, saleNet: 0, refund: 0, labels: 0, ads: 0, otherCosts: 0, net: 0 });
    return orders.get(id);
  };

  for (const r of rows) {
    const cat = classify(r);
    counts[cat] = (counts[cat] || 0) + 1;
    if (cat === "payout") { payouts += Math.abs(r.net); continue; }
    const m = month(r.month);
    m.net += r.net;
    const o = r.orderId ? order(r.orderId) : null;
    if (o) o.net += r.net;

    if (cat === "sale") {
      // Buyer-paid amount is item + shipping. Each fee column is a cost
      // whatever sign the export gives it; anything the columns do not
      // explain (seller-collected tax, currency rounding) is "adjustments",
      // so the waterfall always ties back to the Net amount column.
      const gross = r.subtotal + r.shipping;
      const fvf = -(Math.abs(r.fvfFixed) + Math.abs(r.fvfVariable));
      const intl = -Math.abs(r.international);
      const pen = -(Math.abs(r.notAsDescribed) + Math.abs(r.belowStandard));
      const dep = -Math.abs(r.depositProcessing);
      const explained = gross + fvf + intl + pen + dep;
      buckets.sale += r.subtotal;
      buckets.shippingCharged += r.shipping;
      buckets.fvf += fvf; buckets.international += intl; buckets.penalty += pen; buckets.depositfee += dep;
      buckets.adjustments += r.net - explained;
      const fees = fvf + intl + pen + dep;
      m.sales += gross; m.fees += fees;
      if (o) {
        o.sale += gross; o.saleNet += r.net;
        o.lines.push({ key: keyOf(r), title: r.title || r.description || r.itemId || "(unknown item)", itemId: r.itemId, label: r.label, qty: r.quantity, revenue: r.subtotal, gross, net: r.net });
      }
    } else if (cat === "refund") {
      buckets.refund += r.net; m.refunds += r.net;
      if (o) o.refund += r.net;
    } else if (cat === "labels") {
      buckets.labels += r.net;
      if (o) o.labels += r.net;
    } else {
      buckets[cat] = (buckets[cat] ?? 0) + r.net;
      m.fees += r.net;
      if (o && cat === "ads") o.ads += r.net;
      else if (o) o.otherCosts += r.net;
    }
  }

  const sales = buckets.sale + buckets.shippingCharged;
  const feeBuckets = {};
  let feeTotal = 0;
  for (const b of FEE_BUCKETS) { feeBuckets[b] = buckets[b]; feeTotal += buckets[b]; }
  // Labels are what the buyer's shipping payment buys, so they stay out of
  // the take rate that measures what eBay itself keeps.
  const platformFees = feeTotal - feeBuckets.labels - feeBuckets.disputes;
  const operating = buckets.sale + buckets.shippingCharged + buckets.refund + feeTotal + buckets.adjustments;

  // ---- per item ----
  const items = new Map();
  const item = (l) => {
    if (!items.has(l.key)) items.set(l.key, { key: l.key, name: l.title, itemId: l.itemId, label: l.label, units: 0, unitsRefunded: 0, orders: 0, revenue: 0, gross: 0, costs: 0, refunds: 0, ads: 0, labels: 0, net: 0 });
    return items.get(l.key);
  };
  let attributedNet = 0;
  for (const o of orders.values()) {
    if (!o.lines.length) continue;
    const total = o.lines.reduce((a, l) => a + l.gross, 0);
    // Refund rows usually carry the fee credit back, so compare refund to what
    // the sale paid out (its net), not to what the buyer paid.
    const fullyRefunded = o.saleNet > 0 && -o.refund >= o.saleNet * 0.95;
    for (const l of o.lines) {
      const share = total > 0 ? l.gross / total : 1 / o.lines.length;
      const it = item(l);
      it.units += l.qty; it.orders += 1; it.revenue += l.revenue; it.gross += l.gross;
      it.refunds += o.refund * share; it.ads += o.ads * share; it.labels += o.labels * share;
      // Everything the order caused: its own net, the label, refund and any
      // ad or other charge carrying its order number.
      const net = l.net + (o.labels + o.refund + o.ads + o.otherCosts) * share;
      it.net += net;
      attributedNet += net;
      if (fullyRefunded) it.unitsRefunded += l.qty;
    }
  }
  const costFor = (it) => {
    for (const k of [it.name, it.label, it.itemId, it.key]) if (k && typeof costs[k] === "number" && !Number.isNaN(costs[k])) return costs[k];
    return null;
  };
  const itemList = [...items.values()].map((it) => {
    const netUnits = it.units - it.unitsRefunded;
    const cost = costFor(it);
    const costed = returnsResellable ? Math.max(0, netUnits) : it.units;
    const cogs = cost === null ? null : cost * costed;
    return {
      ...it, netUnits, refundRate: it.units ? it.unitsRefunded / it.units : 0,
      avgPrice: it.units ? it.revenue / it.units : 0,
      cogs, profit: cogs === null ? null : it.net - cogs,
      profitPerUnit: cogs !== null && netUnits > 0 ? (it.net - cogs) / netUnits : null,
      margin: cogs !== null && it.gross ? (it.net - cogs) / it.gross : null,
    };
  }).sort((a, b) => b.gross - a.gross);

  const orderCount = [...orders.values()].filter((o) => o.sale > 0).length;
  const monthList = [...months.values()].sort((a, b) => a.key.localeCompare(b.key));
  const cogsTotal = itemList.reduce((a, x) => a + (x.cogs ?? 0), 0);
  const anyCosted = itemList.some((x) => x.profit !== null);
  const allCosted = itemList.length > 0 && itemList.every((x) => x.profit !== null);
  const shippingGap = buckets.shippingCharged + buckets.labels; // charged minus label spend (labels are negative)

  const summary = {
    firstMonth: monthList[0]?.key ?? "", lastMonth: monthList[monthList.length - 1]?.key ?? "",
    sales, itemSales: buckets.sale, shippingCharged: buckets.shippingCharged, refunds: buckets.refund,
    feeBuckets, feeTotal, platformFees, operating, payouts, adjustments: buckets.adjustments, counts, orderCount,
    takeRate: sales ? -platformFees / sales : 0,
    adRate: sales ? -buckets.ads / sales : 0,
    refundRate: sales ? -buckets.refund / sales : 0,
    avgOrder: orderCount ? sales / orderCount : 0,
    shippingGap, labelSpend: -buckets.labels,
    itemCount: itemList.length, attributedNet, shopLevel: operating - attributedNet, cogsTotal, anyCosted, allCosted,
    profit: anyCosted ? operating - cogsTotal : null,
  };
  return { summary, items: itemList, months: monthList, findings: findings(summary, itemList, monthList) };
}

const $ = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const P = (x, d = 1) => (x * 100).toFixed(d) + "%";

function findings(s, list, months) {
  const out = [];
  const add = (severity, title, detail) => out.push({ severity, title, detail });
  const fb = s.feeBuckets;

  if (s.sales > 0) {
    add(s.takeRate > 0.18 ? "medium" : "info", `eBay kept ${P(s.takeRate)} of what buyers paid`,
      `${$(-s.platformFees)} of fees and ads against ${$(s.sales)} of item and shipping revenue (shipping labels, ${$(-fb.labels)}, are separate because the buyer's shipping payment covers them). Final value fees ${$(-fb.fvf)}, Promoted Listings ${$(-fb.ads)}, international ${$(-fb.international)}, listing and subscription ${$(-(fb.listing + fb.subscription))}. eBay charges its final value fee on the shipping and tax you collect as well as the item price, which is why the rate is above the headline category percentage.`);
  }

  if (s.shippingCharged > 0 || s.labelSpend > 0) {
    if (s.shippingGap < -Math.max(20, s.sales * 0.01)) {
      add(s.shippingGap < -s.sales * 0.03 ? "high" : "medium", `Shipping cost you ${$(-s.shippingGap)} more than buyers paid`,
        `Buyers paid ${$(s.shippingCharged)} for shipping and labels bought through eBay cost ${$(s.labelSpend)}. Free shipping is a pricing choice, but it should be built into the item price on purpose. Check weight and package size on the items with the biggest gap.`);
    } else if (s.shippingGap > Math.max(20, s.sales * 0.01)) {
      add("info", `Shipping paid for itself with ${$(s.shippingGap)} to spare`,
        `Buyers paid ${$(s.shippingCharged)} and labels cost ${$(s.labelSpend)}. Labels bought outside eBay (pirate-style third-party postage) are not in this file, so the surplus may be smaller than it looks.`);
    }
  }

  if (s.adRate > 0.03) {
    add(s.adRate > 0.08 ? "high" : "medium", `Promoted Listings cost ${P(s.adRate)} of sales (${$(-fb.ads)})`,
      `${s.counts.ads || 0} ad charge${s.counts.ads === 1 ? "" : "s"}. General-campaign fees apply to the whole sale price when a buyer clicks a promoted listing and buys within 30 days, including sales that would have happened anyway. Compare the ad rate to your margin on the items promoted, and lower the ad rate or end campaigns on thin-margin items.`);
  }

  if (s.refundRate > 0.05) {
    add(s.refundRate > 0.1 ? "high" : "medium", `Refunds are ${P(s.refundRate)} of revenue`,
      `${$(-s.refunds)} refunded. eBay refunds the fixed per-order fee only in some cases, and the outbound label is already spent, so a returned order costs more than the margin it removes. Open the returns reasons and fix the listing description or packaging behind the top ones.`);
  }

  if ((fb.penalty ?? 0) < 0) {
    add("high", `${$(-fb.penalty)} of performance fees`,
      "“Very high not as described” or “below standard” fees are charged on top of the normal final value fee when defect rates pass eBay's thresholds. They are the most avoidable fee in the report; look at Seller Hub → Performance to see which defects triggered them.");
  }

  if ((fb.disputes ?? 0) < -1) {
    add("medium", `${$(-fb.disputes)} in disputes, claims and chargebacks`, "Rows typed Claim or Dispute in the report. Keep proof of delivery and package photos for any item that draws one.");
  }

  if (fb.international < 0 && s.sales > 0 && -fb.international / s.sales > 0.01) {
    add("medium", `International fees are ${P(-fb.international / s.sales)} of sales`,
      `${$(-fb.international)} charged on orders shipping to buyers outside your country. If your international items have thin margins, add the fee to the item price or turn off international shipping for them.`);
  }

  const losers = list.filter((x) => x.profit !== null && x.profit < 0 && x.units >= 2);
  if (losers.length) {
    const worst = [...losers].sort((a, b) => a.profit - b.profit).slice(0, 3);
    add("high", `${losers.length} item${losers.length > 1 ? "s" : ""} lose money after cost of goods`,
      `Worst: ${worst.map((x) => `${x.name} (${$(x.profit)} on ${x.units} units)`).join("; ")}. Raise the price, cut the cost, or stop promoting them.`);
  }

  const thin = list.filter((x) => x.margin !== null && x.margin >= 0 && x.margin < 0.15 && x.units >= 5);
  if (thin.length) {
    add("medium", `${thin.length} item${thin.length > 1 ? "s" : ""} earn under 15% after cost of goods`,
      `${thin.slice(0, 4).map((x) => `${x.name} ${P(x.margin)}`).join("; ")}. Your time is not in the cost figure, so a thin margin here is thinner than it looks.`);
  }

  const refunded = list.filter((x) => x.units >= 5 && x.refundRate >= 0.1).sort((a, b) => b.refundRate - a.refundRate);
  if (refunded.length) {
    add("high", `${refunded.length} item${refunded.length > 1 ? "s" : ""} with 10%+ of units in fully refunded orders`,
      `${refunded.slice(0, 4).map((x) => `${x.name} ${P(x.refundRate)}`).join("; ")}.`);
  }

  const cheap = list.filter((x) => x.orders >= 5 && x.avgPrice > 0 && x.avgPrice < 12);
  if (cheap.length) {
    add("info", `${cheap.length} low-priced item${cheap.length > 1 ? "s" : ""} carry the per-order fee heavily`,
      `${cheap.slice(0, 3).map((x) => `${x.name} (${$(x.avgPrice)} average)`).join("; ")}. eBay adds a fixed fee of $0.30 to $0.40 to every order, which is 3% to 4% of a $10 item on top of the percentage. Bundling or multi-buy offers spread it.`);
  }

  if (months.length >= 4) {
    const rate = (m) => (m.sales ? -m.fees / m.sales : null);
    const first = months.slice(0, 2).map(rate).filter((x) => x !== null);
    const last = months.slice(-2).map(rate).filter((x) => x !== null);
    if (first.length && last.length) {
      const a = first.reduce((x, y) => x + y) / first.length, b = last.reduce((x, y) => x + y) / last.length;
      if (b - a > 0.03) add("medium", `Fees rose from ${P(a)} to ${P(b)} of sales`,
        `Comparing the first two and last two months. That is ${P(b - a)} of every sale gone to more promotion, more international orders or fee changes. If prices did not move with it, margin fell by the same amount.`);
    }
  }

  const costed = list.filter((x) => x.profit !== null);
  if (costed.length >= 4) {
    const total = costed.reduce((a, x) => a + Math.max(0, x.profit), 0);
    const top = [...costed].sort((a, b) => b.profit - a.profit)[0];
    if (total > 0 && top.profit / total > 0.6) {
      add("medium", `${top.name} earns ${P(top.profit / total)} of your item profit`,
        "One item carrying most of the profit is a risk: a supplier problem, a policy change or a competing listing hits the whole store. Worth sourcing a second earner.");
    }
  }

  if (s.itemCount > 0 && !s.anyCosted) {
    add("info", "Enter your unit costs to see real profit",
      "What you paid for the item is not in the Transaction report. Type a cost per unit next to each item (or paste title,cost lines, custom label or item number work too) and profit, margin and loss-maker findings appear.");
  } else if (s.itemCount > 0 && !s.allCosted) {
    add("info", "Some items have no unit cost yet", "Profit for those items is left out rather than counted as free.");
  }

  const order = { high: 0, medium: 1, info: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
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
  { name: "Vintage Nikon FM2 35mm Film Camera Body", id: "134500000001", sku: "CAM-FM2", price: 219, per: 4, cost: 140, refund: 0.1, ship: 14.5, intl: 0 },
  { name: "LEGO Star Wars 75192 Millennium Falcon Sealed", id: "134500000002", sku: "LEGO-75192", price: 689, per: 2, cost: 610, refund: 0, ship: 0, intl: 0 },
  { name: "Carhartt Detroit Jacket J001 Size L", id: "134500000003", sku: "APP-J001L", price: 64, per: 9, cost: 22, refund: 0.06, ship: 9.4, intl: 0 },
  { name: "Pokemon Card Sleeves 100ct Lot", id: "134500000004", sku: "TCG-SLV", price: 9.5, per: 22, cost: 3.1, refund: 0.03, ship: 4.2, intl: 0 },
];

// Deterministic synthetic store: returns { report, costs } as text, in the
// layout of a Seller Hub Transaction report (metadata lines, then header).
export function sampleData() {
  const head = "Transaction creation date,Type,Order number,Legacy order ID,Buyer username,Buyer name,Ship to city,Ship to province/region/state,Ship to zip,Ship to country,Net amount,Payout currency,Payout date,Payout ID,Payout method,Payout status,Reason for hold,Item ID,Transaction ID,Item title,Custom label,Quantity,Item subtotal,Shipping and handling,Seller collected tax,eBay collected tax,Final Value Fee - fixed,Final Value Fee - variable,\"Very high \"\"not as described\"\" fee\",Below standard performance fee,International fee,Deposit processing fee,Gross transaction amount,Transaction currency,Exchange rate,Reference ID,Description";
  const out = ["Transaction report", "Seller ID,samplestore", "Report period,\"Jun 1, 2026 - Sep 30, 2026\"", "", head];
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const m = (n) => (n < 0 ? "-" : "") + Math.abs(n).toFixed(2);
  const row = (o) => {
    const c = new Array(37).fill("--");
    const set = (name, v) => { c[head.split(",").indexOf(name)] = v; };
    set("Transaction creation date", q(o.date)); set("Type", o.type); set("Order number", o.oid ?? "--");
    set("Net amount", m(o.net)); set("Item ID", o.id ?? "--"); set("Item title", o.title ? q(o.title) : "--");
    set("Custom label", o.sku ?? "--"); set("Quantity", o.qty ?? "--");
    set("Item subtotal", o.sub !== undefined ? m(o.sub) : "--"); set("Shipping and handling", o.ship !== undefined ? m(o.ship) : "--");
    set("Final Value Fee - fixed", o.fixed !== undefined ? m(-o.fixed) : "--"); set("Final Value Fee - variable", o.var !== undefined ? m(-o.var) : "--");
    set("Description", o.desc ? q(o.desc) : "--");
    out.push(c.join(","));
  };
  const names = ["Jun", "Jul", "Aug", "Sep"];
  let n = 0;
  names.forEach((mn, mi) => {
    PRODUCTS.forEach((p, pi) => {
      const count = Math.round(p.per * (1 + mi * 0.1));
      for (let i = 0; i < count; i++) {
        n++;
        const day = 1 + ((i * 3 + pi + mi) % 27);
        const date = `${mn} ${day}, 2026`;
        const oid = `27-${String(10000 + n * 7).padStart(5, "0")}-${String(50000 + n * 3)}`;
        const gross = p.price + p.ship;
        const fixed = gross > 10 ? 0.4 : 0.3;
        const variable = round2(gross * 0.1325);
        const net = round2(gross - fixed - variable);
        row({ date, type: "Order", oid, id: p.id, title: p.name, sku: p.sku, qty: 1, sub: p.price, ship: p.ship, fixed, var: variable, net });
        if (p.ship) row({ date, type: "Shipping label", oid, net: -round2(p.ship * (pi === 2 ? 1.35 : 1.05)), desc: "Shipping label" });
        if ((i + pi) % 4 === 0) row({ date, type: "Other fee", oid, id: p.id, net: -round2(p.price * 0.05), desc: "Promoted Listings - General fee" });
        if (i > 0 && p.refund && (i + mi * 2) % Math.round(1 / p.refund) === 0) row({ date, type: "Refund", oid, id: p.id, net: -round2(net), desc: "Refund" });
      }
    });
    row({ date: `${mn} 15, 2026`, type: "Other fee", net: -(4.95 + mi), desc: "Insertion fee" });
    row({ date: `${mn} 28, 2026`, type: "Payout", net: -500, desc: "Payout" });
  });
  const costs = PRODUCTS.map((p) => `${p.name},${p.cost.toFixed(2)}`);
  return { report: out.join("\n"), costs: "item,cost\n" + costs.join("\n") };
}

export const money = $;
export const pct = P;
