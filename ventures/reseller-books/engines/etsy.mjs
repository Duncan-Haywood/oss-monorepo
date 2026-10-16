// Etsy shop analysis from two CSVs the seller already has: the Payment
// Account statement (every sale, fee, ad charge, refund and deposit) and,
// optionally, Sold Order Items (which listing each order was for). Output is
// the fee waterfall, per-listing profit after fees and cost of goods, and
// plain-language findings. Pure functions, no DOM, no network.

const STATEMENT_ALIASES = {
  date: ["date"],
  type: ["type"],
  title: ["title", "description"],
  info: ["info", "details"],
  amount: ["amount"],
  feesTaxes: ["fees & taxes", "fees and taxes", "fees &amp; taxes"],
  net: ["net"],
};

const ITEM_ALIASES = {
  date: ["sale date", "date sold", "date"],
  name: ["item name", "listing title", "title"],
  quantity: ["quantity"],
  price: ["price"],
  discount: ["discount amount"],
  orderId: ["order id"],
  listingId: ["listing id"],
  sku: ["sku"],
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

// Etsy writes "September 1, 2026", "1 September 2026", "09/01/2026" or ISO.
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
  if (m) return { y: +m[3], mo: +m[1] - 1, d: +m[2] }; // US month-first
  return null;
}
const monthKeyOf = (p) => `${p.y}-${String(p.mo + 1).padStart(2, "0")}`;

// "--" and "" are how Etsy writes "nothing here"; both are zero, not errors.
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

function findColumns(header, aliases) {
  const norm = header.map((h) => h.trim().toLowerCase());
  const cols = {};
  for (const [field, names] of Object.entries(aliases)) {
    for (const n of names) {
      const at = norm.indexOf(n);
      if (at !== -1) { cols[field] = at; break; }
    }
  }
  return cols;
}

function headerRowIndex(table, must) {
  for (let i = 0; i < Math.min(table.length, 20); i++) {
    const norm = table[i].map((h) => h.trim().toLowerCase());
    if (must.every((alts) => alts.some((a) => norm.includes(a)))) return i;
  }
  return -1;
}

const orderIdOf = (...texts) => {
  for (const t of texts) {
    const m = String(t ?? "").match(/#\s*(\d{5,})/);
    if (m) return m[1];
  }
  return "";
};

// Statement rows: one per money movement. `net` is signed from the shop's
// point of view (fees negative). When the export has no Net column it is
// rebuilt as Amount + Fees & Taxes.
export function normalizeStatement(table) {
  if (!table.length) return { rows: [], skipped: [], error: "The statement file is empty." };
  const h = headerRowIndex(table, [["type"], ["title", "description"], ["net", "amount"]]);
  if (h === -1) return { rows: [], skipped: [], error: "No header row found. Expected the Payment Account statement with columns like “Date”, “Type”, “Title”, “Info”, “Amount”, “Fees & Taxes” and “Net”." };
  const cols = findColumns(table[h], STATEMENT_ALIASES);
  if (cols.date === undefined) return { rows: [], skipped: [], error: "No “Date” column found in the statement." };
  const get = (r, f) => (cols[f] === undefined ? "" : (r[cols[f]] ?? "")).trim();
  const rows = [], skipped = [];
  for (let i = h + 1; i < table.length; i++) {
    const r = table[i];
    const line = i + 1;
    const date = parseDate(get(r, "date"));
    if (!date) { skipped.push({ line, reason: `unreadable date “${get(r, "date")}”` }); continue; }
    const amount = parseMoney(get(r, "amount"));
    const fees = parseMoney(get(r, "feesTaxes"));
    let net = cols.net !== undefined ? parseMoney(get(r, "net")) : amount + fees;
    if (cols.net !== undefined && get(r, "net") === "" && (amount || fees)) net = amount + fees;
    if ([amount, fees, net].some(Number.isNaN)) { skipped.push({ line, reason: "unreadable amount" }); continue; }
    const title = get(r, "title"), info = get(r, "info");
    rows.push({
      line, date, month: monthKeyOf(date),
      type: get(r, "type"), typeKey: get(r, "type").toLowerCase(),
      title, info, titleKey: title.toLowerCase(),
      amount, fees, net,
      orderId: orderIdOf(title, info),
    });
  }
  return { rows, skipped, error: null };
}

// Sold Order Items rows: one per listing sold in an order.
export function normalizeItems(table) {
  if (!table.length) return { items: [], skipped: [], error: null };
  const h = headerRowIndex(table, [["item name", "listing title"], ["order id"]]);
  if (h === -1) return { items: [], skipped: [], error: "The items file needs “Item Name” and “Order ID” columns. Export Shop Manager → Settings → Options → Download Data → Sold Order Items." };
  const cols = findColumns(table[h], ITEM_ALIASES);
  const get = (r, f) => (cols[f] === undefined ? "" : (r[cols[f]] ?? "")).trim();
  const items = [], skipped = [];
  for (let i = h + 1; i < table.length; i++) {
    const r = table[i];
    const line = i + 1;
    const orderId = get(r, "orderId").replace(/\D/g, "");
    if (!orderId) { skipped.push({ line, reason: "no order id" }); continue; }
    const qty = parseInt(get(r, "quantity"), 10) || 1;
    const price = parseMoney(get(r, "price"));
    const discount = Math.abs(parseMoney(get(r, "discount")) || 0);
    if (Number.isNaN(price) || Number.isNaN(discount)) { skipped.push({ line, reason: "unreadable price" }); continue; }
    items.push({
      line, orderId, name: get(r, "name") || "(unnamed listing)",
      listingId: get(r, "listingId"), sku: get(r, "sku"),
      quantity: qty, revenue: Math.max(0, price * qty - discount),
    });
  }
  return { items, skipped, error: null };
}

const round2 = (n) => Math.round(n * 100) / 100;

// Every statement row lands in exactly one bucket. Order matters: a
// "Credit for transaction fee" must not count as a transaction fee.
export function classify(r) {
  const t = r.titleKey, y = r.typeKey;
  if (y === "deposit" || /^deposit|payout|transfer to (your )?bank/.test(t)) return "deposit";
  if (/^credit for|^reversal|fee credit|credit:/.test(t)) return "credit";
  if (y === "refund" || /^refund|refund to buyer/.test(t)) return "refund";
  if (y === "sale" || /^payment for order|^sale\b/.test(t)) return "sale";
  if (/offsite ads?/.test(t)) return "offsite";
  if (y === "marketing" || /etsy ads|promoted listing|ad(vertising)? (fee|charge|spend)/.test(t)) return "ads";
  if (/transaction fee/.test(t)) return "transaction";
  if (/processing fee|payment processing/.test(t)) return "processing";
  if (/listing fee|renew|auto-renew|relist/.test(t)) return "listing";
  if (/regulatory operating|vat on|tax on fee|digital services tax/.test(t)) return "regulatory";
  if (/shipping label|postage|usps|ups |fedex|dhl|pirate/.test(t) || y === "shipping") return "labels";
  if (/subscription|etsy plus|plus plan/.test(t)) return "subscription";
  if (y === "tax" || /sales tax|vat\b/.test(t)) return "tax";
  return "other";
}

const FEE_BUCKETS = ["transaction", "processing", "listing", "offsite", "ads", "regulatory", "subscription", "labels", "credit", "other"];

// costs: { [listing name]: unitCost }
export function analyze(rows, items = [], { costs = {}, returnsResellable = true } = {}) {
  if (!rows.length) return { invalid: "No usable statement rows." };
  const buckets = { sale: 0, refund: 0, tax: 0 };
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
    if (!orders.has(id)) orders.set(id, { id, sale: 0, refund: 0, costs: 0, net: 0 });
    return orders.get(id);
  };

  for (const r of rows) {
    const cat = classify(r);
    counts[cat] = (counts[cat] || 0) + 1;
    if (cat === "deposit") { payouts += Math.abs(r.net); continue; }
    buckets[cat] += r.net;
    const m = month(r.month);
    m.net += r.net;
    if (cat === "sale") m.sales += r.net;
    else if (cat === "refund") m.refunds += r.net;
    else if (cat !== "tax" && cat !== "labels") m.fees += r.net;
    if (r.orderId) {
      const o = order(r.orderId);
      o.net += r.net;
      if (cat === "sale") o.sale += r.net;
      else if (cat === "refund") o.refund += r.net;
      else if (cat !== "tax") o.costs += r.net;
    }
  }

  const sales = buckets.sale;
  const feeBuckets = {};
  let feeTotal = 0;
  for (const b of FEE_BUCKETS) { feeBuckets[b] = buckets[b]; feeTotal += buckets[b]; }
  // Shipping labels are a pass-through of the shipping the buyer paid, so they
  // stay out of the take rate that measures what Etsy itself keeps.
  const platformFees = feeTotal - feeBuckets.labels;
  const operating = buckets.sale + buckets.refund + feeTotal;
  const taxHeld = buckets.tax;

  // ---- per-listing, only where the items file lets us name the listing ----
  const itemsByOrder = new Map();
  for (const it of items) {
    if (!itemsByOrder.has(it.orderId)) itemsByOrder.set(it.orderId, []);
    itemsByOrder.get(it.orderId).push(it);
  }
  const listings = new Map();
  const listing = (name) => {
    if (!listings.has(name)) listings.set(name, { name, units: 0, unitsRefunded: 0, orders: 0, revenue: 0, fees: 0, refunds: 0, net: 0 });
    return listings.get(name);
  };
  let matchedOrders = 0, unmatchedOrders = 0, attributedNet = 0;
  for (const [id, its] of itemsByOrder) {
    const o = orders.get(id);
    if (!o) { unmatchedOrders++; continue; }
    matchedOrders++;
    const total = its.reduce((a, x) => a + x.revenue, 0) || its.length;
    const fullyRefunded = o.sale > 0 && -o.refund >= o.sale * 0.95;
    for (const it of its) {
      const share = (its.length && total ? (it.revenue || 1) / total : 1 / its.length);
      const l = listing(it.name);
      l.units += it.quantity;
      l.orders += 1;
      l.revenue += it.revenue;
      l.fees += o.costs * share;
      l.refunds += o.refund * share;
      l.net += o.net * share;
      if (fullyRefunded) l.unitsRefunded += it.quantity;
      attributedNet += o.net * share;
    }
  }
  const listingList = [...listings.values()].map((l) => {
    const netUnits = l.units - l.unitsRefunded;
    const cost = costs[l.name];
    const hasCost = typeof cost === "number" && !Number.isNaN(cost);
    const costedUnits = returnsResellable ? Math.max(0, netUnits) : l.units;
    const cogs = hasCost ? cost * costedUnits : null;
    return {
      ...l, netUnits,
      refundRate: l.units ? l.unitsRefunded / l.units : 0,
      feeRate: l.revenue ? -l.fees / l.revenue : 0,
      cogs,
      profit: hasCost ? l.net - cogs : null,
      profitPerUnit: hasCost && netUnits > 0 ? (l.net - cogs) / netUnits : null,
      margin: hasCost && l.revenue ? (l.net - cogs) / l.revenue : null,
    };
  }).sort((a, b) => b.revenue - a.revenue);

  const orderCount = [...orders.values()].filter((o) => o.sale > 0).length;
  const monthList = [...months.values()].sort((a, b) => a.key.localeCompare(b.key));
  const allCosted = listingList.length > 0 && listingList.every((l) => l.profit !== null);
  const anyCosted = listingList.some((l) => l.profit !== null);
  const cogsTotal = listingList.reduce((a, l) => a + (l.cogs ?? 0), 0);
  const listingNet = listingList.reduce((a, l) => a + l.net, 0);
  // Cost of goods only covers attributed orders, so profit is stated for them
  // plus every cost that is not tied to an order.
  const shopLevel = operating - attributedNet;

  const summary = {
    firstMonth: monthList[0]?.key ?? "", lastMonth: monthList[monthList.length - 1]?.key ?? "",
    sales, refunds: buckets.refund, feeBuckets, feeTotal, operating, payouts, taxHeld,
    counts, orderCount,
    platformFees,
    takeRate: sales ? -platformFees / sales : 0,
    refundRate: sales ? -buckets.refund / sales : 0,
    offsiteRate: sales ? -buckets.offsite / sales : 0,
    adRate: sales ? -buckets.ads / sales : 0,
    listingFeeRate: sales ? -buckets.listing / sales : 0,
    avgOrder: orderCount ? sales / orderCount : 0,
    matchedOrders, unmatchedOrders, listingCount: listingList.length,
    attributedNet, shopLevel, listingNet, cogsTotal, allCosted, anyCosted,
    profit: anyCosted ? operating - cogsTotal : null,
  };
  return { summary, listings: listingList, months: monthList, findings: findings(summary, listingList, monthList) };
}

const $ = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const P = (x, d = 1) => (x * 100).toFixed(d) + "%";

function findings(s, list, months) {
  const out = [];
  const add = (severity, title, detail) => out.push({ severity, title, detail });
  const fb = s.feeBuckets;

  if (s.sales > 0) {
    add(s.takeRate > 0.16 ? "medium" : "info", `Etsy and its partners kept ${P(s.takeRate)} of sales`,
      `${$(-s.platformFees)} of fees and ads against ${$(s.sales)} of sales (shipping labels, ${$(-fb.labels)}, are counted separately because the buyer's shipping payment covers them). Transaction ${$(-fb.transaction)}, processing ${$(-fb.processing)}, listing ${$(-fb.listing)}, Offsite Ads ${$(-fb.offsite)}, Etsy Ads ${$(-fb.ads)}. The standard fees alone (6.5% transaction, 3% + $0.25 processing) come to roughly 10% of an order; everything above that is ads and renewals.`);
  }

  if (s.offsiteRate > 0.02) {
    add(s.offsiteRate > 0.05 ? "high" : "medium", `Offsite Ads cost ${P(s.offsiteRate)} of sales (${$(-fb.offsite)})`,
      `${s.counts.offsite || 0} charge${s.counts.offsite === 1 ? "" : "s"}, each 12% or 15% of an attributed order (15% below $10,000 of trailing sales, where you can opt out; 12% and mandatory above it). Check whether those orders would have come anyway, then compare against your margin on the listings involved before deciding to stay in.`);
  }

  if (s.adRate > 0.1) {
    add(s.adRate > 0.18 ? "high" : "medium", `Etsy Ads are ${P(s.adRate)} of sales`,
      `${$(-fb.ads)} of on-site ad spend. Look at which listings the ads push in Etsy Ads stats, and pause any whose sales have no margin left after fees and cost of goods.`);
  }

  if (s.refundRate > 0.05) {
    add(s.refundRate > 0.1 ? "high" : "medium", `Refunds are ${P(s.refundRate)} of sales`,
      `${$(-s.refunds)} refunded. A refund returns the sale but Etsy does not give back the processing fee, so each refund costs more than the margin it removes. Read the case reasons and fix the listing photos, sizing or shipping promise behind the top ones.`);
  }

  if (s.listingFeeRate > 0.03 && s.orderCount > 0) {
    add("medium", `Listing and renewal fees are ${P(s.listingFeeRate)} of sales`,
      `${$(-fb.listing)} across ${s.counts.listing || 0} charges at $0.20 each. Every listing costs $0.20 to publish and again every four months or on each sale. If many listings have not sold, turn off auto-renew on the slow ones and let them lapse.`);
  }

  const losers = list.filter((x) => x.profit !== null && x.profit < 0 && x.units >= 2);
  if (losers.length) {
    const worst = [...losers].sort((a, b) => a.profit - b.profit).slice(0, 3);
    add("high", `${losers.length} listing${losers.length > 1 ? "s" : ""} lose money after cost of goods`,
      `Worst: ${worst.map((x) => `${x.name} (${$(x.profit)} on ${x.units} units)`).join("; ")}. Raise the price, cut the cost, or stop running ads to it.`);
  }

  const thin = list.filter((x) => x.margin !== null && x.margin >= 0 && x.margin < 0.15 && x.units >= 5);
  if (thin.length) {
    add("medium", `${thin.length} listing${thin.length > 1 ? "s" : ""} earn under 15% after cost of goods`,
      `${thin.slice(0, 4).map((x) => `${x.name} ${P(x.margin)}`).join("; ")}. Your time is not in the cost figure, so a thin margin here is thinner than it looks.`);
  }

  const refunded = list.filter((x) => x.units >= 5 && x.refundRate >= 0.1).sort((a, b) => b.refundRate - a.refundRate);
  if (refunded.length) {
    add("high", `${refunded.length} listing${refunded.length > 1 ? "s" : ""} with 10%+ of units in fully refunded orders`,
      `${refunded.slice(0, 4).map((x) => `${x.name} ${P(x.refundRate)}`).join("; ")}.`);
  }

  if (months.length >= 4) {
    const rate = (m) => (m.sales ? -m.fees / m.sales : null);
    const first = months.slice(0, 2).map(rate).filter((x) => x !== null);
    const last = months.slice(-2).map(rate).filter((x) => x !== null);
    if (first.length && last.length) {
      const a = first.reduce((x, y) => x + y) / first.length, b = last.reduce((x, y) => x + y) / last.length;
      if (b - a > 0.03) add("medium", `Fees rose from ${P(a)} to ${P(b)} of sales`,
        `Comparing the first two and last two months. That is ${P(b - a)} of every sale gone to more ads or more Offsite Ads attribution. If prices did not move with it, margin fell by the same amount.`);
    }
  }

  const costed = list.filter((x) => x.profit !== null);
  if (costed.length >= 4) {
    const total = costed.reduce((a, x) => a + Math.max(0, x.profit), 0);
    const top = [...costed].sort((a, b) => b.profit - a.profit)[0];
    if (total > 0 && top.profit / total > 0.6) {
      add("medium", `${top.name} earns ${P(top.profit / total)} of your listing profit`,
        "One listing carrying most of the profit is a risk: a search-ranking drop, a copycat or a supplier problem hits the whole shop. Worth building a second earner.");
    }
  }

  if (s.listingCount === 0) {
    add("info", "Add the Sold Order Items file to see profit per listing",
      "The statement shows every fee and sale but not which listing each order was for. Download Sold Order Items from Shop Manager → Settings → Options → Download Data and add it above.");
  } else if (s.unmatchedOrders > 0) {
    add("info", `${s.unmatchedOrders} order${s.unmatchedOrders > 1 ? "s" : ""} in the items file are not in the statement`,
      "Their payments fall outside the statement's date range, so they are left out of the per-listing figures rather than counted as free.");
  }
  if (s.listingCount > 0 && !s.anyCosted) {
    add("info", "Enter your unit costs to see real profit",
      "Materials, blanks, packaging and print cost are not in either Etsy file. Type a cost per unit next to each listing (or paste name,cost lines) and profit, margin and loss-maker findings appear.");
  } else if (s.listingCount > 0 && !s.allCosted) {
    add("info", "Some listings have no unit cost yet", "Profit for those listings is left out rather than counted as free.");
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
    if (!k || Number.isNaN(v) || v < 0) { if (i > 0 || !/^(name|listing|item)/i.test(k)) bad.push(i + 1); return; }
    costs[k] = v;
  });
  return { costs, bad };
}

const PRODUCTS = [
  { name: "Personalized Leather Keychain", price: 18, per: 20, cost: 3.6, refund: 0.04, ship: 4.5 },
  { name: "Custom Pet Portrait Print", price: 42, per: 9, cost: 9.5, refund: 0.06, ship: 5.0 },
  { name: "Hand-poured Soy Candle 8oz", price: 24, per: 15, cost: 8.4, refund: 0.1, ship: 7.0 },
  { name: "Embroidered Linen Tote", price: 34, per: 7, cost: 12.8, refund: 0.03, ship: 6.0 },
];

// Deterministic synthetic shop: returns { statement, items, costs } as text.
export function sampleData() {
  const stHead = "Date,Type,Title,Info,Currency,Amount,Fees & Taxes,Net,Tax Details";
  const itHead = "Sale Date,Item Name,Buyer,Quantity,Price,Coupon Code,Discount Amount,Order Shipping,Order Sales Tax,Item Total,Currency,Listing ID,Order ID,SKU";
  const st = [stHead], it = [itHead];
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);
  const rows = (date, type, title, info, amount, feesTaxes, net) =>
    st.push([q(date), type, q(title), info, "USD", money(amount), feesTaxes ? money(feesTaxes) : "--", money(net), "--"].join(","));
  const names = ["June", "July", "August", "September"];
  let n = 0;
  names.forEach((mn, mi) => {
    let monthNet = 0;
    PRODUCTS.forEach((p, pi) => {
      const count = Math.round(p.per * (1 + mi * 0.12));
      for (let i = 0; i < count; i++) {
        n++;
        const day = 1 + ((i * 3 + pi + mi) % 27);
        const date = `${mn} ${day}, 2026`;
        const oid = String(3000000000 + n * 13);
        const total = p.price + p.ship;
        const trans = -(total * 0.065);
        const proc = -(total * 0.03 + 0.25);
        const list = -0.2;
        const label = -(p.ship * 0.9);
        const offsite = (i + pi) % 6 === 0 ? -(p.price * 0.15) : 0;
        it.push([q(date), q(p.name), "Buyer " + n, 1, "$" + p.price.toFixed(2), "", "$0.00", "$" + p.ship.toFixed(2), "$0.00", "$" + total.toFixed(2), "USD", 900000 + pi, oid, "SKU-" + pi].join(","));
        rows(date, "Sale", `Payment for Order #${oid}`, `Order #${oid}`, total, 0, total);
        rows(date, "Fee", `Transaction fee: ${p.name}`, `Order #${oid}`, round2(trans), 0, round2(trans));
        rows(date, "Fee", "Processing fee", `Order #${oid}`, round2(proc), 0, round2(proc));
        rows(date, "Fee", `Listing fee`, `Listing #${900000 + pi}`, list, 0, list);
        rows(date, "Fee", `Shipping label`, `Order #${oid}`, round2(label), 0, round2(label));
        if (offsite) rows(date, "Fee", "Offsite Ads fee", `Order #${oid}`, round2(offsite), 0, round2(offsite));
        if (i > 0 && (i + mi * 2) % Math.round(1 / p.refund) === 0) {
          const refund = -round2(p.price + p.ship);
          rows(date, "Refund", `Refund to buyer for Order #${oid}`, `Order #${oid}`, refund, 0, refund);
        }
      }
    });
    rows(`${mn} 10, 2026`, "Marketing", "Etsy Ads", "", -(60 + mi * 25), 0, -(60 + mi * 25));
    rows(`${mn} 20, 2026`, "Fee", "Listing fee (auto-renew)", "", -(3.4), 0, -3.4);
    rows(`${mn} 28, 2026`, "Deposit", "Deposit to bank account", "", -400, 0, -400);
  });
  const costs = PRODUCTS.map((p) => `${p.name},${p.cost.toFixed(2)}`);
  return { statement: st.join("\n"), items: it.join("\n"), costs: "name,cost\n" + costs.join("\n") };
}

export const money = $;
export const pct = P;
