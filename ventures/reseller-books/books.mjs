// One set of books across every marketplace a reseller sells on.
//
// Each marketplace exports a different file, and each file hides a different
// part of the truth: eBay buries shipping labels and ads inside the same
// report as sales, Etsy spreads fees over three columns and a second file,
// Poshmark charges a flat fee that is invisible until it is divided out, and
// Whatnot splits commission and processing. The single-marketplace
// analyzers in this repository (`ebay-transaction-report-analyzer`,
// `etsy-statement-profit-analyzer`, `poshmark-sales-report-analyzer`,
// `whatnot-sales-report-analyzer`) each read one of them. This module reads
// the files together, so a seller with more than one channel gets one monthly
// profit and loss, one comparison of what each channel really keeps, and one
// worksheet laid out the way a tax preparer asks for it.
//
// The engines in ./engines are verbatim copies of those calc.mjs files,
// so the venture deploys on its own. `books.test.mjs` fails if a copy drifts
// from its source while the source still exists in the monorepo.
//
// Nothing here fetches anything. Files are read in the caller's browser tab.

import { isInventoryLog, parseInventory, partThree, partThreeNotes, costLines, sampleInventoryCsv } from "./inventory.mjs";
import * as ebay from "./engines/ebay.mjs";
import * as etsy from "./engines/etsy.mjs";
import * as poshmark from "./engines/poshmark.mjs";
import * as whatnot from "./engines/whatnot.mjs";
import * as shopify from "./engines/shopify.mjs";
import * as mercari from "./engines/mercari.mjs";
import * as depop from "./engines/depop.mjs";
import { isTripLog, mergeTrips, summarizeTrips, tripNotes, sampleTripCsv } from "./trips.mjs";

export const CHANNELS = {
  ebay: "eBay",
  etsy: "Etsy",
  poshmark: "Poshmark",
  whatnot: "Whatnot",
  shopify: "Shopify",
  mercari: "Mercari",
  depop: "Depop",
};

const r2 = (n) => Math.round(n * 100) / 100;

// The first line with anything but whitespace, or "". Reads 15 lines first,
// so a large export is not split whole just to find its header.
function firstFilledLine(text) {
  const filled = (l) => l.trim() !== "";
  return text.split(/\r?\n/, 15).find(filled) ?? text.split(/\r?\n/).find(filled) ?? "";
}

/** Header tokens of the first non-empty line, lower-cased. */
function headerTokens(text) {
  const line = firstFilledLine(String(text || ""));
  const delim = line.includes("\t") ? "\t" : line.split(";").length > line.split(",").length ? ";" : ",";
  return line.split(delim).map((h) => h.replace(/^\uFEFF/, "").replace(/^"|"$/g, "").trim().toLowerCase());
}

/**
 * Which marketplace file is this? Decided from the header row alone, because
 * the Poshmark and Whatnot parsers will both accept each other's file and read
 * it wrongly (a Whatnot export has an "Order Date" too).
 *
 * eBay's report starts with a few lines of preamble before the header, so its
 * test looks for the header anywhere in the first lines.
 */
export function detectKind(text) {
  const head = String(text || "").split(/\r?\n/, 15).join("\n").toLowerCase();
  if (/net amount/.test(head) && /(order number|transaction creation date)/.test(head)) return "ebay";
  const h = headerTokens(text);
  // Mercari's Gross Sales Report: field names from Mercari's help centre.
  if (mercari.isMercariHeader(h)) return "mercari";
  // Depop's sales export: before Poshmark, since both have a Brand column.
  if (depop.isDepopHeader(h)) return "depop";
  const has = (...names) => names.every((n) => h.some((x) => x === n));
  // Shopify Payments "Transactions" export: a payout status and a type per money
  // movement. Checked before the item-per-row formats, none of which has these.
  if (has("transaction date", "type", "amount") && h.some((x) => /^payout (status|id)$/.test(x))) return "shopify";
  // Shopify admin "Orders" export: one row per line item; only used to cost products.
  if (has("name", "lineitem name") && h.includes("financial status")) return "shopify-orders";
  if (h.includes("fees & taxes") && h.includes("net")) return "etsy";
  if (has("item name", "order id") && h.some((x) => /sale date|date sold/.test(x))) return "etsy-items";
  if (h.some((x) => /^poshmark fee$|^posh fee$/.test(x)) || (h.includes("brand") && h.some((x) => /order price/.test(x)))) return "poshmark";
  if (h.some((x) => /^commission$|^processing fee$|^show$|^show name$/.test(x)) || (h.includes("product name") && h.some((x) => /sold price/.test(x)))) return "whatnot";
  // A trip log (sourcing runs, post office): a date and a miles column. Checked
  // last; no marketplace export has a miles column.
  if (isTripLog(text)) return "mileage";
  // A sourcing sheet: item or SKU, cost and purchase date. No marketplace
  // export has a purchase date.
  if (isInventoryLog(text)) return "inventory";
  return null;
}

const emptyLine = (channel) => ({
  channel,
  label: CHANNELS[channel],
  orders: 0,
  sales: 0, // gross sales the marketplace recorded (item, and shipping where the file has it)
  refunds: 0, // negative
  platformFees: 0, // negative: commission, transaction, processing, listing and similar
  labels: 0, // negative: postage bought through the marketplace
  ads: 0, // negative: promoted listings, Etsy ads
  other: 0, // negative: anything else the file deducts
  net: 0, // what the marketplace says you kept before the cost of the goods
  cogs: null, // null when no cost was supplied for any sale on this channel
  costedShare: null, // share of the channel's sales (by count where known) that carry a cost
  profit: null,
  from: null,
  to: null,
  notes: [],
});

function ebayChannel(files, costText) {
  const out = emptyLine("ebay");
  const rows = [];
  const skipped = [];
  for (const f of files) {
    const n = ebay.normalizeReport(ebay.parseCsv(f.text));
    if (n.error) return { error: `${f.name}: ${n.error}` };
    rows.push(...n.rows);
    skipped.push(...(n.skipped || []));
  }
  const costs = costText ? ebay.parseCosts(costText) : { costs: {}, bad: [] };
  const r = ebay.analyze(rows, { costs: costs.costs });
  if (r.invalid) return { error: r.invalid };
  const s = r.summary;
  const b = s.feeBuckets;
  out.orders = s.orderCount;
  out.sales = s.sales;
  out.refunds = s.refunds;
  out.labels = b.labels;
  out.ads = b.ads;
  // The engines' platformFees already contains advertising; split it out so
  // the Schedule C worksheet can put ads on their own line.
  out.platformFees = r2(s.platformFees - b.ads);
  out.other = r2(s.operating - s.sales - s.refunds - b.labels - b.ads - out.platformFees);
  out.net = s.operating;
  out.from = s.firstMonth;
  out.to = s.lastMonth;
  if (s.anyCosted && s.allCosted) {
    out.cogs = s.cogsTotal;
    out.costedShare = 1;
    out.profit = s.profit;
  } else if (s.anyCosted) {
    // Same rule as the other channels: a partly costed channel would count the
    // uncosted items as free and overstate profit, so leave it blank.
    out.notes.push("Only some eBay items have a cost, so eBay profit is left blank rather than overstated.");
  }
  const months = r.months.map((m) => ({ month: m.key, sales: m.sales, refunds: m.refunds, deductions: r2(m.net - m.sales - m.refunds), net: m.net, cogs: null }));
  return { line: out, months, detail: r, skipped: skipped.length, costBad: costs.bad.length };
}

function etsyChannel(statements, itemFiles, costText) {
  const out = emptyLine("etsy");
  const rows = [];
  for (const f of statements) {
    const n = etsy.normalizeStatement(etsy.parseCsv(f.text));
    if (n.error) return { error: `${f.name}: ${n.error}` };
    rows.push(...n.rows);
  }
  const items = [];
  for (const f of itemFiles) {
    const n = etsy.normalizeItems(etsy.parseCsv(f.text));
    if (n && n.rows) items.push(...n.rows);
  }
  const costs = costText ? etsy.parseCosts(costText) : { costs: {}, bad: [] };
  const r = etsy.analyze(rows, items, { costs: costs.costs });
  if (r.invalid) return { error: r.invalid };
  const s = r.summary;
  const b = s.feeBuckets;
  out.orders = s.orderCount;
  out.sales = s.sales;
  out.refunds = s.refunds;
  out.labels = b.labels;
  out.ads = b.ads;
  // The engines' platformFees already contains advertising; split it out so
  // the Schedule C worksheet can put ads on their own line.
  out.platformFees = r2(s.platformFees - b.ads);
  out.other = r2(s.operating - s.sales - s.refunds - b.labels - b.ads - out.platformFees);
  out.net = s.operating;
  out.from = s.firstMonth;
  out.to = s.lastMonth;
  if (s.anyCosted && s.allCosted) {
    out.cogs = s.cogsTotal;
    out.profit = s.profit;
    out.costedShare = 1;
  } else if (costText && !items.length) {
    out.notes.push("Etsy costs are matched through the Sold Order Items file; add it to cost your Etsy sales.");
  }
  const months = r.months.map((m) => ({ month: m.key, sales: m.sales, refunds: m.refunds, deductions: r2(m.net - m.sales - m.refunds), net: m.net, cogs: null }));
  return { line: out, months, detail: r, costBad: costs.bad.length };
}

// Shopify's Transactions export records what the customer paid, which includes
// the sales tax and shipping collected on the order. Sales tax is the state's
// money, not income, so when the Orders export is given the tax on each charged
// order (less the share refunded) is taken out of both sales and net. Without
// it the charges are used as they are and the channel says so.
function shopifyChannel(txFiles, orderFiles, costText) {
  const out = emptyLine("shopify");
  const rows = [];
  let skipped = 0;
  for (const f of txFiles) {
    const n = shopify.normalizeTransactions(shopify.parseCsv(f.text));
    if (n.error) return { error: `${f.name}: ${n.error}` };
    rows.push(...n.rows);
    skipped += n.skipped.length;
  }
  const orders = [];
  for (const f of orderFiles) {
    const n = shopify.normalizeOrders(shopify.parseCsv(f.text));
    if (n.error) return { error: `${f.name}: ${n.error}` };
    orders.push(...n.orders);
  }
  const costs = costText ? shopify.parseCosts(costText) : { costs: {}, bad: [] };
  const r = shopify.analyze(rows, orders, { costs: costs.costs });
  if (r.invalid) return { error: r.invalid };
  const s = r.summary;
  const t = s.totals;

  const taxByMonth = {};
  let tax = 0;
  if (orders.length) {
    const byKey = new Map(r.orders.filter((o) => o.charged > 0).map((o) => [o.key, o]));
    for (const o of orders) {
      const tx = byKey.get(o.key);
      if (!tx || !(o.taxes > 0)) continue;
      const refundedShare = Math.min(1, Math.max(0, -tx.refunds / tx.charged));
      const kept = r2(o.taxes * (1 - refundedShare));
      tax = r2(tax + kept);
      taxByMonth[tx.month] = r2((taxByMonth[tx.month] || 0) + kept);
    }
  }

  out.orders = s.orderCount;
  out.sales = r2(s.charges - tax);
  out.refunds = r2(t.refunds);
  out.platformFees = r2(t.processing + t.gateway);
  out.net = r2(s.operating - tax);
  out.other = r2(out.net - out.sales - out.refunds - out.platformFees);
  out.from = s.firstMonth;
  out.to = s.lastMonth;
  if (orders.length) {
    if (tax > 0) out.notes.push(`$${tax.toFixed(2)} of sales tax collected was taken out of Shopify sales and payout (from the Orders export); it is owed to the state, not income.`);
  } else {
    out.notes.push("Shopify sales here include the sales tax and shipping customers paid, because no Orders export was given. Add it to take tax out and to cost products.");
  }
  if (s.anyCosted && s.allCosted) {
    out.cogs = s.cogsTotal;
    out.costedShare = 1;
    out.profit = r2(out.net - out.cogs);
  } else if (s.anyCosted) {
    out.notes.push("Only some Shopify products have a cost, so Shopify profit is left blank rather than overstated.");
  } else if (costText && !orders.length) {
    out.notes.push("Shopify costs are matched through the Orders export (by product name or SKU); add it to cost your Shopify sales.");
  }
  const months = r.months.map((m) => {
    const mt = taxByMonth[m.key] || 0;
    const sales = r2(m.charges - mt);
    const net = r2(m.net - mt);
    return { month: m.key, sales, refunds: r2(m.refunds), deductions: r2(net - sales - m.refunds), net, cogs: null };
  });
  return { line: out, months, detail: r, skipped, costBad: costs.bad.length };
}

// Mercari books a sale when the order completes, at item price; what the buyer
// paid on top (shipping, sales tax, buyer fees) never reaches the seller and is
// reported beside the books, not in them. Overlapping downloads are
// de-duplicated by Item ID.
function mercariChannel(files, costText) {
  const out = emptyLine("mercari");
  const rows = [];
  let skipped = 0;
  for (const f of files) {
    const n = mercari.normalizeReport(mercari.parseCsv(f.text, mercari.detectDelimiter(f.text)));
    if (n.error) return { error: `${f.name}: ${n.error}` };
    rows.push(...n.rows);
    skipped += n.skipped.length;
  }
  const costs = costText ? mercari.parseCosts(costText) : { costs: {}, bad: [] };
  const r = mercari.analyze(rows, { costs: costs.costs });
  if (r.invalid) return { error: r.invalid };
  const s = r.summary;
  out.orders = s.orders;
  out.sales = s.sales;
  out.platformFees = s.fees;
  out.labels = s.labels;
  out.other = s.other;
  out.net = s.net;
  out.from = s.firstMonth;
  out.to = s.lastMonth;
  if (s.duplicates) out.notes.push(`${s.duplicates} Mercari row(s) repeated an Item ID from another download and were counted once.`);
  if (s.inProgress) out.notes.push(`${s.inProgress} Mercari order(s) ($${s.inProgressPrice.toFixed(2)} at item price) were still in progress when the report was made; their fees are estimates, so they are left out until a later report shows them completed.`);
  if (s.canceled) out.notes.push(`${s.canceled} canceled Mercari order(s) were left out: a canceled order pays nothing.`);
  if (s.unreconciled) out.notes.push(`${s.unreconciled} Mercari row(s) have a Net Seller Proceeds that the listed fees do not explain; the difference is under other deductions.`);
  const buyer = r2(s.buyerShipping + s.buyerTax + s.buyerFees);
  if (buyer > 0) out.notes.push(`Buyers also paid $${buyer.toFixed(2)} on top of item prices on completed Mercari orders (shipping $${s.buyerShipping.toFixed(2)}, sales tax $${s.buyerTax.toFixed(2)}, buyer fees $${s.buyerFees.toFixed(2)}). None of it reached you, so it is not in sales, but a 1099-K can include some of it.`);
  if (s.costed === s.orders) {
    out.cogs = s.cogs;
    out.costedShare = 1;
    out.profit = r2(s.net - s.cogs);
  } else if (s.costed > 0) {
    out.costedShare = s.costed / s.orders;
    out.notes.push(`${s.costed} of ${s.orders} Mercari sales have a cost, so Mercari profit is left blank rather than overstated.`);
  }
  const months = r.months.map((m) => ({ month: m.month, sales: m.sales, refunds: 0, deductions: r2(m.net - m.sales), net: m.net, cogs: m.costed === m.orders ? m.cogs : null }));
  return { line: out, months, detail: r, skipped, costBad: costs.bad.length };
}

// Depop books a sale on its date of sale, at item price plus the shipping the
// buyer paid (credited to the seller; the label is deducted). The file has no
// payout per sale, so the net is built from its fee, label, boost and refund
// columns. Overlapping downloads are de-duplicated by date, time, buyer,
// description and price.
function depopChannel(files, costText) {
  const out = emptyLine("depop");
  const perFile = [];
  let skipped = 0;
  for (const f of files) {
    const n = depop.normalizeReport(depop.parseCsv(f.text, depop.detectDelimiter(f.text)));
    if (n.error) return { error: `${f.name}: ${n.error}` };
    perFile.push(n.rows);
    skipped += n.skipped.length;
  }
  const costs = costText ? depop.parseCosts(costText) : { costs: {}, bad: [] };
  const r = depop.analyze(perFile, { costs: costs.costs });
  if (r.invalid) return { error: r.invalid };
  const s = r.summary;
  out.orders = s.orders;
  out.sales = s.sales;
  out.refunds = s.refunds;
  out.platformFees = s.fees;
  out.labels = s.labels;
  out.ads = s.ads;
  out.net = s.net;
  out.from = s.firstMonth;
  out.to = s.lastMonth;
  out.notes.push("Depop's export has no payout figure per sale, so Depop's net here is item price plus buyer shipping, less the label, Depop fee, Depop Payments fee, boosting and refunds. Check it against your Depop payouts.");
  if (s.duplicates) out.notes.push(`${s.duplicates} Depop row(s) repeated a sale from another download (same date, time, buyer, description and price) and were counted once.`);
  if (s.feeRefunds) out.notes.push(`Depop gave back $${s.feeRefunds.toFixed(2)} of fees on refunded sales; it is netted against Depop's fees.`);
  if (s.fullyRefunded) out.notes.push(`${s.fullyRefunded} Depop sale(s) were refunded in full and are taken to have come back into stock.`);
  if (s.bundled) out.notes.push(`${s.bundled} Depop row(s) were part of a bundle; a bundle's shipping and fees can sit on one of its rows, so per-item figures are approximate while the totals are not.`);
  const buyer = r2(s.buyerTax + s.buyerFees);
  if (buyer > 0) out.notes.push(`Buyers also paid $${buyer.toFixed(2)} on top on Depop (sales tax $${s.buyerTax.toFixed(2)}, Buyer Marketplace Fee $${s.buyerFees.toFixed(2)}). None of it reached you, so it is not in sales, but a 1099-K can include some of it.`);
  if (s.costed === s.orders) {
    out.cogs = s.cogs;
    out.costedShare = 1;
    out.profit = r2(s.net - s.cogs);
  } else if (s.costed > 0) {
    out.costedShare = s.costed / s.orders;
    out.notes.push(`${s.costed} of ${s.orders} Depop sales have a cost, so Depop profit is left blank rather than overstated.`);
  }
  const months = r.months.map((m) => ({ month: m.month, sales: m.sales, refunds: m.refunds, deductions: r2(m.net - m.sales - m.refunds), net: m.net, cogs: m.costed === m.orders ? m.cogs : null }));
  return { line: out, months, detail: r, skipped, costBad: costs.bad.length };
}

function itemChannel(channel, engine, files, costText, feeMode) {
  const out = emptyLine(channel);
  const items = [];
  let skipped = 0;
  for (const f of files) {
    const delim = engine.detectDelimiter(f.text);
    const table = engine.parseCsv(f.text, delim); // read-only in both calls, so parsed once
    const n = engine.normalizeRows(table, { decimalComma: engine.detectDecimalComma(table, delim), feeMode });
    if (n.error) return { error: `${f.name}: ${n.error}` };
    items.push(...n.items);
    skipped += (n.skipped || []).length;
  }
  const r = engine.analyze(items, { costList: costText || "" });
  if (r.invalid) return { error: r.invalid };
  const s = r.summary;
  out.orders = s.items;
  out.sales = s.price;
  // The payout the file reports is what the seller kept; everything between
  // price and payout is a deduction. Fees are the named part of it.
  out.platformFees = -s.fee;
  out.other = r2(s.payout - s.price + s.fee);
  out.net = s.payout;
  out.from = engine.dateStr(s.from).slice(0, 7);
  out.to = engine.dateStr(s.to).slice(0, 7);
  if (s.costedItems > 0) {
    out.costedShare = s.costedItems / s.items;
    if (s.costedItems === s.items) {
      out.cogs = s.cost;
      out.profit = s.profit;
    } else {
      out.notes.push(`${s.costedItems} of ${s.items} ${CHANNELS[channel]} sales have a cost, so ${CHANNELS[channel]} profit is left blank rather than overstated.`);
    }
  }
  const months = r.byMonth.map((m) => ({
    month: m.label,
    sales: m.price,
    refunds: 0,
    deductions: r2(m.payout - m.price),
    net: m.payout,
    cogs: m.costedItems === m.items ? m.cost : null,
  }));
  return { line: out, months, detail: r, skipped, costBad: r.costList ? r.costList.errors.length : 0 };
}

/**
 * Build the books.
 *
 * @param {{name: string, text: string}[]} files  any mix of marketplace exports
 * @param {{costs?: string, feeMode?: "auto"|"schedule"}} opts
 *   `costs` is pasted `key,cost` lines, handed to each engine, which matches by
 *   its own key (eBay item title or number, SKU on the others).
 */
export function buildBooks(files, { costs = "", feeMode = "auto", openingInventory = null } = {}) {
  const groups = { ebay: [], etsy: [], "etsy-items": [], poshmark: [], whatnot: [], shopify: [], "shopify-orders": [], mercari: [], depop: [], mileage: [], inventory: [] };
  const unread = [];
  for (const f of files) {
    const kind = detectKind(f.text);
    if (kind) groups[kind].push(f);
    else unread.push(f.name);
  }
  if (!groups["etsy-items"].length || groups.etsy.length) {
    /* an items file alone is not a channel; it only costs Etsy sales */
  }
  // An inventory log prices every sale it names (average cost per SKU or
  // title); costs typed in step 2 come after it, so they win for a key.
  const inv = groups.inventory.length ? parseInventory(groups.inventory) : null;
  if (inv && inv.lots.length) costs = [costLines(inv.lots), costs].filter(Boolean).join("\n");
  const channels = [];
  const monthsBy = {};
  const problems = [];
  const details = {};
  const add = (key, res) => {
    if (res.error) {
      problems.push(res.error);
      return;
    }
    channels.push(res.line);
    details[key] = res.detail;
    for (const m of res.months) {
      (monthsBy[m.month] ||= {})[key] = m;
    }
    if (res.costBad) res.line.notes.push(`${res.costBad} cost line(s) were not understood.`);
    if (res.skipped) res.line.notes.push(`${res.skipped} row(s) were skipped as unreadable.`);
  };
  if (groups.ebay.length) add("ebay", ebayChannel(groups.ebay, costs));
  if (groups.etsy.length) add("etsy", etsyChannel(groups.etsy, groups["etsy-items"], costs));
  if (groups.poshmark.length) add("poshmark", itemChannel("poshmark", poshmark, groups.poshmark, costs, feeMode));
  if (groups.whatnot.length) add("whatnot", itemChannel("whatnot", whatnot, groups.whatnot, costs, feeMode));
  if (groups.mercari.length) add("mercari", mercariChannel(groups.mercari, costs));
  if (groups.depop.length) add("depop", depopChannel(groups.depop, costs));
  if (groups.shopify.length) add("shopify", shopifyChannel(groups.shopify, groups["shopify-orders"], costs));
  if (groups["shopify-orders"].length && !groups.shopify.length) {
    problems.push("A Shopify Orders export was given without the Shopify Payments Transactions export. The transactions file is the one with the fees; add it.");
  }
  if (groups["etsy-items"].length && !groups.etsy.length) {
    problems.push("A Sold Order Items file was given without the Etsy Payment Account statement. The statement is the one with the fees; add it.");
  }

  if (!channels.length && groups.mileage.length) {
    problems.unshift("A mileage log was read, but no marketplace file. Add your marketplace reports too: the mileage is an expense against the sales in them.");
  }
  if (!channels.length) {
    return { invalid: problems[0] || "No marketplace file could be recognised. Expected an eBay Transaction report, an Etsy Payment Account statement, a Poshmark My Sales Report, a Whatnot orders export, a Shopify Payments Transactions export, a Mercari Gross Sales Report or a Depop sales export.", unread, problems };
  }

  // Combined months, newest last. Every row reconciles: sales + refunds +
  // deductions = net, by construction, per channel and in the total.
  const keys = Object.keys(monthsBy).sort();
  const months = keys.map((month) => {
    const per = monthsBy[month];
    const row = { month, sales: 0, refunds: 0, deductions: 0, net: 0, byChannel: {}, cogs: 0, costedChannels: 0, channelsPresent: 0 };
    for (const [key, m] of Object.entries(per)) {
      row.sales += m.sales;
      row.refunds += m.refunds;
      row.deductions += m.deductions;
      row.net += m.net;
      row.byChannel[key] = m.net;
      row.channelsPresent += 1;
      if (m.cogs !== null && m.cogs !== undefined) {
        row.cogs += m.cogs;
        row.costedChannels += 1;
      }
    }
    for (const k of ["sales", "refunds", "deductions", "net", "cogs"]) row[k] = r2(row[k]);
    row.profit = row.costedChannels === row.channelsPresent && row.channelsPresent > 0 ? r2(row.net - row.cogs) : null;
    return row;
  });

  const total = { sales: 0, refunds: 0, platformFees: 0, labels: 0, ads: 0, other: 0, net: 0, orders: 0 };
  for (const c of channels) for (const k of Object.keys(total)) total[k] = r2(total[k] + c[k]);
  const allCosted = channels.every((c) => c.profit !== null);
  total.cogs = allCosted ? r2(channels.reduce((a, c) => a + c.cogs, 0)) : null;
  total.profit = allCosted ? r2(channels.reduce((a, c) => a + c.profit, 0)) : null;
  total.keepRate = total.sales > 0 ? total.net / total.sales : null;

  // Business mileage: Schedule C line 9 at the IRS standard rate, kept out of
  // the marketplace reconciliation above (it is not money a marketplace moved).
  let mileage = null;
  if (groups.mileage.length) {
    const merged = mergeTrips(groups.mileage);
    mileage = summarizeTrips(merged.trips);
    mileage.skipped = merged.skipped;
    mileage.repeatsDropped = merged.repeatsDropped;
    mileage.notes = tripNotes(mileage);
    if (merged.skipped) mileage.notes.push(`${merged.skipped} trip row(s) had no readable date or miles and were skipped.`);
    if (merged.repeatsDropped) mileage.notes.push(`${merged.repeatsDropped} trip row(s) repeated in another trip file were counted once.`);
  }
  let inventory = null;
  if (inv) {
    const years = [...new Set(keys.map((k) => k.slice(0, 4)))];
    if (!inv.lots.length) inventory = { invalid: "The inventory log had no readable rows." + (inv.skipped.length ? ` ${inv.skipped.length} row(s) were skipped (first: ${inv.skipped[0].file} line ${inv.skipped[0].line}, ${inv.skipped[0].reason}).` : "") };
    else if (years.length !== 1) inventory = { invalid: `Schedule C Part III is for one tax year, and these reports cover ${years.join(", ")}. Load one year's marketplace reports with the inventory log to get Part III.` };
    else {
      inventory = partThree(inv.lots, soldUnits(details), { year: Number(years[0]), opening: openingInventory });
      inventory.lots = inv.lots.length;
      inventory.skipped = inv.skipped;
      inventory.notes = partThreeNotes(inventory);
      if (details.etsy && !(details.etsy.listings || []).length) inventory.notes.push("Etsy sales are matched to the inventory log through the Sold Order Items file, which was not given, so none of them took stock from it and line 41 counts those items as still on hand. Add the file.");
      if (inv.skipped.length) inventory.notes.push(`${inv.skipped.length} inventory row(s) were skipped (first: ${inv.skipped[0].file} line ${inv.skipped[0].line}, ${inv.skipped[0].reason}).`);
    }
  }
  total.carTruck = mileage ? mileage.carTruck : null;
  total.profitAfterCar = total.profit !== null && mileage ? r2(total.profit - mileage.carTruck) : null;

  for (const c of channels) {
    c.keepRate = c.sales > 0 ? c.net / c.sales : null;
    c.takeRate = c.sales > 0 ? -(c.platformFees + c.labels + c.ads + c.other) / c.sales : null;
    c.profitMargin = c.profit !== null && c.sales > 0 ? c.profit / c.sales : null;
  }

  return {
    channels,
    months,
    total,
    mileage,
    inventory,
    schedule: scheduleWorksheet(channels, total, mileage, inventory),
    findings: findings(channels, total, months, mileage, inventory),
    unread,
    problems,
    details,
  };
}

/**
 * Units sold per item, from each channel's analysis, in the shape partThree
 * matches: the names a sale goes by on that marketplace, and net units
 * (a returned unit is back on the shelf).
 */
export function soldUnits(details) {
  const out = [];
  const add = (channel, name, keys, units) => { if (units > 0) out.push({ channel: CHANNELS[channel], name: name || keys.find(Boolean) || "", keys: keys.filter(Boolean).map(String), units }); };
  for (const it of details.ebay?.items || []) add("ebay", it.name, [it.label, it.name, it.itemId], Math.max(0, it.netUnits));
  for (const l of details.etsy?.listings || []) add("etsy", l.name, [l.name], Math.max(0, l.netUnits));
  for (const p of details.shopify?.products || []) add("shopify", p.name, [p.sku, p.name], Math.max(0, p.netUnits));
  for (const ch of ["poshmark", "whatnot"]) for (const x of details[ch]?.items || []) add(ch, x.title, [x.sku, x.id, x.title], 1);
  for (const x of details.mercari?.sold || []) add("mercari", x.title, [x.id, x.title], 1);
  for (const x of details.depop?.sold || []) add("depop", x.title, [x.title], 1);
  return out;
}

/**
 * A worksheet in the shape of the US Schedule C income and expense lines, so a
 * preparer receives numbers already grouped. It is arithmetic on the files, not
 * a return: where a line depends on how the seller treats an item (postage is
 * often cost of goods sold, sometimes "other expenses"), the row says which
 * lines a number could belong to and leaves the decision to the preparer.
 */
export function scheduleWorksheet(channels, total, mileage = null, inventory = null) {
  const neg = (v) => r2(-v);
  const rows = [
    { line: "1", label: "Gross receipts or sales", amount: r2(total.sales), note: "As the marketplaces recorded them. Compare with any 1099-K, which may also include sales tax and shipping." },
    { line: "2", label: "Returns and allowances", amount: neg(total.refunds), note: "Refunds the marketplaces deducted." },
    inventory && !inventory.invalid
      ? { line: "4 / 42", label: "Cost of goods sold", amount: inventory.line42, note: `From Part III below (${inventory.year}, inventory valued at cost): line 40 less closing inventory.${inventory.unmatchedUnits ? ` ${inventory.unmatchedUnits} sold unit(s) are not in the inventory log, so this is short by their cost.` : ""}` }
      : { line: "4 / 42", label: "Cost of goods sold", amount: total.cogs, note: total.cogs === null ? "Not computed: not every sale has a cost. Add costs or an inventory log, or use your purchase records." : "From the costs you supplied, sale by sale. Add an inventory log (what you bought, when) for Part III with opening and closing inventory." },
    { line: "8", label: "Advertising", amount: neg(total.ads), note: "Promoted listings and Etsy ads." },
    { line: "10", label: "Commissions and fees", amount: neg(total.platformFees), note: "Final value, transaction, processing, listing and commission fees." },
    { line: "27a / 4", label: "Postage bought through the marketplace", amount: neg(total.labels), note: "Shipping labels. Often reported inside cost of goods or as an other expense; ask your preparer which." },
    { line: "27a", label: "Other marketplace deductions", amount: neg(total.other), note: "Anything else between sales and payout (subscriptions, disputes, credits, shipping adjustments), net of credits." },
  ];
  if (inventory && !inventory.invalid) {
    const p = inventory;
    rows.push(
      { line: "Part III 33", label: "Method used to value closing inventory", amount: null, note: "Cost (33a): each unit at what you paid for it, oldest purchase sold first." },
      { line: "Part III 35", label: "Inventory at beginning of year", amount: p.line35, note: p.openingSource === "entered" ? "As you entered it (last year's line 41)." : `From the log: purchases before ${p.year} not marked sold before it. Should equal last year's line 41.` },
      { line: "Part III 36", label: "Purchases less cost of items withdrawn for personal use", amount: p.line36, note: `${p.year} purchases in the log${p.withdrawn ? `, less $${p.withdrawn.toFixed(2)} marked personal or kept` : ""}.` },
      { line: "Part III 37-39", label: "Labor, materials and supplies, other costs", amount: null, note: "Not in a sourcing sheet. Add any to line 40 with your preparer." },
      { line: "Part III 40", label: "Add lines 35 through 39", amount: p.line40, note: "Lines 35 and 36 only." },
      { line: "Part III 41", label: "Inventory at end of year", amount: p.line41, note: `${p.closingUnits} unit(s) bought by Dec 31 ${p.year} and not sold in these reports or marked gone. Count what is on your shelves and compare.` },
      { line: "Part III 42", label: "Cost of goods sold (line 40 less line 41)", amount: p.line42, note: `Carried to line 4. ${p.matchedUnits} sold unit(s) matched to purchases at $${p.matchedCost.toFixed(2)}.` },
    );
  }
  if (mileage) {
    const rates = mileage.rates.map((r) => `${(r * 100).toFixed(1).replace(/\.0$/, "")}¢`).join(" and ");
    rows.push({ line: "9", label: "Car and truck expenses (standard mileage rate)", amount: mileage.carTruck, note: `${mileage.businessMiles} business miles from your trip log at ${rates || "the IRS rate"} a mile by trip date (2026: 72.5¢ to June 30, 76¢ from July 1), plus $${(mileage.tolls + mileage.parking).toFixed(2)} of business tolls and parking. The standard rate replaces actual car costs (gas, repairs, insurance, depreciation) and generally has to be chosen in the first year the car is used for business.` });
    rows.push({ line: "Part IV 44a", label: "Business miles", amount: null, miles: mileage.businessMiles, note: `${mileage.businessMiles} business, ${mileage.commuteMiles} commuting, ${mileage.otherMiles} other miles in the log. Part IV also asks for the date the car went into service and whether you have written evidence; the log is that evidence.` });
  }
  return rows;
}

function findings(channels, total, months, mileage = null, inventory = null) {
  const out = [];
  if (inventory && inventory.invalid) out.push({ severity: "medium", title: `Inventory: ${inventory.invalid}`, detail: "" });
  else if (inventory) {
    out.push({
      severity: inventory.unmatchedUnits ? "high" : "info",
      title: `Schedule C Part III for ${inventory.year}: cost of goods sold $${inventory.line42.toFixed(2)}, closing inventory $${inventory.line41.toFixed(2)}`,
      detail: `Opening inventory $${inventory.line35.toFixed(2)} plus purchases $${inventory.line36.toFixed(2)}, less $${inventory.line41.toFixed(2)} still on hand at December 31 (${inventory.closingUnits} unit(s)). ${inventory.matchedUnits} sold unit(s) were matched to the purchase that bought them, oldest first.`,
    });
    for (const n of inventory.notes) out.push({ severity: /no purchase in the inventory log/.test(n) ? "high" : "info", title: `Inventory: ${n}`, detail: "" });
  }
  if (mileage && mileage.businessTrips) {
    out.push({
      severity: "info",
      title: `${mileage.businessTrips} business trips, ${mileage.businessMiles} miles: $${mileage.carTruck.toFixed(2)} of car and truck expenses`,
      detail: total.profitAfterCar === null
        ? "At the IRS standard mileage rate for each trip's date, plus business tolls and parking. Add costs for every sale to see profit after the car."
        : `At the IRS standard mileage rate for each trip's date, plus business tolls and parking. Profit after the cost of goods and the car: $${total.profitAfterCar.toFixed(2)}.`,
    });
  }
  if (mileage) for (const n of mileage.notes) out.push({ severity: "info", title: `Mileage: ${n}`, detail: "" });
  if (channels.length >= 2) {
    const ranked = [...channels].filter((c) => c.sales > 0).sort((a, b) => b.keepRate - a.keepRate);
    const best = ranked[0];
    const worst = ranked[ranked.length - 1];
    if (best && worst && best !== worst) {
      out.push({
        severity: "info",
        title: `${best.label} keeps ${(best.keepRate * 100).toFixed(1)}% of every sale dollar; ${worst.label} keeps ${(worst.keepRate * 100).toFixed(1)}%`,
        detail: `That is before the cost of the goods. On ${best.label}, $100 of sales leaves $${(best.keepRate * 100).toFixed(2)} after fees, postage bought there, ads and refunds; on ${worst.label} it leaves $${(worst.keepRate * 100).toFixed(2)}. Compare like with like: a channel full of heavy items pays more in postage, which is not its fee.`,
      });
    }
  }
  for (const c of channels) {
    if (c.sales > 0 && c.ads / c.sales < -0.05) {
      out.push({ severity: "medium", title: `${c.label} advertising is ${((-c.ads / c.sales) * 100).toFixed(1)}% of sales`, detail: `${c.label} ads and promotions cost $${(-c.ads).toFixed(2)} against $${c.sales.toFixed(2)} of sales. Check the sales they brought against what you would have sold anyway.` });
    }
    if (c.sales > 0 && Math.abs(c.refunds) / c.sales > 0.05) {
      out.push({ severity: "medium", title: `${c.label} refunds are ${((Math.abs(c.refunds) / c.sales) * 100).toFixed(1)}% of sales`, detail: `$${Math.abs(c.refunds).toFixed(2)} was refunded on $${c.sales.toFixed(2)} of sales. Refunded sales also return no fee on some marketplaces.` });
    }
    for (const n of c.notes) out.push({ severity: "info", title: n.startsWith(c.label) ? n : `${c.label}: ${n}`, detail: "" });
  }
  const profitable = channels.filter((c) => c.profit !== null);
  if (profitable.length >= 2) {
    const byMargin = [...profitable].sort((a, b) => b.profitMargin - a.profitMargin);
    const a = byMargin[0];
    const z = byMargin[byMargin.length - 1];
    out.push({
      severity: "high",
      title: `After the cost of goods, ${a.label} earns ${(a.profitMargin * 100).toFixed(1)}¢ of profit per sales dollar and ${z.label} earns ${(z.profitMargin * 100).toFixed(1)}¢`,
      detail: `Profit is what the marketplace paid out minus what you paid for the goods. Sourcing and listing time are not counted, so a thinner channel can still win on hours spent.`,
    });
  }
  const costed = months.filter((m) => m.profit !== null);
  if (costed.length >= 3) {
    const worst = [...costed].sort((a, b) => a.profit - b.profit)[0];
    if (worst.profit < 0) out.push({ severity: "high", title: `${worst.month} lost $${(-worst.profit).toFixed(2)} after the cost of goods`, detail: "The month's marketplace payouts were smaller than what you paid for the items sold in it." });
  }
  return out;
}

export function toCsv(result) {
  const q = (x) => { let v = String(x); if (/^[=+\-@\t\r]/.test(v) && !/^-?\d[\d,.]*$/.test(v)) v = "'" + v; return `"${v.replace(/"/g, '""')}"`; }; // formula injection guard (CWE-1236)
  const f = (v) => (v === null || v === undefined ? "" : Number(v).toFixed(2));
  const head = "month,sales,refunds,marketplace_deductions,net_payout,cost_of_goods,profit";
  const lines = result.months.map((m) => [m.month, f(m.sales), f(m.refunds), f(m.deductions), f(m.net), m.costedChannels === m.channelsPresent ? f(m.cogs) : "", f(m.profit)].join(","));
  const chead = "\nchannel,orders,sales,refunds,fees,postage,ads,other,net_payout,cost_of_goods,profit,keeps_per_sales_dollar";
  const cl = result.channels.map((c) => [q(c.label), c.orders, f(c.sales), f(c.refunds), f(c.platformFees), f(c.labels), f(c.ads), f(c.other), f(c.net), f(c.cogs), f(c.profit), c.keepRate === null ? "" : c.keepRate.toFixed(4)].join(","));
  const shead = "\nschedule_c_line,label,amount";
  const sl = result.schedule.map((s) => [q(s.line), q(s.label), s.miles !== undefined ? s.miles : f(s.amount)].join(","));
  const out = [head, ...lines, chead, ...cl, shead, ...sl];
  if (result.mileage) {
    out.push("\nmileage_month,business_miles,standard_rate_deduction,car_and_truck_with_tolls_parking");
    for (const m of result.mileage.months) out.push([m.month, m.miles, f(m.deduction), f(m.carTruck)].join(","));
  }
  return out.join("\n");
}

export function summaryText(result) {
  const m = (v) => (v === null || v === undefined ? "–" : ((t) => (v < 0 && /[1-9∞]/.test(t) ? "-$" : "$") + t)(Math.abs(v).toFixed(2)));
  const out = [`Reseller books: ${result.channels.map((c) => c.label).join(", ")}`];
  const t = result.total;
  out.push(`Sales ${m(t.sales)}, refunds ${m(t.refunds)}, fees ${m(t.platformFees)}, postage ${m(t.labels)}, ads ${m(t.ads)}, other ${m(t.other)}, net payout ${m(t.net)}.`);
  out.push(t.profit === null ? "Profit not computed (not every sale has a cost)." : `Cost of goods ${m(t.cogs)}; profit ${m(t.profit)}.`);
  const inv = result.inventory;
  if (inv && !inv.invalid) out.push(`Schedule C Part III (${inv.year}, at cost): opening inventory ${m(inv.line35)}, purchases ${m(inv.line36)}, closing inventory ${m(inv.line41)}, cost of goods sold ${m(inv.line42)}${inv.unmatchedUnits ? ` (${inv.unmatchedUnits} sold unit(s) not in the inventory log)` : ""}.`);
  if (result.mileage) out.push(`Mileage: ${result.mileage.businessMiles} business miles, car and truck expenses ${m(result.mileage.carTruck)} (standard rate)${t.profitAfterCar === null ? "" : `; profit after the car ${m(t.profitAfterCar)}`}.`);
  for (const c of result.channels) out.push(`${c.label}: ${c.orders} orders, sales ${m(c.sales)}, kept ${m(c.net)} (${(c.keepRate * 100).toFixed(1)}%)${c.profit === null ? "" : `, profit ${m(c.profit)}`}`);
  return out.join("\n");
}

/** Synthetic example: the engines' own made-up files, so no real seller appears. */
export function sampleFiles() {
  const e = ebay.sampleData();
  const t = etsy.sampleData();
  const sh = shopify.sampleData();
  return {
    files: [
      { name: "ebay-transaction-report.csv", text: e.report },
      { name: "etsy-payment-account-statement.csv", text: t.statement },
      { name: "poshmark-my-sales-report.csv", text: poshmark.sampleCsv() },
      { name: "whatnot-orders.csv", text: whatnot.sampleCsv() },
      { name: "shopify-payments-transactions.csv", text: sh.transactions },
      { name: "shopify-orders.csv", text: sh.orders },
      { name: "mercari-gross-sales-report.csv", text: mercari.sampleCsv() },
      { name: "depop-sales.csv", text: depop.sampleCsv() },
      { name: "mileage-log.csv", text: sampleTripCsv() },
    ],
    costs: e.costs + "\n" + sh.costs.split("\n").slice(1).join("\n"),
  };
}

export const money = (v) => (v === null || v === undefined ? "–" : ((t) => (v < 0 && /[1-9∞]/.test(t) ? "-" : "") + t)(Math.abs(v).toLocaleString("en-US", { style: "currency", currency: "USD" })));
export const decodeBuffer = poshmark.decodeBuffer;
export { sampleInventoryCsv };
