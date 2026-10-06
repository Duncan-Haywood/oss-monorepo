// Upwork transaction history -> accounting journal.
//
// Upwork keeps a freelancer's money in an Upwork balance. Client payments (hourly, fixed price milestones,
// bonuses) arrive gross, Upwork's service fee comes off as its own negative row, Connects and Freelancer Plus are
// charged to the same balance, and a withdrawal to a bank or PayPal moves the money out. A bookkeeper therefore
// has to book income gross, the fees as an expense, and clear the Upwork balance against the withdrawals.
// This module reads the Upwork Transaction History CSV (Reports > Transaction history > Download CSV: Date,
// Ref ID, Type, Description, ..., Amount, Currency, Balance), books each row by its Type, proves the file is
// complete by walking the Balance column row to row (a missing or edited row breaks the chain), and writes
// balanced journals for Xero, QuickBooks Online, QuickBooks Desktop (IIF) and a plain CSV, one per month.
//
// The export's column names, its Type labels and each importer's layout are from memory of public Upwork and
// accounting help documents; no real Upwork export and no live Xero or QuickBooks import was available when
// this was written. Columns are matched by several aliases, a row no rule explains is never dropped (it lands in
// an "uncategorised" line and is reported), and the Balance check says whether the rows can be trusted.
//
// Everything is integer cents. Nothing here touches the network or the DOM.

export const CATEGORIES = {
  hourly: { label: "Upwork hourly contract earnings (gross)", account: "Upwork Hourly Income" },
  fixed: { label: "Upwork fixed-price and milestone earnings (gross)", account: "Upwork Fixed Price Income" },
  bonus: { label: "Upwork bonuses and tips (gross)", account: "Upwork Bonus Income" },
  fees: { label: "Upwork service, withdrawal and processing fees", account: "Upwork Fees" },
  connects: { label: "Connects, Freelancer Plus and ads", account: "Upwork Connects and Membership" },
  refunds: { label: "Refunds and reversals to clients", account: "Upwork Refunds" },
  withdrawals: { label: "Withdrawals to your bank or PayPal", account: "Bank (Upwork withdrawals)" },
  uncategorised: { label: "Uncategorised Upwork items", account: "Upwork Uncategorised" },
  clearing: { label: "Upwork balance (clearing)", account: "Upwork Balance" },
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

// "$1,234.56", "-$12.00", "(12.00)", "USD 5" and European "1.234,56" all read to cents. Empty is null, junk is NaN.
export function parseAmount(s) {
  let t = String(s ?? "").trim().replace(/\s/g, "");
  if (t === "") return null;
  t = t.replace(/^([-+]?)(?:[A-Za-z]{3})/, "$1").replace(/[$€£]/g, "");
  const paren = t.match(/^\((.*)\)$/);
  if (paren) t = "-" + paren[1];
  let u = t;
  if (/^-?\d{1,3}(\.\d{3})+,\d{1,2}$/.test(t)) u = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d+,\d{1,2}$/.test(t)) u = t.replace(",", ".");
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) u = t.replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(u)) return NaN;
  return Math.round(parseFloat(u) * 100);
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

// Returns YYYY-MM-DD or null. Accepts ISO (with a time), "Sep 28, 2026", DD.MM.YYYY, and slashed dates read per `order`.
export function parseDate(s, order = "mdy") {
  const t = String(s ?? "").trim();
  if (!t) return null;
  let y, m, d, x;
  if ((x = t.match(/^(\d{4})-(\d{2})-(\d{2})/))) [y, m, d] = [x[1], x[2], x[3]];
  else if ((x = t.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/)) && MONTHS[x[1].toLowerCase()]) [m, d, y] = [MONTHS[x[1].toLowerCase()], x[2], x[3]];
  else if ((x = t.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})/)) && MONTHS[x[2].toLowerCase()]) [d, m, y] = [x[1], MONTHS[x[2].toLowerCase()], x[3]];
  else if ((x = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/))) [d, m, y] = [x[1], x[2], x[3]];
  else if ((x = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) { if (order === "dmy") [d, m, y] = [x[1], x[2], x[3]]; else [m, d, y] = [x[1], x[2], x[3]]; }
  else return null;
  const dt = new Date(Date.UTC(+y, +m - 1, +d));
  if (dt.getUTCFullYear() !== +y || dt.getUTCMonth() !== +m - 1 || dt.getUTCDate() !== +d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Upwork Type labels, matched loosely and in this order: a "Withdrawal Fee" is a fee, not a withdrawal.
export function rowCategory(type) {
  const t = String(type || "").toLowerCase().trim();
  if (!t) return "uncategorised";
  if (/withdraw.*fee|fee.*withdraw|service fee|processing fee|transaction fee|marketplace fee|\bfee\b/.test(t)) return "fees";
  if (/withdraw|transfer to|payout|direct to|paypal payment/.test(t)) return "withdrawals";
  if (/connect|membership|freelancer plus|subscription|\bads?\b|advertis|boost|proposal/.test(t)) return "connects";
  if (/refund|chargeback|dispute|reversal|clawback|cancel/.test(t)) return "refunds";
  if (/hourly|timesheet|weekly|time\b/.test(t)) return "hourly";
  if (/fixed|milestone|escrow|contract|project|payment/.test(t)) return "fixed";
  if (/bonus|tip/.test(t)) return "bonus";
  return "uncategorised";
}

const ALL = "Upwork";

// The whole file is one account statement. Rows are walked in time order (Upwork lists newest first; the order is
// detected from the Balance column, or from the dates when there is none) so the running Balance can be proved.
// opts.expected, when given, is the balance Upwork shows after the last row.
export function parsePayouts(text, opts = {}) {
  const findings = [];
  const add = (severity, title, detail, line) => findings.push({ severity, title, detail, line: line || 0 });
  const lines = String(text || "").replace(/^﻿/, "").split(/\r?\n/);
  const first = lines.findIndex((l) => l.trim());
  const none = { payouts: [], findings, summary: { rows: 0, payouts: 0 } };
  if (first < 0) { add("error", "The file is empty", "Paste or choose an Upwork transaction history CSV."); return none; }
  const d = (lines[first].match(/\t/g) || []).length > (lines[first].match(/,/g) || []).length ? "\t" : ",";
  const head = splitLine(lines[first], d).map(norm);
  const col = (...names) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; };
  const I = {
    date: col("date", "transaction-date", "date-created", "datetime", "date-time"),
    id: col("ref-id", "reference-id", "reference", "transaction-id", "id", "ref"),
    type: col("type", "transaction-type"),
    desc: col("description", "memo", "details", "contract", "job"),
    amount: col("amount", "amount-in-usd", "usd-amount", "total"),
    currency: col("currency"),
    balance: col("balance", "balance-in-usd", "running-balance"),
  };
  const missing = [];
  if (I.date < 0) missing.push("date");
  if (I.type < 0) missing.push("type");
  if (I.amount < 0) missing.push("amount");
  if (missing.length) {
    add("error", "This does not look like an Upwork transaction history", `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. In Upwork open Reports > Transaction history, choose the date range and Download CSV, then paste the whole file here.`, first + 1);
    return none;
  }
  const get = (cells, k) => (I[k] >= 0 ? (cells[I[k]] ?? "").trim() : "");
  const rows = [];
  let currency = "";
  for (let i = first + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = splitLine(lines[i], d);
    const rid = get(cells, "id") || `line ${i + 1}`;
    const amount = parseAmount(get(cells, "amount")), bal = I.balance >= 0 ? parseAmount(get(cells, "balance")) : null;
    if (amount === null) { add("warning", "Row has no amount", `${rid} was skipped.`, i + 1); continue; }
    if (Number.isNaN(amount) || Number.isNaN(bal)) { add("error", `An amount on ${rid} is not a number`, "The row is left out, so the balance will not add up.", i + 1); continue; }
    const cur = get(cells, "currency").toUpperCase();
    if (cur && currency && cur !== currency) add("warning", "Mixed currencies in the export", `${cur} row among ${currency} rows. Journals assume one currency; Upwork's own Amount column is in your account currency.`, i + 1);
    if (cur && !currency) currency = cur;
    const type = get(cells, "type");
    const key = rowCategory(type);
    const created = parseDate(get(cells, "date"), opts.dateOrder);
    if (!created) add("warning", `Row ${rid} has no readable date`, `"${get(cells, "date")}" was not understood; the row is placed in the final month.`, i + 1);
    rows.push({ line: i + 1, id: rid, item: get(cells, "desc") || type, type, gross: key === "hourly" || key === "fixed" || key === "bonus" ? amount : 0, fee: key === "fees" ? -amount : 0, net: amount, bal, refunded: key === "refunds", parts: [{ k: key, amt: amount }], created });
  }
  if (!rows.length) { add("error", "No transaction rows found", "The header was read but there were no data rows."); return none; }

  // Put the rows in time order. With balances, the order that makes the running balance hold wins.
  const chain = (rs) => rs.reduce((n, r, j) => n + (j > 0 && r.bal !== null && rs[j - 1].bal !== null && rs[j - 1].bal + r.net === r.bal ? 1 : 0), 0);
  const fwd = rows, rev = [...rows].reverse();
  let ordered = fwd;
  const cf = chain(fwd), cr = chain(rev);
  if (cf !== cr) ordered = cr > cf ? rev : fwd;
  else { const a = fwd[0].created, z = fwd[fwd.length - 1].created; if (a && z && a > z) ordered = rev; }

  const haveBal = ordered.every((r) => r.bal !== null);
  let stated = null, opening = null;
  if (haveBal) {
    opening = ordered[0].bal - ordered[0].net;
    stated = ordered[ordered.length - 1].bal - opening;
    for (let j = 1; j < ordered.length; j++) {
      const p = ordered[j - 1], r = ordered[j], off = r.bal - p.bal - r.net;
      if (off !== 0) add("error", `Balance does not follow between ${p.id} and ${r.id}`, `The balance moved by ${money(r.bal - p.bal, currency || "USD")} but ${r.id} is ${money(r.net, currency || "USD")}: ${money(off, currency || "USD")} is missing or was edited (line ${p.line} to ${r.line}). A row may have been dropped from the paste or its amount changed.`, r.line);
    }
    if (opts.expected != null && Number.isFinite(opts.expected) && opts.expected !== ordered[ordered.length - 1].bal) add("warning", "The last balance in the file is not the balance you entered", `The file ends at ${money(ordered[ordered.length - 1].bal, currency || "USD")} but you entered ${money(opts.expected, currency || "USD")}. The export may stop before today, or newer rows are missing.`, 0);
  } else add("warning", "No Balance column, so completeness cannot be proved", "Without the running balance the page cannot tell if a row is missing. Download the full Transaction history (it includes Balance) and paste that.", 0);
  const effective = ordered.map((r) => r.created).filter(Boolean).sort().pop() || null;
  const group = { id: ALL, effective, stated, opening, currency, rows: ordered };
  return { payouts: [group], findings, summary: { rows: ordered.length, payouts: 1 } };
}

// What Upwork cost, against what was billed: the number a freelancer actually wants from the file.
export function feeSummary(payouts) {
  let gross = 0, fees = 0, connects = 0, refunds = 0, withdrawn = 0;
  for (const s of payouts) for (const r of s.rows) for (const p of r.parts) {
    if (p.k === "hourly" || p.k === "fixed" || p.k === "bonus") gross += p.amt;
    else if (p.k === "fees") fees -= p.amt;
    else if (p.k === "connects") connects -= p.amt;
    else if (p.k === "refunds") refunds -= p.amt;
    else if (p.k === "withdrawals") withdrawn -= p.amt;
  }
  return { gross, fees, connects, refunds, withdrawn, feeRate: gross > 0 ? fees / gross : null, allInRate: gross > 0 ? (fees + connects) / gross : null };
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
    if (s.stated === null) findings.push({ severity: "warning", title: "The Upwork balance could not be checked", detail: `The rows add up to ${money(sum, cur)}. Without a Balance column the page cannot prove nothing is missing.`, line: 0 });
    else if (s.stated !== sum) findings.push({ severity: "error", title: `Rows add up to ${money(sum, cur)} but the Upwork balance moved by ${money(s.stated, cur)}`, detail: `Off by ${money(s.stated - sum, cur)}. Rows are missing from the paste, or an amount was skipped or edited. Do not post these journals until the figures agree.`, line: 0 });

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
    if (undated) findings.push({ severity: "warning", title: `${undated} row${undated === 1 ? "" : "s"} had no readable date`, detail: "They were placed in the final month.", line: 0 });
    const keys = [...periods.keys()].sort();
    if (keys.length > 1) findings.push({ severity: "info", title: `The export spans ${keys.length} months`, detail: `Written as ${keys.length} journals (${keys.join(", ")}), each balanced to the Upwork balance account, so every month's revenue and fees land in the month they happened.`, line: 0 });
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
      if (net !== 0 || !lines.length) lines.push({ category: "clearing", account: mapping.clearing, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0, memo: `Change in Upwork balance (${ym})` });
      journals.push({ payoutId: s.id, period: ym, date, deposit: s.effective, currency: cur, narration: `Upwork transactions ${ym}`, lines, clearing: net });
    });
    const unknown = s.rows.filter((r) => r.parts.some((p) => p.k === "uncategorised"));
    if (unknown.length) findings.push({ severity: "warning", title: `${unknown.length} item${unknown.length === 1 ? "" : "s"} no rule recognised`, detail: `${[...new Set(unknown.map((r) => r.item || r.id))].slice(0, 5).join(", ")}. They are journalled to "${mapping.uncategorised}" so the journal still equals the net. Review them and reclassify by hand if needed.`, line: unknown[0].line });
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
    return { id: s.id, deposit: s.effective, currency: s.currency || "USD", stated: s.stated, journalled: sum, periods: js.map((j) => ({ period: j.period, date: j.date, clearing: j.clearing })), agrees: s.stated === null ? null : s.stated === sum };
  });
}

export function validate(text, opts = {}) {
  const p = parsePayouts(text, opts);
  const b = buildJournals(p.payouts, opts);
  const findings = [...p.findings, ...b.findings];
  const order = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b2) => order[a.severity] - order[b2.severity]);
  return { payouts: p.payouts, journals: b.journals, findings, reconciliation: reconciliation(p.payouts, b.journals), fees: feeSummary(p.payouts), summary: { ...p.summary, journals: b.journals.length } };
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

const HEAD = ["Date", "Ref ID", "Type", "Description", "Agency", "Freelancer", "Team", "Account Name", "PO", "Amount", "Amount in local currency", "Currency", "Balance", "Balance in local currency"];

// items: [date, type, description, amount] in time order. Upwork lists the newest row first, with the balance
// after each row. `skip` drops rows from the output but keeps the balances, as a hand-edited paste would.
export function buildReport({ currency = "USD", opening = 250, items, skip = [], mangle = {} }) {
  const csv = (v) => (/[",]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  let bal = Math.round(opening * 100);
  const rows = items.map(([date, type, desc, amt], n) => {
    const cents = Math.round(amt * 100);
    bal += cents;
    const amtText = mangle[n] ?? (cents < 0 ? "-" : "") + (Math.abs(cents) / 100).toFixed(2);
    return [date, `${1000000 + n}`, type, desc, "", "Sam Freelancer", "Sam Freelancer", "", "", amtText, amtText, currency, (bal / 100).toFixed(2), (bal / 100).toFixed(2)].map(csv).join(",");
  });
  const kept = rows.filter((_, n) => !skip.includes(n));
  return [HEAD.join(","), ...kept.reverse()].join("\n") + "\n";
}

const SAMPLE_ITEMS = [
  ["2026-09-18", "Hourly", "Website QA - week 37", 800.00],
  ["2026-09-18", "Service Fee", "Service Fee - Website QA", -80.00],
  ["2026-09-25", "Fixed Price", "Milestone 2 - Dashboard build", 1500.00],
  ["2026-09-25", "Service Fee", "Service Fee - Dashboard build", -150.00],
  ["2026-09-29", "Withdrawal", "Withdrawal to bank", -1800.00],
  ["2026-09-29", "Withdrawal Fee", "Wire fee", -2.00],
  ["2026-09-30", "Connects", "Connects purchase (80)", -12.00],
  ["2026-10-02", "Bonus", "Bonus - Dashboard build", 100.00],
  ["2026-10-02", "Service Fee", "Service Fee - Bonus", -10.00],
  ["2026-10-04", "Hourly", "Website QA - week 39", 640.00],
  ["2026-10-04", "Service Fee", "Service Fee - Website QA", -64.00],
  ["2026-10-05", "Refund", "Refund - Milestone 1", -200.00],
];

export const sampleReport = () => buildReport({ items: SAMPLE_ITEMS });
// The same history after a hand edit: the bonus row dropped from the paste (the balance no longer follows),
// one amount that is not a number, and a type no rule knows.
export function sampleBrokenReport() {
  const items = [...SAMPLE_ITEMS, ["2026-10-06", "Gift Card", "Promotional credit", 5.00], ["2026-10-06", "Hourly", "Website QA - week 40", 0]];
  return buildReport({ items, skip: [7], mangle: { 13: "6..4" } });
}
