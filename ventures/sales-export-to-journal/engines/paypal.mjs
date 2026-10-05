// PayPal Activity report -> accounting journal.
//
// A PayPal account is itself a bank-like balance: sales arrive gross, fees come off, refunds and
// disputes move money back, and withdrawals to a bank move it out. Bookkeepers need each of those
// on its own line, split at month end, with a PayPal account line that moves by exactly what the
// account's Balance column says it moved. This module reads the Activity Download CSV, proves
// the running Balance column is continuous (opening balance + every net = closing balance, row
// by row), groups rows into categories, and writes balanced journals for Xero, QuickBooks Online,
// QuickBooks Desktop (IIF) and a plain CSV.
//
// The report column names, the transaction type names and each importer's column layout are from
// memory of public PayPal and accounting-software help documents; no real PayPal export and no
// live Xero or QuickBooks import was available when this was written. Rows no rule recognises are
// never dropped: they land in an "uncategorised" line and are reported.
//
// Everything is integer cents. Nothing here touches the network or the DOM.

export const CATEGORIES = {
  sales: { label: "Payments received (gross)", account: "PayPal Sales" },
  refunds: { label: "Refunds paid", account: "PayPal Refunds" },
  disputes: { label: "Chargebacks, disputes and holds", account: "PayPal Disputes" },
  processing: { label: "PayPal fees", account: "PayPal Fees" },
  purchases: { label: "Payments sent", account: "PayPal Payments Sent" },
  transfers: { label: "Transfers to and from the bank", account: "Bank Transfer Clearing" },
  conversion: { label: "Currency conversion", account: "PayPal Currency Conversion" },
  uncategorised: { label: "Uncategorised PayPal items", account: "PayPal Uncategorised" },
  clearing: { label: "PayPal account (moves by the Balance column)", account: "PayPal Account" },
};
export const CATEGORY_ORDER = Object.keys(CATEGORIES);

export const defaultMapping = () => Object.fromEntries(CATEGORY_ORDER.map((k) => [k, CATEGORIES[k].account]));

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

// Returns YYYY-MM-DD or null. Accepts ISO, DD.MM.YYYY, and slashed dates read per `order`.
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

const norm = (h) => h.trim().toLowerCase().replace(/^\ufeff/, "").replace(/[\s_]+/g, "-").replace(/-+$/, "");
const ALIASES = {
  date: ["date"],
  time: ["time"],
  type: ["type", "transaction-type"],
  status: ["status"],
  currency: ["currency"],
  gross: ["gross", "amount"],
  fee: ["fee", "fees"],
  net: ["net"],
  balance: ["balance"],
  impact: ["balance-impact"],
  id: ["transaction-id"],
  name: ["name"],
  desc: ["item-title", "description", "subject"],
};
const SKIP_STATUS = /^(pending|denied|canceled|cancelled|created|voided|expired|declined|failed|placed|unclaimed)$/i;

export function parsePayouts(text, opts = {}) {
  const findings = [];
  const add = (severity, title, detail, line) => findings.push({ severity, title, detail, line: line || 0 });
  const empty = () => ({ settlements: [], findings, summary: { rows: 0, settlements: 0 } });
  const lines = String(text || "").replace(/^\ufeff/, "").split(/\r?\n/);
  const first = lines.findIndex((l) => l.trim());
  if (first < 0) { add("error", "The file is empty", "Paste or choose a PayPal Activity report."); return empty(); }
  const d = (lines[first].match(/\t/g) || []).length > (lines[first].match(/,/g) || []).length ? "\t" : ",";
  const head = splitLine(lines[first], d).map(norm);
  const I = {};
  for (const [k, names] of Object.entries(ALIASES)) I[k] = names.map((n) => head.indexOf(n)).find((i) => i >= 0) ?? -1;
  const missing = ["date", "type", "currency"].filter((k) => I[k] < 0);
  if (missing.length || (I.gross < 0 && I.net < 0)) {
    add("error", "This does not look like a PayPal Activity report", `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}${I.gross < 0 && I.net < 0 ? " gross/net" : ""}. In PayPal open Activity > Statements > Activity download (or Reports > Activity), choose Completed payments or All transactions, and download the CSV with the Date, Type, Currency, Gross, Fee, Net and Balance columns.`, first + 1);
    return empty();
  }
  const get = (cells, k) => (I[k] >= 0 ? (cells[I[k]] ?? "").trim() : "");
  // The file is usually newest-first; read it oldest-first so the Balance chain can be walked.
  const data = [];
  for (let i = first + 1; i < lines.length; i++) if (lines[i].trim()) data.push({ i, cells: splitLine(lines[i], d) });
  const dateOf = (r) => parseDate(get(r.cells, "date"), opts.dateOrder) || "";
  const dated = data.filter((r) => dateOf(r));
  if (dated.length > 1 && dateOf(dated[0]) + get(dated[0].cells, "time") > dateOf(dated[dated.length - 1]) + get(dated[dated.length - 1].cells, "time")) data.reverse();
  const byCur = new Map();
  const bucket = (cur) => { if (!byCur.has(cur)) byCur.set(cur, { id: `PayPal ${cur}`, start: null, end: null, deposit: null, total: null, currency: cur, rows: [], summaryRows: 0, chain: [] }); return byCur.get(cur); };
  let rows = 0, skipped = 0, memo = 0;
  for (const { i, cells } of data) {
    const status = get(cells, "status"), impact = get(cells, "impact"), type = get(cells, "type");
    const cur = (get(cells, "currency") || "").toUpperCase();
    if (!cur) { add("warning", "Row has no currency", "It was skipped.", i + 1); continue; }
    if (/^memo$/i.test(impact)) { memo++; continue; }
    if (status && SKIP_STATUS.test(status)) { skipped++; continue; }
    const netRaw = get(cells, "net"), grossRaw = get(cells, "gross"), feeRaw = get(cells, "fee"), balRaw = get(cells, "balance");
    const net = parseAmount(netRaw), gross = parseAmount(grossRaw), fee = parseAmount(feeRaw), bal = parseAmount(balRaw);
    if ([net, gross, fee, bal].some((v) => Number.isNaN(v))) { add("error", `A number in this row is not valid (gross "${grossRaw}", fee "${feeRaw}", net "${netRaw}", balance "${balRaw}")`, "The row is left out, so the account will not reconcile.", i + 1); continue; }
    if (net === null && gross === null) { add("warning", "Row has no amount", `${type || "row"} was skipped.`, i + 1); continue; }
    const f = fee ?? 0, g = gross ?? net - f, n = net ?? g + f;
    if (g + f !== n) add("warning", "Gross plus fee is not net on this row", `${type}: ${money(g, cur)} + ${money(f, cur)} is ${money(g + f, cur)} but the report says ${money(n, cur)}. The net is used.`, i + 1);
    const s = bucket(cur);
    const posted = parseDate(get(cells, "date"), opts.dateOrder);
    const base = { line: i + 1, type, orderId: get(cells, "id"), id: get(cells, "id"), posted, desc: get(cells, "desc") || get(cells, "name") };
    const gAdj = n - f; // gross component, so gross + fee == net always holds
    if (gAdj !== 0) s.rows.push({ ...base, part: "gross", amount: gAdj });
    if (f !== 0) s.rows.push({ ...base, part: "fee", amount: f });
    s.chain.push({ line: i + 1, net: n, balance: bal });
    rows++;
  }
  for (const s of byCur.values()) {
    // Opening balance = first balance minus its own net. Every later row must land on the previous balance + its net.
    const withBal = s.chain.filter((c) => c.balance !== null);
    if (withBal.length === s.chain.length && s.chain.length) {
      let prev = s.chain[0].balance - s.chain[0].net, breaks = 0;
      for (const c of s.chain) {
        if (prev + c.net !== c.balance) { breaks++; if (breaks <= 3) add("error", `Balance column breaks at this row (${s.currency})`, `Previous balance ${money(prev, s.currency)} plus net ${money(c.net, s.currency)} is ${money(prev + c.net, s.currency)}, but the file says ${money(c.balance, s.currency)}. Rows are missing or out of order above this line.`, c.line); }
        prev = c.balance;
      }
      if (breaks > 3) add("error", `${breaks - 3} more Balance breaks in ${s.currency}`, "Only the first three are listed.");
      s.total = s.chain[s.chain.length - 1].balance - (s.chain[0].balance - s.chain[0].net);
    }
    s.openBalance = s.chain.length && s.chain[0].balance !== null ? s.chain[0].balance - s.chain[0].net : null;
    s.closeBalance = s.chain.length ? s.chain[s.chain.length - 1].balance : null;
  }
  if (memo) add("info", `${memo} memo row${memo === 1 ? "" : "s"} skipped`, "Rows whose Balance Impact is Memo (authorisations, orders) do not move the balance.");
  if (skipped) add("info", `${skipped} pending, denied or cancelled row${skipped === 1 ? "" : "s"} skipped`, "They did not move the balance. Download again once they complete.");
  const settlements = [...byCur.values()].filter((s) => s.rows.length);
  if (!settlements.length) add("error", "No transactions found", "The header was read but no completed row moved the balance.");
  return { settlements, findings, summary: { rows, settlements: settlements.length } };
}
export const parseSettlements = parsePayouts;

// ---- categorising ------------------------------------------------------------

export function categoryOf(row) {
  const type = row.type.toLowerCase();
  if (row.part === "fee") return "processing";
  if (/refund/.test(type)) return "refunds";
  if (/chargeback|dispute|reversal|hold on balance|release|reserve/.test(type)) return "disputes";
  if (/withdraw|bank deposit|add funds|transfer to bank|transfer from bank|bank transfer/.test(type)) return "transfers";
  if (/currency conversion/.test(type)) return "conversion";
  if (/payment|checkout|sale|invoice|subscription|donation|purchase|shopping cart|virtual terminal|qr|order/.test(type)) return row.amount < 0 ? "purchases" : "sales";
  return "uncategorised";
}

// ---- journals ----------------------------------------------------------------

const lastDay = (ym) => { const [y, m] = ym.split("-").map(Number); return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`; };

// split: "month" (default) writes one journal per calendar month a settlement touches.
export function buildJournals(settlements, opts = {}) {
  const mapping = opts.mapping || defaultMapping();
  const split = opts.split || "month";
  const findings = [];
  const journals = [];
  for (const s of settlements) {
    const sum = s.rows.reduce((a, r) => a + r.amount, 0);
    const endDate = s.end || [...s.rows].map((r) => r.posted).filter(Boolean).sort().pop() || null;
    const cur = s.currency || "USD";
    if (s.total === null) findings.push({ severity: "warning", title: `${s.id} has no Balance column`, detail: "The running balance could not be used to prove the rows are complete.", line: 0 });
    else if (s.total !== sum) findings.push({ severity: "error", title: `${s.id}: rows add up to ${money(sum, cur)} but the Balance column moved by ${money(s.total, cur)}`, detail: `Off by ${money(s.total - sum, cur)}. Rows are missing from the download, or an amount was skipped. Do not post this journal until the figures agree.`, line: 0 });
    const periods = new Map();
    let undated = 0, outside = 0;
    for (const r of s.rows) {
      let ym = r.posted ? r.posted.slice(0, 7) : (endDate || "").slice(0, 7);
      if (!r.posted) undated++;
      if (r.posted && s.start && s.end && (r.posted < s.start || r.posted > s.end)) outside++;
      if (split === "none") ym = (endDate || ym || "").slice(0, 7);
      if (!ym) ym = "undated";
      if (!periods.has(ym)) periods.set(ym, new Map());
      const cat = categoryOf(r), m = periods.get(ym);
      const e = m.get(cat) || { net: 0, count: 0 };
      e.net += r.amount; e.count++; m.set(cat, e);
    }
    if (undated) findings.push({ severity: "warning", title: `${undated} row${undated === 1 ? "" : "s"} in ${s.id} had no posted date`, detail: "They were placed in the settlement's final month.", line: 0 });
    if (outside) findings.push({ severity: "info", title: `${outside} row${outside === 1 ? "" : "s"} in ${s.id} posted outside its start and end dates`, detail: "They are journalled in the month they posted.", line: 0 });
    const keys = [...periods.keys()].sort();
    if (keys.length > 1) findings.push({ severity: "info", title: `${s.id} spans ${keys.length} months`, detail: `Written as ${keys.length} journals (${keys.join(", ")}), each balanced to the PayPal account, so every month's revenue and fees land in the month they happened. Together they move the PayPal account by exactly what the Balance column moved.`, line: 0 });
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
      if (net !== 0 || !lines.length) lines.push({ category: "clearing", account: mapping.clearing, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0, memo: `${s.id}${keys.length > 1 ? ` (${ym})` : ""}` });
      journals.push({ settlementId: s.id, period: ym, date, deposit: s.deposit, currency: cur, narration: `${s.id}${keys.length > 1 ? ` ${ym}` : ""}`, lines, clearing: net });
    });
    const unknown = s.rows.filter((r) => categoryOf(r) === "uncategorised");
    if (unknown.length) findings.push({ severity: "warning", title: `${s.id} has ${unknown.length} item${unknown.length === 1 ? "" : "s"} no rule recognised`, detail: `${[...new Set(unknown.map((r) => r.desc || r.type))].slice(0, 5).join(", ")}. They are journalled to "${mapping.uncategorised}" so the journal still equals the Balance column's movement. Review them and reclassify by hand if needed.`, line: unknown[0].line });
  }
  return { journals, findings };
}

export function uncategorisedRows(settlements) {
  return settlements.flatMap((s) => s.rows.filter((r) => categoryOf(r) === "uncategorised").map((r) => ({ settlement: s.id, ...r })));
}

export function reconciliation(settlements, journals) {
  return settlements.map((s) => {
    const js = journals.filter((j) => j.settlementId === s.id);
    const sum = js.reduce((a, j) => a + j.clearing, 0);
    return { id: s.id, deposit: s.deposit, currency: s.currency || "USD", stated: s.total, journalled: sum, periods: js.map((j) => ({ period: j.period, date: j.date, clearing: j.clearing })), agrees: s.total === null ? null : s.total === sum };
  });
}

export function validate(text, opts = {}) {
  const p = parseSettlements(text, opts);
  const b = buildJournals(p.settlements, opts);
  const findings = [...p.findings, ...b.findings];
  const order = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b2) => order[a.severity] - order[b2.severity]);
  return { settlements: p.settlements, journals: b.journals, findings, reconciliation: reconciliation(p.settlements, b.journals), summary: { ...p.summary, journals: b.journals.length } };
}

// ---- exports -----------------------------------------------------------------

const csvCell = (v) => { const s = String(v ?? ""); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csvRow = (a) => a.map(csvCell).join(",");
const fmtDate = (iso, order) => { if (!iso) return ""; const [y, m, d] = iso.split("-"); return order === "dmy" ? `${d}/${m}/${y}` : order === "mdy" ? `${m}/${d}/${y}` : iso; };

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
  for (const j of journals) for (const l of j.lines) rows.push(csvRow([`${j.settlementId}${j.period && j.period !== "undated" && journalsOf(journals, j.settlementId) > 1 ? "-" + j.period : ""}`, fmtDate(j.date, o.dateOrder || "mdy"), l.account, l.debit ? dollars(l.debit) : "", l.credit ? dollars(l.credit) : "", l.memo, "", j.currency]));
  return rows.join("\r\n") + "\r\n";
}
const journalsOf = (journals, id) => journals.filter((j) => j.settlementId === id).length;

// QuickBooks Desktop IIF general journal: positive = debit, a transaction's lines sum to zero.
export function toIif(journals) {
  const t = (s) => String(s ?? "").replace(/[\t\r\n]+/g, " ");
  const out = ["!TRNS\tTRNSID\tTRNSTYPE\tDATE\tACCNT\tAMOUNT\tDOCNUM\tMEMO", "!SPL\tSPLID\tTRNSTYPE\tDATE\tACCNT\tAMOUNT\tDOCNUM\tMEMO", "!ENDTRNS"];
  for (const j of journals) {
    const date = fmtDate(j.date, "mdy"), doc = t(`${j.settlementId}${journalsOf(journals, j.settlementId) > 1 ? "-" + j.period : ""}`);
    j.lines.forEach((l, i) => out.push(`${i === 0 ? "TRNS" : "SPL"}\t\tGENERAL JOURNAL\t${date}\t${t(l.account)}\t${((l.debit - l.credit) / 100).toFixed(2)}\t${doc}\t${t(l.memo)}`));
    out.push("ENDTRNS");
  }
  return out.join("\r\n") + "\r\n";
}

export function journalsCsv(journals) {
  const rows = [csvRow(["settlement", "period", "date", "category", "account", "debit", "credit", "memo"])];
  for (const j of journals) for (const l of j.lines) rows.push(csvRow([j.settlementId, j.period, j.date, l.category, l.account, l.debit ? dollars(l.debit) : "", l.credit ? dollars(l.credit) : "", l.memo]));
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

const HEAD = ["Date", "Time", "TimeZone", "Name", "Type", "Status", "Currency", "Gross", "Fee", "Net", "Transaction ID", "Item Title", "Balance", "Balance Impact"];

// items: [type, date (YYYY-MM-DD), gross, fee, title, name, status?, impact?]; oldest first. The Balance
// column is computed from `opening`, and the file is written newest-first, as PayPal downloads it.
export function buildReport({ items, opening = 1000, currency = "USD", mdy = true }) {
  const c = (n) => Math.round(n * 100);
  let bal = c(opening);
  const q = (v) => { const t = String(v); return /[",]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const fmt = (n) => (n / 100).toFixed(2);
  const rows = items.map(([type, date, gross, fee, title, name, status = "Completed", impact = "Credit"], i) => {
    const net = c(gross) + c(fee);
    if (impact !== "Memo") bal += net;
    const [y, m, d] = date.split("-");
    const shown = bal;
    return [mdy ? `${m}/${d}/${y}` : `${d}/${m}/${y}`, `10:${String(i).padStart(2, "0")}:00`, "PDT", name || "", type, status, currency, fmt(c(gross)), fmt(c(fee)), fmt(net), `TX${1000 + i}`, title || "", fmt(shown), impact === "Memo" ? "Memo" : net < 0 ? "Debit" : "Credit"].map(q).join(",");
  });
  return [HEAD.join(","), ...rows.reverse()].join("\n") + "\n";
}

const SAMPLE_ITEMS = [
  ["Website Payment", "2026-09-28", 129.99, -4.07, "Order 1001", "Pat Example"],
  ["Express Checkout Payment", "2026-09-29", 49.0, -1.75, "Order 1002", "Sam Example"],
  ["Subscription Payment", "2026-09-30", 19.0, -0.85, "Monthly plan", "Alex Example"],
  ["General Withdrawal", "2026-09-30", -150.0, 0, "Transfer to bank", ""],
  ["Payment Refund", "2026-10-02", -49.0, 1.75, "Refund order 1002", "Sam Example"],
  ["Website Payment", "2026-10-02", 79.0, -2.59, "Order 1003", "Jo Example"],
  ["Chargeback", "2026-10-03", -79.0, 0, "Chargeback order 1003", "Jo Example"],
  ["Payment Sent", "2026-10-04", -25.0, 0, "Domain renewal", "Registrar Inc"],
  ["Authorization", "2026-10-05", 60.0, 0, "Pre-auth", "Kim Example", "Pending", "Memo"],
  ["Mobile Payment", "2026-10-06", 5.0, -0.46, "Tip", "Lee Example"],
];

export const sampleReport = () => buildReport({ items: SAMPLE_ITEMS });
// The same download after a hand edit: rows missing so the Balance column breaks, plus an amount that is not a number.
export function sampleBrokenReport() {
  const items = SAMPLE_ITEMS.filter((r) => r[0] !== "Subscription Payment");
  return buildReport({ items }) + buildReportBad();
}
function buildReportBad() { return `10/06/2026,11:00:00,PDT,Bad Row,Website Payment,Completed,USD,12..5,0.00,12..5,TXBAD,Bad amount,0.00,Credit\n`; }
