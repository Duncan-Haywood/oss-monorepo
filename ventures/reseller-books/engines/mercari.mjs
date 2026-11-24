// Mercari (US) Gross Sales Report reader. Pure functions, no DOM, no network.
//
// Unlike the other engines this one has no single-marketplace analyzer to be
// copied from, so it lives here. The column names are not from memory: they
// are the 20 fields Mercari's own help centre lists for the report
// ("How to access my Gross Sales Report", mercari.com/us/help_center/article/541,
// read 2026-11-24). No real export was available, so header spelling, date
// format and number format are matched loosely; a real file may still differ.
//
// What the help centre says each field means, and what this reader does with it:
// - Order Status is Completed, Canceled or In Progress "based on the date you
//   generate the report". Fees on an in-progress order are estimates and the
//   money is not in the seller's balance yet, so only Completed rows are
//   booked; the others are counted and reported.
// - Net Seller Proceeds is the Item Price less the seller-paid shipping, the
//   Mercari selling fee, the payment processing fee and any shipping adjustment
//   (an underweight label). The file's net is kept; a row whose parts do not add
//   up to it puts the difference in `other` and is counted as unreconciled.
// - Buyer Shipping Fee, Sales Tax and the fees "charged to buyer" (merchant,
//   service, buyer protection, payment processing) are paid by the buyer on top
//   of the item and never reach the seller, so they are not sales. They are
//   totalled separately, because a Form 1099-K can include some of them.
// - Completed Date is when the proceeds reach the balance, so a sale is booked
//   in its completion month (sold month when no completion date is given).
// - Item ID is unique per item, so the same sale in two overlapping downloads
//   is booked once; a later status (Completed or Canceled) wins over In Progress.

import { parseCsv, parseNumber, parseWhen, detectDmy, detectDelimiter } from "./whatnot.mjs";

export { parseCsv, detectDelimiter };

const ALIASES = {
  id: ["item id", "item #", "item number"],
  sold: ["sold date", "date sold"],
  canceled: ["canceled date", "cancelled date"],
  completed: ["completed date", "complete date"],
  title: ["item title", "title", "item name"],
  status: ["order status", "status"],
  shipTo: ["shipped to state"],
  shipFrom: ["shipped from state"],
  price: ["item price", "sale price", "sold price"],
  buyerShip: ["buyer shipping fee"],
  sellerShip: ["seller shipping fee"],
  sellingFee: ["mercari selling fee", "selling fee"],
  processing: ["payment processing fee"],
  adjustment: ["shipping adjustment fee"],
  net: ["net seller proceeds"],
  tax: ["sales tax charged to buyer"],
  merchantBuyer: ["merchant fees charged to buyer"],
  serviceBuyer: ["service fee charged to buyer"],
  protectionBuyer: ["buyer protection charged to buyer"],
  processingBuyer: ["payment processing fee charged to buyer"],
};

const r2 = (n) => Math.round(n * 100) / 100;
const norm = (h) => String(h ?? "").replace(/^﻿/, "").trim().toLowerCase().replace(/\s+/g, " ");

/** True when a header row is Mercari's Gross Sales Report. */
export function isMercariHeader(cells) {
  const h = cells.map(norm);
  return h.includes("net seller proceeds") || (h.includes("mercari selling fee") && h.includes("item id"));
}

function findColumns(header) {
  const h = header.map(norm);
  const cols = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    for (const n of names) {
      const at = h.indexOf(n);
      if (at !== -1 && !Object.values(cols).includes(at)) { cols[field] = at; break; }
    }
  }
  return cols;
}

const STATUS = (s) => {
  const v = norm(s);
  if (v.startsWith("complete")) return "completed";
  if (v.startsWith("cancel")) return "canceled";
  if (v === "" ) return "";
  return "in-progress";
};
const RANK = Object.assign(Object.create(null), { "": 0, "in-progress": 1, canceled: 2, completed: 2 });

/**
 * Rows of the report as objects. Money columns are positive amounts as the
 * help centre describes them ("deducted from your Item Price"); a minus sign or
 * brackets on a fee is read as the same deduction, not a credit.
 */
export function normalizeReport(table) {
  const at = table.findIndex((r) => isMercariHeader(r));
  if (at === -1) return { error: "This does not look like a Mercari Gross Sales Report: no Net Seller Proceeds column was found." };
  const cols = findColumns(table[at]);
  for (const need of ["price", "net"]) if (cols[need] === undefined) return { error: `The Mercari report has no ${need === "price" ? "Item Price" : "Net Seller Proceeds"} column.` };
  if (cols.sold === undefined && cols.completed === undefined) return { error: "The Mercari report has no Sold Date or Completed Date column." };
  const body = table.slice(at + 1);
  const dateCells = [];
  for (const r of body) for (const k of ["sold", "completed", "canceled"]) if (cols[k] !== undefined) dateCells.push(r[cols[k]]);
  const dmy = detectDmy(dateCells);
  const cell = (r, k) => (cols[k] === undefined ? "" : String(r[cols[k]] ?? "").trim());
  const num = (r, k) => (cols[k] === undefined ? 0 : parseNumber(r[cols[k]]));
  const fee = (r, k) => Math.abs(num(r, k));
  const rows = [];
  const skipped = [];
  for (const r of body) {
    const line = r.line;
    const price = num(r, "price");
    const net = num(r, "net");
    const sold = parseWhen(cell(r, "sold"), dmy);
    const completed = parseWhen(cell(r, "completed"), dmy);
    const when = completed || sold;
    const nums = ["sellerShip", "sellingFee", "processing", "adjustment", "buyerShip", "tax", "merchantBuyer", "serviceBuyer", "protectionBuyer", "processingBuyer"].map((k) => num(r, k));
    if (!Number.isFinite(price) || !Number.isFinite(net) || nums.some((n) => !Number.isFinite(n)) || !when) {
      // A totals line at the foot of a report has no date; it is not a sale.
      if (!/total/i.test(r.join(" "))) skipped.push(line);
      continue;
    }
    let status = STATUS(cell(r, "status"));
    if (!status) status = parseWhen(cell(r, "canceled"), dmy) ? "canceled" : completed ? "completed" : "in-progress";
    rows.push({
      line,
      id: cell(r, "id") || null,
      title: cell(r, "title"),
      status,
      month: new Date(when.t).toISOString().slice(0, 7),
      t: when.t,
      price,
      sellerShip: fee(r, "sellerShip"),
      sellingFee: fee(r, "sellingFee"),
      processing: fee(r, "processing"),
      adjustment: fee(r, "adjustment"),
      net,
      buyerPaid: {
        shipping: num(r, "buyerShip"),
        tax: num(r, "tax"),
        fees: r2(num(r, "merchantBuyer") + num(r, "serviceBuyer") + num(r, "protectionBuyer") + num(r, "processingBuyer")),
      },
    });
  }
  return { rows, skipped };
}

/** Same sale in overlapping downloads: one row per Item ID, the most settled status kept. */
export function dedupe(rows) {
  const byId = new Map();
  const out = [];
  let dropped = 0;
  for (const row of rows) {
    if (!row.id) { out.push(row); continue; }
    const seen = byId.get(row.id);
    if (seen === undefined) { byId.set(row.id, out.length); out.push(row); continue; }
    dropped += 1;
    const prev = out[seen];
    if ((Object.hasOwn(RANK, row.status) ? RANK[row.status] : 0) > (Object.hasOwn(RANK, prev.status) ? RANK[prev.status] : 0)) out[seen] = row;
  }
  return { rows: out, dropped };
}

/** Pasted `key,cost` lines; key is an Item ID or an item title. */
export function parseCosts(text) {
  const costs = Object.create(null);
  const bad = [];
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const l = raw.trim();
    if (!l) continue;
    const m = l.match(/^(.*)[,;\t]\s*([^,;\t]+)$/);
    const v = m ? parseNumber(m[2]) : NaN;
    if (!m || !Number.isFinite(v) || !m[1].trim()) { if (!/cost/i.test(l)) bad.push(l); continue; }
    costs[m[1].trim().replace(/^"|"$/g, "").toLowerCase()] = v;
  }
  return { costs, bad };
}

/**
 * Book the completed sales. Returns per-month and total figures in the
 * ledger's sign convention: sales positive, deductions negative, and
 * sales + fees + labels + other = net (the file's Net Seller Proceeds).
 */
export function analyze(rawRows, { costs: given = {} } = {}) {
  const costs = Object.assign(Object.create(null), given);
  const { rows, dropped } = dedupe(rawRows);
  const done = rows.filter((r) => r.status === "completed");
  if (!done.length) {
    const open = rows.filter((r) => r.status === "in-progress").length;
    return { invalid: rows.length ? `The Mercari report has no completed orders${open ? ` (${open} still in progress, whose fees are estimates)` : ""}.` : "The Mercari report has no sales rows." };
  }
  const blank = () => ({ orders: 0, sales: 0, fees: 0, labels: 0, other: 0, net: 0, cogs: 0, costed: 0, buyerShipping: 0, buyerTax: 0, buyerFees: 0 });
  const months = Object.create(null);
  const total = blank();
  let unreconciled = 0;
  for (const r of done) {
    const m = (months[r.month] ||= blank());
    const fees = -(r.sellingFee + r.processing);
    const labels = -r.sellerShip;
    const expected = r.price + fees + labels - r.adjustment;
    const gap = r2(r.net - expected);
    if (Math.abs(gap) > 0.01) unreconciled += 1;
    const other = r2(-r.adjustment + gap);
    const key = [r.id, r.title].filter(Boolean).map((k) => k.toLowerCase()).find((k) => costs[k] !== undefined);
    for (const t of [m, total]) {
      t.orders += 1;
      t.sales += r.price;
      t.fees += fees;
      t.labels += labels;
      t.other += other;
      t.net += r.net;
      t.buyerShipping += r.buyerPaid.shipping;
      t.buyerTax += r.buyerPaid.tax;
      t.buyerFees += r.buyerPaid.fees;
      if (key !== undefined) { t.cogs += costs[key]; t.costed += 1; }
    }
  }
  const round = (o) => { for (const k of Object.keys(o)) if (typeof o[k] === "number") o[k] = r2(o[k]); return o; };
  const sorted = done.map((r) => r.t).sort((a, b) => a - b);
  return {
    months: Object.keys(months).sort().map((k) => ({ month: k, ...round(months[k]) })),
    summary: {
      ...round(total),
      firstMonth: new Date(sorted[0]).toISOString().slice(0, 7),
      lastMonth: new Date(sorted[sorted.length - 1]).toISOString().slice(0, 7),
      canceled: rows.filter((r) => r.status === "canceled").length,
      inProgress: rows.filter((r) => r.status === "in-progress").length,
      inProgressPrice: r2(rows.filter((r) => r.status === "in-progress").reduce((a, r) => a + r.price, 0)),
      duplicates: dropped,
      unreconciled,
    },
  };
}

/** A made-up report in the help centre's column order; no real seller appears. */
export function sampleCsv() {
  return [
    "Item ID,Sold Date,Canceled Date,Completed Date,Item Title,Order Status,Shipped to State,Shipped from State,Item Price,Buyer Shipping Fee,Seller Shipping Fee,Mercari Selling Fee,Payment Processing Fee,Shipping Adjustment Fee,Net Seller Proceeds,Sales Tax Charged to Buyer,Merchant Fees Charged to Buyer,Service Fee Charged to Buyer,Buyer Protection Charged to Buyer,Payment Processing Fee Charged to Buyer",
    "m10000000001,03/02/2026,,03/06/2026,Vintage denim jacket,Completed,CA,OH,48.00,0.00,7.45,4.80,1.74,0.00,34.01,3.96,0.00,0.00,1.92,0.00",
    "m10000000002,03/11/2026,,03/15/2026,Ceramic planter set,Completed,TX,OH,30.00,8.25,0.00,3.00,1.20,1.10,24.70,2.48,0.00,0.00,1.20,0.00",
    "m10000000003,03/20/2026,03/22/2026,,Leather belt,Canceled,NY,OH,18.00,6.99,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00",
    "m10000000004,04/03/2026,,04/08/2026,Board game bundle,Completed,WA,OH,62.00,0.00,13.20,6.20,2.16,0.00,40.44,5.27,0.00,0.00,2.48,0.00",
    "m10000000005,04/27/2026,,,Wool scarf,In Progress,IL,OH,22.00,6.49,0.00,2.20,0.96,0.00,18.84,1.98,0.00,0.00,0.88,0.00",
  ].join("\n");
}
