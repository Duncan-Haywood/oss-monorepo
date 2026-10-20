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

import * as ebay from "./engines/ebay.mjs";
import * as etsy from "./engines/etsy.mjs";
import * as poshmark from "./engines/poshmark.mjs";
import * as whatnot from "./engines/whatnot.mjs";
import * as shopify from "./engines/shopify.mjs";

export const CHANNELS = {
  ebay: "eBay",
  etsy: "Etsy",
  poshmark: "Poshmark",
  whatnot: "Whatnot",
  shopify: "Shopify",
};

const r2 = (n) => Math.round(n * 100) / 100;

/** Header tokens of the first non-empty line, lower-cased. */
function headerTokens(text) {
  const line = String(text || "").split(/\r?\n/).find((l) => l.trim() !== "") || "";
  const delim = line.includes("\t") ? "\t" : line.split(";").length > line.split(",").length ? ";" : ",";
  return line.split(delim).map((h) => h.replace(/^﻿/, "").replace(/^"|"$/g, "").trim().toLowerCase());
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
  const head = String(text || "").split(/\r?\n/).slice(0, 15).join("\n").toLowerCase();
  if (/net amount/.test(head) && /(order number|transaction creation date)/.test(head)) return "ebay";
  const h = headerTokens(text);
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
  if (s.anyCosted) {
    out.cogs = s.cogsTotal;
    out.costedShare = s.allCosted ? 1 : null;
    out.profit = s.profit;
    if (!s.allCosted) out.notes.push("Only some eBay items have a cost, so eBay profit is left blank rather than overstated.");
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

function itemChannel(channel, engine, files, costText, feeMode) {
  const out = emptyLine(channel);
  const items = [];
  let skipped = 0;
  for (const f of files) {
    const delim = engine.detectDelimiter(f.text);
    const n = engine.normalizeRows(engine.parseCsv(f.text, delim), { decimalComma: delim === ";", feeMode });
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
export function buildBooks(files, { costs = "", feeMode = "auto" } = {}) {
  const groups = { ebay: [], etsy: [], "etsy-items": [], poshmark: [], whatnot: [], shopify: [], "shopify-orders": [] };
  const unread = [];
  for (const f of files) {
    const kind = detectKind(f.text);
    if (kind) groups[kind].push(f);
    else unread.push(f.name);
  }
  if (!groups["etsy-items"].length || groups.etsy.length) {
    /* an items file alone is not a channel; it only costs Etsy sales */
  }
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
  if (groups.shopify.length) add("shopify", shopifyChannel(groups.shopify, groups["shopify-orders"], costs));
  if (groups["shopify-orders"].length && !groups.shopify.length) {
    problems.push("A Shopify Orders export was given without the Shopify Payments Transactions export. The transactions file is the one with the fees; add it.");
  }
  if (groups["etsy-items"].length && !groups.etsy.length) {
    problems.push("A Sold Order Items file was given without the Etsy Payment Account statement. The statement is the one with the fees; add it.");
  }

  if (!channels.length) {
    return { invalid: problems[0] || "No marketplace file could be recognised. Expected an eBay Transaction report, an Etsy Payment Account statement, a Poshmark My Sales Report, a Whatnot orders export or a Shopify Payments Transactions export.", unread, problems };
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

  for (const c of channels) {
    c.keepRate = c.sales > 0 ? c.net / c.sales : null;
    c.takeRate = c.sales > 0 ? -(c.platformFees + c.labels + c.ads + c.other) / c.sales : null;
    c.profitMargin = c.profit !== null && c.sales > 0 ? c.profit / c.sales : null;
  }

  return {
    channels,
    months,
    total,
    schedule: scheduleWorksheet(channels, total),
    findings: findings(channels, total, months),
    unread,
    problems,
    details,
  };
}

/**
 * A worksheet in the shape of the US Schedule C income and expense lines, so a
 * preparer receives numbers already grouped. It is arithmetic on the files, not
 * a return: where a line depends on how the seller treats an item (postage is
 * often cost of goods sold, sometimes "other expenses"), the row says which
 * lines a number could belong to and leaves the decision to the preparer.
 */
export function scheduleWorksheet(channels, total) {
  const neg = (v) => r2(-v);
  const rows = [
    { line: "1", label: "Gross receipts or sales", amount: r2(total.sales), note: "As the marketplaces recorded them. Compare with any 1099-K, which may also include sales tax and shipping." },
    { line: "2", label: "Returns and allowances", amount: neg(total.refunds), note: "Refunds the marketplaces deducted." },
    { line: "4 / 42", label: "Cost of goods sold", amount: total.cogs, note: total.cogs === null ? "Not computed: not every sale has a cost. Add costs, or use your purchase records." : "From the costs you supplied. Opening and closing inventory are not modelled." },
    { line: "8", label: "Advertising", amount: neg(total.ads), note: "Promoted listings and Etsy ads." },
    { line: "10", label: "Commissions and fees", amount: neg(total.platformFees), note: "Final value, transaction, processing, listing and commission fees." },
    { line: "27a / 4", label: "Postage bought through the marketplace", amount: neg(total.labels), note: "Shipping labels. Often reported inside cost of goods or as an other expense; ask your preparer which." },
    { line: "27a", label: "Other marketplace deductions", amount: neg(total.other), note: "Anything else between sales and payout (subscriptions, disputes, credits, shipping adjustments), net of credits." },
  ];
  return rows;
}

function findings(channels, total, months) {
  const out = [];
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
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const f = (v) => (v === null || v === undefined ? "" : Number(v).toFixed(2));
  const head = "month,sales,refunds,marketplace_deductions,net_payout,cost_of_goods,profit";
  const lines = result.months.map((m) => [m.month, f(m.sales), f(m.refunds), f(m.deductions), f(m.net), m.costedChannels === m.channelsPresent ? f(m.cogs) : "", f(m.profit)].join(","));
  const chead = "\nchannel,orders,sales,refunds,fees,postage,ads,other,net_payout,cost_of_goods,profit,keeps_per_sales_dollar";
  const cl = result.channels.map((c) => [q(c.label), c.orders, f(c.sales), f(c.refunds), f(c.platformFees), f(c.labels), f(c.ads), f(c.other), f(c.net), f(c.cogs), f(c.profit), c.keepRate === null ? "" : c.keepRate.toFixed(4)].join(","));
  const shead = "\nschedule_c_line,label,amount";
  const sl = result.schedule.map((s) => [q(s.line), q(s.label), f(s.amount)].join(","));
  return [head, ...lines, chead, ...cl, shead, ...sl].join("\n");
}

export function summaryText(result) {
  const m = (v) => (v === null || v === undefined ? "–" : (v < 0 ? "-$" : "$") + Math.abs(v).toFixed(2));
  const out = [`Reseller books: ${result.channels.map((c) => c.label).join(", ")}`];
  const t = result.total;
  out.push(`Sales ${m(t.sales)}, refunds ${m(t.refunds)}, fees ${m(t.platformFees)}, postage ${m(t.labels)}, ads ${m(t.ads)}, other ${m(t.other)}, net payout ${m(t.net)}.`);
  out.push(t.profit === null ? "Profit not computed (not every sale has a cost)." : `Cost of goods ${m(t.cogs)}; profit ${m(t.profit)}.`);
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
    ],
    costs: e.costs + "\n" + sh.costs.split("\n").slice(1).join("\n"),
  };
}

export const money = (v) => (v === null || v === undefined ? "–" : (v < 0 ? "-" : "") + Math.abs(v).toLocaleString("en-US", { style: "currency", currency: "USD" }));
export const decodeBuffer = poshmark.decodeBuffer;
