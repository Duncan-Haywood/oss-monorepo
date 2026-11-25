// Depop sales export reader ("Download sales" in the Selling Hub). Pure
// functions, no DOM, no network.
//
// Like the Mercari reader this one has no single-marketplace analyzer to copy
// from, so it lives here. Depop's help centre describes what the file holds
// but not its header strings, and no real export was available to this run.
// The column names below come from four independent open-source projects
// that read real Depop exports, found through GitHub code search on
// 2026-11-25. One printed a real file's full header row; the others hard-code
// the same names in their parsers:
//
//   Date of sale, Time of sale, Date of listing, Bundle, Buyer, Brand,
//   Description, Size, Item price, Buyer shipping cost, Total, USPS Cost,
//   Depop fee, Depop Payments fee, Buyer Marketplace Fee, Boosting fee,
//   Payment type, Estimated payout date, Payout arrival date, Category, Name,
//   Address Line 1, Address Line 2, City, State, Post Code, Country,
//   US Sales tax, Refunded to buyer amount, Fees refunded to seller,
//   Payout id, Australia Sales tax, Unknown Tax, Canada Sales tax
//
// The sources: Juribu/Depop-Sales-Analysis (the printed header),
// CiaranO-C/popstats-server, IsaganiJulian/Depop-Data-Project,
// sraudez/resale-analytics-dashboard. Those projects also show two quirks
// handled here: an empty money cell can be written `="-"` or `$-`, and the
// date order follows the seller's country (US month first, UK day first).
//
// What each column does in the books:
// - Sales are the item price plus the shipping the buyer paid: on Depop the
//   buyer's shipping is credited to the seller and the label (USPS Cost) is
//   deducted, the same shape as eBay's report.
// - Depop fee (the selling fee), Depop Payments fee (processing) and Boosting
//   fee (promoted listings, so advertising) are deducted.
// - Refunded to buyer amount is a refund; Fees refunded to seller gives back
//   part of the fees on a refunded sale.
// - Buyer Marketplace Fee and the sales tax columns are paid by the buyer on
//   top and never reach the seller, so they are reported beside the books.
// - The file carries no payout figure per sale, so the net here is computed
//   from those columns, not read; Total is not used because some exports fold
//   US sales tax into it.
// - Names and addresses of buyers are never read.
// - There is no item ID. The same sale in two overlapping downloads is
//   recognised by its date, time, buyer, description and price and counted
//   once; identical rows inside one file all count (a bundle can hold two
//   identical items).

import { parseCsv, parseNumber, parseWhen, detectDmy, detectDelimiter } from "./whatnot.mjs";

export { parseCsv, detectDelimiter };

const ALIASES = {
  date: ["date of sale", "sale date", "date"],
  time: ["time of sale"],
  bundle: ["bundle"],
  buyer: ["buyer"],
  brand: ["brand"],
  title: ["description", "item description", "item"],
  size: ["size"],
  price: ["item price"],
  buyerShip: ["buyer shipping cost"],
  total: ["total"],
  label: ["usps cost", "shipping label cost", "label cost"],
  sellingFee: ["depop fee", "selling fee"],
  processing: ["depop payments fee", "payment fee"],
  buyerFee: ["buyer marketplace fee"],
  boost: ["boosting fee"],
  usTax: ["us sales tax", "sales tax"],
  auTax: ["australia sales tax"],
  caTax: ["canada sales tax"],
  otherTax: ["unknown tax"],
  refund: ["refunded to buyer amount", "refund amount"],
  feeRefund: ["fees refunded to seller"],
};

const r2 = (n) => Math.round(n * 100) / 100;
const norm = (h) => String(h ?? "").replace(/^﻿/, "").trim().toLowerCase().replace(/\s+/g, " ");

/** True when a header row is Depop's sales export. */
export function isDepopHeader(cells) {
  const h = cells.map(norm);
  return h.includes("depop payments fee") || (h.includes("depop fee") && h.includes("item price"));
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

// Excel's text-forcing wrapper: the raw file says `="-"`, which a CSV parser
// hands over as `="-"` or, having taken the quotes, `=-`.
const unwrap = (v) => {
  const s = String(v ?? "").trim();
  const m = s.match(/^="(.*)"$/) || s.match(/^=(.*)$/);
  return m ? m[1].trim() : s;
};

/** A money cell: `="-"`, `$-`, `-` and blank are zero; `="12.00"` is 12. */
export function depopNumber(v) {
  let s = String(v ?? "").trim();
  s = unwrap(s);
  if (/^[$£€]?\s*[-–—]?\s*$/.test(s)) return 0;
  return parseNumber(s);
}

/**
 * Rows of the export as objects. Money columns are amounts as Depop writes
 * them; a fee is a deduction whichever sign it carries.
 */
export function normalizeReport(table) {
  const at = table.findIndex((r) => isDepopHeader(r));
  if (at === -1) return { error: "This does not look like a Depop sales export: no Depop Payments fee or Depop fee column was found." };
  const cols = findColumns(table[at]);
  if (cols.price === undefined) return { error: "The Depop export has no Item price column." };
  if (cols.date === undefined) return { error: "The Depop export has no Date of sale column." };
  const body = table.slice(at + 1);
  const dmy = detectDmy(body.map((r) => r[cols.date]));
  const cell = (r, k) => (cols[k] === undefined ? "" : unwrap(String(r[cols[k]] ?? "")));
  const num = (r, k) => (cols[k] === undefined ? 0 : depopNumber(r[cols[k]]));
  const MONEY = ["price", "buyerShip", "label", "sellingFee", "processing", "buyerFee", "boost", "usTax", "auTax", "caTax", "otherTax", "refund", "feeRefund"];
  const rows = [];
  const skipped = [];
  for (const r of body) {
    const when = parseWhen(cell(r, "date"), dmy);
    const v = Object.fromEntries(MONEY.map((k) => [k, num(r, k)]));
    if (!when || MONEY.some((k) => !Number.isFinite(v[k]))) {
      // A totals line at the foot has no date; it is not a sale.
      if (!/total/i.test(r.join(" "))) skipped.push(r.line);
      continue;
    }
    rows.push({
      line: r.line,
      key: [cell(r, "date"), cell(r, "time"), cell(r, "buyer"), cell(r, "title"), cell(r, "price")].join("\u0001").toLowerCase(),
      title: cell(r, "title"),
      brand: cell(r, "brand"),
      bundle: /^(yes|true|1)$/i.test(cell(r, "bundle")),
      month: new Date(when.t).toISOString().slice(0, 7),
      t: when.t,
      price: v.price,
      buyerShip: Math.abs(v.buyerShip),
      label: Math.abs(v.label),
      sellingFee: Math.abs(v.sellingFee),
      processing: Math.abs(v.processing),
      boost: Math.abs(v.boost),
      refund: Math.abs(v.refund),
      feeRefund: Math.abs(v.feeRefund),
      buyerPaid: { fees: Math.abs(v.buyerFee), tax: r2(Math.abs(v.usTax) + Math.abs(v.auTax) + Math.abs(v.caTax) + Math.abs(v.otherTax)) },
    });
  }
  return { rows, skipped };
}

/**
 * Same sale in overlapping downloads. `files` is one array of rows per file;
 * a sale whose key appeared in an earlier file is dropped, while repeats
 * inside one file are kept.
 */
export function dedupe(files) {
  const seen = new Set();
  const out = [];
  let dropped = 0;
  for (const rows of files) {
    const here = new Set();
    for (const row of rows) {
      if (seen.has(row.key)) { dropped += 1; continue; }
      here.add(row.key);
      out.push(row);
    }
    for (const k of here) seen.add(k);
  }
  return { rows: out, dropped };
}

/** Pasted `key,cost` lines; key is the item description (title). */
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
 * Book the sales. Ledger signs: sales positive, deductions negative, and
 * sales + refunds + fees + labels + ads = net.
 *
 * @param {object[][]} files rows from normalizeReport, one array per file
 */
export function analyze(files, { costs: given = {} } = {}) {
  const costs = Object.assign(Object.create(null), given);
  const { rows, dropped } = dedupe(files);
  if (!rows.length) return { invalid: "The Depop export has no sales rows." };
  const blank = () => ({ orders: 0, sales: 0, refunds: 0, fees: 0, labels: 0, ads: 0, net: 0, cogs: 0, costed: 0, buyerTax: 0, buyerFees: 0, feeRefunds: 0 });
  const months = Object.create(null);
  const total = blank();
  for (const r of rows) {
    const m = (months[r.month] ||= blank());
    const sales = r.price + r.buyerShip;
    const fees = -(r.sellingFee + r.processing) + r.feeRefund;
    const net = sales - r.refund + fees - r.label - r.boost;
    const key = r.title ? r.title.toLowerCase() : undefined;
    for (const t of [m, total]) {
      t.orders += 1;
      t.sales += sales;
      t.refunds -= r.refund;
      t.fees += fees;
      t.labels -= r.label;
      t.ads -= r.boost;
      t.net += net;
      t.feeRefunds += r.feeRefund;
      t.buyerTax += r.buyerPaid.tax;
      t.buyerFees += r.buyerPaid.fees;
      if (key !== undefined && costs[key] !== undefined) { t.cogs += costs[key]; t.costed += 1; }
    }
  }
  const round = (o) => { for (const k of Object.keys(o)) if (typeof o[k] === "number") o[k] = r2(o[k]); return o; };
  const sorted = rows.map((r) => r.t).sort((a, b) => a - b);
  return {
    months: Object.keys(months).sort().map((k) => ({ month: k, ...round(months[k]) })),
    // A fully refunded sale is taken to have come back, so it sells no unit.
    sold: rows.filter((r) => !(r.price > 0 && r.refund >= r.price)).map((r) => ({ title: r.title, month: r.month })),
    summary: {
      ...round(total),
      firstMonth: new Date(sorted[0]).toISOString().slice(0, 7),
      lastMonth: new Date(sorted[sorted.length - 1]).toISOString().slice(0, 7),
      duplicates: dropped,
      bundled: rows.filter((r) => r.bundle).length,
      fullyRefunded: rows.filter((r) => r.price > 0 && r.refund >= r.price).length,
    },
  };
}

/** A made-up export in the column order the sources show; no real seller or buyer appears. */
export function sampleCsv() {
  return [
    "Date of sale,Time of sale,Date of listing,Bundle,Buyer,Brand,Description,Size,Item price,Buyer shipping cost,Total,USPS Cost,Depop fee,Depop Payments fee,Buyer Marketplace Fee,Boosting fee,Payment type,Estimated payout date,Payout arrival date,Category,US Sales tax,Refunded to buyer amount,Fees refunded to seller",
    `03/04/2026,14:05,01/20/2026,No,buyer_one,Levi's,Vintage 501 jeans,W30,$45.00,$6.50,$51.50,$6.50,="-",$2.15,$2.25,$3.60,Card,03/07/2026,03/07/2026,Bottoms,$4.12,="-",="-"`,
    `03/18/2026,09:40,02/02/2026,No,buyer_two,Nike,Windbreaker jacket,M,$38.00,$5.25,$43.25,$5.25,="-",$1.88,$1.90,="-",Card,03/21/2026,03/21/2026,Outerwear,$3.46,="-",="-"`,
    `04/09/2026,19:12,03/30/2026,No,buyer_three,Unbranded,Knit sweater,L,$30.00,$5.25,$35.25,$5.25,="-",$1.61,$1.50,$2.40,Card,04/12/2026,04/12/2026,Tops,$2.82,$30.00,$1.61`,
  ].join("\n");
}
