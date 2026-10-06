// Wise balance statement -> accounting journal with realised FX gain or loss.
//
// A Wise multi-currency account is one bank account per currency. A business whose books are kept in
// one currency (the base currency) has to value every movement of a foreign balance in base currency,
// and when foreign money is spent, sent or converted, the difference between what it cost to acquire
// and what it was worth when it left is a realised exchange gain or loss. Almost nobody books it,
// because the statement carries no base-currency values and no cost.
//
// This module reads one Wise statement CSV (one currency balance), values each row in the base
// currency at the rate you supply for the date, tracks the balance's average cost, and writes a
// balanced journal per month for Xero, QuickBooks Online, QuickBooks Desktop (IIF) and plain CSV, with the
// realised FX on its own line and a workings CSV showing every row's rate, value, cost and gain.
// Running balances are proved: each row must follow from the one before it.
//
// Column names and importer layouts are from memory of public Wise and accounting help documents;
// no real Wise statement and no live import was available. Columns are matched by several aliases,
// and a statement whose running balance does not follow is reported, never silently journalled.
//
// Everything is integer cents (rates are floats, values rounded per row). No network, no DOM.

export const CATEGORIES = {
  bank: { label: "Wise balance", account: "Wise" },
  incoming: { label: "Money received", account: "Wise Incoming Payments" },
  outgoing: { label: "Money sent", account: "Wise Outgoing Payments" },
  card: { label: "Card spending", account: "Wise Card Spending" },
  fees: { label: "Wise fees", account: "Wise Fees" },
  interest: { label: "Interest and cashback", account: "Wise Interest Income" },
  fx: { label: "Realised FX gain or loss", account: "Realised FX Gain/Loss" },
  clearing: { label: "Conversions between Wise balances", account: "Wise Conversion Clearing" },
};
export const CATEGORY_ORDER = Object.keys(CATEGORIES);
export const defaultMapping = (cur = "") => ({ ...Object.fromEntries(CATEGORY_ORDER.map((k) => [k, CATEGORIES[k].account])), bank: cur ? `Wise ${cur}` : CATEGORIES.bank.account });

export function parseMapping(text, cur = "") {
  const out = defaultMapping(cur), errors = [];
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const m = line.match(/^([a-z]+)\s*[=:]\s*(.+)$/i);
    if (!m) { errors.push(`Line ${i + 1}: expected "category = account", got "${line}"`); return; }
    const key = m[1].toLowerCase();
    if (!CATEGORIES[key]) { errors.push(`Line ${i + 1}: unknown category "${m[1]}" (use ${CATEGORY_ORDER.join(", ")})`); return; }
    // The generic default for the balance account stands for "Wise <currency>", so it is not an override.
    if (key === "bank" && m[2].trim() === CATEGORIES.bank.account) return;
    out[key] = m[2].trim();
  });
  return { mapping: out, errors };
}
export const mappingText = (mapping = defaultMapping()) => CATEGORY_ORDER.map((k) => `${k} = ${mapping[k]}`).join("\n");

const dollars = (c) => (c < 0 ? "-" : "") + (Math.abs(c) / 100).toFixed(2);
export const money = (c, cur = "USD") => (c < 0 ? "-" : "") + Math.abs(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + cur;

// ---- parsing -----------------------------------------------------------------

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

export function parseRate(s) {
  const t = String(s ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) && v > 0 ? v : NaN;
}

// Returns YYYY-MM-DD or null. Wise writes DD-MM-YYYY; ISO, DD.MM.YYYY and slashed dates are also read.
export function parseDate(s, order = "dmy") {
  const t = String(s ?? "").trim();
  if (!t) return null;
  let y, m, d, x;
  if ((x = t.match(/^(\d{4})-(\d{2})-(\d{2})/))) [y, m, d] = [x[1], x[2], x[3]];
  else if ((x = t.match(/^(\d{1,2})[.-](\d{1,2})[.-](\d{4})/))) [d, m, y] = [x[1], x[2], x[3]];
  else if ((x = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) { if (order === "dmy") [d, m, y] = [x[1], x[2], x[3]]; else [m, d, y] = [x[1], x[2], x[3]]; }
  else return null;
  const dt = new Date(Date.UTC(+y, +m - 1, +d));
  if (dt.getUTCFullYear() !== +y || dt.getUTCMonth() !== +m - 1 || dt.getUTCDate() !== +d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// The rates you type: one per line, "YYYY-MM-DD rate" or "YYYY-MM rate", base currency per 1 unit of the statement's currency.
export function parseRates(text) {
  const daily = new Map(), monthly = new Map(), errors = [];
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) return;
    const m = line.match(/^(\d{4}-\d{2}(?:-\d{2})?)\s*[,=:;\s]\s*([0-9][0-9.,]*)$/);
    const rate = m ? parseRate(m[2]) : null;
    if (!m || !rate || Number.isNaN(rate)) { errors.push(`Rate line ${i + 1}: expected "2026-09-30 1.1050" or "2026-09 1.1050", got "${line}"`); return; }
    if (m[1].length === 10) { if (!parseDate(m[1])) { errors.push(`Rate line ${i + 1}: ${m[1]} is not a date`); return; } daily.set(m[1], rate); }
    else monthly.set(m[1], rate);
  });
  return { daily, monthly, errors };
}

// Exact day; else the latest earlier day; else that month's rate; else the earliest later day.
export function rateFor(rates, date) {
  if (!rates || !date) return null;
  if (rates.daily.has(date)) return rates.daily.get(date);
  const days = [...rates.daily.keys()].sort();
  let before = null; for (const k of days) if (k <= date) before = k;
  if (before) return rates.daily.get(before);
  if (rates.monthly.has(date.slice(0, 7))) return rates.monthly.get(date.slice(0, 7));
  const after = days.find((k) => k > date);
  return after ? rates.daily.get(after) : null;
}

const kindOf = (desc, amt, hasExchange) => {
  const t = String(desc || "").toLowerCase();
  if (hasExchange || /^(converted|conversion|exchanged|you converted)/.test(t) || /\bconverted\b.*\bto\b/.test(t)) return "conversion";
  if (/wise charges|wise fee|monthly fee|account fee|card fee|atm fee/.test(t) && amt < 0) return "fee";
  if (/interest|cashback|cash back|assets? (earnings|return)/.test(t) && amt > 0) return "interest";
  if (/card transaction|card payment|\bpos\b|\bcard\b/.test(t) && amt < 0) return "card";
  return amt >= 0 ? "incoming" : "outgoing";
};

export function parseStatement(text, opts = {}) {
  const findings = [];
  const add = (severity, title, detail, line) => findings.push({ severity, title, detail, line: line || 0 });
  const lines = String(text || "").replace(/^﻿/, "").split(/\r?\n/);
  const first = lines.findIndex((l) => l.trim());
  const none = { rows: [], currency: "", findings, feeMode: "included" };
  if (first < 0) { add("error", "The file is empty", "Paste or choose a Wise statement CSV."); return none; }
  const d = (lines[first].match(/\t/g) || []).length > (lines[first].match(/;/g) || []).length && (lines[first].match(/\t/g) || []).length > (lines[first].match(/,/g) || []).length ? "\t" : (lines[first].match(/;/g) || []).length > (lines[first].match(/,/g) || []).length ? ";" : ",";
  const head = splitLine(lines[first], d).map(norm);
  const col = (...names) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; };
  const I = {
    id: col("transferwise-id", "wise-id", "id", "transaction-id"),
    date: col("date"),
    datetime: col("date-time", "datetime"),
    amount: col("amount"),
    currency: col("currency"),
    desc: col("description", "details"),
    ref: col("payment-reference", "reference"),
    balance: col("running-balance", "balance"),
    from: col("exchange-from"),
    to: col("exchange-to"),
    rate: col("exchange-rate"),
    payer: col("payer-name"),
    payee: col("payee-name"),
    merchant: col("merchant"),
    fee: col("total-fees", "fees", "fee"),
  };
  const missing = [];
  if (I.amount < 0) missing.push("Amount");
  if (I.date < 0 && I.datetime < 0) missing.push("Date");
  if (I.currency < 0) missing.push("Currency");
  if (missing.length) {
    add("error", "This does not look like a Wise statement", `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. In Wise open the balance, choose Statements, pick CSV, and paste the whole file here (one currency at a time).`, first + 1);
    return none;
  }
  const get = (cells, k) => (I[k] >= 0 ? (cells[I[k]] ?? "").trim() : "");
  let rows = [], currency = "";
  for (let i = first + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = splitLine(lines[i], d);
    const amount = parseAmount(get(cells, "amount")), balance = parseAmount(get(cells, "balance")), fee = parseAmount(get(cells, "fee")), rate = parseRate(get(cells, "rate"));
    const label = get(cells, "id") || `line ${i + 1}`;
    if (amount === null || Number.isNaN(amount) || Number.isNaN(balance) || Number.isNaN(fee)) { add("error", `An amount on ${label} is not a number`, "The row is left out, so the running balance will not follow.", i + 1); continue; }
    const date = parseDate(get(cells, "date") || get(cells, "datetime"), opts.dateOrder);
    if (!date) { add("error", `The date on ${label} could not be read`, `"${get(cells, "date") || get(cells, "datetime")}". Wise writes DD-MM-YYYY; the row is left out.`, i + 1); continue; }
    const cur = get(cells, "currency").toUpperCase();
    if (cur && currency && cur !== currency) { add("error", "More than one currency in the file", `${cur} among ${currency} rows. Download one statement per currency balance.`, i + 1); continue; }
    if (cur && !currency) currency = cur;
    const from = get(cells, "from").toUpperCase(), to = get(cells, "to").toUpperCase();
    const desc = get(cells, "desc") || get(cells, "merchant") || get(cells, "ref");
    const counterparty = get(cells, "payee") || get(cells, "payer") || get(cells, "merchant");
    rows.push({ line: i + 1, id: label, date, time: get(cells, "datetime") || date, amount, balance: balance, fee: Math.abs(fee || 0), rate: rate || null, from, to, desc, counterparty, kind: kindOf(desc, amount, Boolean(from && to && from !== to)), seq: rows.length });
  }
  if (!rows.length) { add("error", "No transactions found", "The header was read but there were no data rows."); return { ...none, currency }; }
  // Wise lists newest first. Order by the balance chain when there is one, otherwise by date.
  const hasBal = rows.every((r) => r.balance !== null);
  const follows = (list, mode) => list.reduce((n, r, i) => (i && r.balance !== null && list[i - 1].balance !== null && list[i - 1].balance + r.amount - (mode === "extra" && r.amount < 0 ? r.fee : 0) === r.balance ? n + 1 : n), 0);
  const rev = [...rows].reverse();
  if (hasBal) rows = follows(rev, "included") + follows(rev, "extra") > follows(rows, "included") + follows(rows, "extra") ? rev : rows;
  else rows = [...rows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : b.seq - a.seq));
  const asRows = rows;
  let feeMode = "included";
  if (hasBal && asRows.some((r) => r.fee && r.amount < 0) && follows(asRows, "extra") > follows(asRows, "included")) feeMode = "extra";
  return { rows: asRows, currency, findings, feeMode, hasBalance: hasBal };
}

// ---- valuation and journals --------------------------------------------------

const lastDay = (ym) => { const [y, m] = ym.split("-").map(Number); return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`; };

// opts: base (currency the books are kept in), rates (parseRates result), openingCost (base cents for the opening balance),
// closing (expected closing balance, cents), mapping, split ("month" | "none").
export function buildJournals(parsed, opts = {}) {
  const findings = [];
  const add = (severity, title, detail, line) => findings.push({ severity, title, detail, line: line || 0 });
  const { rows, currency, feeMode } = parsed;
  const base = (opts.base || "USD").toUpperCase();
  const mapping = opts.mapping || defaultMapping(currency);
  const empty = { journals: [], workings: [], fx: { realised: 0, byMonth: [], position: null }, findings, base, currency };
  if (!rows.length) return empty;
  const foreign = currency !== base;
  const rates = opts.rates || { daily: new Map(), monthly: new Map() };
  const spot = (date) => (foreign ? rateFor(rates, date) : 1);

  if (foreign) {
    const gaps = [...new Set(rows.filter((r) => spot(r.date) === null).map((r) => r.date))];
    if (gaps.length || !rows.length) {
      add("error", `No ${currency}-to-${base} rate for ${gaps.length ? gaps.slice(0, 4).join(", ") + (gaps.length > 4 ? ` and ${gaps.length - 4} more dates` : "") : "this statement"}`, `Every row of a ${currency} balance has to be valued in ${base}. Type at least one rate (for example "${rows[0].date} 1.0850", or "${rows[0].date.slice(0, 7)} 1.0850" for a whole month) in the rates box: ${base} per 1 ${currency}, from your own source (your bank's, ECB or the rate you use for the books).`);
      return { ...empty, findings };
    }
  }
  // Opening position: the balance before the first row.
  const first = rows[0];
  let qty = first.balance !== null ? first.balance - first.amount + (feeMode === "extra" && first.amount < 0 ? first.fee : 0) : 0;
  let cost = 0;
  if (qty !== 0) {
    cost = opts.openingCost != null && Number.isFinite(opts.openingCost) ? opts.openingCost : Math.round(qty * spot(first.date));
    add("info", `Opening balance ${money(qty, currency)} valued at ${money(cost, base)}`, opts.openingCost != null && Number.isFinite(opts.openingCost) ? "Using the cost you typed in." : `No opening cost was typed in, so it is valued at the ${first.date} rate. Type the base-currency cost of the opening balance to carry gains over correctly from earlier periods.`);
  }
  // Running-balance proof.
  let breaks = 0;
  rows.forEach((r, i) => {
    if (r.balance === null) return;
    const prev = i ? rows[i - 1].balance : qty;
    const expect = prev + r.amount - (feeMode === "extra" && r.amount < 0 ? r.fee : 0);
    if (prev !== null && expect !== r.balance) {
      breaks++;
      if (breaks <= 5) add("error", `Running balance does not follow at ${r.id}`, `Previous balance ${money(prev, currency)} plus this row's ${money(r.amount, currency)} should give ${money(expect, currency)} but the statement says ${money(r.balance, currency)}. A row is missing, duplicated or edited; do not post this journal until it agrees.`, r.line);
    }
  });
  if (breaks > 5) add("error", `${breaks - 5} more running-balance breaks`, "Only the first five are listed.");
  const closing = rows[rows.length - 1].balance;
  if (opts.closing != null && Number.isFinite(opts.closing) && closing !== null && opts.closing !== closing) add("error", `Closing balance is ${money(closing, currency)} but you typed ${money(opts.closing, currency)}`, "The statement does not end where your Wise balance does. Rows are missing from the end (or the start) of the paste.");
  if (feeMode === "extra") add("info", "Fees are taken on top of the Amount", "The running balance only follows when the Total fees column is deducted in addition to Amount, so each fee is booked as an extra debit to the balance.");

  const months = new Map();
  const workings = [];
  const bump = (ym, k, base_, fgn) => { if (!base_) return; if (!months.has(ym)) months.set(ym, new Map()); const m = months.get(ym); const e = m.get(k) || { net: 0, foreign: 0, count: 0 }; e.net += base_; e.foreign += fgn; e.count++; m.set(k, e); };
  let negative = 0;
  for (const r of rows) {
    const ym = opts.split === "none" ? rows[rows.length - 1].date.slice(0, 7) : r.date.slice(0, 7);
    const sp = spot(r.date);
    let costOut = 0, valueIn = 0, fxGain = 0, rateUsed = sp, principalBase = 0, feeBase = 0;
    if (r.amount > 0) {
      let value = Math.round(r.amount * sp);
      if (r.kind === "conversion" && r.from === base && r.rate && foreign) { value = Math.round(r.amount / r.rate); rateUsed = r.rate ? 1 / r.rate : sp; }
      valueIn = value; qty += r.amount; cost += value;
      bump(ym, "bank", value, r.amount);
      bump(ym, r.kind === "conversion" ? "clearing" : r.kind === "interest" ? "interest" : "incoming", -value, -r.amount);
    } else {
      const fee = r.fee, leaving = -r.amount + (feeMode === "extra" ? fee : 0), principal = leaving - Math.min(fee, leaving);
      const f = Math.min(fee, leaving);
      if (qty <= 0 || leaving > qty) negative++;
      costOut = leaving === qty ? cost : qty > 0 ? Math.round((cost * leaving) / qty) : Math.round(leaving * sp);
      qty -= leaving; cost -= costOut;
      if (r.kind === "conversion" && r.to === base && r.rate && foreign) { principalBase = Math.round(principal * r.rate); rateUsed = r.rate; } else principalBase = Math.round(principal * sp);
      feeBase = Math.round(f * sp);
      if (r.kind === "fee") { feeBase += principalBase; principalBase = 0; }
      const target = r.kind === "conversion" ? "clearing" : r.kind === "card" ? "card" : "outgoing";
      fxGain = principalBase + feeBase - costOut; // spent at worth minus what it cost: positive = gain on the way out
      bump(ym, target, principalBase, principal);
      if (r.kind === "fee") bump(ym, "fees", feeBase, leaving); else bump(ym, "fees", feeBase, f);
      bump(ym, "bank", -costOut, -leaving);
      // Debits are positive. The balance leaves at cost; the target absorbs its worth; the gap is FX.
      bump(ym, "fx", -(principalBase + feeBase - costOut), 0);
    }
    workings.push({ line: r.line, date: r.date, id: r.id, kind: r.kind, description: r.desc, amount: r.amount, fee: r.fee, rate: rateUsed, valueBase: r.amount > 0 ? valueIn : -(principalBase + feeBase), costOut: -costOut, fx: r.amount > 0 ? 0 : fxGain, balance: qty, costBasis: cost });
  }
  if (negative) add("warning", `${negative} row${negative === 1 ? "" : "s"} spent more ${currency} than the balance held`, "Usually the statement starts part-way through the history, so the opening balance is missing. Those rows are costed at the spot rate; type the opening balance cost, or paste the earlier rows, for exact gains.");
  const unusual = rows.filter((r) => r.kind === "conversion" && r.amount < 0 && r.to !== base && foreign);
  if (unusual.length) add("info", `${unusual.length} conversion${unusual.length === 1 ? "" : "s"} to a currency other than ${base}`, `Valued at your ${currency} rate for the day rather than Wise's rate, because Wise's rate is to the other currency, not to ${base}.`);

  const keys = [...months.keys()].sort();
  if (keys.length > 1) add("info", `The statement spans ${keys.length} months`, `Written as ${keys.length} journals (${keys.join(", ")}), each balanced on its own, so every month's flows and FX land in the month they happened.`);
  const journals = keys.map((ym, idx) => {
    const m = months.get(ym);
    const date = idx === keys.length - 1 ? rows[rows.length - 1].date : lastDay(ym);
    const jl = [];
    for (const k of CATEGORY_ORDER) {
      if (!m.has(k)) continue;
      const { net, foreign: f, count } = m.get(k);
      if (net === 0) continue;
      const fxNote = k === "fx" ? "" : f !== 0 && foreign ? `, ${money(Math.abs(f), currency)}` : "";
      jl.push({ category: k, account: mapping[k], debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0, memo: `${CATEGORIES[k].label}${k === "bank" ? ` ${currency}` : ""} (${count} row${count === 1 ? "" : "s"}${fxNote})` });
    }
    const balance = jl.reduce((a, l) => a + l.debit - l.credit, 0);
    if (balance !== 0) { jl.push({ category: "fx", account: mapping.fx, debit: balance < 0 ? -balance : 0, credit: balance > 0 ? balance : 0, memo: "Rounding" }); add("warning", `Journal ${ym} was off by ${money(balance, base)}`, "Rounding, booked to the FX line.", 0); }
    return { period: ym, date, currency: base, statementCurrency: currency, narration: `Wise ${currency} statement ${ym}`, lines: jl };
  });
  const lastSpot = foreign ? spot(rows[rows.length - 1].date) : 1;
  const realised = workings.reduce((a, w) => a + w.fx, 0);
  const byMonth = keys.map((ym) => ({ period: ym, realised: workings.filter((w) => w.date.slice(0, 7) === ym || opts.split === "none").reduce((a, w) => a + w.fx, 0) }));
  const position = { qty, cost, value: Math.round(qty * lastSpot), rate: lastSpot, unrealised: Math.round(qty * lastSpot) - cost };
  return { journals, workings, fx: { realised, byMonth: opts.split === "none" ? [{ period: keys[keys.length - 1], realised }] : byMonth, position }, findings, base, currency };
}

export function validate(text, opts = {}) {
  const p = parseStatement(text, opts);
  const mp = opts.mappingText != null ? parseMapping(opts.mappingText, p.currency) : { mapping: opts.mapping, errors: [] };
  const rates = opts.rates || parseRates(opts.ratesText);
  const parsedOpts = { ...opts, rates, mapping: mp.mapping };
  const b = buildJournals(p, parsedOpts);
  const findings = [...p.findings, ...b.findings, ...rates.errors.map((e) => ({ severity: "warning", title: "A rate line was not read", detail: e, line: 0 })), ...mp.errors.map((e) => ({ severity: "warning", title: "An account line was not read", detail: e, line: 0 }))];
  const order = { error: 0, warning: 1, info: 2 };
  findings.sort((a, c) => order[a.severity] - order[c.severity]);
  const closing = p.rows.length ? p.rows[p.rows.length - 1].balance : null;
  return { rows: p.rows, journals: b.journals, workings: b.workings, fx: b.fx, findings, base: b.base, currency: p.currency, closing, summary: { rows: p.rows.length, journals: b.journals.length } };
}

// ---- exports -----------------------------------------------------------------

const csvCell = (v) => { const s = String(v ?? ""); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csvRow = (a) => a.map(csvCell).join(",");
const fmtDate = (iso, order) => { if (!iso) return ""; const [y, m, d] = iso.split("-"); return order === "dmy" ? `${d}/${m}/${y}` : order === "mdy" ? `${m}/${d}/${y}` : iso; };
const docNo = (journals, j) => `WISE-${j.statementCurrency}-${j.period}`;

export function toXeroJournalCsv(journals, o = {}) {
  const tax = o.taxRate || "Tax Exempt";
  const rows = [csvRow(["*Narration", "*Date", "Description", "*AccountCode", "*TaxRate", "*Amount"])];
  for (const j of journals) for (const l of j.lines) rows.push(csvRow([j.narration, fmtDate(j.date, o.dateOrder || "dmy"), l.memo, l.account, tax, dollars(l.debit - l.credit)]));
  return rows.join("\r\n") + "\r\n";
}

export function toQboJournalCsv(journals, o = {}) {
  const rows = [csvRow(["*JournalNo", "*JournalDate", "*AccountName", "Debits", "Credits", "Description", "Name", "Currency"])];
  for (const j of journals) for (const l of j.lines) rows.push(csvRow([docNo(journals, j), fmtDate(j.date, o.dateOrder || "mdy"), l.account, l.debit ? dollars(l.debit) : "", l.credit ? dollars(l.credit) : "", l.memo, "", j.currency]));
  return rows.join("\r\n") + "\r\n";
}

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
  const rows = [csvRow(["period", "date", "category", "account", "debit", "credit", "memo"])];
  for (const j of journals) for (const l of j.lines) rows.push(csvRow([j.period, j.date, l.category, l.account, l.debit ? dollars(l.debit) : "", l.credit ? dollars(l.credit) : "", l.memo]));
  return rows.join("\r\n") + "\r\n";
}

export function workingsCsv(result) {
  const rows = [csvRow(["line", "date", "id", "kind", "description", `amount_${result.currency}`, `fee_${result.currency}`, `rate_${result.base}_per_${result.currency}`, `value_${result.base}`, `cost_${result.base}`, `realised_fx_${result.base}`, `balance_${result.currency}`, `cost_basis_${result.base}`])];
  for (const w of result.workings) rows.push(csvRow([w.line, w.date, w.id, w.kind, w.description, dollars(w.amount), dollars(w.fee), Number(w.rate).toFixed(6), dollars(w.valueBase), dollars(w.costOut), dollars(w.fx), dollars(w.balance), dollars(w.costBasis)]));
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

const HEAD = ["TransferWise ID", "Date", "Date Time", "Amount", "Currency", "Description", "Payment Reference", "Running Balance", "Exchange From", "Exchange To", "Exchange Rate", "Payer Name", "Payee Name", "Payee Account Number", "Merchant", "Card Last Four Digits", "Card Holder Full Name", "Attachment", "Note", "Total fees"];

// items (oldest first): { date, desc, amount, fee, from, to, rate, merchant }. Written newest first, as Wise does,
// with a running balance that includes each fee in the Amount (feeMode "included") unless `feeExtra`.
export function buildStatement({ currency = "EUR", opening = 0, items, feeExtra = false, newestFirst = true, breakAt = -1 }) {
  const csv = (v) => (/[",]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  let bal = Math.round(opening * 100);
  const out = [];
  items.forEach((it, i) => {
    const a = Math.round(it.amount * 100), f = Math.round((it.fee || 0) * 100);
    bal += a - (feeExtra && a < 0 ? f : 0);
    const shown = i === breakAt ? bal + 1000 : bal;
    const [y, m, d] = it.date.split("-");
    out.push([`TRANSFER-${100 + i}`, `${d}-${m}-${y}`, `${d}-${m}-${y} 12:00:00.000`, it.amount.toFixed(2), currency, it.desc, "", (shown / 100).toFixed(2), it.from || "", it.to || "", it.rate ? String(it.rate) : "", "", "", "", it.merchant || "", "", "", "", "", it.fee ? it.fee.toFixed(2) : "0.00"].map(csv).join(","));
  });
  return [HEAD.join(","), ...(newestFirst ? out.reverse() : out)].join("\n") + "\n";
}

export const SAMPLE_RATES = "2026-09-01 1.1000\n2026-09-10 1.1200\n2026-09-15 1.1100\n2026-10-01 1.1250\n";
export const SAMPLE_ITEMS = [
  { date: "2026-09-03", desc: "Received money from Acme GmbH", amount: 2000.0 },
  { date: "2026-09-10", desc: "Received money from Beta SARL", amount: 1000.0 },
  { date: "2026-09-15", desc: "Card transaction of 20.00 EUR issued by Figma", amount: -20.0, merchant: "Figma" },
  { date: "2026-10-02", desc: "Converted 2,500.00 EUR to 2,799.56 USD", amount: -2500.0, fee: 11.5, from: "EUR", to: "USD", rate: 1.125 },
  { date: "2026-10-04", desc: "Sent money to Lisbon Cowork", amount: -300.0, fee: 1.4 },
];
export const sampleStatement = () => buildStatement({ items: SAMPLE_ITEMS });
// The same statement after a hand edit: one row dropped from the paste, one date unreadable, one amount not a number.
export function sampleBrokenStatement() {
  const lines = sampleStatement().trimEnd().split("\n");
  lines.splice(3, 1);
  lines[1] = lines[1].replace("04-10-2026 12:00:00.000", "not a date").replace("04-10-2026", "31-02-2026");
  lines.push(lines[2].replace("-20.00", "2O.00"));
  return lines.join("\n") + "\n";
}
