// Etsy payment-account statement analysis: fee waterfall, take rate, per-order
// and per-listing fees, offsite-ads and refund findings. Input is the monthly
// statement CSV from Shop Manager > Finances > Payment account > Monthly
// statements. Pure functions, no DOM, no network.

const ALIASES = {
  date: ["date"],
  type: ["type"],
  title: ["title", "description"],
  info: ["info", "details"],
  currency: ["currency"],
  amount: ["amount", "gross amount"],
  fees: ["fees & taxes", "fees and taxes", "fees"],
  net: ["net", "net amount"],
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

// Etsy writes "March 3, 2025"; other exports use ISO or US slashes. Only the
// calendar month matters here.
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

// "--" is how Etsy writes an empty money cell.
export function parseMoney(value) {
  let s = String(value ?? "").trim();
  if (!s || /^-+$/.test(s)) return 0;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[^0-9.,-]/g, "");
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
  const norm = header.map((h) => h.trim().toLowerCase());
  const cols = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    for (const n of names) {
      const at = norm.indexOf(n);
      if (at !== -1) { cols[field] = at; break; }
    }
  }
  return cols;
}

function headerRowIndex(table) {
  for (let i = 0; i < Math.min(table.length, 25); i++) {
    const norm = table[i].map((h) => h.trim().toLowerCase());
    if (norm.includes("type") && norm.includes("date") && norm.some((h) => h === "net" || h === "amount")) return i;
  }
  return -1;
}

// Each row's effect on the Etsy payment account is its Net cell, or Amount
// when there is no Net column. Negative = Etsy took it.
export function normalizeRows(table) {
  if (!table.length) return { rows: [], skipped: [], error: "The file is empty." };
  const h = headerRowIndex(table);
  if (h === -1) return { rows: [], skipped: [], error: "No header row found. Expected the Etsy payment account statement with columns like “Date”, “Type”, “Title”, “Amount”, “Fees & Taxes” and “Net”." };
  const cols = findColumns(table[h]);
  if (cols.net === undefined && cols.amount === undefined) return { rows: [], skipped: [], error: "No “Net” or “Amount” column found." };
  const get = (r, f) => (cols[f] === undefined ? "" : (r[cols[f]] ?? "")).trim();
  const rows = [], skipped = [];
  for (let i = h + 1; i < table.length; i++) {
    const r = table[i];
    const line = i + 1;
    const date = parseDate(get(r, "date"));
    if (!date) { skipped.push({ line, reason: `unreadable date “${get(r, "date")}”` }); continue; }
    const netText = get(r, "net"), amtText = get(r, "amount");
    const effect = parseMoney(netText !== "" && !/^-+$/.test(netText) ? netText : amtText);
    const fees = parseMoney(get(r, "fees"));
    if (Number.isNaN(effect) || Number.isNaN(fees)) { skipped.push({ line, reason: "unreadable amount" }); continue; }
    const title = get(r, "title"), info = get(r, "info");
    const order = (`${title} ${info}`.match(/#\s?(\d{5,})/) || [])[1] || "";
    rows.push({
      line, date, month: monthKeyOf(date),
      type: get(r, "type"), typeKey: get(r, "type").toLowerCase(),
      title, info, order, currency: get(r, "currency"),
      amount: parseMoney(amtText) || 0, fees, effect,
    });
  }
  return { rows, skipped, error: null };
}

// Category of one statement row.
export function classify(r) {
  const t = r.typeKey, d = r.title.toLowerCase();
  if (t === "deposit" || /deposit|payout/.test(d) && t !== "fee") return "payout";
  if (t === "sale") return "sale";
  if (t === "refund") return "refund";
  if (t === "tax" || t === "vat" || /sales tax|vat/.test(d) && t !== "fee") return "tax";
  if (/offsite ads/.test(d)) return "offsite-ads";
  if (t === "marketing" || /etsy ads|promoted listing/.test(d)) return "etsy-ads";
  if (t === "shipping" || /shipping label/.test(d)) return "shipping-labels";
  if (/^credit for/.test(d) || (t === "fee" && r.effect > 0)) return "fee-credit";
  if (/regulatory|operating fee/.test(d)) return "regulatory";
  if (/^transaction fee/.test(d)) return "transaction";
  if (/^processing fee|payment processing/.test(d)) return "processing";
  if (/listing fee|auto-renew|renew/.test(d)) return "listing";
  if (t === "fee" || t === "buyer fee" || t === "subscription") return "other-fees";
  return "other";
}

const round2 = (n) => Math.round(n * 100) / 100;
const FEE_CATS = ["transaction", "processing", "listing", "offsite-ads", "etsy-ads", "regulatory", "shipping-labels", "fee-credit", "other-fees", "other"];

function itemOf(title) {
  const m = title.match(/^transaction fee:\s*(.+)$/i);
  if (!m) return null;
  const name = m[1].trim();
  return /^shipping$/i.test(name) ? null : name;
}

// costs: { [listing title]: unit cost }.
export function analyze(rows, { costs = {} } = {}) {
  if (!rows.length) return { invalid: "No usable rows." };
  const cats = { sale: 0, refund: 0, tax: 0, payout: 0 };
  for (const c of FEE_CATS) cats[c] = 0;
  const months = new Map();
  const orders = new Map();
  const month = (k) => {
    if (!months.has(k)) months.set(k, { key: k, sales: 0, refunds: 0, fees: 0, net: 0, orders: 0 });
    return months.get(k);
  };
  const order = (id) => {
    if (!orders.has(id)) orders.set(id, { id, sales: 0, refunds: 0, fees: 0, offsite: 0, items: new Set(), month: null });
    return orders.get(id);
  };
  let offsiteOrders = 0;

  for (const r of rows) {
    const cat = classify(r);
    cats[cat] += r.effect;
    const m = month(r.month);
    if (cat === "payout") continue;
    if (cat === "tax") continue;
    m.net += r.effect;
    if (cat === "sale") { m.sales += r.effect; m.orders += 1; } else if (cat === "refund") m.refunds += r.effect; else { m.fees += r.effect; if (cat !== "shipping-labels") m.etsyFees += r.effect; }
    if (r.order) {
      const o = order(r.order);
      o.month = o.month || r.month;
      if (cat === "sale") o.sales += r.effect;
      else if (cat === "refund") o.refunds += r.effect;
      else o.fees += r.effect;
      if (cat === "offsite-ads") o.offsite += r.effect;
      const it = cat === "transaction" ? itemOf(r.title) : null;
      if (it) o.items.add(it);
    }
  }
  for (const o of orders.values()) if (o.offsite < 0) offsiteOrders++;

  const feeTotal = FEE_CATS.reduce((a, c) => a + cats[c], 0);
  // Take rate is Etsy's own charges; shipping labels are pass-through the
  // buyer usually paid for inside the sale amount.
  const etsyFees = feeTotal - cats["shipping-labels"];
  const operating = cats.sale + cats.refund + feeTotal;
  const soldOrders = [...orders.values()].filter((o) => o.sales > 0);

  // Per listing: only single-item orders can be attributed exactly.
  const listings = new Map();
  let multiItem = { orders: 0, sales: 0, fees: 0 };
  for (const o of soldOrders) {
    if (o.items.size === 1) {
      const name = [...o.items][0];
      const l = listings.get(name) || { title: name, orders: 0, sales: 0, refunds: 0, fees: 0, offsite: 0 };
      l.orders++; l.sales += o.sales; l.refunds += o.refunds; l.fees += o.fees; l.offsite += o.offsite;
      listings.set(name, l);
    } else { multiItem.orders++; multiItem.sales += o.sales; multiItem.fees += o.fees; }
  }
  const listingList = [...listings.values()].map((l) => {
    const cost = costs[l.title];
    const hasCost = typeof cost === "number" && !Number.isNaN(cost);
    const net = l.sales + l.refunds + l.fees;
    const cogs = hasCost ? cost * l.orders : null;
    return { ...l, net, takeRate: l.sales ? -l.fees / l.sales : 0, cogs, profit: hasCost ? net - cogs : null, margin: hasCost && l.sales ? (net - cogs) / l.sales : null };
  }).sort((a, b) => b.sales - a.sales);

  const monthList = [...months.values()].sort((a, b) => a.key.localeCompare(b.key));
  const cogsTotal = listingList.reduce((a, l) => a + (l.cogs ?? 0), 0);
  const anyCosted = listingList.some((l) => l.profit !== null);
  const summary = {
    firstMonth: monthList[0].key, lastMonth: monthList[monthList.length - 1].key,
    cats, sales: cats.sale, refunds: cats.refund, feeTotal, etsyFees, operating, payouts: cats.payout, tax: cats.tax,
    orderCount: soldOrders.length, offsiteOrders,
    takeRate: cats.sale ? -etsyFees / cats.sale : 0,
    offsiteRate: cats.sale ? -cats["offsite-ads"] / cats.sale : 0,
    adRate: cats.sale ? -cats["etsy-ads"] / cats.sale : 0,
    refundRate: cats.sale ? -cats.refund / cats.sale : 0,
    avgOrder: soldOrders.length ? cats.sale / soldOrders.length : 0,
    multiItem, cogsTotal, anyCosted,
    profit: anyCosted ? operating - cogsTotal : null,
    listingCount: listingList.length,
  };
  return { summary, listings: listingList, months: monthList, orders: soldOrders, findings: findings(summary, listingList, monthList, soldOrders) };
}

const $ = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const P = (x, d = 1) => (x * 100).toFixed(d) + "%";

function findings(s, list, months, soldOrders) {
  const out = [];
  const add = (severity, title, detail) => out.push({ severity, title, detail });
  const c = s.cats;

  add(s.takeRate > 0.2 ? "high" : "info", `Etsy kept ${P(s.takeRate)} of sales in fees (${$(-s.etsyFees)} of ${$(s.sales)})`,
    `That is transaction, processing, listing, advertising and regulatory charges together, before what the goods cost you. Shipping labels (${$(-s.cats["shipping-labels"])}) are counted separately: Etsy deducts them from the same account, but buyers usually paid shipping inside the sales figure.`);

  if (s.offsiteOrders > 0) {
    add(s.offsiteRate > 0.05 ? "high" : "medium", `Offsite Ads took ${$(-c["offsite-ads"])} on ${s.offsiteOrders} order${s.offsiteOrders > 1 ? "s" : ""} (${P(s.offsiteRate)} of sales)`,
      `Etsy charges 12% or 15% of the order total (excluding tax) when a sale comes through an Offsite Ads click. Shops that earned under $10,000 in the past 12 months can opt out; larger shops cannot, so check the rate in Shop Manager, then price to absorb it.`);
  }

  if (s.adRate > 0.1) {
    add("medium", `Etsy Ads are ${P(s.adRate)} of sales`,
      `${$(-c["etsy-ads"])} of Etsy Ads charges. Compare against the orders that would have come from search anyway, and pause listings whose ads do not return several times their cost.`);
  }

  const small = soldOrders.filter((o) => o.sales > 0 && o.sales < 15 && -o.fees / o.sales > 0.3);
  if (small.length >= 3) {
    add("medium", `${small.length} orders under $15 lost over 30% to fees`,
      `Fixed per-order charges (the processing fee's flat part, the $0.20 listing fee per sale) weigh heaviest on small baskets. A minimum order, bundles or a small price rise fixes more here than in the big orders.`);
  }

  if (s.refunds < 0) {
    add(s.refundRate > 0.08 ? "high" : "info", `Refunds returned ${P(s.refundRate)} of sales (${$(-s.refunds)})`,
      `Etsy credits back the transaction fee on a refunded item but not always the processing fee, so a refund costs more than the sale it reverses. Read the refund reasons for repeat listings.`);
  }

  if (c.regulatory < 0) {
    add("info", `Regulatory operating fee: ${$(-c.regulatory)}`,
      `A percentage fee Etsy adds in some countries. It is easy to miss in a monthly total; it is broken out here.`);
  }

  if (months.length >= 4) {
    const rate = (m) => (m.sales ? -m.etsyFees / m.sales : null);
    const first = months.slice(0, 2).map(rate).filter((x) => x !== null);
    const last = months.slice(-2).map(rate).filter((x) => x !== null);
    if (first.length && last.length) {
      const a = first.reduce((x, y) => x + y) / first.length, b = last.reduce((x, y) => x + y) / last.length;
      if (b - a > 0.03) add("medium", `Fees rose from ${P(a)} to ${P(b)} of sales`,
        `Comparing the first two and last two months. Offsite Ads, Etsy Ads and a heavier shipping-label share are the usual causes; prices that did not move with them cost you the difference.`);
    }
  }

  const costed = list.filter((l) => l.profit !== null);
  const losers = costed.filter((l) => l.profit < 0 && l.orders >= 2);
  if (losers.length) {
    add("high", `${losers.length} listing${losers.length > 1 ? "s" : ""} lose money after cost of goods`,
      `Worst: ${[...losers].sort((a, b) => a.profit - b.profit).slice(0, 3).map((l) => `${l.title} (${$(l.profit)} on ${l.orders} orders)`).join("; ")}. Figures cover single-item orders only and exclude shop-level ads and listing fees not tied to an order.`);
  }

  if (s.multiItem.orders > 0) {
    add("info", `${s.multiItem.orders} multi-item order${s.multiItem.orders > 1 ? "s" : ""} not attributed to a listing`,
      `The statement does not say which item earned which sale, so orders with two or more different items appear only in the totals, not in the per-listing table.`);
  }

  if (!s.anyCosted && list.length) {
    add("info", "Enter your unit costs to see real profit per listing",
      "Etsy's statement has what Etsy paid you, not what the goods cost. Type a cost per unit next to a listing, or paste “title,cost” lines.");
  }

  const rank = { high: 0, medium: 1, info: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

export function parseCosts(text) {
  const costs = {}, bad = [];
  String(text ?? "").split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const cells = parseCsv(line)[0] || [];
    if (cells.length < 2) { bad.push(i + 1); return; }
    const v = parseMoney(cells[cells.length - 1]);
    const k = cells.slice(0, -1).join(",").trim();
    if (!k || Number.isNaN(v) || v < 0) { if (i > 0 || !/^(title|listing)$/i.test(k)) bad.push(i + 1); return; }
    costs[k] = v;
  });
  return { costs, bad };
}

export function sampleCsv() {
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);
  const lines = ["Date,Type,Title,Info,Currency,Amount,Fees & Taxes,Net,Tax Details"];
  const row = (date, type, title, info, amount, net) => lines.push([date, type, title, info, "USD", amount === null ? "--" : money(amount), "--", money(net), "--"].map(q).join(","));
  const products = [
    { name: "Personalized Leather Keychain", price: 18, per: 14, label: 4.2 },
    { name: "Hand-poured Soy Candle 8oz", price: 26, per: 10, label: 5.1 },
    { name: "Custom Pet Portrait Print", price: 12, per: 12, label: 0 },
    { name: "Embroidered Linen Tote Bag", price: 34, per: 6, label: 6.4 },
  ];
  const months = ["June", "July", "August", "September"];
  let n = 0;
  months.forEach((mn, mi) => {
    for (const p of products) {
      const count = Math.round(p.per * (1 + mi * 0.12));
      for (let i = 0; i < count; i++) {
        n++;
        const day = 1 + ((i * 2 + mi) % 27);
        const date = `${mn} ${day}, 2026`;
        const id = 3000000000 + n * 137;
        const tx = round2(p.price * 0.065), proc = round2(p.price * 0.03 + 0.25);
        row(date, "Sale", `Payment for Order #${id}`, `Order #${id}`, p.price, p.price);
        row(date, "Fee", `Transaction fee: ${p.name}`, `Order #${id}`, -tx, -tx);
        row(date, "Fee", "Processing fee", `Order #${id}`, -proc, -proc);
        row(date, "Fee", "Listing fee", `Listing #${900000 + n}`, -0.2, -0.2);
        if (p.label) row(date, "Shipping", "USPS shipping label", `Order #${id}`, -p.label, -p.label);
        if (i % 6 === 0) row(date, "Fee", "Offsite Ads Fee", `Order #${id}`, -round2(p.price * 0.15), -round2(p.price * 0.15));
        if (i % 11 === 5) {
          row(`${mn} ${Math.min(28, day + 5)}, 2026`, "Refund", `Refund for Order #${id}`, `Order #${id}`, -p.price, -p.price);
          row(`${mn} ${Math.min(28, day + 5)}, 2026`, "Fee", `Credit for transaction fee: ${p.name}`, `Order #${id}`, tx, tx);
        }
      }
    }
    row(`${mn} 10, 2026`, "Marketing", "Etsy Ads", "", -(45 + mi * 20), -(45 + mi * 20));
    row(`${mn} 20, 2026`, "Deposit", "Deposit to bank", "", -400, -400);
  });
  return lines.join("\n");
}

export function sampleCosts() {
  return "title,cost\nPersonalized Leather Keychain,4.80\nHand-poured Soy Candle 8oz,7.60\nCustom Pet Portrait Print,1.20\nEmbroidered Linen Tote Bag,13.40";
}

export const money = $;
export const pct = P;
