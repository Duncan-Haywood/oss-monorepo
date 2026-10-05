// Gumroad Sales CSV -> accounting journal.
//
// Gumroad's sales export has one row per sale with the price, shipping, tax, Gumroad's fee, any
// affiliate commission and the seller's net, plus refund, chargeback and (if present) payout rows.
// Bookkeepers need sales, shipping, tax (a liability, not revenue), Gumroad fees, affiliate
// commissions, refunds and chargebacks booked separately, one journal per calendar month, balanced
// to a Gumroad clearing account, with each payout moved from clearing to the bank. This module reads
// the export, checks every row against its own columns, and writes balanced journals for Xero,
// QuickBooks Online, QuickBooks Desktop (IIF) and plain CSV. It is a bookkeeping converter; the
// sibling gumroad-sales-fee-analyzer is the analysis tool and is not duplicated here.
//
// Column names, row types, signs and importer layouts are from memory of public Gumroad and
// accounting help documents; no real Gumroad export and no live import was available when this was
// written, so columns are matched by alias. Money that no rule explains goes to an uncategorised
// line and is reported, never dropped.
//
// Everything is integer cents. Nothing here touches the network or the DOM.

export const CATEGORIES = {
  sales: { label: "Product sales", account: "Gumroad Sales" },
  shipping: { label: "Shipping charged to buyers", account: "Gumroad Shipping Income" },
  tax: { label: "Sales tax / VAT paid out to you (liability)", account: "Sales Tax Payable" },
  refunds: { label: "Refunds to buyers", account: "Gumroad Refunds" },
  disputes: { label: "Chargebacks and disputes", account: "Gumroad Chargebacks" },
  fees: { label: "Gumroad fees", account: "Gumroad Fees" },
  affiliate: { label: "Affiliate commissions", account: "Gumroad Affiliate Commissions" },
  uncategorised: { label: "Money no rule explains", account: "Gumroad Uncategorised" },
  clearing: { label: "Gumroad clearing (balance held by Gumroad)", account: "Gumroad Clearing" },
  bank: { label: "Payouts received in the bank", account: "Bank Account" },
};
export const CATEGORY_ORDER = Object.keys(CATEGORIES);
const EARNING_ORDER = CATEGORY_ORDER.filter((k) => k !== "clearing" && k !== "bank");

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

const norm = (h) => h.trim().toLowerCase().replace(/^﻿/, "").replace(/["']/g, "").replace(/[\s_/]+/g, "-").replace(/\(.*\)$/, "").replace(/-{2,}/g, "-").replace(/-+$/, "");

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

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
// Gumroad prints amounts as "$25.00", "-$1.63", "25.00" or "--"; strip the symbol and read the rest.
export function parseMoney(s) {
  const t = String(s ?? "").trim();
  if (t === "" || /^-+$/.test(t)) return null;
  const neg = /^\(.*\)$/.test(t) || /^[-−]/.test(t) || /[-−]$/.test(t);
  const core = t.replace(/[^0-9.,]/g, "");
  if (!core) return NaN;
  const v = parseAmount(core);
  return v === null || Number.isNaN(v) ? NaN : neg ? -Math.abs(v) : v;
}
// ISO, "Sep 2, 2026", "2 Sep 2026" or numeric dates; return YYYY-MM-DD or null.
export function parseSaleDate(s, order = "mdy") {
  const t = String(s ?? "").trim();
  let x;
  if ((x = t.match(/^([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})/))) { const m = MONTHS[x[1].toLowerCase()]; return m ? parseDate(`${x[3]}-${String(m).padStart(2, "0")}-${String(x[2]).padStart(2, "0")}`) : null; }
  if ((x = t.match(/^(\d{1,2}) ([A-Za-z]{3})[a-z]*\.?,? (\d{4})/))) { const m = MONTHS[x[2].toLowerCase()]; return m ? parseDate(`${x[3]}-${String(m).padStart(2, "0")}-${String(x[1]).padStart(2, "0")}`) : null; }
  return parseDate(t, order);
}

// Aliases are matched in order against normalised header names (lower case, hyphenated).
const COLUMNS = {
  date: ["sale-time", "sale-date", "purchase-date", "date", "created-at", "transaction-date", "order-date"],
  id: ["sale-id", "purchase-id", "order-id", "order-number", "transaction-id", "id"],
  product: ["product-name", "item-name", "product", "item", "title"],
  gross: ["price", "item-price", "sale-price", "amount", "gross", "gross-amount", "product-price"],
  shipping: ["shipping", "shipping-amount", "shipping-fee"],
  tax: ["sales-tax", "tax", "vat", "vat-amount", "taxes", "tax-amount", "gumroad-tax"],
  fee: ["gumroad-fee", "fee", "fees", "service-fee", "gumroad-fees", "processing-fee"],
  affiliate: ["affiliate-fee", "affiliate-commission", "affiliate-amount", "affiliate"],
  net: ["net-total", "net", "your-earnings", "earnings", "net-amount", "net-earnings", "payout-amount"],
  type: ["type", "transaction-type", "activity", "event"],
  status: ["status", "payment-status"],
  refunded: ["refunded", "is-refunded"],
  disputed: ["chargedback", "chargebacked", "disputed", "is-chargedback", "chargeback"],
  currency: ["currency"],
  payoutId: ["payout-id", "payout", "payout-reference"],
  payoutDate: ["payout-date"],
};
const truthy = (s) => /^(true|yes|y|1|refunded|chargedback|disputed)$/i.test(String(s || "").trim());
const RE_PAYOUT = /payout|withdraw|transfer|deposit/i;
const RE_REFUND = /refund|reversal/i;
const RE_DISPUTE = /chargeback|dispute|charged back/i;
const RE_SKIP = /fail|declin|cancel|void|pending|incomplete|unpaid/i;

// Rows are grouped by calendar month. The month's earnings can be checked against a figure the
// caller types in via opts.expected (only when the file holds exactly one month). `opts.taxInNet`
// says whether tax is included in the net when the file has no Net column to decide it per row.
export function parsePayouts(text, opts = {}) {
  const findings = [];
  const add = (severity, title, detail, line) => findings.push({ severity, title, detail, line: line || 0 });
  const lines = String(text || "").replace(/^﻿/, "").split(/\r?\n/);
  const none = { payouts: [], deposits: [], findings, summary: { rows: 0, payouts: 0 } };
  if (!lines.some((l) => l.trim())) { add("error", "The file is empty", "Paste or choose a Gumroad sales CSV."); return none; }
  let first = -1, d = ",", head = [];
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    if (!lines[i].trim()) continue;
    const dd = (lines[i].match(/\t/g) || []).length > (lines[i].match(/,/g) || []).length ? "\t" : ",";
    const h = splitLine(lines[i], dd).map(norm);
    const has = (k) => COLUMNS[k].some((n) => h.includes(n));
    if (has("date") && (has("gross") || has("net")) && (has("fee") || has("net") || has("type"))) { first = i; d = dd; head = h; break; }
  }
  if (first < 0) {
    add("error", "This does not look like a Gumroad sales export", "No header row with a date, a price or amount, and a fee, net or type column was found. In Gumroad open Analytics (or Sales) and download the sales CSV. A product list or a payout summary page with no per-sale rows cannot be used.", 1);
    return none;
  }
  const I = {};
  for (const [k, names] of Object.entries(COLUMNS)) { I[k] = -1; for (const n of names) { const i = head.indexOf(n); if (i >= 0) { I[k] = i; break; } } }
  const get = (cells, k) => (I[k] >= 0 ? (cells[I[k]] ?? "").trim() : "");
  const byId = new Map(), deps = new Map();
  let rows = 0, skipped = 0, taxExcluded = 0;
  const currencies = new Set();
  const dep = (id) => { if (!deps.has(id)) deps.set(id, { id, earnings: 0, rows: 0, payout: 0, payoutRows: 0, first: null, last: null, date: null }); return deps.get(id); };
  const month = (ym) => { if (!byId.has(ym)) byId.set(ym, { id: ym, effective: null, stated: null, currency: "USD", rows: [], payoutRows: [] }); return byId.get(ym); };
  for (let i = first + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = splitLine(lines[i], d);
    const ln = i + 1;
    const raw = get(cells, "date");
    const label = get(cells, "id") || get(cells, "product") || `line ${ln}`;
    if (/^(total|totals|subtotal|grand total)\b/i.test((cells[0] || "").trim())) continue;
    const date = parseSaleDate(raw, opts.dateOrder);
    if (!date) { add("error", `Date "${raw}" not understood`, "The row is left out, so its month will not add up.", ln); continue; }
    const f = {};
    let bad = false;
    for (const k of ["gross", "shipping", "tax", "fee", "affiliate", "net"]) {
      const v = parseMoney(get(cells, k));
      if (Number.isNaN(v)) { add("error", "An amount is not a number", `"${get(cells, k)}" in ${k} on ${label} was left out with its row.`, ln); bad = true; break; }
      f[k] = v;
    }
    if (bad) continue;
    const cur = get(cells, "currency") || "USD";
    currencies.add(cur);
    const typeText = `${get(cells, "type")} ${get(cells, "status")}`.trim();
    const payoutId = get(cells, "payoutId").replace(/^-+$/, "");
    if (RE_SKIP.test(typeText) && !RE_PAYOUT.test(get(cells, "type"))) { skipped++; add("warning", `Row with status "${typeText}" skipped`, `${label} is not a completed sale, so no money moved to you; it is not journalled.`, ln); continue; }
    if (RE_PAYOUT.test(get(cells, "type"))) {
      const amt = f.net ?? f.gross;
      if (amt === null || amt === undefined) { add("warning", "Payout row has no amount", `${label} was skipped.`, ln); continue; }
      if (/fail|return|cancel|declin/i.test(get(cells, "status"))) { skipped++; add("warning", `Payout with status "${get(cells, "status")}" skipped`, `${payoutId || label} did not reach your bank, so it is not journalled and its money stays in clearing.`, ln); continue; }
      const s = month(date.slice(0, 7));
      if (!s.effective || date > s.effective) s.effective = date;
      s.currency = cur;
      s.payoutRows.push({ line: ln, label: payoutId || label, created: date, amount: Math.abs(amt), id: payoutId });
      if (payoutId) { const e = dep(payoutId); e.payout += Math.abs(amt); e.payoutRows++; e.date = date; }
      continue;
    }
    if (f.gross === null && f.net === null) { add("warning", "Row has no amount", `${label} was skipped.`, ln); continue; }
    const parts = {};
    const put = (k, v) => { if (v) parts[k] = (parts[k] || 0) + v; };
    const isRefund = RE_REFUND.test(get(cells, "type")) || RE_REFUND.test(get(cells, "status")) && !truthy(get(cells, "refunded"));
    const isDispute = RE_DISPUTE.test(get(cells, "type")) || RE_DISPUTE.test(get(cells, "status"));
    const gross = Math.abs(f.gross ?? 0), ship = Math.abs(f.shipping ?? 0), tax = Math.abs(f.tax ?? 0), fee = Math.abs(f.fee ?? 0), aff = Math.abs(f.affiliate ?? 0);
    // Whether the tax column is part of the seller's net is decided per row from the Net column when
    // there is one (Gumroad can collect and remit tax itself, in which case it is never paid to you).
    const decideTax = (withoutTax, withTax) => {
      if (tax === 0) return false;
      if (f.net === null) return Boolean(opts.taxInNet);
      return f.net === withTax && f.net !== withoutTax;
    };
    let net;
    if (isRefund || isDispute) {
      const cat = isDispute ? "disputes" : "refunds";
      const inTax = decideTax(-gross - ship, -gross - ship - tax);
      put(cat, -(gross + ship)); if (inTax) put("tax", -tax); else if (tax) taxExcluded -= tax;
      // A reversed sale may return or keep Gumroad's fee; the Net column decides, the rest is uncategorised.
      net = f.net ?? parts[cat] + (parts.tax || 0);
    } else {
      const without = gross + ship - fee - aff, withT = without + tax;
      const inTax = decideTax(without, withT);
      put("sales", gross); put("shipping", ship); put("fees", -fee); put("affiliate", -aff);
      if (inTax) put("tax", tax); else if (tax) taxExcluded += tax;
      net = f.net ?? (inTax ? withT : without);
      if (truthy(get(cells, "refunded"))) { put("refunds", -(gross + ship)); if (inTax) put("tax", -tax); if (f.net === null) net -= gross + ship + (inTax ? tax : 0); }
      if (truthy(get(cells, "disputed"))) { put("disputes", -(gross + ship)); if (inTax) put("tax", -tax); if (f.net === null) net -= gross + ship + (inTax ? tax : 0); }
    }
    let explained = Object.values(parts).reduce((a, v) => a + v, 0);
    // On a reversal, money coming back beyond the amount refunded is Gumroad returning its fee.
    if ((isRefund || isDispute) && net - explained > 0) { const back = net - explained; put("fees", back); explained += back; }
    const rest = net - explained;
    if (rest) {
      put("uncategorised", rest);
      if (!isRefund && !isDispute && !truthy(get(cells, "refunded")) && !truthy(get(cells, "disputed"))) add("warning", `Net amount does not match the columns on ${label}`, `Price, shipping, fee and tax columns add up to ${money(explained)} but the row's Net is ${money(net)}. The ${money(rest)} difference is journalled to uncategorised; the Net is what Gumroad says you earned.`, ln);
    }
    const s = month(date.slice(0, 7));
    if (!s.effective || date > s.effective) s.effective = date;
    s.currency = cur;
    s.rows.push({ line: ln, label, type: get(cells, "type") || "Sale", created: date, parts, net, deposit: payoutId, title: get(cells, "product") });
    if (payoutId) { const e = dep(payoutId); e.earnings += net; e.rows++; if (!e.first || date < e.first) e.first = date; if (!e.last || date > e.last) e.last = date; }
    rows++;
  }
  const payouts = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  if (!payouts.length) add("error", "No sales found", "The header was read but there were no usable data rows.");
  if (currencies.size > 1) add("warning", `More than one currency in the file (${[...currencies].join(", ")})`, "Journals are written in one currency per file. Split the export by currency before importing.", 0);
  if (opts.expected != null && Number.isFinite(opts.expected)) {
    if (payouts.length === 1) payouts[0].stated = opts.expected;
    else add("info", "Expected total ignored", "It can only be applied when the file holds exactly one month.");
  }
  const deposits = [...deps.values()].sort((a, b) => (a.date || a.last || "").localeCompare(b.date || b.last || ""));
  for (const e of deposits) {
    e.ties = e.payoutRows ? e.earnings === e.payout : null;
    if (e.payoutRows && !e.rows) add("info", `Payout ${e.id} has no sales in this file`, `${money(e.payout)} was paid out, but none of the rows that made it up are in this export. Widen the date range to include them.`, 0);
    else if (e.ties === false) add("warning", `Payout ${e.id}: sales add up to ${money(e.earnings)} but the payout is ${money(e.payout)}`, `Off by ${money(e.payout - e.earnings)}. Some of the payout's sales are outside the date range, or an adjustment moved. The journal still books each row and each payout; match the bank deposit to ${money(e.payout)}.`, 0);
  }
  if (rows && !deposits.length && payouts.some((s) => s.payoutRows.length === 0)) add("info", "No payout rows or Payout IDs in this file", "Without them the journals leave every month's net in the Gumroad clearing account. Match each Gumroad payout in your bank feed against that account yourself.", 0);
  if (taxExcluded) add("info", `${money(taxExcluded)} of tax is on rows where your Net does not include it`, "Where the Net excludes the tax column, Gumroad collected the tax itself and it is never paid to you, so it is not journalled. Check that against your own tax position.", 0);
  return { payouts, deposits, findings, summary: { rows, payouts: payouts.length, skipped, taxExcluded } };
}

// ---- categorising ------------------------------------------------------------

export function categoryOf(row) { return Object.entries(row.parts).filter(([, v]) => v).map(([k]) => k); }

// ---- journals ----------------------------------------------------------------

const lastDay = (ym) => { const [y, m] = ym.split("-").map(Number); return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`; };
const earningsOf = (s) => s.rows.reduce((a, r) => a + r.net, 0);
const paidOf = (s) => s.payoutRows.reduce((a, p) => a + p.amount, 0);

export function buildJournals(payouts, opts = {}) {
  const mapping = opts.mapping || defaultMapping();
  const findings = [];
  const journals = [];
  for (const s of payouts) {
    const sum = earningsOf(s), paid = paidOf(s);
    if (s.stated === null) findings.push({ severity: "info", title: `Month ${s.id}: no expected total to check against`, detail: `Net of this month's sales (before payouts) adds up to ${money(sum, s.currency)}. Type the month's net from your Gumroad earnings summary into the optional box to prove it.`, line: 0 });
    else if (s.stated !== sum) findings.push({ severity: "error", title: `Month ${s.id}: Net amounts add up to ${money(sum, s.currency)} but the total you gave is ${money(s.stated, s.currency)}`, detail: `Off by ${money(s.stated - sum, s.currency)}. Rows are missing from the paste, or an amount was skipped. Do not post this journal until the figures agree.`, line: 0 });
    const m = new Map();
    for (const r of s.rows) for (const [k, v] of Object.entries(r.parts)) {
      if (!v) continue;
      const e = m.get(k) || { net: 0, count: 0 };
      e.net += v; e.count++; m.set(k, e);
    }
    const lines = [];
    for (const k of EARNING_ORDER) {
      if (!m.has(k)) continue;
      const { net, count } = m.get(k);
      if (net === 0) continue;
      lines.push({ category: k, account: mapping[k], debit: net < 0 ? -net : 0, credit: net > 0 ? net : 0, memo: `${CATEGORIES[k].label} (${count} row${count === 1 ? "" : "s"})` });
    }
    const earn = lines.reduce((a, l) => a + l.credit - l.debit, 0);
    if (earn !== 0) lines.push({ category: "clearing", account: mapping.clearing, debit: earn > 0 ? earn : 0, credit: earn < 0 ? -earn : 0, memo: `Gumroad sales ${s.id}` });
    if (paid) {
      lines.push({ category: "bank", account: mapping.bank, debit: paid, credit: 0, memo: `Payouts to bank (${s.payoutRows.length})` });
      lines.push({ category: "clearing", account: mapping.clearing, debit: 0, credit: paid, memo: `Gumroad payouts ${s.id}` });
    }
    journals.push({ payoutId: s.id, period: s.id, date: lastDay(s.id), deposit: s.effective, currency: s.currency, narration: `Gumroad sales ${s.id}`, lines, clearing: earn - paid, earnings: earn, paidOut: paid });
    const unk = s.rows.filter((r) => r.parts.uncategorised);
    if (unk.length) findings.push({ severity: "warning", title: `Month ${s.id} has ${unk.length} row${unk.length === 1 ? "" : "s"} where the Net is not explained by the other columns`, detail: `${money(unk.reduce((a, r) => a + r.parts.uncategorised, 0), s.currency)} in total (for example a refund that kept or returned the fee, or an adjustment). It is journalled to "${mapping.uncategorised}" so the journal still equals the Net amounts. Review those rows and reclassify by hand.`, line: unk[0].line });
  }
  return { journals, findings };
}

export function uncategorisedRows(payouts) {
  return payouts.flatMap((s) => s.rows.filter((r) => r.parts.uncategorised).map((r) => ({ payout: s.id, ...r })));
}

export function reconciliation(payouts, journals) {
  return payouts.map((s) => {
    const sum = earningsOf(s);
    return { id: s.id, deposit: s.effective, currency: s.currency, stated: s.stated, journalled: sum, paidOut: paidOf(s), clearing: sum - paidOf(s), periods: journals.filter((j) => j.payoutId === s.id).map((j) => ({ period: j.period, date: j.date, clearing: j.clearing })), agrees: s.stated === null ? null : s.stated === sum };
  });
}

export function validate(text, opts = {}) {
  const p = parsePayouts(text, opts);
  const b = buildJournals(p.payouts, opts);
  const findings = [...p.findings, ...b.findings];
  const order = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b2) => order[a.severity] - order[b2.severity]);
  return { payouts: p.payouts, deposits: p.deposits, journals: b.journals, findings, reconciliation: reconciliation(p.payouts, b.journals), summary: { ...p.summary, journals: b.journals.length } };
}

// ---- exports -----------------------------------------------------------------

const csvCell = (v) => { const s = String(v ?? ""); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csvRow = (a) => a.map(csvCell).join(",");
const fmtDate = (iso, order) => { if (!iso) return ""; const [y, m, d] = iso.split("-"); return order === "dmy" ? `${d}/${m}/${y}` : order === "mdy" ? `${m}/${d}/${y}` : iso; };
const docNo = (j) => `GUMROAD-${j.payoutId}`;

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
  for (const j of journals) for (const l of j.lines) rows.push(csvRow([docNo(j), fmtDate(j.date, o.dateOrder || "mdy"), l.account, l.debit ? dollars(l.debit) : "", l.credit ? dollars(l.credit) : "", l.memo, "", j.currency]));
  return rows.join("\r\n") + "\r\n";
}

// QuickBooks Desktop IIF general journal: positive = debit, a transaction's lines sum to zero.
export function toIif(journals) {
  const t = (s) => String(s ?? "").replace(/[\t\r\n]+/g, " ");
  const out = ["!TRNS\tTRNSID\tTRNSTYPE\tDATE\tACCNT\tAMOUNT\tDOCNUM\tMEMO", "!SPL\tSPLID\tTRNSTYPE\tDATE\tACCNT\tAMOUNT\tDOCNUM\tMEMO", "!ENDTRNS"];
  for (const j of journals) {
    const date = fmtDate(j.date, "mdy"), doc = t(docNo(j));
    j.lines.forEach((l, i) => out.push(`${i === 0 ? "TRNS" : "SPL"}\t\tGENERAL JOURNAL\t${date}\t${t(l.account)}\t${((l.debit - l.credit) / 100).toFixed(2)}\t${doc}\t${t(l.memo)}`));
    out.push("ENDTRNS");
  }
  return out.join("\r\n") + "\r\n";
}

export function journalsCsv(journals) {
  const rows = [csvRow(["month", "date", "category", "account", "debit", "credit", "memo"])];
  for (const j of journals) for (const l of j.lines) rows.push(csvRow([j.period, j.date, l.category, l.account, l.debit ? dollars(l.debit) : "", l.credit ? dollars(l.credit) : "", l.memo]));
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

export const HEAD = ["Sale ID", "Sale Date", "Type", "Status", "Product Name", "Buyer Email", "Price", "Shipping", "Sales Tax", "Gumroad Fee", "Affiliate Fee", "Net Total", "Currency", "Payout ID"];
const usd = (c) => (c < 0 ? "-" : "") + "$" + Math.abs(c / 100).toFixed(2);
const c100 = (v) => Math.round((v || 0) * 100);

// Items in dollars. Fees are positive numbers meaning money Gumroad keeps. `taxIn` means the tax is
// paid out to the seller (included in Net); otherwise Gumroad collects and remits it. Refund and
// chargeback rows carry negative amounts; `amount` is the payout on Payout rows (printed negative).
export const netOf = (it) => {
  if (it.type === "Payout") return -c100(it.amount);
  const base = c100(it.price) + c100(it.ship);
  const tax = it.taxIn ? c100(it.tax) : 0;
  if (it.type === "Refund" || it.type === "Chargeback") return -(base + tax) + c100(it.feeBack);
  return base + tax - c100(it.fee) - c100(it.aff);
};
export function buildReport(items) {
  const out = [HEAD.join(",")];
  for (const it of items) {
    const type = it.type || "Sale";
    const sign = type === "Refund" || type === "Chargeback" ? -1 : 1;
    const row = type === "Payout"
      ? [it.id, `${it.date} 09:00:00`, "Payout", "Completed", "", "", "", "", "", "", "", usd(netOf(it)), "USD", it.payout || ""]
      : [it.id, `${it.date} 14:03:11`, type, "Completed", it.title, it.buyer || "buyer@example.com", usd(sign * c100(it.price)), usd(sign * c100(it.ship)), usd(sign * c100(it.tax)), it.fee ? usd(c100(it.fee)) : "", it.aff ? usd(c100(it.aff)) : "", usd(netOf(it)), "USD", it.payout || ""];
    out.push(row.map((v) => (/[",]/.test(v) ? `"${v}"` : v)).join(","));
  }
  return out.join("\n") + "\n";
}

// G1 and G2 are paid in September, G3 on Oct 2; G4 is not yet paid out. Fees follow "10% + $0.50"
// on the price, which is a made-up example, not Gumroad's schedule.
const raw = [
  { id: "S1001", date: "2026-09-02", title: "Notion Planner Template", price: 29, tax: 2.4, fee: 3.4, payout: "G1" },
  { id: "S1002", date: "2026-09-03", title: "Lightroom Preset Pack", price: 49, tax: 0, fee: 5.4, aff: 4.9, payout: "G1" },
  { id: "S1003", date: "2026-09-12", title: "Ebook: Freelance Pricing", price: 19, tax: 3.8, taxIn: true, fee: 2.4, payout: "G2" },
  { id: "S1004", date: "2026-09-14", title: "Stock Photo Bundle", price: 79, ship: 0, tax: 0, fee: 8.4, payout: "G2" },
  { id: "S1005", date: "2026-09-20", type: "Refund", title: "Lightroom Preset Pack", price: 49, tax: 0, feeBack: 5.4, payout: "G3" },
  { id: "S1006", date: "2026-09-22", type: "Chargeback", title: "Stock Photo Bundle", price: 79, tax: 0, payout: "G3" },
  { id: "S1007", date: "2026-09-29", title: "Notion Planner Template", price: 29, tax: 0, fee: 3.4, payout: "G3" },
  { id: "S1008", date: "2026-09-30", title: "Video Course: Color Grading", price: 199, ship: 0, tax: 0, fee: 20.4, aff: 19.9, payout: "G3" },
  { id: "S1009", date: "2026-10-01", title: "Ebook: Freelance Pricing", price: 19, tax: 0, fee: 2.4, payout: "G4" },
  { id: "S1010", date: "2026-10-03", title: "Notion Planner Template", price: 29, tax: 0, fee: 3.4, payout: "G4" },
];
const paid = (id) => raw.filter((i) => i.payout === id).reduce((a, i) => a + netOf(i), 0) / 100;
export const SAMPLE_ITEMS = [
  ...raw.filter((i) => i.date < "2026-09-05"),
  { id: "P1", type: "Payout", date: "2026-09-05", payout: "G1", amount: paid("G1") },
  ...raw.filter((i) => i.date >= "2026-09-05" && i.date < "2026-09-25"),
  { id: "P2", type: "Payout", date: "2026-09-25", payout: "G2", amount: paid("G2") },
  ...raw.filter((i) => i.date >= "2026-09-25"),
  { id: "P3", type: "Payout", date: "2026-10-02", payout: "G3", amount: paid("G3") },
];
SAMPLE_ITEMS.sort((a, b) => a.date.localeCompare(b.date));
export const SAMPLE_NET_SEPT = SAMPLE_ITEMS.filter((i) => i.type !== "Payout" && i.date.startsWith("2026-09")).reduce((a, i) => a + netOf(i), 0) / 100;

export const sampleReport = () => buildReport(SAMPLE_ITEMS);
// The same export after a hand edit: a Net that breaks the row, a garbled amount and a failed payout.
export function sampleBrokenReport() {
  const lines = buildReport(SAMPLE_ITEMS).trimEnd().split("\n");
  const f = (s) => splitLine(s, ",");
  const ni = HEAD.indexOf("Net Total"), ti = HEAD.indexOf("Sales Tax");
  const at = (id) => lines.findIndex((l, i) => i > 0 && l.startsWith(id + ","));
  let c = f(lines[at("S1001")]); c[ni] = "$99.00"; lines[at("S1001")] = c.map(csvCell).join(",");
  c = f(lines[at("S1002")]); c[ti] = "$2..06"; lines[at("S1002")] = c.map(csvCell).join(",");
  lines[at("P2")] = lines[at("P2")].replace("Completed", "Failed");
  return lines.join("\n") + "\n";
}
