// Shopify Payments fee analysis from the one CSV a merchant already has: the
// Payments Transactions export (Shopify admin -> Finances -> Payouts ->
// Transactions -> Export). Output is the fee waterfall by transaction type,
// effective rate by card brand / card source / payment method, refund and
// dispute cost, a foreign-currency premium where detectable, a monthly table,
// two editable what-ifs and plain-language findings. Pure functions, no DOM,
// no network.

const ALIASES = {
  date: ["transaction date", "date", "created", "created at"],
  type: ["type", "transaction type"],
  order: ["order", "order name", "order id"],
  brand: ["card brand", "brand"],
  source: ["card source", "source"],
  payoutId: ["payout id"],
  amount: ["amount", "gross"],
  fee: ["fee", "fees"],
  net: ["net"],
  method: ["payment method name", "payment method", "gateway"],
  presAmount: ["presentment amount"],
  presCurrency: ["presentment currency"],
  currency: ["currency", "shop currency"],
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

// Shopify writes "2026-09-01 14:03:22 -0400"; long month names and
// month-first slashes are accepted for hand-edited files.
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

// Blank and "--" are zero, not errors; anything else unparseable is NaN.
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

function headerRowIndex(table, must) {
  for (let i = 0; i < Math.min(table.length, 20); i++) {
    const norm = table[i].map((h) => h.trim().toLowerCase());
    if (must.every((alts) => alts.some((a) => norm.includes(a)))) return i;
  }
  return -1;
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

const round2 = (n) => Math.round(n * 100) / 100;

const label = (s, fallback) => {
  const t = String(s ?? "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  return t || fallback;
};

// Every readable row is kept; unreadable ones are returned with line and
// reason so the total of rows read plus rows skipped is the file's data rows.
export function normalizeTransactions(table) {
  if (!table.length) return { rows: [], skipped: [], error: "The file is empty." };
  const h = headerRowIndex(table, [["transaction date", "date", "created", "created at"], ["type", "transaction type"], ["amount", "gross"]]);
  if (h === -1) return { rows: [], skipped: [], error: "No header row found. Expected the Shopify Payments Transactions export with columns like “Transaction Date”, “Type”, “Order”, “Card Brand”, “Amount”, “Fee” and “Net”." };
  const cols = findColumns(table[h]);
  const get = (r, f) => (cols[f] === undefined ? "" : (r[cols[f]] ?? "")).trim();
  const rows = [], skipped = [];
  for (let i = h + 1; i < table.length; i++) {
    const r = table[i];
    const line = i + 1;
    const date = parseDate(get(r, "date"));
    if (!date) { skipped.push({ line, reason: `unreadable date “${get(r, "date")}”` }); continue; }
    const amount = parseMoney(get(r, "amount"));
    const feeCol = cols.fee !== undefined ? parseMoney(get(r, "fee")) : 0;
    const netRaw = cols.net !== undefined && get(r, "net") !== "" ? parseMoney(get(r, "net")) : null;
    if (Number.isNaN(amount) || Number.isNaN(feeCol) || Number.isNaN(netRaw)) { skipped.push({ line, reason: "unreadable amount, fee or net" }); continue; }
    // Net = Amount - Fee, so the fee is recovered from Net when it is there.
    // That makes the sign of the Fee column irrelevant: positive means cost.
    const fee = netRaw !== null ? round2(amount - netRaw) : feeCol;
    const net = netRaw !== null ? netRaw : round2(amount - feeCol);
    const pres = parseMoney(get(r, "presAmount"));
    const cur = get(r, "currency").toUpperCase(), pcur = get(r, "presCurrency").toUpperCase();
    rows.push({
      line, date, month: monthKeyOf(date),
      typeRaw: get(r, "type"), typeKey: label(get(r, "type"), ""),
      order: get(r, "order"),
      brand: label(get(r, "brand"), "unknown"),
      source: label(get(r, "source"), "unknown"),
      method: label(get(r, "method"), "unknown"),
      amount, fee, net,
      presAmount: Number.isNaN(pres) ? 0 : pres, currency: cur, presCurrency: pcur,
      foreign: Boolean(cur && pcur && cur !== pcur),
    });
  }
  return { rows, skipped, error: null };
}


export const BUCKETS = ["charge", "refund", "dispute", "dispute_won", "adjustment", "reserve", "other", "payout"];

// Every row lands in exactly one bucket. "Won" is tested before "dispute"
// because a reversal's type also contains the word dispute.
export function classify(r) {
  const y = r.typeKey;
  if (/^payout/.test(y) || y === "transfer") return "payout";
  if (/(dispute|chargeback).*(reversal|won|reversed)|(reversal|won).*(dispute|chargeback)/.test(y)) return "dispute_won";
  if (/dispute|chargeback/.test(y)) return "dispute";
  if (/reserve/.test(y)) return "reserve";
  if (/refund/.test(y)) return "refund";
  if (/adjust|correction/.test(y)) return "adjustment";
  if (/^(charge|payment|sale|capture|authorization)/.test(y)) return "charge";
  return "other";
}

// "Domestic vs international" comes from Card Source or Payment Method Name
// text; a wallet (Apple Pay, Google Pay, Shop Pay, PayPal) is named as one and
// its origin is left unknown unless the text also says it.
export function originOf(r) {
  const t = `${r.source} ${r.method}`;
  if (/international|intl|foreign/.test(t)) return "international";
  if (/domestic/.test(t)) return "domestic";
  return "unknown";
}
export function walletOf(r) {
  const t = `${r.source} ${r.method}`;
  if (/apple pay/.test(t)) return "apple pay";
  if (/google pay|gpay/.test(t)) return "google pay";
  if (/shop pay/.test(t)) return "shop pay";
  if (/paypal/.test(t)) return "paypal";
  return "";
}

function group(map, key, r) {
  if (!map.has(key)) map.set(key, { key, count: 0, gross: 0, fees: 0 });
  const g = map.get(key);
  g.count++; g.gross += r.amount; g.fees += r.fee;
}
const finishGroups = (map) => [...map.values()]
  .map((g) => ({ ...g, rate: g.gross > 0 ? g.fees / g.gross : 0, perOrder: g.count ? g.fees / g.count : 0 }))
  .sort((a, b) => b.gross - a.gross);

export function analyze(rows) {
  if (!rows.length) return { invalid: "No usable transaction rows." };
  const buckets = {};
  for (const b of BUCKETS) buckets[b] = { count: 0, amount: 0, fees: 0, net: 0 };
  const months = new Map();
  const byBrand = new Map(), bySource = new Map(), byMethod = new Map(), byOrigin = new Map(), byCurrency = new Map();
  const chargeByOrder = new Map();
  const month = (k) => {
    if (!months.has(k)) months.set(k, { key: k, charges: 0, gross: 0, chargeFees: 0, refunds: 0, disputes: 0, fees: 0, net: 0 });
    return months.get(k);
  };

  for (const r of rows) {
    const b = classify(r);
    r.bucket = b;
    const k = buckets[b];
    k.count++; k.amount += r.amount; k.fees += r.fee; k.net += r.net;
    if (b === "payout") continue;
    const m = month(r.month);
    m.fees += r.fee; m.net += r.net;
    if (b === "charge") {
      m.charges++; m.gross += r.amount; m.chargeFees += r.fee;
      group(byBrand, r.brand, r);
      group(bySource, walletOf(r) || r.source, r);
      group(byMethod, r.method, r);
      group(byOrigin, originOf(r), r);
      group(byCurrency, r.foreign ? "foreign presentment currency" : "same currency", r);
      if (r.order) {
        const o = chargeByOrder.get(r.order) || { gross: 0, fee: 0 };
        o.gross += r.amount; o.fee += r.fee;
        chargeByOrder.set(r.order, o);
      }
    } else if (b === "refund") m.refunds += r.amount;
    else if (b === "dispute" || b === "dispute_won") m.disputes += r.net;
  }

  const c = buckets.charge;
  const gross = c.amount;
  const totalFees = BUCKETS.filter((b) => b !== "payout").reduce((a, b) => a + buckets[b].fees, 0);
  const operatingNet = BUCKETS.filter((b) => b !== "payout").reduce((a, b) => a + buckets[b].net, 0);
  const effectiveRate = gross > 0 ? c.fees / gross : 0;

  // Refund cost: the processing fee that was paid on the charge and not given
  // back. Matched by order number where the charge is in the file; otherwise
  // estimated at the overall rate and counted separately so the estimate shows.
  let refundCostMatched = 0, refundCostEstimated = 0, refundsMatched = 0, refundsUnmatched = 0;
  for (const r of rows) {
    if (r.bucket !== "refund") continue;
    const refunded = Math.abs(r.amount);
    const o = r.order ? chargeByOrder.get(r.order) : null;
    if (o && o.gross > 0) {
      refundsMatched++;
      refundCostMatched += o.fee * Math.min(1, refunded / o.gross) + r.fee;
    } else {
      refundsUnmatched++;
      refundCostEstimated += refunded * effectiveRate + r.fee;
    }
  }
  const refundCost = refundCostMatched + refundCostEstimated;
  const refundAmount = -buckets.refund.amount;

  const disputeCount = buckets.dispute.count;
  const disputeFees = buckets.dispute.fees;
  const disputeNet = buckets.dispute.net + buckets.dispute_won.net;

  const origin = finishGroups(byOrigin);
  const cur = finishGroups(byCurrency);
  const foreign = cur.find((g) => g.key === "foreign presentment currency");
  const same = cur.find((g) => g.key === "same currency");
  // Premium the foreign-currency charges paid over the same-currency rate.
  const currencyPremium = foreign && same && same.rate > 0 ? Math.max(0, (foreign.rate - same.rate) * foreign.gross) : 0;

  const monthList = [...months.values()].sort((a, b) => a.key.localeCompare(b.key))
    .map((m) => ({ ...m, rate: m.gross > 0 ? m.chargeFees / m.gross : 0 }));

  const summary = {
    firstMonth: monthList[0]?.key ?? "", lastMonth: monthList[monthList.length - 1]?.key ?? "",
    rowCount: rows.length, buckets, gross, chargeCount: c.count, chargeFees: c.fees,
    avgOrder: c.count ? gross / c.count : 0,
    effectiveRate, perCharge: c.count ? c.fees / c.count : 0,
    totalFees, allInRate: gross > 0 ? totalFees / gross : 0, operatingNet,
    payouts: Math.abs(buckets.payout.net), payoutCount: buckets.payout.count,
    refundAmount, refundRate: gross > 0 ? refundAmount / gross : 0,
    refundCost, refundCostMatched, refundCostEstimated, refundsMatched, refundsUnmatched,
    disputeCount, disputeFees, disputeNet, disputesWon: buckets.dispute_won.count,
    disputeRate: c.count ? disputeCount / c.count : 0,
    currencyPremium, foreignCount: foreign?.count ?? 0, foreignGross: foreign?.gross ?? 0,
    foreignShare: gross > 0 ? (foreign?.gross ?? 0) / gross : 0,
  };
  const knownOrigin = origin.filter((g) => g.key !== "unknown");
  const intl = origin.find((g) => g.key === "international"), dom = origin.find((g) => g.key === "domestic");
  const knownGross = knownOrigin.reduce((a, g) => a + g.gross, 0);
  summary.intl = intl && dom && knownGross > 0
    ? { share: intl.gross / knownGross, intlRate: intl.rate, domRate: dom.rate, knownGross, intlGross: intl.gross }
    : null;

  const groups = { brand: finishGroups(byBrand), source: finishGroups(bySource), method: finishGroups(byMethod), origin, currency: cur };
  return { summary, groups, months: monthList, findings: findings(summary, groups, monthList) };
}

// What-if 1: fees if every charge had cost pct% + cents instead. Editable,
// not a statement of any plan's real rates.
export function whatIfPlan(s, pct, cents) {
  if (!s || !(s.chargeCount > 0)) return null;
  const fees = s.gross * (pct / 100) + s.chargeCount * (cents / 100);
  return { fees, rate: s.gross > 0 ? fees / s.gross : 0, saved: s.chargeFees - fees };
}

// What-if 2: move charge volume from international to domestic (or the
// reverse) at the rates each paid in this file, to a target international
// share of the volume whose origin is known.
export function whatIfIntl(s, targetPct) {
  const i = s?.intl;
  if (!i) return null;
  const target = Math.min(1, Math.max(0, targetPct / 100));
  const moved = (i.share - target) * i.knownGross;
  return { moved, saved: moved * (i.intlRate - i.domRate), currentShare: i.share };
}

const $ = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const P = (x, d = 1) => (x * 100).toFixed(d) + "%";

function findings(s, g, months) {
  const out = [];
  const add = (severity, title, detail) => out.push({ severity, title, detail });

  if (s.gross > 0) {
    add("info", `Shopify Payments kept ${P(s.effectiveRate, 2)} of card sales (${$(s.chargeFees)} on ${$(s.gross)})`,
      `${s.chargeCount} charges, an average of ${$(s.avgOrder)} each, cost ${(s.perCharge).toFixed(2)} per charge in fees. Counting refunds, disputes, reserves and adjustments as well, fees of every kind come to ${$(s.totalFees)} (${P(s.allInRate, 2)} of card sales). Payouts are money already counted and are left out.`);
  }
  if (s.avgOrder > 0 && s.avgOrder < 30) {
    add("info", `Small orders pay more: the per-charge fee is a larger share`,
      `At an average of ${$(s.avgOrder)} a fixed per-transaction fee is a big part of the rate. Raising the average order (bundles, a free-shipping threshold) lowers the rate without any change of plan.`);
  }

  const i = s.intl;
  if (i && i.share > 0.05 && i.intlRate - i.domRate > 0.003) {
    add(i.share > 0.2 ? "high" : "medium", `International cards are ${P(i.share, 0)} of volume and cost ${P(i.intlRate - i.domRate, 1)} more`,
      `${P(i.intlRate, 2)} against ${P(i.domRate, 2)} for domestic cards. That premium on ${$(i.intlGross)} of international sales is about ${$((i.intlRate - i.domRate) * i.intlGross)}. Use the what-if below to see what a lower international share would save.`);
  }

  const amex = g.brand.find((x) => /amex|american express/.test(x.key));
  const nonAmex = g.brand.filter((x) => !/amex|american express/.test(x.key) && x.gross > 0);
  if (amex && amex.count >= 5 && nonAmex.length) {
    const ng = nonAmex.reduce((a, x) => a + x.gross, 0), nf = nonAmex.reduce((a, x) => a + x.fees, 0);
    if (ng > 0 && amex.rate - nf / ng > 0.002) {
      add("medium", `American Express costs ${P(amex.rate - nf / ng, 1)} more than other brands`,
        `${P(amex.rate, 2)} on ${amex.count} charges against ${P(nf / ng, 2)} for the rest. Worth knowing before you promote it at checkout; it is rarely worth refusing.`);
    }
  }

  if (s.foreignCount > 0 && s.currencyPremium > 0) {
    add(s.currencyPremium > s.chargeFees * 0.03 ? "medium" : "info", `Foreign-currency checkouts paid about ${$(s.currencyPremium)} extra`,
      `${s.foreignCount} charges (${P(s.foreignShare, 0)} of volume) were presented in a currency different from the shop's. Their rate ran above same-currency charges by this much in this file, which is the visible cost of currency conversion. Compare with pricing in your main markets' own currencies or a plan whose conversion rate suits your mix.`);
  }

  if (s.refundAmount > 0) {
    add(s.refundRate > 0.08 ? "high" : "medium", `Refunds of ${$(s.refundAmount)} (${P(s.refundRate)} of sales) cost ${$(s.refundCost)} in fees you did not get back`,
      `A refund returns the sale, but the processing fee is normally not returned, so each refund costs the fee on top of the lost margin. ${s.refundsMatched} refund${s.refundsMatched === 1 ? "" : "s"} matched to a charge in this file by order number${s.refundsUnmatched ? `; ${s.refundsUnmatched} could not be matched (charge outside the file) and are estimated at the overall rate` : ""}. Exchanges and store credit avoid the fee loss.`);
  }

  if (s.disputeCount > 0) {
    add(s.disputeRate > 0.0075 ? "high" : "medium", `${s.disputeCount} dispute${s.disputeCount === 1 ? "" : "s"} (${P(s.disputeRate, 2)} of charges), ${$(s.disputeFees)} in dispute fees`,
      `After ${s.disputesWon} won, disputes cost ${$(-s.disputeNet)} net including the fees. Card networks watch dispute rates and commonly start to worry from about 0.75% to 1% of transactions, though thresholds vary by network and programme; check current rules with your acquirer. Clear billing descriptors, fast tracking and answering every dispute with evidence are the usual levers.`);
  }
  if (s.buckets.reserve.count > 0) {
    add("info", `${s.buckets.reserve.count} reserve row${s.buckets.reserve.count === 1 ? "" : "s"} (${$(s.buckets.reserve.net)} net)`,
      "A reserve holds part of your money back and releases it later. It is not a fee; it is listed so the totals reconcile.");
  }
  if (s.buckets.adjustment.count > 0) {
    add("info", `${s.buckets.adjustment.count} adjustment${s.buckets.adjustment.count === 1 ? "" : "s"} (${$(s.buckets.adjustment.net)} net)`,
      "Manual corrections from Shopify or the card networks. Open the rows in your admin to see the reason for each.");
  }
  if (s.buckets.other.count > 0) {
    add("medium", `${s.buckets.other.count} row${s.buckets.other.count === 1 ? "" : "s"} of an unrecognised type`,
      "They are counted in the “other” line rather than dropped, so the totals still reconcile. If they are large, the export layout may have changed.");
  }

  if (months.length >= 4) {
    const rate = (m) => (m.gross > 0 ? m.chargeFees / m.gross : null);
    const first = months.slice(0, 2).map(rate).filter((x) => x !== null);
    const last = months.slice(-2).map(rate).filter((x) => x !== null);
    if (first.length && last.length) {
      const a = first.reduce((x, y) => x + y) / first.length, b = last.reduce((x, y) => x + y) / last.length;
      if (Math.abs(b - a) > 0.004) add("medium", `The effective rate ${b > a ? "rose" : "fell"} from ${P(a, 2)} to ${P(b, 2)}`,
        `First two months against last two. A drift like this usually means a change in international share, card mix or order size rather than a change of Shopify's price.`);
    }
  }
  const order = { high: 0, medium: 1, info: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}

// Deterministic synthetic store (US, USD): four months of charges across card
// brands and origins, some foreign-currency checkouts, refunds, disputes, an
// adjustment, a reserve and weekly payouts. Returns the CSV text.
export function sampleData() {
  const head = "Transaction Date,Type,Order,Card Brand,Card Source,Payout Status,Payout Date,Payout ID,Available On,Amount,Fee,Net,Checkout,Payment Method Name,Presentment Amount,Presentment Currency,Currency,Vat,Business Entity";
  const out = [head];
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const m = (n) => n.toFixed(2);
  const kinds = [
    { brand: "visa", source: "domestic", method: "visa", share: 30, intl: false },
    { brand: "mastercard", source: "domestic", method: "mastercard", share: 18, intl: false },
    { brand: "american_express", source: "domestic", method: "american_express", share: 6, intl: false },
    { brand: "visa", source: "apple_pay", method: "apple_pay", share: 10, intl: false },
    { brand: "mastercard", source: "google_pay", method: "google_pay", share: 6, intl: false },
    { brand: "visa", source: "international", method: "visa", share: 14, intl: true, cur: "CAD", rate: 1.36 },
    { brand: "mastercard", source: "international", method: "mastercard", share: 8, intl: true, cur: "GBP", rate: 0.79 },
    { brand: "visa", source: "international", method: "visa", share: 8, intl: true, cur: "EUR", rate: 0.92 },
  ];
  const wheel = kinds.flatMap((k) => Array(k.share).fill(k));
  const months = ["2026-06", "2026-07", "2026-08", "2026-09"];
  let n = 0, payoutId = 7000;
  const rows = [];
  months.forEach((mo, mi) => {
    const count = 60 + mi * 8;
    for (let i = 0; i < count; i++) {
      n++;
      const k = wheel[(n * 37) % wheel.length];
      const day = String(1 + ((i * 7 + mi * 3) % 27)).padStart(2, "0");
      const stamp = `${mo}-${day} ${String(8 + (n % 12)).padStart(2, "0")}:${String((n * 7) % 60).padStart(2, "0")}:00 -0400`;
      const amount = round2(18 + ((n * 53) % 140) + ((n * 17) % 100) / 100);
      let pct = 0.029, fixed = 0.3;
      if (k.brand === "american_express") pct = 0.035;
      if (k.intl) pct += 0.01;
      const foreign = Boolean(k.cur);
      if (foreign) pct += 0.015;
      const fee = round2(amount * pct + fixed);
      const order = `#${1000 + n}`;
      const pres = foreign ? m(amount * k.rate) : m(amount);
      rows.push({ stamp, cols: [q(stamp), "charge", order, k.brand, k.source, "paid", "", "", "", m(amount), m(fee), m(amount - fee), "", k.method, pres, foreign ? k.cur : "USD", "USD", "0.00", ""] });
      // Refunds: about 1 in 14 orders. Fee on the refund row is 0 (not returned).
      if (n % 14 === 5) {
        const part = n % 28 === 5 ? amount : round2(amount / 2);
        rows.push({ stamp, cols: [q(stamp), "refund", order, k.brand, k.source, "paid", "", "", "", m(-part), "0.00", m(-part), "", k.method, m(-part), "USD", "USD", "0.00", ""] });
      }
      // Disputes: about 1 in 90 orders, fee 15; a few are won.
      if (n % 90 === 41) {
        rows.push({ stamp, cols: [q(stamp), "dispute", order, k.brand, k.source, "paid", "", "", "", m(-amount), "15.00", m(-amount - 15), "", k.method, m(-amount), "USD", "USD", "0.00", ""] });
        if (n % 180 === 41) rows.push({ stamp, cols: [q(stamp), "dispute_reversal", order, k.brand, k.source, "paid", "", "", "", m(amount), "-15.00", m(amount + 15), "", k.method, m(amount), "USD", "USD", "0.00", ""] });
      }
    }
    if (mi === 1) rows.push({ stamp: `${mo}-12 09:00:00 -0400`, cols: [q(`${mo}-12 09:00:00 -0400`), "adjustment", "", "", "", "paid", "", "", "", "-6.50", "0.00", "-6.50", "", "", "", "", "USD", "0.00", ""] });
    if (mi === 2) {
      rows.push({ stamp: `${mo}-03 09:00:00 -0400`, cols: [q(`${mo}-03 09:00:00 -0400`), "reserve", "", "", "", "paid", "", "", "", "-250.00", "0.00", "-250.00", "", "", "", "", "USD", "0.00", ""] });
      rows.push({ stamp: `${mo}-28 09:00:00 -0400`, cols: [q(`${mo}-28 09:00:00 -0400`), "reserve", "", "", "", "paid", "", "", "", "250.00", "0.00", "250.00", "", "", "", "", "USD", "0.00", ""] });
    }
    for (const d of ["07", "14", "21", "28"]) {
      payoutId++;
      const s = `${mo}-${d} 06:00:00 -0400`;
      rows.push({ stamp: s, cols: [q(s), "payout", "", "", "", "paid", `${mo}-${d}`, String(payoutId), "", "-1500.00", "0.00", "-1500.00", "", "", "", "", "USD", "0.00", ""] });
    }
  });
  rows.sort((a, b) => a.stamp.localeCompare(b.stamp));
  for (const r of rows) out.push(r.cols.join(","));
  return out.join("\n");
}

export const money = $;
export const pct = P;
