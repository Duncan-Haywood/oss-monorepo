// Airbnb host transaction history -> accounting journal.
//
// Airbnb pays hosts a net deposit that hides the nightly rate, the cleaning fee, Airbnb's host service
// fee, cancellations, resolution adjustments and any tax Airbnb pays across for the host to remit.
// Bookkeepers need those split out, in the month they belong to. This module reads the Transaction
// history CSV (Airbnb > Menu > Earnings > Transaction history > Download CSV), splits every reservation
// into rental income, cleaning income, host fees and refunds, books pass-through tax as a liability and
// adjustments as their own line, compares the rows to the payouts the file states, and writes balanced
// journals for Xero, QuickBooks Online, QuickBooks Desktop (IIF) and a plain CSV.
//
// The CSV's column names, its type labels and each importer's layout are from memory of public Airbnb and
// accounting help documents; no real Airbnb export and no live Xero or QuickBooks import was available when
// this was written. Columns are matched by several aliases, a reservation whose parts do not add to its
// amount is flagged, and a row no rule explains is never dropped: it lands in an "uncategorised" line and is
// reported, so the journal still equals the file.
//
// Everything is integer cents. Nothing here touches the network or the DOM.

export const CATEGORIES = {
  sales: { label: "Rental income (nightly rate, gross)", account: "Airbnb Rental Income" },
  cleaning: { label: "Cleaning fees charged to guests", account: "Airbnb Cleaning Fee Income" },
  refunds: { label: "Cancellations and refunds to guests", account: "Airbnb Refunds" },
  fees: { label: "Airbnb host service fees and fast pay fees", account: "Airbnb Host Fees" },
  tax: { label: "Occupancy tax Airbnb paid you to remit (liability)", account: "Occupancy Tax Payable" },
  adjustments: { label: "Resolution adjustments, credits and other Airbnb items", account: "Airbnb Adjustments" },
  cohost: { label: "Co-host payouts", account: "Co-Host Fees" },
  uncategorised: { label: "Uncategorised Airbnb items", account: "Airbnb Uncategorised" },
  clearing: { label: "Airbnb clearing (matches the payout deposits)", account: "Airbnb Clearing" },
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

const GROUP = "Airbnb earnings";

// Airbnb's file has no payout ID on a reservation, so the whole file is one group: every non-payout row
// is summed, and every row typed "Payout" states a deposit. The two differ by whatever is still waiting
// to be paid (or was paid from before the file starts); that difference is what clearing holds.
// opts.basis: "paid" (default) places a reservation in the month of its transaction date; "checkin"
// places it in the month of its start date.
export function parsePayouts(text, opts = {}) {
  const findings = [];
  const add = (severity, title, detail, line) => findings.push({ severity, title, detail, line: line || 0 });
  const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/);
  const first = lines.findIndex((l) => l.trim());
  const none = { payouts: [], findings, summary: { rows: 0, payouts: 0 } };
  if (first < 0) { add("error", "The file is empty", "Paste or choose an Airbnb transaction history CSV."); return none; }
  const d = (lines[first].match(/\t/g) || []).length > (lines[first].match(/,/g) || []).length ? "\t" : ",";
  const head = splitLine(lines[first], d).map(norm);
  const col = (...names) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; };
  const I = {
    date: col("date", "transaction-date"),
    type: col("type", "transaction-type"),
    code: col("confirmation-code", "confirmation", "reservation-code"),
    start: col("start-date", "check-in", "checkin-date"),
    listing: col("listing", "property"),
    details: col("details", "description"),
    currency: col("currency"),
    amount: col("amount"),
    paidOut: col("paid-out", "payout-amount"),
    fee: col("service-fee", "host-fee", "host-service-fee"),
    fast: col("fast-pay-fee", "fast-payout-fee"),
    cleaning: col("cleaning-fee"),
    gross: col("gross-earnings", "gross"),
    occ: col("occupancy-taxes", "occupancy-tax"),
  };
  const missing = [];
  if (I.type < 0) missing.push("type");
  if (I.amount < 0 && I.paidOut < 0) missing.push("amount");
  if (I.date < 0) missing.push("date");
  if (missing.length) {
    add("error", "This does not look like an Airbnb transaction history", `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. In Airbnb open Menu > Earnings > Transaction history, choose the date range and Download CSV, then paste the whole file here.`, first + 1);
    return none;
  }
  const get = (cells, k) => (I[k] >= 0 ? (cells[I[k]] ?? "").trim() : "");
  const s = { id: GROUP, effective: null, stated: null, currency: "", rows: [] };
  let rows = 0, payoutRows = 0, occTotal = 0, occRows = 0;
  for (let i = first + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = splitLine(lines[i], d);
    const type = get(cells, "type"), tl = type.toLowerCase();
    const rid = get(cells, "code") || `line ${i + 1}`;
    const date = parseDate(get(cells, "date"), opts.dateOrder);
    const money_ = (k) => { const v = parseAmount(get(cells, k)); return v === null ? 0 : v; };
    const bad = ["amount", "paidOut", "fee", "fast", "cleaning", "gross", "occ"].some((k) => Number.isNaN(parseAmount(get(cells, k))));
    if (bad) { add("error", `An amount on ${rid} is not a number`, "The row is left out, so the file will not add up.", i + 1); continue; }
    const cur = get(cells, "currency").toUpperCase();
    if (cur && s.currency && cur !== s.currency) add("warning", "Mixed currencies in the export", `${cur} row among ${s.currency} rows. Journals assume one currency.`, i + 1);
    if (cur && !s.currency) s.currency = cur;
    if (date && (!s.effective || date > s.effective)) s.effective = date;
    if (/^payout$|^payout\b/.test(tl) && !/co-?host/.test(tl)) {
      const v = I.paidOut >= 0 && get(cells, "paidOut") !== "" ? money_("paidOut") : money_("amount");
      s.stated = (s.stated || 0) + Math.abs(v); payoutRows++;
      continue;
    }
    const net = money_("amount");
    const parts = [];
    const push = (k, amt) => { if (amt) parts.push({ k, amt }); };
    let created = date, item = get(cells, "listing") || type;
    if (/reservation/.test(tl) && !/pass/.test(tl)) {
      const gross = money_("gross"), cleaning = money_("cleaning"), fee = Math.abs(money_("fee")) + Math.abs(money_("fast"));
      const sign = gross < 0 ? -1 : 1;
      if (opts.basis === "checkin") created = parseDate(get(cells, "start"), opts.dateOrder) || date;
      if (I.gross < 0) { push("uncategorised", net); add("error", "No Gross earnings column", `${rid} cannot be split without it; it is journalled to uncategorised for ${money(net)}.`, i + 1); }
      else {
        if (gross < 0) push("refunds", gross); else { push("sales", gross - cleaning); push("cleaning", cleaning); }
        push("fees", -sign * fee);
        const residual = net - parts.reduce((a, p) => a + p.amt, 0);
        if (residual !== 0) { push("uncategorised", residual); add("error", `Parts do not add up to the amount on ${rid}`, `Gross earnings ${money(gross)} less fees ${money(sign * fee)} = ${money(gross - sign * fee)}, but the row's Amount is ${money(net)}. The ${money(residual)} difference is journalled to "uncategorised"; check the file was not edited, or whether tax was paid in the Amount.`, i + 1); }
      }
      const occ = money_("occ");
      if (occ) { occTotal += occ; occRows++; }
    } else if (/pass.?through/.test(tl) || (/tax/.test(tl) && !/withh/.test(tl))) push("tax", net);
    else if (/co-?host/.test(tl)) push("cohost", net);
    else if (/adjust|resolution|credit|referral|reimburs|compensation/.test(tl)) push("adjustments", net);
    else { push("uncategorised", net); add("warning", `Unrecognised type "${type}" on ${rid}`, "It is journalled to uncategorised so the journal still equals the file.", i + 1); }
    if (net === 0 && !parts.length) continue;
    s.rows.push({ line: i + 1, id: rid, item, gross: parts.filter((p) => p.k === "sales" || p.k === "cleaning").reduce((a, p) => a + p.amt, 0), fee: -(parts.find((p) => p.k === "fees")?.amt || 0), net, refunded: parts.some((p) => p.k === "refunds"), parts, created });
    rows++;
  }
  if (occRows) add("info", `${occRows} reservation${occRows === 1 ? "" : "s"} show occupancy taxes of ${money(occTotal, s.currency || "USD")} that Airbnb collected and remitted`, "That tax is not in your Amount, so it is not journalled. Pass Through Tax rows (tax Airbnb paid across for you to remit) are booked to the tax payable account.", 0);
  if (!rows && !payoutRows) add("error", "No transaction rows found", "The header was read but there were no data rows.");
  if (opts.expected != null && Number.isFinite(opts.expected) && s.stated === null) s.stated = opts.expected;
  const payouts = s.rows.length || s.stated !== null ? [s] : [];
  return { payouts, findings, summary: { rows, payouts: payoutRows } };
}

// ---- journals ----------------------------------------------------------------

const lastDay = (ym) => { const [y, m] = ym.split("-").map(Number); return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`; };

// split: "month" (default) writes one journal per calendar month; "none" one journal dated the file's last date.
export function buildJournals(payouts, opts = {}) {
  const mapping = opts.mapping || defaultMapping();
  const split = opts.split || "month";
  const findings = [];
  const journals = [];
  for (const s of payouts) {
    const sum = s.rows.reduce((a, r) => a + r.net, 0);
    const cur = s.currency || "USD";
    const endDate = s.effective || [...s.rows].map((r) => r.created).filter(Boolean).sort().pop() || null;
    if (s.stated === null) findings.push({ severity: "warning", title: "The file has no Payout rows and no deposit was typed in", detail: `The rows add up to ${money(sum, cur)}. Include Payout rows in the date range, or enter the total deposited in the box above, to compare.`, line: 0 });
    else if (s.stated !== sum) findings.push({ severity: "warning", title: `Rows add up to ${money(sum, cur)} but payouts in the file total ${money(s.stated, cur)}`, detail: `Difference ${money(sum - s.stated, cur)}. ${sum > s.stated ? "That much is earned but not yet paid out (or the payout falls after the file's end date); Airbnb clearing will hold it until the deposit arrives." : "Payouts include money from reservations before the file starts. Extend the date range back to the first unpaid reservation."} If neither explains it, rows are missing from the paste.`, line: 0 });
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
    if (undated) findings.push({ severity: "warning", title: `${undated} row${undated === 1 ? "" : "s"} had no usable date`, detail: "They were placed in the file's final month.", line: 0 });
    const keys = [...periods.keys()].sort();
    if (keys.length > 1) findings.push({ severity: "info", title: `The file spans ${keys.length} months`, detail: `Written as ${keys.length} journals (${keys.join(", ")}), each balanced to Airbnb clearing, so every month's income and fees land in the month they belong to. Bank deposits then clear all of them.`, line: 0 });
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
      if (net !== 0 || !lines.length) lines.push({ category: "clearing", account: mapping.clearing, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0, memo: `Airbnb earnings ${ym}` });
      journals.push({ payoutId: s.id, period: ym, date, deposit: s.effective, currency: cur, narration: `Airbnb earnings ${ym}`, lines, clearing: net });
    });
    const unknown = s.rows.filter((r) => r.parts.some((p) => p.k === "uncategorised"));
    if (unknown.length) findings.push({ severity: "warning", title: `${unknown.length} item${unknown.length === 1 ? "" : "s"} no rule recognised`, detail: `${[...new Set(unknown.map((r) => r.item || r.id))].slice(0, 5).join(", ")}. They are journalled to "${mapping.uncategorised}" so the journal still equals the file. Review them and reclassify by hand if needed.`, line: unknown[0].line });
  }
  return { journals, findings };
}

export function uncategorisedRows(payouts) {
  return payouts.flatMap((s) => s.rows.filter((r) => r.parts.some((p) => p.k === "uncategorised")).map((r) => ({ payout: s.id, ...r })));
}

// "agrees" is null when the file states no payout; true when payouts equal the rows; false when they differ
// (usually timing, which the findings explain).
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
  return { payouts: p.payouts, journals: b.journals, findings, reconciliation: reconciliation(p.payouts, b.journals), summary: { ...p.summary, journals: b.journals.length } };
}

// ---- exports -----------------------------------------------------------------

const csvCell = (v) => { const s = String(v ?? ""); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csvRow = (a) => a.map(csvCell).join(",");
const fmtDate = (iso, order) => { if (!iso) return ""; const [y, m, d] = iso.split("-"); return order === "dmy" ? `${d}/${m}/${y}` : order === "mdy" ? `${m}/${d}/${y}` : iso; };
const docNo = (journals, j) => `AIRBNB-${j.period}`;

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

const HEAD = ["Date", "Arriving by date", "Type", "Confirmation code", "Start date", "End date", "Nights", "Guest", "Listing", "Details", "Currency", "Amount", "Paid out", "Service fee", "Fast pay fee", "Cleaning fee", "Gross earnings", "Occupancy taxes"];

// stays: [date, code, nights, gross, cleaning, fee, start]. A negative gross is a cancellation reversal.
// Occupancy taxes are shown on the row but are not in the Amount (Airbnb remits them).
export function buildReport({ currency = "USD", stays, extra = [], payouts = [], totalOverride }) {
  const csv = (v) => (/[",]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const us = (iso) => { const [y, m, dd] = iso.split("-"); return `${m}/${dd}/${y}`; };
  const out = [HEAD.join(",")];
  for (const [date, code, nights, gross, cleaning, fee, start] of stays) {
    const net = typeof gross === "string" ? gross : (gross - fee).toFixed(2);
    out.push([us(date), "", "Reservation", code, us(start || date), "", nights, "Guest", "Lakeview cabin", "", currency, net, "", fee.toFixed(2), "0.00", cleaning.toFixed(2), typeof gross === "string" ? gross : gross.toFixed(2), "12.00"].map(csv).join(","));
  }
  for (const [date, type, amount] of extra) out.push([us(date), "", type, "", "", "", "", "", "Lakeview cabin", "", currency, amount.toFixed(2), "", "", "", "", "", ""].map(csv).join(","));
  for (const [date, amount] of payouts) out.push([us(date), "", "Payout", "", "", "", "", "", "", "to bank", currency, "", (totalOverride ?? amount).toFixed(2), "", "", "", "", ""].map(csv).join(","));
  return out.join("\n") + "\n";
}

const SAMPLE_STAYS = [
  ["2026-09-12", "HMAB1C2D3E", 3, 540.00, 90.00, 16.20, "2026-09-12"],
  ["2026-09-26", "HMAB4F5G6H", 5, 910.00, 90.00, 27.30, "2026-09-26"],
  ["2026-10-02", "HMAB7J8K9L", 2, 360.00, 90.00, 10.80, "2026-10-02"],
  ["2026-10-04", "HMABMN0P1Q", 4, -420.00, 0.00, -12.60, "2026-10-04"],
];
const SAMPLE_EXTRA = [["2026-10-03", "Pass Through Tax", 38.40], ["2026-10-03", "Resolution Adjustment", -45.00]];
const stayNet = (st) => st.reduce((a, r) => a + Math.round((r[3] - r[5]) * 100), 0);
const SAMPLE_PAID = (stayNet(SAMPLE_STAYS) + Math.round(38.4 * 100) - 4500) / 100;
export const sampleReport = () => buildReport({ stays: SAMPLE_STAYS, extra: SAMPLE_EXTRA, payouts: [["2026-10-05", SAMPLE_PAID]] });
// The same export after a hand edit: one reservation whose Amount does not match its parts, one amount that
// is not a number, and an unrecognised row type.
export function sampleBrokenReport() {
  const stays = SAMPLE_STAYS.slice(0, 3).concat([["2026-10-04", "HMABBAD001", 2, "12..5", 0, 0, "2026-10-04"]]);
  const csv = buildReport({ stays, extra: [...SAMPLE_EXTRA, ["2026-10-04", "Mystery Bonus", 25.00]], payouts: [["2026-10-05", SAMPLE_PAID]] });
  return csv.replace("349.20", "339.20");
}
