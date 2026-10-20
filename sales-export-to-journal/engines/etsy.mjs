// Etsy Payment account / monthly statement CSV -> accounting journal.
//
// Etsy's statement lists every sale, fee, refund, ad charge, shipping label and deposit with
// amounts like "$25.00" and "--". Bookkeepers need gross sales, each kind of fee and the bank
// deposits booked separately, one journal per calendar month, balanced to an Etsy clearing
// account. This module reads the statement, checks every row's amount + fees = net, optionally
// proves the month's activity against a total typed in from Etsy, and writes balanced journals
// for Xero, QuickBooks Online, QuickBooks Desktop (IIF) and plain CSV.
//
// The column names, Type values and importer layouts are from memory of public Etsy and
// accounting help documents; no real Etsy export and no live import was available when this was
// written. Unrecognised rows are never dropped: they land in an uncategorised line and are reported.
//
// Everything is integer cents. Nothing here touches the network or the DOM.

export const CATEGORIES = {
  sales: { label: "Etsy sales (gross)", account: "Etsy Sales" },
  refunds: { label: "Refunds", account: "Etsy Refunds" },
  fees: { label: "Etsy fees (listing, transaction, processing, other)", account: "Etsy Fees" },
  ads: { label: "Etsy Ads and offsite ads", account: "Etsy Advertising" },
  labels: { label: "Shipping labels bought through Etsy", account: "Etsy Shipping Labels" },
  taxes: { label: "Taxes withheld or remitted by Etsy", account: "Etsy Taxes Withheld" },
  other: { label: "Adjustments and credits", account: "Etsy Adjustments" },
  uncategorised: { label: "Uncategorised Etsy items", account: "Etsy Uncategorised" },
  deposits: { label: "Deposits to your bank", account: "Bank - Etsy Deposits" },
  clearing: { label: "Etsy clearing (Payment account balance movement)", account: "Etsy Clearing" },
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

const REQUIRED = ["net", "reporting-category"];

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
// Etsy prints amounts as "$25.00", "-$1.63", "--" or "€12,50"; strip the symbol and read the rest.
export function parseMoney(s) {
  const t = String(s ?? "").trim();
  if (t === "" || /^-+$/.test(t)) return null;
  const neg = /^\(.*\)$/.test(t) || /^[-−]/.test(t) || /[-−]$/.test(t);
  const core = t.replace(/[^0-9.,]/g, "");
  if (!core) return NaN;
  const v = parseAmount(core);
  return v === null || Number.isNaN(v) ? NaN : neg ? -Math.abs(v) : v;
}
// Etsy writes "September 28, 2026" or "28 September 2026" or numeric dates; return YYYY-MM-DD or null.
export function parseStatementDate(s, order = "mdy") {
  const t = String(s ?? "").trim();
  let x;
  if ((x = t.match(/^([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})/))) { const m = MONTHS[x[1].toLowerCase()]; return m ? parseDate(`${x[3]}-${String(m).padStart(2, "0")}-${String(x[2]).padStart(2, "0")}`) : null; }
  if ((x = t.match(/^(\d{1,2}) ([A-Za-z]{3})[a-z]*\.?,? (\d{4})/))) { const m = MONTHS[x[2].toLowerCase()]; return m ? parseDate(`${x[3]}-${String(m).padStart(2, "0")}-${String(x[1]).padStart(2, "0")}`) : null; }
  return parseDate(t, order);
}

// Rows are grouped by calendar month. The month's activity (everything except deposits) can be
// checked against a net total the caller types in from Etsy via opts.expected.
export function parsePayouts(text, opts = {}) {
  const findings = [];
  const add = (severity, title, detail, line) => findings.push({ severity, title, detail, line: line || 0 });
  const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/);
  const first = lines.findIndex((l) => l.trim());
  const none = { payouts: [], findings, summary: { rows: 0, payouts: 0 } };
  if (first < 0) { add("error", "The file is empty", "Paste or choose an Etsy statement."); return none; }
  const d = (lines[first].match(/\t/g) || []).length > (lines[first].match(/,/g) || []).length ? "\t" : ",";
  const head = splitLine(lines[first], d).map(norm);
  const col = (...names) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; };
  const I = { date: col("date"), type: col("type"), title: col("title"), info: col("info"), currency: col("currency"), amount: col("amount"), fees: col("fees-&-taxes", "fees-and-taxes", "fees"), net: col("net") };
  const missing = [];
  if (I.date < 0) missing.push("Date");
  if (I.type < 0) missing.push("Type");
  if (I.net < 0 && I.amount < 0) missing.push("Net or Amount");
  if (missing.length) {
    add("error", "This does not look like an Etsy statement", `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. In Etsy Shop Manager open Finances > Payment account (or Legal & tax > Monthly statements) and download the CSV.`, first + 1);
    return none;
  }
  const get = (cells, k) => (I[k] >= 0 ? (cells[I[k]] ?? "").trim() : "");
  const byId = new Map();
  let rows = 0;
  for (let i = first + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = splitLine(lines[i], d);
    const type = get(cells, "type").toLowerCase(), title = get(cells, "title");
    const date = parseStatementDate(get(cells, "date"), opts.dateOrder);
    if (!date) { add("error", `Date "${get(cells, "date")}" not understood`, "The row is left out, so its month will not add up.", i + 1); continue; }
    const amtS = get(cells, "amount"), feeS = get(cells, "fees"), netS = get(cells, "net");
    let amount = parseMoney(amtS), ft = parseMoney(feeS), net = parseMoney(netS);
    if ([amount, ft, net].some((v) => Number.isNaN(v))) { add("error", "An amount is not a number", `"${[amtS, feeS, netS].join(" | ")}" on ${title || type || `line ${i + 1}`} was left out.`, i + 1); continue; }
    if (amount === null && net === null) { add("warning", "Row has no amount", `${type || "row"} was skipped.`, i + 1); continue; }
    if (amount === null) amount = net - (ft || 0);
    if (net === null) net = amount + (ft || 0);
    if (ft === null) ft = 0;
    if (amount + ft !== net) add("error", `Amount plus fees and taxes does not equal net on "${title || type}"`, `${money(amount)} + ${money(ft)} = ${money(amount + ft)}, but the row says ${money(net)}. The journal uses the net; check the file was not edited.`, i + 1);
    const ym = date.slice(0, 7);
    if (!byId.has(ym)) byId.set(ym, { id: ym, effective: null, stated: null, currency: "", rows: [] });
    const s = byId.get(ym);
    const cur = get(cells, "currency").toUpperCase();
    if (cur && s.currency && cur !== s.currency) add("warning", `Mixed currencies in ${ym}`, `${cur} row among ${s.currency} rows. Journals assume one currency per month.`, i + 1);
    if (cur && !s.currency) s.currency = cur;
    if (!s.effective || date > s.effective) s.effective = date;
    s.rows.push({ line: i + 1, id: "", cat: type, desc: title, info: get(cells, "info"), gross: amount, fee: -ft, net, created: date });
    rows++;
  }
  const payouts = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  if (!payouts.length) add("error", "No statement rows found", "The header was read but there were no data rows.");
  if (opts.expected != null && Number.isFinite(opts.expected)) {
    if (payouts.length === 1) payouts[0].stated = opts.expected;
    else add("info", "Expected total ignored", "It can only be applied when the file holds exactly one month.");
  }
  return { payouts, findings, summary: { rows, payouts: payouts.length } };
}

// ---- categorising ------------------------------------------------------------

export function categoryOf(row) {
  const c = String(row.cat || "").toLowerCase().trim();
  const t = String(row.desc || "").toLowerCase();
  if (c === "sale" || c === "payment" || c === "order") return "sales";
  if (c === "refund") return "refunds";
  if (c === "deposit" || c === "payout" || c === "transfer") return "deposits";
  if (c === "marketing" || /etsy ads|offsite ads|promoted/.test(t)) return "ads";
  if (c === "shipping" || c === "shipping label" || /shipping label|postage/.test(t)) return "labels";
  if (c === "tax" || c === "vat" || c === "sales tax") return "taxes";
  if (c === "fee" || c === "listing" || c === "processing" || c === "transaction" || /listing fee|transaction fee|processing fee|regulatory|renew/.test(t)) return "fees";
  if (c === "adjustment" || c === "credit" || c === "reserve" || c === "reserve release") return "other";
  return "uncategorised";
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
    const sum = s.rows.filter((r) => categoryOf(r) !== "deposits").reduce((a, r) => a + r.net, 0);
    const cur = s.currency || "USD";
    const endDate = s.effective || [...s.rows].map((r) => r.created).filter(Boolean).sort().pop() || null;
    if (s.stated === null) findings.push({ severity: "info", title: `Month ${s.id}: no expected total to check against`, detail: `The activity rows (everything except deposits) add up to ${money(sum, cur)}. Type the month's net total from Etsy into the optional box to prove it.`, line: 0 });
    else if (s.stated !== sum) findings.push({ severity: "error", title: `Month ${s.id}: activity adds up to ${money(sum, cur)} but the total you gave is ${money(s.stated, cur)}`, detail: `Off by ${money(s.stated - sum, cur)}. Rows are missing from the paste, or an amount was skipped. Do not post this journal until the figures agree.`, line: 0 });
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
      const k = categoryOf(r);
      add(k, r.gross);
      add(k === "sales" ? "taxes" : "fees", -r.fee);
    }
    if (undated) findings.push({ severity: "warning", title: `${undated} row${undated === 1 ? "" : "s"} in ${s.id} had no date`, detail: "They were placed in the payout's final month.", line: 0 });
    const keys = [...periods.keys()].sort();
    if (keys.length > 1) findings.push({ severity: "info", title: `Month ${s.id} spans ${keys.length} months`, detail: `Written as ${keys.length} journals (${keys.join(", ")}), each balanced to Stripe clearing, so every month's revenue and fees land in the month they happened. The bank deposit of ${s.stated === null ? "the full amount" : money(s.stated, cur)} then clears both.`, line: 0 });
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
      if (net !== 0 || !lines.length) lines.push({ category: "clearing", account: mapping.clearing, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0, memo: `Etsy statement ${s.id}` });
      journals.push({ payoutId: s.id, period: ym, date, deposit: s.effective, currency: cur, narration: `Etsy statement ${s.id}`, lines, clearing: net });
    });
    const unknown = s.rows.filter((r) => categoryOf(r) === "uncategorised");
    if (unknown.length) findings.push({ severity: "warning", title: `Month ${s.id} has ${unknown.length} item${unknown.length === 1 ? "" : "s"} no rule recognised`, detail: `${[...new Set(unknown.map((r) => r.cat || r.desc))].slice(0, 5).join(", ")}. They are journalled to "${mapping.uncategorised}" so the journal still equals the net. Review them and reclassify by hand if needed.`, line: unknown[0].line });
  }
  return { journals, findings };
}

export function uncategorisedRows(payouts) {
  return payouts.flatMap((s) => s.rows.filter((r) => categoryOf(r) === "uncategorised").map((r) => ({ payout: s.id, ...r })));
}

export function reconciliation(payouts, journals) {
  return payouts.map((s) => {
    const js = journals.filter((j) => j.payoutId === s.id);
    const sum = s.rows.filter((r) => categoryOf(r) !== "deposits").reduce((a, r) => a + r.net, 0);
    return { id: s.id, deposit: s.effective, currency: s.currency || "USD", stated: s.stated, journalled: sum, periods: js.map((j) => ({ period: j.period, date: j.date, clearing: j.clearing })), agrees: s.stated === null ? null : s.stated === sum };
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

const HEAD = ["Date", "Type", "Title", "Info", "Currency", "Amount", "Fees & Taxes", "Net", "Tax Details"];
const usd = (c) => (c < 0 ? "-" : "") + "$" + Math.abs(c / 100).toFixed(2);

// items: [date, type, title, amount, feesAndTaxes]; amounts in dollars, fees negative. Net is computed.
export function buildReport(items) {
  const q = (v) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const out = [HEAD.join(",")];
  for (const [date, type, title, amount, fees] of items) {
    const a = typeof amount === "string" ? amount : usd(Math.round(amount * 100));
    const f = fees ? usd(Math.round(fees * 100)) : "--";
    const n = typeof amount === "string" ? amount : usd(Math.round((amount + (fees || 0)) * 100));
    out.push([date, type, title, "", "USD", a, f, n, "--"].map(q).join(","));
  }
  return out.join("\n") + "\n";
}

export const SAMPLE_ITEMS = [
  ["September 3, 2026", "Sale", "Payment for Order #1001", 42.0, 0],
  ["September 3, 2026", "Fee", "Transaction fee: Handmade candle", -2.73, 0],
  ["September 3, 2026", "Fee", "Processing fee", -1.5, 0],
  ["September 9, 2026", "Sale", "Payment for Order #1002", 28.5, 0],
  ["September 9, 2026", "Fee", "Transaction fee: Soap set", -1.85, 0],
  ["September 14, 2026", "Fee", "Listing fee", -0.2, 0],
  ["September 20, 2026", "Marketing", "Etsy Ads", -6.0, 0],
  ["September 25, 2026", "Refund", "Refund for Order #1001 (partial)", -10.0, 0],
  ["September 30, 2026", "Deposit", "Deposit to bank account ending 1234", -30.0, 0],
  ["October 2, 2026", "Sale", "Payment for Order #1003", 64.0, 0],
  ["October 2, 2026", "Fee", "Transaction fee: Candle trio", -4.16, 0],
  ["October 4, 2026", "Shipping", "Shipping label: USPS Priority", -8.9, 0],
  ["October 5, 2026", "Fee", "Listing fee", -0.2, 0],
];
export const SAMPLE_NET_SEPT = 42.0 - 2.73 - 1.5 + 28.5 - 1.85 - 0.2 - 6.0 - 10.0;

export const sampleReport = () => buildReport(SAMPLE_ITEMS);
// The same statement after a hand edit: an unknown type, a garbled amount and a net that no longer adds up.
export function sampleBrokenReport() {
  return buildReport(SAMPLE_ITEMS).replace("Etsy Ads,,USD,-$6.00,--,-$6.00", "Etsy Ads,,USD,-$6.00,--,-$5.00") + `"October 6, 2026",Mystery,Unknown thing,,USD,$1.23,--,$1.23,--\n"October 6, 2026",Sale,Typo,,USD,$12..5,--,$12..5,--\n`;
}
