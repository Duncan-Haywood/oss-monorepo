// Square Transactions CSV -> accounting journal.
//
// Square's Transactions export (Dashboard > Reports > Transactions > Export) has one row per
// payment with Gross Sales, Discounts, Net Sales, Tax, Tip, Partial Refunds, Total Collected, Fees
// and Net Total. Bookkeepers need sales, discounts, sales tax, tips, refunds and Square's fees
// booked separately, one journal per calendar month, balanced to a Square clearing account, and
// each Deposit ID totalled so it can be matched to the bank feed. This module reads the export,
// checks every row (Total Collected + Fees = Net Total), accounts for every dollar of Total
// Collected, and writes balanced journals for Xero, QuickBooks Online, QuickBooks Desktop (IIF)
// and plain CSV.
//
// Column names and importer layouts are from memory of public Square and accounting help
// documents; no real Square export and no live import was available when this was written.
// Money that no rule explains goes to an uncategorised line and is reported, never dropped.
//
// Everything is integer cents. Nothing here touches the network or the DOM.

export const CATEGORIES = {
  sales: { label: "Gross sales", account: "Square Sales" },
  discounts: { label: "Discounts", account: "Square Discounts" },
  service: { label: "Service charges", account: "Square Service Charges" },
  giftcards: { label: "Gift card sales (liability)", account: "Gift Cards Outstanding" },
  tax: { label: "Sales tax collected (liability)", account: "Sales Tax Payable" },
  tips: { label: "Tips collected (liability)", account: "Tips Payable" },
  refunds: { label: "Refunds", account: "Square Refunds" },
  fees: { label: "Square processing fees", account: "Square Fees" },
  uncategorised: { label: "Collected money no rule explains", account: "Square Uncategorised" },
  clearing: { label: "Square clearing (pending deposit)", account: "Square Clearing" },
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


const COLUMNS = {
  date: ["date"], gross: ["gross-sales"], discounts: ["discounts"], service: ["service-charges"], net: ["net-sales"],
  giftcards: ["gift-card-sales"], tax: ["tax"], tip: ["tip"], refunds: ["partial-refunds", "refunds"],
  collected: ["total-collected"], fees: ["fees"], netTotal: ["net-total"], txn: ["transaction-id"], payment: ["payment-id"],
  deposit: ["deposit-id"], status: ["transaction-status"], desc: ["description", "details"], tz: ["time-zone"],
};

// Rows are grouped by calendar month. The period's Net Total can be checked against a figure
// the caller types in via opts.expected (only when the file holds exactly one month).
export function parsePayouts(text, opts = {}) {
  const findings = [];
  const add = (severity, title, detail, line) => findings.push({ severity, title, detail, line: line || 0 });
  const lines = String(text || "").replace(/^﻿/, "").split(/\r?\n/);
  const first = lines.findIndex((l) => l.trim());
  const none = { payouts: [], deposits: [], findings, summary: { rows: 0, payouts: 0 } };
  if (first < 0) { add("error", "The file is empty", "Paste or choose a Square Transactions export."); return none; }
  const d = (lines[first].match(/\t/g) || []).length > (lines[first].match(/,/g) || []).length ? "\t" : ",";
  const head = splitLine(lines[first], d).map(norm);
  const I = {};
  for (const [k, names] of Object.entries(COLUMNS)) { I[k] = -1; for (const n of names) { const i = head.indexOf(n); if (i >= 0) { I[k] = i; break; } } }
  const missing = [];
  if (I.date < 0) missing.push("Date");
  if (I.collected < 0) missing.push("Total Collected");
  if (I.fees < 0 && I.netTotal < 0) missing.push("Fees or Net Total");
  if (missing.length) {
    add("error", "This does not look like a Square Transactions export", `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. In the Square Dashboard open Reports > Sales > Transactions (or Payments), choose the dates and export the CSV. The Items export has no fees and cannot be used.`, first + 1);
    return none;
  }
  const get = (cells, k) => (I[k] >= 0 ? (cells[I[k]] ?? "").trim() : "");
  const byId = new Map(), deps = new Map();
  let rows = 0, skipped = 0;
  for (let i = first + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = splitLine(lines[i], d);
    const date = parseDate(get(cells, "date"), opts.dateOrder);
    const label = get(cells, "payment") || get(cells, "txn") || get(cells, "desc") || `line ${i + 1}`;
    if (!date) { add("error", `Date "${get(cells, "date")}" not understood`, "The row is left out, so its month will not add up.", i + 1); continue; }
    const f = {};
    let bad = false;
    for (const k of ["gross", "discounts", "service", "net", "giftcards", "tax", "tip", "refunds", "collected", "fees", "netTotal"]) {
      const v = parseMoney(get(cells, k));
      if (Number.isNaN(v)) { add("error", "An amount is not a number", `"${get(cells, k)}" in ${k} on ${label} was left out with its row.`, i + 1); bad = true; break; }
      f[k] = v;
    }
    if (bad) continue;
    const status = get(cells, "status").toLowerCase();
    if (status && !/^(complete|completed|paid|success|succeeded|)$/.test(status) && !/refund/.test(status)) { skipped++; add("warning", `Row with status "${get(cells, "status")}" skipped`, `${label} is not a completed payment, so no money moved; it is not journalled.`, i + 1); continue; }
    if (f.collected === null && f.netTotal === null) { add("warning", "Row has no total", `${label} was skipped.`, i + 1); continue; }
    const fees = f.fees ?? 0;
    const collected = f.collected ?? (f.netTotal - fees);
    const netTotal = f.netTotal ?? (collected + fees);
    if (collected + fees !== netTotal) add("error", `Total Collected plus Fees does not equal Net Total on ${label}`, `${money(collected)} + ${money(fees)} = ${money(collected + fees)}, but the row says ${money(netTotal)}. The journal uses the Net Total; check the file was not edited.`, i + 1);
    const g = f.gross ?? 0, disc = f.discounts ?? 0, svc = f.service ?? 0, gc = f.giftcards ?? 0, tax = f.tax ?? 0, tip = f.tip ?? 0, ref = f.refunds ?? 0;
    // Discounts and refunds print as negatives on most exports; either sign is read as a reduction.
    const parts = { sales: g, discounts: -Math.abs(disc), service: svc, giftcards: gc, tax, tips: tip, refunds: -Math.abs(ref) };
    const explained = Object.values(parts).reduce((a, v) => a + v, 0);
    parts.uncategorised = collected - explained;
    parts.fees = fees;
    const ym = date.slice(0, 7);
    if (!byId.has(ym)) byId.set(ym, { id: ym, effective: null, stated: null, currency: "USD", rows: [] });
    const s = byId.get(ym);
    if (!s.effective || date > s.effective) s.effective = date;
    const dep = get(cells, "deposit");
    s.rows.push({ line: i + 1, label, created: date, parts, net: netTotal, deposit: dep });
    if (dep) { const e = deps.get(dep) || { id: dep, net: 0, rows: 0, first: date, last: date }; e.net += netTotal; e.rows++; if (date < e.first) e.first = date; if (date > e.last) e.last = date; deps.set(dep, e); }
    rows++;
  }
  const payouts = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  if (!payouts.length) add("error", "No transactions found", "The header was read but there were no usable data rows.");
  if (opts.expected != null && Number.isFinite(opts.expected)) {
    if (payouts.length === 1) payouts[0].stated = opts.expected;
    else add("info", "Expected total ignored", "It can only be applied when the file holds exactly one month.");
  }
  const noDeposit = payouts.reduce((a, s) => a + s.rows.filter((r) => !r.deposit).length, 0);
  if (rows && noDeposit) add("info", `${noDeposit} row${noDeposit === 1 ? " has" : "s have"} no Deposit ID`, "Square assigns a Deposit ID when a payment is paid out. Rows without one are recent or cash and are not yet in any bank deposit.", 0);
  return { payouts, deposits: [...deps.values()].sort((a, b) => a.first.localeCompare(b.first)), findings, summary: { rows, payouts: payouts.length, skipped } };
}

// ---- categorising ------------------------------------------------------------

export function categoryOf(row) { return Object.entries(row.parts).filter(([, v]) => v).map(([k]) => k); }

// ---- journals ----------------------------------------------------------------

const lastDay = (ym) => { const [y, m] = ym.split("-").map(Number); return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`; };

export function buildJournals(payouts, opts = {}) {
  const mapping = opts.mapping || defaultMapping();
  const findings = [];
  const journals = [];
  for (const s of payouts) {
    const sum = s.rows.reduce((a, r) => a + r.net, 0);
    if (s.stated === null) findings.push({ severity: "info", title: `Month ${s.id}: no expected total to check against`, detail: `Net Total for the month adds up to ${money(sum)}. Type the month's Net Total from your Square report summary into the optional box to prove it.`, line: 0 });
    else if (s.stated !== sum) findings.push({ severity: "error", title: `Month ${s.id}: Net Total adds up to ${money(sum)} but the total you gave is ${money(s.stated)}`, detail: `Off by ${money(s.stated - sum)}. Rows are missing from the paste, or an amount was skipped. Do not post this journal until the figures agree.`, line: 0 });
    const m = new Map();
    for (const r of s.rows) for (const [k, v] of Object.entries(r.parts)) {
      if (!v) continue;
      const e = m.get(k) || { net: 0, count: 0 };
      e.net += v; e.count++; m.set(k, e);
    }
    const lines = [];
    for (const k of CATEGORY_ORDER) {
      if (k === "clearing" || !m.has(k)) continue;
      const { net, count } = m.get(k);
      if (net === 0) continue;
      lines.push({ category: k, account: mapping[k], debit: net < 0 ? -net : 0, credit: net > 0 ? net : 0, memo: `${CATEGORIES[k].label} (${count} row${count === 1 ? "" : "s"})` });
    }
    const net = lines.reduce((a, l) => a + l.credit - l.debit, 0);
    if (net !== 0 || !lines.length) lines.push({ category: "clearing", account: mapping.clearing, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0, memo: `Square transactions ${s.id}` });
    journals.push({ payoutId: s.id, period: s.id, date: lastDay(s.id), deposit: s.effective, currency: "USD", narration: `Square transactions ${s.id}`, lines, clearing: net });
    const unk = s.rows.filter((r) => r.parts.uncategorised);
    if (unk.length) findings.push({ severity: "warning", title: `Month ${s.id} has ${unk.length} row${unk.length === 1 ? "" : "s"} where Total Collected is not explained by the other columns`, detail: `${money(unk.reduce((a, r) => a + r.parts.uncategorised, 0))} in total (for example gift card redemptions, other tenders or a refund booked in an unusual column). It is journalled to "${mapping.uncategorised}" so the journal still equals the Net Total. Review those rows and reclassify by hand.`, line: unk[0].line });
  }
  return { journals, findings };
}

export function uncategorisedRows(payouts) {
  return payouts.flatMap((s) => s.rows.filter((r) => r.parts.uncategorised).map((r) => ({ payout: s.id, ...r })));
}

export function reconciliation(payouts, journals) {
  return payouts.map((s) => {
    const sum = s.rows.reduce((a, r) => a + r.net, 0);
    return { id: s.id, deposit: s.effective, currency: "USD", stated: s.stated, journalled: sum, periods: journals.filter((j) => j.payoutId === s.id).map((j) => ({ period: j.period, date: j.date, clearing: j.clearing })), agrees: s.stated === null ? null : s.stated === sum };
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

const HEAD = ["Date", "Time", "Time Zone", "Gross Sales", "Discounts", "Service Charges", "Net Sales", "Gift Card Sales", "Tax", "Tip", "Partial Refunds", "Total Collected", "Source", "Card", "Card Brand", "PAN Suffix", "Fees", "Net Total", "Transaction ID", "Payment ID", "Deposit ID", "Description"];
const usd = (c) => (c < 0 ? "-" : "") + "$" + Math.abs(c / 100).toFixed(2);

// items: { date, gross, disc, tax, tip, refund, fee, deposit, id } in dollars; totals are computed.
export function buildReport(items) {
  const c = (v) => Math.round((v || 0) * 100);
  const out = [HEAD.join(",")];
  for (const it of items) {
    const net = c(it.gross) - c(it.disc) + (it.gift ? 0 : 0);
    const collected = net + c(it.tax) + c(it.tip) + (it.gift ? c(it.gift) : 0) - c(it.refund);
    const fee = -c(it.fee);
    const row = [it.date, "12:00:00", "Eastern Time (US & Canada)", usd(c(it.gross)), usd(-c(it.disc)), "$0.00", usd(net), usd(c(it.gift)), usd(c(it.tax)), usd(c(it.tip)), usd(-c(it.refund)), usd(collected), "Square Point of Sale", "Card", "Visa", "1111", usd(fee), usd(collected + fee), `T${it.id}`, `P${it.id}`, it.deposit || "", it.desc || ""];
    out.push(row.join(","));
  }
  return out.join("\n") + "\n";
}

export const SAMPLE_ITEMS = [
  { id: 1, date: "2026-09-02", gross: 40, disc: 0, tax: 3.3, tip: 6, fee: 1.46, deposit: "D100" },
  { id: 2, date: "2026-09-02", gross: 25, disc: 5, tax: 1.65, tip: 0, fee: 0.9, deposit: "D100" },
  { id: 3, date: "2026-09-15", gross: 120, disc: 0, tax: 9.9, tip: 12, fee: 4.48, deposit: "D101" },
  { id: 4, date: "2026-09-29", gross: 60, disc: 0, tax: 4.95, tip: 0, fee: 2.0, refund: 20, deposit: "D102" },
  { id: 5, date: "2026-09-30", gross: 15, disc: 0, tax: 1.24, tip: 2, gift: 25, fee: 0.78, deposit: "D102" },
  { id: 6, date: "2026-10-03", gross: 80, disc: 8, tax: 5.94, tip: 10, fee: 3.1, deposit: "D103" },
  { id: 7, date: "2026-10-04", gross: 32, disc: 0, tax: 2.64, tip: 0, fee: 1.1, deposit: "" },
];
export const SAMPLE_NET_SEPT = (() => {
  let t = 0;
  for (const it of SAMPLE_ITEMS.filter((x) => x.date.startsWith("2026-09"))) t += Math.round((it.gross - it.disc + it.tax + it.tip + (it.gift || 0) - (it.refund || 0)) * 100) - Math.round(it.fee * 100);
  return t / 100;
})();

export const sampleReport = () => buildReport(SAMPLE_ITEMS);
// The same export after a hand edit: a fee that breaks the net, a garbled amount and a payment that never completed.
export function sampleBrokenReport() {
  const lines = buildReport(SAMPLE_ITEMS).trimEnd().split("\n");
  const cells = lines[1].split(",");
  cells[17] = "$40.00";
  lines[1] = cells.join(",");
  const bad = lines[2].split(",");
  bad[8] = "$1..65";
  lines[2] = bad.join(",");
  return lines.join("\n") + "\n";
}
