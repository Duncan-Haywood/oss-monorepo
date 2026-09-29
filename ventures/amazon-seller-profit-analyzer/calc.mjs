// Amazon seller transaction-report analysis: per-SKU profit, fee breakdown,
// account-level costs (ads, storage, subscription), reimbursements, refund
// findings. Input is the Seller Central "Transaction" / "Date range" CSV.
// Pure functions, no DOM, no network.

const ALIASES = {
  date: ["date/time", "date", "posted date", "posted-date"],
  settlement: ["settlement id", "settlement-id"],
  type: ["type", "transaction type", "transaction-type"],
  orderId: ["order id", "order-id", "amazon order id"],
  sku: ["sku", "seller sku", "merchant sku"],
  description: ["description"],
  quantity: ["quantity", "quantity-purchased", "qty"],
  fulfillment: ["fulfillment", "fulfilment"],
  sales: ["product sales"],
  shipCredits: ["shipping credits"],
  giftCredits: ["gift wrap credits", "giftwrap credits"],
  promo: ["promotional rebates"],
  sellingFees: ["selling fees"],
  fbaFees: ["fba fees"],
  otherTxnFees: ["other transaction fees"],
  other: ["other"],
  total: ["total"],
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

// Amazon writes "Sep 1, 2025 3:04:05 AM PDT", "1 Sep 2025 03:04:05 UTC" or
// ISO. Only the calendar month matters here, so the timezone is ignored.
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

export function parseMoney(value) {
  let s = String(value ?? "").trim();
  if (!s) return 0;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[^0-9.,-]/g, "");
  // European "1.234,56" vs US "1,234.56": whichever separator comes last is the decimal.
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

// Seller Central sometimes puts a few summary lines above the header.
function headerRowIndex(table) {
  for (let i = 0; i < Math.min(table.length, 25); i++) {
    const norm = table[i].map((h) => h.trim().toLowerCase());
    if (norm.includes("type") && norm.some((h) => h === "total" || h === "date/time" || h === "date")) return i;
  }
  return -1;
}

// Returns { rows, skipped, error }. Each row is normalised to numbers; a fee
// column is negative when Amazon charged it, as in the source file.
export function normalizeRows(table) {
  if (!table.length) return { rows: [], skipped: [], error: "The file is empty." };
  const h = headerRowIndex(table);
  if (h === -1) return { rows: [], skipped: [], error: "No header row found. Expected the Seller Central Transaction report with columns like “date/time”, “type”, “sku”, “selling fees”, “fba fees” and “total”." };
  const cols = findColumns(table[h]);
  if (cols.date === undefined) return { rows: [], skipped: [], error: "No date column found (expected “date/time”)." };
  if (cols.total === undefined) return { rows: [], skipped: [], error: "No “total” column found. Export the Transaction view, not a summary." };
  const get = (r, f) => (cols[f] === undefined ? "" : (r[cols[f]] ?? "")).trim();
  const num = (r, f) => parseMoney(get(r, f));
  const rows = [], skipped = [];
  for (let i = h + 1; i < table.length; i++) {
    const r = table[i];
    const line = i + 1;
    const date = parseDate(get(r, "date"));
    if (!date) { skipped.push({ line, reason: `unreadable date “${get(r, "date")}”` }); continue; }
    const money = {};
    let bad = null;
    for (const f of ["sales", "shipCredits", "giftCredits", "promo", "sellingFees", "fbaFees", "otherTxnFees", "other", "total"]) {
      const v = num(r, f);
      if (Number.isNaN(v)) { bad = f; break; }
      money[f] = v;
    }
    if (bad) { skipped.push({ line, reason: `unreadable amount in “${bad}”` }); continue; }
    rows.push({
      line, date, month: monthKeyOf(date),
      type: get(r, "type"), typeKey: get(r, "type").toLowerCase(),
      orderId: get(r, "orderId"), sku: get(r, "sku"), description: get(r, "description"),
      quantity: parseInt(get(r, "quantity"), 10) || 0,
      fulfillment: get(r, "fulfillment").toLowerCase(),
      ...money,
    });
  }
  return { rows, skipped, error: null };
}

const round2 = (n) => Math.round(n * 100) / 100;

function classifyAccountRow(r) {
  const d = r.description.toLowerCase();
  const t = r.typeKey;
  if (t === "transfer") return "transfer";
  if (/advertis|sponsored|cost of advertising/.test(d)) return "advertising";
  if (/subscription/.test(d)) return "subscription";
  if (/storage|aged inventory|long-term|low-inventory|inbound placement|removal|disposal|liquidation|inventory placement|awd/.test(d) || t === "fba inventory fee") return "fba-inventory";
  if (t === "adjustment" || t === "fba inventory reimbursement" || /reimburse|lost|damaged|found/.test(d)) {
    return r.total > 0 ? "reimbursement" : "adjustment-negative";
  }
  if (t === "chargeback refund" || t === "a-to-z guarantee claim" || /a-to-z|chargeback/.test(d)) return "claims";
  if (t === "service fee" || t === "fee adjustment" || t === "deal fee") return "other-fees";
  return "other";
}

// costs: { [sku]: unitCost }. returnsResellable: refunded units go back into
// stock, so their cost is not lost.
export function analyze(rows, { costs = {}, returnsResellable = true } = {}) {
  if (!rows.length) return { invalid: "No usable rows." };
  const skus = new Map();
  const months = new Map();
  const account = { advertising: 0, subscription: 0, "fba-inventory": 0, reimbursement: 0, "adjustment-negative": 0, claims: 0, "other-fees": 0, other: 0 };
  const accountRows = { reimbursement: [] };
  let payouts = 0;
  const orders = new Map();

  const sku = (k) => {
    const key = k || "(no SKU)";
    if (!skus.has(key)) skus.set(key, { sku: key, unitsSold: 0, unitsRefunded: 0, orders: 0, gross: 0, promo: 0, referral: 0, fba: 0, otherFees: 0, refundAmount: 0, refundReferralBack: 0, netProceeds: 0, fbaUnits: 0, fbmUnits: 0 });
    return skus.get(key);
  };
  const month = (k) => {
    if (!months.has(k)) months.set(k, { key: k, gross: 0, promo: 0, fees: 0, refunds: 0, account: 0, net: 0, units: 0 });
    return months.get(k);
  };

  for (const r of rows) {
    const m = month(r.month);
    if (r.typeKey === "order") {
      const s = sku(r.sku);
      const gross = r.sales + r.shipCredits + r.giftCredits;
      s.unitsSold += r.quantity;
      s.orders += 1;
      s.gross += gross;
      s.promo += r.promo;
      s.referral += r.sellingFees;
      s.fba += r.fbaFees;
      s.otherFees += r.otherTxnFees + r.other;
      s.netProceeds += r.total;
      if (r.fulfillment.includes("amazon") || r.fulfillment === "afn") s.fbaUnits += r.quantity; else s.fbmUnits += r.quantity;
      m.gross += gross; m.promo += r.promo; m.fees += r.sellingFees + r.fbaFees + r.otherTxnFees + r.other; m.net += r.total; m.units += r.quantity;
      if (r.orderId) {
        const o = orders.get(r.orderId) || { referral: 0, refundReferral: 0, refunded: false, sku: r.sku };
        o.referral += r.sellingFees;
        orders.set(r.orderId, o);
      }
    } else if (r.typeKey === "refund") {
      const s = sku(r.sku);
      s.unitsRefunded += r.quantity;
      s.refundAmount += r.sales + r.shipCredits + r.giftCredits + r.promo;
      s.refundReferralBack += r.sellingFees;
      s.fba += r.fbaFees;
      s.otherFees += r.otherTxnFees + r.other;
      s.netProceeds += r.total;
      m.refunds += r.sales + r.shipCredits + r.giftCredits + r.promo; m.fees += r.fbaFees + r.otherTxnFees + r.other + r.sellingFees; m.net += r.total;
      if (r.orderId) {
        const o = orders.get(r.orderId) || { referral: 0, refundReferral: 0, refunded: true, sku: r.sku };
        o.refundReferral += r.sellingFees;
        o.refunded = true;
        orders.set(r.orderId, o);
      }
    } else {
      const cat = classifyAccountRow(r);
      if (cat === "transfer") { payouts += r.total; continue; }
      account[cat] += r.total;
      m.account += r.total; m.net += r.total;
      if (cat === "reimbursement") accountRows.reimbursement.push(r);
    }
  }

  // Referral fee Amazon kept on refunded orders: the order paid referral R
  // (negative), the refund gave back part of it. Difference is the
  // refund administration fee. Only orders seen on both sides count.
  let refundAdminKept = 0, refundAdminOrders = 0;
  for (const o of orders.values()) {
    if (o.refunded && o.referral < 0 && o.refundReferral > 0) {
      const kept = -(o.referral + o.refundReferral);
      if (kept > 0.005) { refundAdminKept += kept; refundAdminOrders++; }
    }
  }

  const list = [...skus.values()].map((s) => {
    const netUnits = s.unitsSold - s.unitsRefunded;
    const cost = costs[s.sku];
    const hasCost = typeof cost === "number" && !Number.isNaN(cost);
    const costedUnits = returnsResellable ? Math.max(0, netUnits) : s.unitsSold;
    const cogs = hasCost ? cost * costedUnits : null;
    const fees = s.referral + s.fba + s.otherFees;
    return {
      ...s,
      netUnits,
      refundRate: s.unitsSold ? s.unitsRefunded / s.unitsSold : 0,
      feeRate: s.gross ? -fees / s.gross : 0,
      cogs,
      profit: hasCost ? s.netProceeds - cogs : null,
      profitPerUnit: hasCost && netUnits > 0 ? (s.netProceeds - cogs) / netUnits : null,
      margin: hasCost && s.gross ? (s.netProceeds - cogs) / s.gross : null,
      proceedsPerUnit: netUnits > 0 ? s.netProceeds / netUnits : null,
    };
  }).sort((a, b) => b.gross - a.gross);

  const t = {
    gross: 0, promo: 0, referral: 0, fba: 0, otherFees: 0, refundAmount: 0, refundReferralBack: 0, netProceeds: 0, unitsSold: 0, unitsRefunded: 0,
  };
  for (const s of list) for (const k of Object.keys(t)) t[k] += s[k];
  const accountTotal = Object.values(account).reduce((a, b) => a + b, 0);
  const allCosted = list.length > 0 && list.every((s) => s.profit !== null);
  const anyCosted = list.some((s) => s.profit !== null);
  const cogsTotal = list.reduce((a, s) => a + (s.cogs ?? 0), 0);
  const operating = t.netProceeds + accountTotal;

  const monthList = [...months.values()].sort((a, b) => a.key.localeCompare(b.key));
  const summary = {
    firstMonth: monthList[0].key,
    lastMonth: monthList[monthList.length - 1].key,
    ...t,
    accountTotal,
    account,
    payouts,
    operating,
    cogsTotal,
    allCosted, anyCosted,
    profit: anyCosted ? operating - cogsTotal : null,
    feeRate: t.gross ? -(t.referral + t.fba + t.otherFees) / t.gross : 0,
    refundRate: t.unitsSold ? t.unitsRefunded / t.unitsSold : 0,
    adRate: t.gross ? -account.advertising / t.gross : 0,
    refundAdminKept, refundAdminOrders,
    reimbursementCount: accountRows.reimbursement.length,
    skuCount: list.length,
  };

  return { summary, skus: list, months: monthList, findings: findings(summary, list, monthList) };
}

const $ = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const P = (x, d = 1) => (x * 100).toFixed(d) + "%";

function findings(s, list, months) {
  const out = [];
  const add = (severity, title, detail) => out.push({ severity, title, detail });

  if (s.adRate > 0.12) {
    add(s.adRate > 0.2 ? "high" : "medium", `Advertising is ${P(s.adRate)} of sales`,
      `Amazon charged ${$(-s.account.advertising)} in advertising against ${$(s.gross)} of product sales. Add referral (${P(-s.referral / s.gross)}) and FBA fees (${P(-s.fba / s.gross)}) and there is little left for the cost of the goods. Check which campaigns bring orders that would not have come anyway.`);
  }

  const losers = list.filter((x) => x.profit !== null && x.profit < 0 && x.unitsSold >= 3);
  if (losers.length) {
    const worst = [...losers].sort((a, b) => a.profit - b.profit).slice(0, 3);
    add("high", `${losers.length} SKU${losers.length > 1 ? "s" : ""} lose money after cost of goods`,
      `Worst: ${worst.map((x) => `${x.sku} (${$(x.profit)} on ${x.unitsSold} units)`).join(", ")}. These figures exclude account-level ads, storage and subscription, so the real loss is larger.`);
  }

  const thin = list.filter((x) => x.margin !== null && x.margin >= 0 && x.margin < 0.1 && x.unitsSold >= 10);
  if (thin.length) {
    add("medium", `${thin.length} SKU${thin.length > 1 ? "s" : ""} earn under 10% after cost of goods`,
      `${thin.slice(0, 4).map((x) => `${x.sku} ${P(x.margin)}`).join(", ")}. One price cut, one return wave or one fee change turns these negative.`);
  }

  const refunded = list.filter((x) => x.unitsSold >= 10 && x.refundRate >= 0.1).sort((a, b) => b.refundRate - a.refundRate);
  if (refunded.length) {
    add("high", `${refunded.length} SKU${refunded.length > 1 ? "s" : ""} with 10%+ of units refunded`,
      `${refunded.slice(0, 4).map((x) => `${x.sku} ${P(x.refundRate)} (${x.unitsRefunded} of ${x.unitsSold})`).join(", ")}. A refund returns the sale and usually the fulfilment fee is not refunded, so each one costs more than the margin it removes. Read the return reasons in Seller Central for these first.`);
  }

  if (s.refundAdminKept > 1) {
    add("info", `Amazon kept ${$(s.refundAdminKept)} of referral fees on ${s.refundAdminOrders} refunded orders`,
      `When an order is refunded Amazon gives back the referral fee less an administration fee. Matching each refund to its order in this file, the part not returned comes to ${$(s.refundAdminKept)}. It is a cost of refunds you can lower by resolving issues before a refund, and it is invisible in Seller Central's summary.`);
  }

  if (s.reimbursementCount > 0) {
    add("info", `${$(s.account.reimbursement)} of reimbursements received (${s.reimbursementCount} ${s.reimbursementCount === 1 ? "line" : "lines"})`,
      `These are credits Amazon paid for lost or damaged inventory. If the count looks low for your volume, compare against your FBA inventory adjustments report: Amazon's claims are frequently incomplete and can be filed up to 18 months after the event.`);
  } else if (s.unitsSold > 200 && s.fba < 0) {
    add("info", "No reimbursements in the file",
      "FBA sellers at this volume normally see at least a few lost or damaged inventory credits. None appear here. Check the FBA inventory adjustments report and file a claim if units went missing.");
  }

  const fbaInv = -s.account["fba-inventory"];
  if (fbaInv > 0 && s.gross && fbaInv / s.gross > 0.04) {
    add("medium", `FBA storage and inventory fees are ${P(fbaInv / s.gross)} of sales`,
      `${$(fbaInv)} of storage, aged-inventory, removal or placement fees. High storage against sales usually means slow-moving stock: check aged inventory and consider a removal or a price cut.`);
  }

  if (months.length >= 4) {
    const rate = (m) => (m.gross ? -m.fees / m.gross : null);
    const first = months.slice(0, 2).map(rate).filter((x) => x !== null);
    const last = months.slice(-2).map(rate).filter((x) => x !== null);
    if (first.length && last.length) {
      const a = first.reduce((x, y) => x + y) / first.length, b = last.reduce((x, y) => x + y) / last.length;
      if (b - a > 0.03) add("medium", `Fees rose from ${P(a)} to ${P(b)} of sales`,
        `Comparing the first two and last two months in the file. That is ${P(b - a)} of every sale, from a fee change, a heavier product mix or size-tier changes. If prices did not move with it, margin fell by the same amount.`);
    }
  }

  const costed = list.filter((x) => x.profit !== null);
  if (costed.length >= 4) {
    const total = costed.reduce((a, x) => a + Math.max(0, x.profit), 0);
    const top = [...costed].sort((a, b) => b.profit - a.profit)[0];
    if (total > 0 && top.profit / total > 0.6) {
      add("medium", `${top.sku} earns ${P(top.profit / total)} of your SKU profit`,
        `One listing carrying most of the profit is a risk: a suppression, hijacker or a stock-out on it hits the whole business. Worth building a second earner.`);
    }
  }

  if (!s.anyCosted) {
    add("info", "Enter your unit costs to see real profit",
      "The file has what Amazon paid you but not what the products cost you. Enter a cost per unit for each SKU (or paste SKU,cost lines) and the profit, margin and loss-maker findings appear.");
  } else if (!s.allCosted) {
    add("info", "Some SKUs have no unit cost yet",
      "Profit for those SKUs is left out rather than counted as free. Add their costs to include them.");
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
    if (!k || Number.isNaN(v) || v < 0) { if (i > 0 || !/^sku$/i.test(k)) bad.push(i + 1); return; }
    costs[k] = v;
  });
  return { costs, bad };
}

export function sampleCsv() {
  const head = '"date/time","settlement id","type","order id","sku","description","quantity","marketplace","account type","fulfillment","order city","order state","order postal","tax collection model","product sales","product sales tax","shipping credits","shipping credits tax","gift wrap credits","giftwrap credits tax","Regulatory Fee","Tax On Regulatory Fee","promotional rebates","promotional rebates tax","marketplace withheld tax","selling fees","fba fees","other transaction fees","other","total"';
  const lines = [head];
  let n = 0;
  const line = (date, type, order, sku, desc, qty, sales, promo, sell, fba, other, total) =>
    lines.push(`"${date}","1234567890","${type}","${order}","${sku}","${desc}","${qty}","amazon.com","Standard Orders","Amazon","","","","MarketplaceFacilitator","${sales}","0","0","0","0","0","0","0","${promo}","0","0","${sell}","${fba}","0","${other}","${total}"`);
  const products = [
    { sku: "KITCHEN-SCALE-BLK", title: "Digital Kitchen Scale", price: 19.99, fba: -3.22, per: 22, refund: 0.05 },
    { sku: "YOGA-MAT-6MM", title: "Yoga Mat 6mm", price: 29.99, fba: -6.1, per: 14, refund: 0.13 },
    { sku: "PHONE-STAND-ALU", title: "Aluminium Phone Stand", price: 14.99, fba: -3.02, per: 30, refund: 0.04 },
    { sku: "LED-DESK-LAMP", title: "LED Desk Lamp", price: 34.99, fba: -5.4, per: 9, refund: 0.08 },
  ];
  const monthNames = ["Jun", "Jul", "Aug", "Sep"];
  monthNames.forEach((mn, mi) => {
    for (const p of products) {
      const count = Math.round(p.per * (1 + mi * 0.1));
      for (let i = 0; i < count; i++) {
        n++;
        const day = 1 + ((i * 3 + mi) % 27);
        const id = `111-${String(1000000 + n).slice(1)}-${String(2000000 + n * 7).slice(1)}`;
        const sell = -round2(p.price * 0.15);
        const promo = i % 9 === 0 ? -2 : 0;
        const total = round2(p.price + promo + sell + p.fba);
        line(`${mn} ${day}, 2026 9:${String(10 + (i % 50))}:00 AM PDT`, "Order", id, p.sku, p.title, 1, p.price, promo, sell, p.fba, 0, total);
        if ((i + mi) % Math.round(1 / p.refund) === 0) {
          const rsell = round2(-sell * 0.8);
          line(`${mn} ${Math.min(28, day + 6)}, 2026 4:05:00 PM PDT`, "Refund", id, p.sku, p.title, 1, -p.price, -promo, rsell, 0, 0, round2(-p.price - promo + rsell));
        }
      }
    }
    line(`${mn} 12, 2026 1:00:00 AM PDT`, "Service Fee", "", "", "Cost of Advertising", "", 0, 0, 0, 0, 0, -(210 + mi * 60));
    line(`${mn} 1, 2026 1:00:00 AM PDT`, "Service Fee", "", "", "Subscription", "", 0, 0, 0, 0, 0, -39.99);
    line(`${mn} 15, 2026 1:00:00 AM PDT`, "FBA Inventory Fee", "", "", "FBA storage fee", "", 0, 0, 0, 0, 0, -(28 + mi * 5));
    line(`${mn} 28, 2026 1:00:00 AM PDT`, "Transfer", "", "", "Transfer to bank", "", 0, 0, 0, 0, 0, -1200);
  });
  line("Aug 20, 2026 1:00:00 AM PDT", "Adjustment", "", "YOGA-MAT-6MM", "FBA Inventory Reimbursement - Lost:Warehouse", 3, 0, 0, 0, 0, 0, 62.4);
  return lines.join("\n");
}

export function sampleCosts() {
  return "sku,cost\nKITCHEN-SCALE-BLK,4.10\nYOGA-MAT-6MM,9.50\nPHONE-STAND-ALU,3.05\nLED-DESK-LAMP,10.60";
}

export const money = $;
export const pct = P;
