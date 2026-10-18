// YouTube / Google AdSense payments export -> accounting journal.
//
// AdSense pays creators once a month, for the previous month's earnings. A creator outside the US also
// sees US tax withheld by Google (the rows that appear once the tax interview is done), and is usually
// paid in a currency that is not the one the books are kept in. Bookkeepers need that split into
// revenue, withholding-tax receivable (a separate asset account, claimable against the home tax bill),
// the bank deposit, and the realised FX difference between the rate the revenue was earned at and the
// rate the cash arrived at. This module reads the payments export (Date, Description, Amount, and a
// Currency column when there is one), classifies each row, values every foreign row at a rate you type,
// and writes one balanced journal per calendar month of payment for Xero, QuickBooks Online,
// QuickBooks Desktop (IIF) and a plain CSV.
//
// Model: a payment row is money that reached the bank, net of withholding. A withholding row is tax
// Google kept on top of that, so revenue is payment + withholding. Revenue is booked at the previous
// month's rate (AdSense pays last month's earnings) when you typed one, otherwise at the payment-date
// rate; the bank and the withholding receivable are booked at the payment-date rate; the difference is
// the realised FX line. Every journal balances by construction, and a typed bank total can be checked.
//
// The export's column names and each importer's column layout are from memory of public Google and
// accounting help documents; no real AdSense export and no live Xero or QuickBooks import was available
// when this was written. Column names are matched by several aliases, and a row no rule explains is
// never dropped: it lands in an "uncategorised" line and is reported.
//
// Everything is integer cents (rates are floats, values rounded per row). No network, no DOM.

export const CATEGORIES = {
  revenue: { label: "AdSense revenue (gross of withholding)", account: "AdSense Revenue" },
  withholding: { label: "US tax withheld by Google (receivable)", account: "US Tax Withholding Receivable" },
  adjustments: { label: "AdSense adjustments and reversals", account: "AdSense Adjustments" },
  fx: { label: "Realised FX gain or loss", account: "Realised FX Gain/Loss" },
  uncategorised: { label: "Uncategorised AdSense items", account: "AdSense Uncategorised" },
  bank: { label: "Bank received", account: "Bank" },
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

const norm = (h) => h.trim().toLowerCase().replace(/^﻿/, "").replace(/\(.*\)$/, "").trim().replace(/[\s_]+/g, "-").replace(/-+$/, "");

export function parseAmount(s) {
  let t = String(s ?? "").trim().replace(/\s/g, "").replace(/^[$€£]|[$€£]$/g, "");
  if (t === "") return null;
  let neg = false;
  const par = t.match(/^\((.*)\)$/);
  if (par) { neg = true; t = par[1]; }
  t = t.replace(/^[$€£]/, "");
  let u = t;
  if (/^-?\d{1,3}(\.\d{3})+,\d{1,2}$/.test(t)) u = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d+,\d{1,2}$/.test(t)) u = t.replace(",", ".");
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) u = t.replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(u)) return NaN;
  const v = Math.round(parseFloat(u) * 100);
  return neg ? -v : v;
}

export function parseRate(s) {
  const t = String(s ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) && v > 0 ? v : NaN;
}

// Returns YYYY-MM-DD or null. Accepts ISO (with a time), "21 Sep 2026", "Sep 21, 2026", DD.MM.YYYY and slashed dates read per `order`.
export function parseDate(s, order = "mdy") {
  const t = String(s ?? "").trim();
  if (!t) return null;
  const MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  let y, m, d, x;
  if ((x = t.match(/^(\d{4})-(\d{2})-(\d{2})/))) [y, m, d] = [x[1], x[2], x[3]];
  else if ((x = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/))) [d, m, y] = [x[1], x[2], x[3]];
  else if ((x = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) { if (order === "dmy") [d, m, y] = [x[1], x[2], x[3]]; else [m, d, y] = [x[1], x[2], x[3]]; }
  else if ((x = t.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})/))) { const mi = MON.indexOf(x[2].toLowerCase()); if (mi < 0) return null; [d, m, y] = [x[1], mi + 1, x[3]]; }
  else if ((x = t.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/))) { const mi = MON.indexOf(x[1].toLowerCase()); if (mi < 0) return null; [m, d, y] = [mi + 1, x[2], x[3]]; }
  else return null;
  const dt = new Date(Date.UTC(+y, +m - 1, +d));
  if (dt.getUTCFullYear() !== +y || dt.getUTCMonth() !== +m - 1 || dt.getUTCDate() !== +d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// What a row's description says it is. Withholding wins over payment ("Tax withheld on payment").
export function rowKind(desc) {
  const t = String(desc || "").toLowerCase();
  if (/withh|\btax\b|\birs\b|1042|backup/.test(t)) return "withholding";
  if (/revers|adjust|chargeback|invalid|clawback|correct|recover|deduct/.test(t)) return "adjustments";
  if (/payment|paid|issued|transfer|earning|wire|eft|sent|payout/.test(t)) return "payment";
  return "uncategorised";
}

// The rates you type: one per line, "[CUR] YYYY-MM-DD rate" or "[CUR] YYYY-MM rate", base currency per 1 unit of CUR.
// A line without a currency applies to every foreign currency that has no lines of its own.
export function parseRates(text) {
  const byCur = new Map(), errors = [];
  const get = (c) => { if (!byCur.has(c)) byCur.set(c, { daily: new Map(), monthly: new Map() }); return byCur.get(c); };
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) return;
    const m = line.match(/^(?:([A-Za-z]{3})\s+)?(\d{4}-\d{2}(?:-\d{2})?)\s*[,=:;\s]\s*([0-9][0-9.,]*)$/);
    const rate = m ? parseRate(m[3]) : null;
    if (!m || !rate || Number.isNaN(rate)) { errors.push(`Rate line ${i + 1}: expected "USD 2026-09-21 0.7350" or "2026-09 0.7350", got "${line}"`); return; }
    const g = get((m[1] || "*").toUpperCase());
    if (m[2].length === 10) { if (!parseDate(m[2])) { errors.push(`Rate line ${i + 1}: ${m[2]} is not a date`); return; } g.daily.set(m[2], rate); }
    else g.monthly.set(m[2], rate);
  });
  return { byCur, errors };
}

const prevMonth = (ym) => { const [y, m] = ym.split("-").map(Number); const d = new Date(Date.UTC(y, m - 2, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
const lastDay = (ym) => { const [y, m] = ym.split("-").map(Number); return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`; };
const tableFor = (rates, cur) => (rates && (rates.byCur.get(cur) || rates.byCur.get("*"))) || null;

// Exact day; else the latest earlier day; else that month's rate; else the earliest later day.
export function rateFor(rates, cur, date) {
  const t = tableFor(rates, cur);
  if (!t || !date) return null;
  if (t.daily.has(date)) return t.daily.get(date);
  const days = [...t.daily.keys()].sort();
  let before = null; for (const k of days) if (k <= date) before = k;
  if (before) return t.daily.get(before);
  if (t.monthly.has(date.slice(0, 7))) return t.monthly.get(date.slice(0, 7));
  const after = days.find((k) => k > date);
  return after ? t.daily.get(after) : null;
}

// The rate revenue is earned at: the month before the payment (AdSense pays last month's earnings).
function earnedRate(rates, cur, date) {
  const t = tableFor(rates, cur);
  const pm = prevMonth(date.slice(0, 7));
  if (!t) return null;
  if (t.monthly.has(pm)) return t.monthly.get(pm);
  if (t.daily.has(lastDay(pm))) return t.daily.get(lastDay(pm));
  return null;
}

export function parseRows(text, opts = {}) {
  const findings = [];
  const add = (severity, title, detail, line) => findings.push({ severity, title, detail, line: line || 0 });
  const lines = String(text || "").replace(/^﻿/, "").split(/\r?\n/);
  const first = lines.findIndex((l) => l.trim());
  const none = { rows: [], findings };
  if (first < 0) { add("error", "The file is empty", "Paste or choose an AdSense payments CSV."); return none; }
  const d = (lines[first].match(/\t/g) || []).length > (lines[first].match(/,/g) || []).length ? "\t" : ",";
  const rawHead = splitLine(lines[first], d);
  const head = rawHead.map(norm);
  const col = (...names) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; };
  const I = {
    date: col("date", "payment-date", "paid-on", "transaction-date", "issued", "date-issued"),
    desc: col("description", "transaction", "details", "type", "transaction-type", "payment-type"),
    amount: col("amount", "payment-amount", "amount-paid", "payment", "total"),
    currency: col("currency", "payment-currency", "currency-code"),
  };
  const missing = [];
  if (I.date < 0) missing.push("date");
  if (I.amount < 0) missing.push("amount");
  if (missing.length) {
    add("error", "This does not look like an AdSense payments export", `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. In AdSense open Payments > Transactions (or Payments > Payment history) and download the CSV, then paste the whole file here.`, first + 1);
    return none;
  }
  const headerCur = I.amount >= 0 ? (rawHead[I.amount].match(/\(([A-Za-z]{3})\)\s*$/) || [])[1] : null;
  const fileCur = (opts.currency || headerCur || opts.base || "USD").toUpperCase();
  const get = (cells, k) => (I[k] >= 0 ? (cells[I[k]] ?? "").trim() : "");
  const rows = [];
  for (let i = first + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = splitLine(lines[i], d);
    const desc = get(cells, "desc");
    const date = parseDate(get(cells, "date"), opts.dateOrder);
    let amount = parseAmount(get(cells, "amount"));
    if (amount === null) { add("warning", "Row has no amount", `Line ${i + 1} was skipped.`, i + 1); continue; }
    if (Number.isNaN(amount)) { add("error", `The amount on line ${i + 1} is not a number`, "The row is left out, so the journal will not match the bank.", i + 1); continue; }
    if (!date) { add("error", `The date on line ${i + 1} is not a date`, "The row is left out; it cannot be placed in a month. Check the date format setting.", i + 1); continue; }
    if (amount === 0) continue;
    const kind = rowKind(desc);
    if (kind === "withholding") amount = Math.abs(amount);
    if (kind === "payment" && amount < 0) add("warning", `Line ${i + 1}: a payment is negative`, "It is booked as a negative revenue row. If this is a reversal, describe it as one; if the sign is wrong the journal will be wrong.", i + 1);
    rows.push({ line: i + 1, date, desc, kind, amount, currency: (get(cells, "currency") || fileCur).toUpperCase() });
  }
  if (!rows.length && !findings.some((f) => f.severity === "error")) add("error", "No payment rows found", "The header was read but there were no data rows.");
  return { rows, findings };
}

// ---- journals ----------------------------------------------------------------

// opts: base (currency the books are kept in), rates (parseRates result), revenueRate ("earned" | "payment"),
// split ("month" | "none"), mapping, bankTotal (base cents actually received in the bank, to check against).
export function buildJournals(rows, opts = {}) {
  const mapping = opts.mapping || defaultMapping();
  const base = (opts.base || "USD").toUpperCase();
  const rates = opts.rates || { byCur: new Map() };
  const mode = opts.revenueRate || "earned";
  const split = opts.split || "month";
  const findings = [];
  const add = (severity, title, detail) => findings.push({ severity, title, detail, line: 0 });
  const periods = new Map();
  const workings = [];
  const missingRate = new Map();
  let bankBooked = 0, fxTotal = 0, usedEarned = 0, fellBack = 0;
  const foreignCur = new Set();
  const endAll = rows.map((r) => r.date).sort().pop() || null;
  for (const r of rows) {
    const foreign = r.currency !== base;
    if (foreign) foreignCur.add(r.currency);
    const pay = foreign ? rateFor(rates, r.currency, r.date) : 1;
    if (!pay) { if (!missingRate.has(r.currency)) missingRate.set(r.currency, []); missingRate.get(r.currency).push(r.date); continue; }
    let acc = pay;
    if (foreign && (r.kind === "payment" || r.kind === "withholding") && mode === "earned") {
      const e = earnedRate(rates, r.currency, r.date);
      if (e) { acc = e; usedEarned++; } else fellBack++;
    }
    const ym = split === "none" ? endAll.slice(0, 7) : r.date.slice(0, 7);
    if (!periods.has(ym)) periods.set(ym, { map: new Map(), last: r.date });
    const p = periods.get(ym);
    if (r.date > p.last) p.last = r.date;
    const put = (k, v) => { if (!v) return; const e = p.map.get(k) || { net: 0, count: 0 }; e.net += v; e.count++; p.map.set(k, e); };
    const cash = Math.round(r.amount * pay);
    let revenueBase = 0, fx = 0;
    if (r.kind === "payment" || r.kind === "withholding") {
      revenueBase = Math.round(r.amount * acc);
      fx = cash - revenueBase;
      put(r.kind === "payment" ? "bank" : "withholding", cash);
      put("revenue", -revenueBase);
      put("fx", -fx);
      if (r.kind === "payment") bankBooked += cash;
      fxTotal += fx;
    } else {
      put("bank", cash);
      put(r.kind, -cash);
      bankBooked += cash;
    }
    workings.push({ line: r.line, date: r.date, description: r.desc, kind: r.kind, currency: r.currency, amount: r.amount, payRate: pay, earnedRate: acc, cash, revenue: revenueBase, fx });
  }
  for (const [cur, dates] of missingRate) add("error", `No ${cur}-to-${base} rate for ${dates.length} row${dates.length === 1 ? "" : "s"}`, `${[...new Set(dates)].slice(0, 4).join(", ")}${dates.length > 4 ? " and more" : ""} are left out of the journals. Type at least one rate (for example "${cur} ${dates[0]} 1.0850", or "${cur} ${dates[0].slice(0, 7)} 1.0850" for a month) in the rates box: ${base} per 1 ${cur}, from your own source (your bank's, ECB or the rate you use for the books).`);
  if (foreignCur.size && mode === "earned" && fellBack) add("info", `${fellBack} foreign row${fellBack === 1 ? "" : "s"} had no earned-month rate`, `They are booked at the payment-date rate, so they carry no FX line. Type a month rate (for example "${[...foreignCur][0]} ${prevMonth((rows[0] || { date: "2026-10-01" }).date.slice(0, 7))} 1.0850") for the month the earnings belong to.`);
  if (foreignCur.size && (mode === "payment" || (!usedEarned && !fellBack))) add("info", "Revenue is booked at the payment-date rate", "So there is no realised FX line. Switch the revenue rate to the month earned if your books accrue AdSense revenue at an earlier rate.");
  const journals = [];
  const keys = [...periods.keys()].sort();
  keys.forEach((ym, idx) => {
    const { map: m, last } = periods.get(ym);
    const lines = [];
    for (const k of CATEGORY_ORDER) {
      if (!m.has(k)) continue;
      const { net, count } = m.get(k);
      if (net === 0) continue;
      lines.push({ category: k, account: mapping[k], debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0, memo: `${CATEGORIES[k].label} (${count} row${count === 1 ? "" : "s"})` });
    }
    const diff = lines.reduce((a, l) => a + l.debit - l.credit, 0);
    if (diff !== 0) lines.push({ category: "fx", account: mapping.fx, debit: diff < 0 ? -diff : 0, credit: diff > 0 ? diff : 0, memo: "Rounding" });
    const date = idx === keys.length - 1 ? last : lastDay(ym);
    if (lines.length) journals.push({ id: `ADSENSE-${ym}`, period: ym, date, currency: base, narration: `AdSense payments ${ym}`, lines, bank: lines.filter((l) => l.category === "bank").reduce((a, l) => a + l.debit - l.credit, 0) });
  });
  if (keys.length > 1) add("info", `The export spans ${keys.length} months`, `Written as ${keys.length} journals (${keys.join(", ")}), each balanced on its own and dated inside its own month.`);
  if (rows.some((r) => r.kind === "withholding")) {
    const total = rows.filter((r) => r.kind === "withholding").length;
    add("info", `${total} US tax withholding row${total === 1 ? "" : "s"} booked to ${mapping.withholding}`, "Each is added to revenue (the payment row is taken as the amount after withholding) and held as a receivable, to be claimed against your home tax or reversed per your accountant. If your export already shows the payment before withholding, the revenue is overstated by that amount.");
  }
  const unk = rows.filter((r) => r.kind === "uncategorised");
  if (unk.length) add("warning", `${unk.length} row${unk.length === 1 ? "" : "s"} no rule recognised`, `${[...new Set(unk.map((r) => r.desc || "(blank)"))].slice(0, 5).join(", ")}. They are journalled to "${mapping.uncategorised}" against the bank so nothing is dropped. Review and reclassify by hand.`);
  const recon = { currency: base, stated: opts.bankTotal != null && Number.isFinite(opts.bankTotal) ? opts.bankTotal : null, booked: bankBooked, agrees: null };
  if (recon.stated !== null) {
    recon.agrees = recon.stated === bankBooked;
    if (!recon.agrees) add("error", `Bank rows add up to ${money(bankBooked, base)} but you typed ${money(recon.stated, base)}`, `Off by ${money(recon.stated - bankBooked, base)}. A payment rate may differ from the one your bank used (type the day's actual rate), or rows are missing from the paste. Do not post until the figures agree.`);
  } else if (rows.length) add("warning", "No bank total typed", `The payments add up to ${money(bankBooked, base)} in ${base}. Enter what actually reached your bank for these rows to check the rates.`);
  return { journals, findings, workings, reconciliation: recon, fx: { realised: fxTotal } };
}

export function validate(text, opts = {}) {
  const p = parseRows(text, opts);
  const b = buildJournals(p.rows, opts);
  const findings = [...p.findings, ...b.findings];
  const order = { error: 0, warning: 1, info: 2 };
  findings.sort((a, c) => order[a.severity] - order[c.severity]);
  return { rows: p.rows, journals: b.journals, findings, workings: b.workings, reconciliation: b.reconciliation, fx: b.fx, summary: { rows: p.rows.length, journals: b.journals.length } };
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
  for (const j of journals) for (const l of j.lines) rows.push(csvRow([j.id, fmtDate(j.date, o.dateOrder || "mdy"), l.account, l.debit ? dollars(l.debit) : "", l.credit ? dollars(l.credit) : "", l.memo, "", j.currency]));
  return rows.join("\r\n") + "\r\n";
}

// QuickBooks Desktop IIF general journal: positive = debit, a transaction's lines sum to zero.
export function toIif(journals) {
  const t = (s) => String(s ?? "").replace(/[\t\r\n]+/g, " ");
  const out = ["!TRNS\tTRNSID\tTRNSTYPE\tDATE\tACCNT\tAMOUNT\tDOCNUM\tMEMO", "!SPL\tSPLID\tTRNSTYPE\tDATE\tACCNT\tAMOUNT\tDOCNUM\tMEMO", "!ENDTRNS"];
  for (const j of journals) {
    const date = fmtDate(j.date, "mdy"), doc = t(j.id);
    j.lines.forEach((l, i) => out.push(`${i === 0 ? "TRNS" : "SPL"}\t\tGENERAL JOURNAL\t${date}\t${t(l.account)}\t${((l.debit - l.credit) / 100).toFixed(2)}\t${doc}\t${t(l.memo)}`));
    out.push("ENDTRNS");
  }
  return out.join("\r\n") + "\r\n";
}

export function journalsCsv(journals) {
  const rows = [csvRow(["journal", "period", "date", "category", "account", "debit", "credit", "memo"])];
  for (const j of journals) for (const l of j.lines) rows.push(csvRow([j.id, j.period, j.date, l.category, l.account, l.debit ? dollars(l.debit) : "", l.credit ? dollars(l.credit) : "", l.memo]));
  return rows.join("\r\n") + "\r\n";
}

export function workingsCsv(workings) {
  const rows = [csvRow(["line", "date", "description", "kind", "currency", "amount", "payment_rate", "revenue_rate", "cash_base", "revenue_base", "fx_base"])];
  for (const w of workings) rows.push(csvRow([w.line, w.date, w.description, w.kind, w.currency, dollars(w.amount), w.payRate, w.earnedRate, dollars(w.cash), dollars(w.revenue), dollars(w.fx)]));
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

const HEAD = ["Date", "Description", "Amount", "Currency"];
export function buildReport(items) {
  const csv = (v) => (/[",]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [HEAD.join(","), ...items.map(([date, desc, amount, cur = "USD"]) => [date, desc, typeof amount === "number" ? amount.toFixed(2) : amount, cur].map(csv).join(","))].join("\n") + "\n";
}

export const SAMPLE_BASE = "GBP";
export const sampleRatesText = () => "# GBP per 1 USD, from your own source\nUSD 2026-08 0.7500\nUSD 2026-09 0.7400\nUSD 2026-09-21 0.7350\nUSD 2026-10-21 0.7300\n";
const SAMPLE_ITEMS = [
  ["2026-09-21", "Google AdSense payment", 842.17],
  ["2026-09-21", "US tax withholding", -144.83],
  ["2026-10-21", "Google AdSense payment", 910.40],
  ["2026-10-21", "US tax withholding", -156.60],
];
export const sampleReport = () => buildReport(SAMPLE_ITEMS);
export const sampleOpts = () => ({ base: SAMPLE_BASE, rates: parseRates(sampleRatesText()) });
// What the bank would show for the sample: the two payments at the payment-date rates.
export const sampleBankTotal = () => validate(sampleReport(), sampleOpts()).reconciliation.booked;
// The same export after a hand edit: a euro row with no euro rate, an amount that is not a number,
// a row no rule knows, and a payment dropped so the bank total no longer agrees.
export function sampleBrokenReport() {
  return buildReport([
    SAMPLE_ITEMS[0], SAMPLE_ITEMS[1],
    ["2026-10-21", "Google AdSense payment", "9..10", "USD"],
    ["2026-10-21", "US tax withholding", -156.60],
    ["2026-10-22", "Google AdSense payment", 120.00, "EUR"],
    ["2026-10-23", "Mystery credit", 15.00],
  ]);
}
