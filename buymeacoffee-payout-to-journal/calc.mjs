// Buy Me a Coffee earnings export -> accounting journal.
//
// Buy Me a Coffee pays creators through PayPal or Stripe, so the money that lands is net of processing
// fees (and Buy Me a Coffee's cut on memberships, shop sales and commissions on the free plan) and mixes
// tips, memberships, shop orders and commissions. Bookkeepers need those split out, and a month end
// respected. This module reads the Buy Me a Coffee transactions CSV (Buy Me a Coffee > Dashboard > Transactions >
// Download CSV: DateTime, From, Item, Received, Given, Currency, TransactionType, ...), books each
// transaction to an income account by its TransactionType, derives the fee as Given - Received,
// proves the rows add up to the deposit you type in from PayPal or your bank, proves the rows add up to the payout, and writes balanced journals for Xero,
// QuickBooks Online, QuickBooks Desktop (IIF) and a plain CSV.
//
// The export's column names and each importer's column layout are from memory of public Buy Me a Coffee
// and accounting help documents; no real Buy Me a Coffee export and no live Xero or QuickBooks import was
// available when this was written. Column names are matched by several aliases, a sale whose
// parts do not add to its net is flagged, and a row no rule explains is never dropped: it lands in an
// "uncategorised" line and is reported, so the journal still equals the net.
//
// Everything is integer cents. Nothing here touches the network or the DOM.

export const CATEGORIES = {
  donations: { label: "Buy Me a Coffee donations and tips (gross)", account: "Buy Me a Coffee Donation Income" },
  memberships: { label: "Buy Me a Coffee memberships (gross)", account: "Buy Me a Coffee Membership Income" },
  shop: { label: "Buy Me a Coffee shop orders (gross)", account: "Buy Me a Coffee Shop Income" },
  commissions: { label: "Buy Me a Coffee commissions (gross)", account: "Buy Me a Coffee Commission Income" },
  shipping: { label: "Shipping charged to buyers", account: "Buy Me a Coffee Shipping Income" },
  tax: { label: "Sales tax / VAT you collected (liability)", account: "Buy Me a Coffee Sales Tax Payable" },
  refunds: { label: "Refunds", account: "Buy Me a Coffee Refunds" },
  fees: { label: "Buy Me a Coffee and payment processing fees", account: "Buy Me a Coffee Fees" },
  uncategorised: { label: "Uncategorised Buy Me a Coffee items", account: "Buy Me a Coffee Uncategorised" },
  clearing: { label: "Buy Me a Coffee clearing (matches the payout deposit)", account: "Buy Me a Coffee Clearing" },
};
export const CATEGORY_ORDER = Object.keys(CATEGORIES);

export const defaultMapping = () => Object.fromEntries(CATEGORY_ORDER.map((k) => [k, CATEGORIES[k].account]));

// One "key = Account name" per line; blank lines and # comments are ignored.
export function parseMapping(text) {
  const out = defaultMapping(), errors = [];
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const m = line.match(/^([a-z]+)\s*[=:]\s*(.+)$/i);
    if (!m) { errors.push(`Line ${i + 1}: expected "category = account", got "${line}"`); return; }
    const key = m[1].toLowerCase();
    if (!CATEGORIES[key]) { errors.push(`Line ${i + 1}: unknown category "${m[1]}" (use ${CATEGORY_ORDER.join(", ")})`); return; }
    out[key] = m[2].trim();
  });
  return { mapping: out, errors };
}
export const mappingText = (mapping = defaultMapping()) => CATEGORY_ORDER.map((k) => `${k} = ${mapping[k]}`).join("\n");

const dollars = (c) => (c < 0 ? "-" : "") + (Math.abs(c) / 100).toFixed(2);
export const money = (c, cur = "USD") => (c < 0 ? "-" : "") + Math.abs(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + cur;

// ---- parsing ----------------------------------------------------------------

function splitLine(line, d) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === d) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const norm = (h) => h.trim().toLowerCase().replace(/^﻿/, "").replace(/[\s_]+/g, "-").replace(/\(.*\)$/, "").replace(/-+$/, "");

export function parseAmount(s) {
  const t = String(s ?? "").trim().replace(/\s/g, "");
  if (t === "") return null;
  let u = t;
  if (/^-?\d{1,3}(\.\d{3})+,\d{1,2}$/.test(t)) u = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d+,\d{1,2}$/.test(t)) u = t.replace(",", ".");
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) u = t.replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(u)) return NaN;
  return Math.round(parseFloat(u) * 100);
}

// Returns YYYY-MM-DD or null. Accepts ISO (with a time), DD.MM.YYYY, and slashed dates read per `order`.
export function parseDate(s, order = "mdy") {
  const t = String(s ?? "").trim();
  if (!t) return null;
  let y, m, d, x;
  if ((x = t.match(/^(\d{4})-(\d{2})-(\d{2})/))) [y, m, d] = [x[1], x[2], x[3]];
  else if ((x = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/))) [d, m, y] = [x[1], x[2], x[3]];
  else if ((x = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) { if (order === "dmy") [d, m, y] = [x[1], x[2], x[3]]; else [m, d, y] = [x[1], x[2], x[3]]; }
  else return null;
  const dt = new Date(Date.UTC(+y, +m - 1, +d));
  if (dt.getUTCFullYear() !== +y || dt.getUTCMonth() !== +m - 1 || dt.getUTCDate() !== +d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Buy Me a Coffee TransactionType values: Donation, Subscription, Shop Order, Commission (matched loosely).
export function incomeCategory(type) {
  const t = String(type || "").toLowerCase();
  if (/donat|tip|coffee|support/.test(t)) return "donations";
  if (/subscr|member/.test(t)) return "memberships";
  if (/shop|order|product|digital|physical|extra|merch/.test(t)) return "shop";
  if (/commission/.test(t)) return "commissions";
  return t ? "uncategorised" : "donations"; // a blank type is a plain tip; an unknown one is reviewed
}

const UNPAID = "(no payout ID)";
const ALL = "all rows";
const TRUE = /^(true|yes|y|1|refunded)$/i;

// Rows are grouped by payout id when the export has one; otherwise the whole file is one group and
// the deposit is supplied by the caller (opts.expected, from the bank / PayPal / Buy Me a Coffee payouts page).
// An optional `type` column containing "payout" states the deposit.
export function parsePayouts(text, opts = {}) {
  const findings = [];
  const add = (severity, title, detail, line) => findings.push({ severity, title, detail, line: line || 0 });
  const lines = String(text || "").replace(/^﻿/, "").split(/\r?\n/);
  const first = lines.findIndex((l) => l.trim());
  const none = { payouts: [], findings, summary: { rows: 0, payouts: 0 } };
  if (first < 0) { add("error", "The file is empty", "Paste or choose a Buy Me a Coffee earnings CSV."); return none; }
  const d = (lines[first].match(/\t/g) || []).length > (lines[first].match(/,/g) || []).length ? "\t" : ",";
  const head = splitLine(lines[first], d).map(norm);
  const col = (...names) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; };
  const I = {
    payout: col("payout-id", "payout", "payout-reference"),
    effective: col("payout-date", "paid-out-on", "payout-created-at"),
    id: col("transactionid", "transaction-id", "charge-id", "sale-id", "purchase-id", "order-id", "id"),
    created: col("datetime", "date-time", "charge-date", "date", "purchase-date", "sale-date", "created-at", "created"),
    currency: col("currency", "price-currency"),
    price: col("given", "pledge-amount", "pledge", "price", "amount", "gross", "charge-amount"),
    shipping: col("shipping", "shipping-price"),
    tax: col("salestax", "taxes", "tax", "sales-tax", "vat"),
    fee: col("fees", "fee", "bmc-fees", "bmc-fee", "total-fees"),
    platformFee: col("platform-fee", "platform-fees", "bmc-platform-fee"),
    processingFee: col("processing-fee", "payment-processing-fee", "processing-fees"),
    net: col("received", "net-total", "net", "net-earnings", "seller-revenue", "you-receive"),
    refunded: col("refunded", "is-refunded", "refunded?", "refund"),
    refundAmt: col("refunded-amount", "amount-refunded"),
    item: col("item", "tier", "reward-tier", "item-name", "product-name", "product", "item", "patron"),
    type: col("transactiontype", "type", "transaction-type"),
  };
  const missing = [];
  if (I.net < 0) missing.push("amount received");
  if (I.price < 0) missing.push("amount given");
  if (missing.length) {
    add("error", "This does not look like a Buy Me a Coffee transactions export", `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. In Buy Me a Coffee open Dashboard > Transactions (or Settings > Data export) and choose Download CSV, then paste the whole file here.`, first + 1);
    return none;
  }
  const get = (cells, k) => (I[k] >= 0 ? (cells[I[k]] ?? "").trim() : "");
  const byId = new Map();
  const bucket = (id) => { if (!byId.has(id)) byId.set(id, { id, effective: null, stated: null, currency: "", rows: [] }); return byId.get(id); };
  let rows = 0;
  for (let i = first + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = splitLine(lines[i], d);
    const rid = get(cells, "id") || `line ${i + 1}`;
    const pid = I.payout >= 0 ? get(cells, "payout") || UNPAID : ALL;
    const s = bucket(pid);
    const eff = parseDate(get(cells, "effective"), opts.dateOrder);
    if (eff && !s.effective) s.effective = eff;
    const netS = get(cells, "net"), net = parseAmount(netS);
    if (/^payout/i.test(get(cells, "type"))) { if (net !== null && !Number.isNaN(net)) s.stated = (s.stated || 0) + Math.abs(net); continue; } // the deposit itself
    if (net === null) { add("warning", "Row has no net total", `${rid} was skipped.`, i + 1); continue; }
    const amts = {};
    let bad = Number.isNaN(net);
    for (const k of ["price", "shipping", "tax", "fee", "platformFee", "processingFee", "refundAmt"]) { const v = parseAmount(get(cells, k)); if (Number.isNaN(v)) bad = true; amts[k] = v == null ? 0 : v; }
    if (bad) { add("error", `An amount on ${rid} is not a number`, "The row is left out, so its payout will not add up.", i + 1); continue; }
    const cur = get(cells, "currency").toUpperCase();
    if (cur && s.currency && cur !== s.currency) add("warning", `Mixed currencies in ${pid === ALL ? "the export" : `payout ${pid}`}`, `${cur} row among ${s.currency} rows. Journals assume one currency per payout.`, i + 1);
    if (cur && !s.currency) s.currency = cur;
    const refunded = TRUE.test(get(cells, "refunded")) || amts.refundAmt > 0;
    // Buy Me a Coffee fee columns are usually positive numbers meaning a cost; a negative one is read as a cost too.
    // Buy Me a Coffee reports a platform fee and a processing fee as separate columns; both are summed (a combined fee column wins when present).
    // Buy Me a Coffee's export has no fee column: the fee is what the supporter gave minus what you received.
    const derived = I.fee < 0 && I.platformFee < 0 && I.processingFee < 0;
    const fee = derived ? amts.price + amts.shipping - net : I.fee >= 0 ? Math.abs(amts.fee) : Math.abs(amts.platformFee) + Math.abs(amts.processingFee);
    if (derived && fee < 0) add("warning", `${rid}: received is more than given`, "The fee came out negative, so the extra is booked as a negative fee. Check the Received and Given columns were not swapped.", i + 1);
    const incomeKey = incomeCategory(get(cells, "type"));
    const parts = [];
    const push = (k, amt) => { if (amt) parts.push({ k, amt }); };
    push(incomeKey, amts.price);
    push("shipping", amts.shipping);
    // Tax is the buyer's, so it only belongs in the payout when the row's own arithmetic says Buy Me a Coffee paid it out.
    const taxInNet = amts.tax !== 0 && amts.price + amts.shipping + amts.tax - fee === net + (refunded ? (amts.refundAmt || amts.price + amts.shipping + amts.tax) : 0);
    if (taxInNet) push("tax", amts.tax);
    push("fees", -fee);
    if (refunded) push("refunds", -(amts.refundAmt || amts.price + amts.shipping + (taxInNet ? amts.tax : 0)));
    let residual = net - parts.reduce((a, p) => a + p.amt, 0);
    if (residual !== 0) {
      if (refunded) { push("fees", residual); add("info", `${rid}: refunded sale's fee adjusted by ${money(residual)}`, "The net total on a refunded sale differs from price minus fee minus refund; the difference is booked to fees (Buy Me a Coffee returning or keeping its fee).", i + 1); }
      else { push("uncategorised", residual); add("error", `Parts do not add up to the net total on ${rid}`, `Price ${money(amts.price)} + shipping ${money(amts.shipping)} - fee ${money(fee)} = ${money(amts.price + amts.shipping - fee)}, but the row says ${money(net)}. The ${money(residual)} difference is journalled to "uncategorised"; check the file was not edited.`, i + 1); }
    }
    s.rows.push({ line: i + 1, id: rid, item: get(cells, "item"), gross: amts.price, fee, net, refunded, parts, created: parseDate(get(cells, "created"), opts.dateOrder) });
    rows++;
  }
  const payouts = [...byId.values()].filter((s) => s.rows.length || s.stated !== null);
  if (!payouts.length) add("error", "No sales rows found", "The header was read but there were no data rows.");
  if (opts.expected != null && Number.isFinite(opts.expected)) {
    const real = payouts.filter((s) => s.id !== UNPAID);
    if (real.length === 1 && real[0].stated === null) real[0].stated = opts.expected;
    else if (real.length !== 1) add("info", "Expected deposit ignored", "It can only be applied when the file holds exactly one payout (or no payout column) without a deposit row of its own.");
  }
  return { payouts, findings, summary: { rows, payouts: payouts.length } };
}

// ---- journals ----------------------------------------------------------------

const lastDay = (ym) => { const [y, m] = ym.split("-").map(Number); return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`; };

// split: "month" (default) writes one journal per calendar month a payout touches.
export function buildJournals(payouts, opts = {}) {
  const mapping = opts.mapping || defaultMapping();
  const split = opts.split || "month";
  const findings = [];
  const journals = [];
  for (const s of payouts) {
    const sum = s.rows.reduce((a, r) => a + r.net, 0);
    const cur = s.currency || "USD";
    const endDate = s.effective || [...s.rows].map((r) => r.created).filter(Boolean).sort().pop() || null;
    if (s.id === UNPAID) findings.push({ severity: "warning", title: `${s.rows.length} row${s.rows.length === 1 ? "" : "s"} have no payout ID`, detail: "They have no payout ID in the report. They are journalled to Buy Me a Coffee clearing as a separate group and will not match a bank deposit yet.", line: 0 });
    else if (s.stated === null) findings.push({ severity: "warning", title: `${s.id === ALL ? "The export" : `Payout ${s.id}`} has no payout row and no expected deposit`, detail: `The rows add up to ${money(sum, cur)}. Enter the deposit from your bank, PayPal or Buy Me a Coffee payout in the box above to check it.`, line: 0 });
    else if (s.stated !== sum) findings.push({ severity: "error", title: `Payout ${s.id}: rows add up to ${money(sum, cur)} but the payout is ${money(s.stated, cur)}`, detail: `Off by ${money(s.stated - sum, cur)}. Rows are missing from the paste, or an amount was skipped. Do not post this journal until the figures agree.`, line: 0 });
    const periods = new Map();
    let undated = 0;
    for (const r of s.rows) {
      let ym = r.created ? r.created.slice(0, 7) : (endDate || "").slice(0, 7);
      if (!r.created) undated++;
      if (split === "none") ym = (endDate || ym || "").slice(0, 7);
      if (!ym) ym = "undated";
      if (!periods.has(ym)) periods.set(ym, new Map());
      const m = periods.get(ym);
      const add = (k, amt) => { if (!amt) return; const e = m.get(k) || { net: 0, count: 0 }; e.net += amt; e.count++; m.set(k, e); };
      for (const p of r.parts) add(p.k, p.amt);
    }
    if (undated) findings.push({ severity: "warning", title: `${undated} row${undated === 1 ? "" : "s"} in payout ${s.id} had no created date`, detail: "They were placed in the payout's final month.", line: 0 });
    const keys = [...periods.keys()].sort();
    if (keys.length > 1) findings.push({ severity: "info", title: `Payout ${s.id} spans ${keys.length} months`, detail: `Written as ${keys.length} journals (${keys.join(", ")}), each balanced to Buy Me a Coffee clearing, so every month's revenue and fees land in the month they happened. The bank deposit of ${s.stated === null ? "the full amount" : money(s.stated, cur)} then clears both.`, line: 0 });
    keys.forEach((ym, idx) => {
      const m = periods.get(ym), last = idx === keys.length - 1;
      const date = ym === "undated" ? (endDate || "") : last && endDate && endDate.slice(0, 7) === ym ? endDate : lastDay(ym);
      const lines = [];
      for (const k of CATEGORY_ORDER) {
        if (k === "clearing" || !m.has(k)) continue;
        const { net, count } = m.get(k);
        if (net === 0) continue;
        lines.push({ category: k, account: mapping[k], debit: net < 0 ? -net : 0, credit: net > 0 ? net : 0, memo: `${CATEGORIES[k].label} (${count} row${count === 1 ? "" : "s"})` });
      }
      const net = lines.reduce((a, l) => a + l.credit - l.debit, 0);
      if (net !== 0 || !lines.length) lines.push({ category: "clearing", account: mapping.clearing, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0, memo: `Payout ${s.id}${keys.length > 1 ? ` (${ym})` : ""}` });
      journals.push({ payoutId: s.id, period: ym, date, deposit: s.effective, currency: cur, narration: `Buy Me a Coffee payout ${s.id}${keys.length > 1 ? ` ${ym}` : ""}`, lines, clearing: net });
    });
    const unknown = s.rows.filter((r) => r.parts.some((p) => p.k === "uncategorised"));
    if (unknown.length) findings.push({ severity: "warning", title: `Payout ${s.id} has ${unknown.length} item${unknown.length === 1 ? "" : "s"} no rule recognised`, detail: `${[...new Set(unknown.map((r) => r.item || r.id))].slice(0, 5).join(", ")}. They are journalled to "${mapping.uncategorised}" so the journal still equals the net. Review them and reclassify by hand if needed.`, line: unknown[0].line });
  }
  return { journals, findings };
}

export function uncategorisedRows(payouts) {
  return payouts.flatMap((s) => s.rows.filter((r) => r.parts.some((p) => p.k === "uncategorised")).map((r) => ({ payout: s.id, ...r })));
}

export function reconciliation(payouts, journals) {
  return payouts.map((s) => {
    const js = journals.filter((j) => j.payoutId === s.id);
    const sum = js.reduce((a, j) => a + j.clearing, 0);
    return { id: s.id, deposit: s.effective, currency: s.currency || "USD", stated: s.id === UNPAID ? null : s.stated, journalled: sum, periods: js.map((j) => ({ period: j.period, date: j.date, clearing: j.clearing })), agrees: s.id === UNPAID || s.stated === null ? null : s.stated === sum };
  });
}

export function validate(text, opts = {}) {
  const p = parsePayouts(text, opts);
  const b = buildJournals(p.payouts, opts);
  const findings = [...p.findings, ...b.findings];
  const order = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b2) => order[a.severity] - order[b2.severity]);
  return { payouts: p.payouts, journals: b.journals, findings, reconciliation: reconciliation(p.payouts, b.journals), summary: { ...p.summary, journals: b.journals.length } };
}

// ---- exports -----------------------------------------------------------------

const csvCell = (v) => { const s = String(v ?? ""); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csvRow = (a) => a.map(csvCell).join(",");
const fmtDate = (iso, order) => { if (!iso) return ""; const [y, m, d] = iso.split("-"); return order === "dmy" ? `${d}/${m}/${y}` : order === "mdy" ? `${m}/${d}/${y}` : iso; };
const journalsOf = (journals, id) => journals.filter((j) => j.payoutId === id).length;
const docNo = (journals, j) => `${j.payoutId}${j.period && j.period !== "undated" && journalsOf(journals, j.payoutId) > 1 ? "-" + j.period : ""}`;

// Xero manual journal import: debits positive, credits negative.
export function toXeroJournalCsv(journals, o = {}) {
  const tax = o.taxRate || "Tax Exempt";
  const rows = [csvRow(["*Narration", "*Date", "Description", "*AccountCode", "*TaxRate", "*Amount"])];
  for (const j of journals) for (const l of j.lines) rows.push(csvRow([j.narration, fmtDate(j.date, o.dateOrder || "dmy"), l.memo, l.account, tax, dollars(l.debit - l.credit)]));
  return rows.join("\r\n") + "\r\n";
}

// QuickBooks Online journal entry import.
export function toQboJournalCsv(journals, o = {}) {
  const rows = [csvRow(["*JournalNo", "*JournalDate", "*AccountName", "Debits", "Credits", "Description", "Name", "Currency"])];
  for (const j of journals) for (const l of j.lines) rows.push(csvRow([docNo(journals, j), fmtDate(j.date, o.dateOrder || "mdy"), l.account, l.debit ? dollars(l.debit) : "", l.credit ? dollars(l.credit) : "", l.memo, "", j.currency]));
  return rows.join("\r\n") + "\r\n";
}

// QuickBooks Desktop IIF general journal: positive = debit, a transaction's lines sum to zero.
export function toIif(journals) {
  const t = (s) => String(s ?? "").replace(/[\t\r\n]+/g, " ");
  const out = ["!TRNS\tTRNSID\tTRNSTYPE\tDATE\tACCNT\tAMOUNT\tDOCNUM\tMEMO", "!SPL\tSPLID\tTRNSTYPE\tDATE\tACCNT\tAMOUNT\tDOCNUM\tMEMO", "!ENDTRNS"];
  for (const j of journals) {
    const date = fmtDate(j.date, "mdy"), doc = t(docNo(journals, j));
    j.lines.forEach((l, i) => out.push(`${i === 0 ? "TRNS" : "SPL"}\t\tGENERAL JOURNAL\t${date}\t${t(l.account)}\t${((l.debit - l.credit) / 100).toFixed(2)}\t${doc}\t${t(l.memo)}`));
    out.push("ENDTRNS");
  }
  return out.join("\r\n") + "\r\n";
}

export function journalsCsv(journals) {
  const rows = [csvRow(["payout", "period", "date", "category", "account", "debit", "credit", "memo"])];
  for (const j of journals) for (const l of j.lines) rows.push(csvRow([j.payoutId, j.period, j.date, l.category, l.account, l.debit ? dollars(l.debit) : "", l.credit ? dollars(l.credit) : "", l.memo]));
  return rows.join("\r\n") + "\r\n";
}

export function findingsCsv(result) {
  return [csvRow(["severity", "line", "title", "detail"]), ...result.findings.map((f) => csvRow([f.severity, f.line || "", f.title, f.detail]))].join("\r\n") + "\r\n";
}

export function decodeBuffer(buf) {
  const u = new Uint8Array(buf);
  if (u[0] === 0xff && u[1] === 0xfe) return new TextDecoder("utf-16le").decode(u);
  if (u[0] === 0xfe && u[1] === 0xff) return new TextDecoder("utf-16be").decode(u);
  return new TextDecoder("utf-8").decode(u);
}

// ---- samples -----------------------------------------------------------------

const HEAD = ["DateTime (UTC)", "From", "Message", "Item", "Received", "Given", "Currency", "TransactionType", "TransactionId", "Reference"];

// items: [date, from, item, type, given, received]. A deposit row is added when `withPayoutRow`
// (a real export has none, so the deposit is normally typed in from PayPal, Stripe or the bank).
export function buildReport({ currency = "USD", items, withPayoutRow = false, totalOverride }) {
  const csv = (v) => (/[",]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const out = [HEAD.join(",")];
  let net = 0, n = 0;
  for (const [date, from, item, type, given, received] of items) {
    n++;
    if (typeof received === "number") net += Math.round(received * 100);
    const f = (v) => (typeof v === "number" ? v.toFixed(2) : v);
    out.push([`${date} 12:00:00`, from, "", item, f(received), f(given), currency, type, `T${1000 + n}`, `ref-${n}`].map(csv).join(","));
  }
  if (withPayoutRow) out.push(["", "", "", "", (totalOverride ?? net / 100).toFixed(2), "", currency, "Payout", "", ""].map(csv).join(","));
  return out.join("\n") + "\n";
}

const SAMPLE_ITEMS = [
  ["2026-09-28", "Alex", "Buy Me a Coffee Donation", "Donation", 5.00, 4.85],
  ["2026-09-29", "Sam", "Gold supporter", "Subscription", 10.00, 9.35],
  ["2026-09-30", "Jo", "Sticker pack", "Shop Order", 18.00, 16.75],
  ["2026-10-01", "Kim", "Character portrait", "Commission", 120.00, 112.10],
  ["2026-10-02", "Riley", "Buy Me a Coffee Donation", "Donation", 3.00, 2.90],
  ["2026-10-03", "Sam", "Gold supporter", "Subscription", 10.00, 9.35],
];

const deposit = (items) => items.reduce((a, r) => a + Math.round(r[5] * 100), 0) / 100;
export const sampleReport = () => buildReport({ items: SAMPLE_ITEMS, withPayoutRow: true });
// The same export after a hand edit: a transaction dropped from the paste so the payout no longer agrees,
// one amount that is not a number, one type no rule knows, and one row whose columns look swapped.
export function sampleBrokenReport() {
  const items = SAMPLE_ITEMS.slice(0, -1);
  items.push(["2026-10-04", "Lee", "Mystery item", "Gift Card", 10.00, 9.00]);
  items.push(["2026-10-04", "Max", "Buy Me a Coffee Donation", "Donation", 5.00, "4..5"]);
  items.push(["2026-10-05", "Dee", "Buy Me a Coffee Donation", "Donation", 4.00, 4.50]);
  return buildReport({ items, totalOverride: deposit(SAMPLE_ITEMS), withPayoutRow: true });
}
