// eBay Transaction report -> accounting journal.
//
// eBay pays out a net deposit that hides item sales, shipping income, seller-collected tax, final value
// fees, Promoted Listings, insertion and store fees, shipping labels, refunds and disputes. Bookkeepers need
// those split out, and a payout that straddles a month end split in two. This module reads the Transaction
// report (Seller Hub > Payments > Reports > Downloads), proves each payout's rows add up to the Payout row,
// groups them into categories and writes balanced journals for Xero, QuickBooks Online, QuickBooks Desktop
// (IIF) and a plain CSV.
//
// The report layout, the Type and Description wording and each importer's column layout are from memory of
// public eBay and accounting help documents; no real eBay report and no live Xero or QuickBooks import was
// available when this was written. Rows no rule recognises are never dropped: they land in an
// "uncategorised" line and are reported, so the journal still equals the net.
//
// Everything is integer cents. Nothing here touches the network or the DOM.

export const CATEGORIES = {
  sales: { label: "Item sales (gross)", account: "eBay Sales" },
  shipping: { label: "Shipping and handling charged to buyers", account: "eBay Shipping Income" },
  tax: { label: "Sales tax collected by you (liability)", account: "eBay Sales Tax Payable" },
  refunds: { label: "Refunds", account: "eBay Refunds" },
  fees: { label: "Final value, international, performance and deposit fees", account: "eBay Fees" },
  ads: { label: "Promoted Listings and ad fees", account: "eBay Advertising" },
  listing: { label: "Insertion, listing upgrade and store subscription fees", account: "eBay Listing and Store Fees" },
  labels: { label: "Shipping labels bought on eBay", account: "eBay Shipping Labels" },
  disputes: { label: "Claims, disputes and chargebacks", account: "eBay Disputes" },
  other: { label: "Holds, reserves, transfers and adjustments", account: "eBay Adjustments" },
  uncategorised: { label: "Uncategorised eBay items", account: "eBay Uncategorised" },
  clearing: { label: "eBay clearing (matches the bank deposit)", account: "eBay Clearing" },
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

const UNPAID = "(not yet paid out)";
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

// Returns YYYY-MM-DD or null. Accepts ISO, "Jun 1, 2026", "1 Jun 2026", DD.MM.YYYY and slashed dates read per `order`.
export function parseDate(s, order = "mdy") {
  const t = String(s ?? "").trim().replace(/^"|"$/g, "");
  if (!t || /^-+$/.test(t)) return null;
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

// Amounts: "--" and "" are nothing (null); currency symbols, "(1.00)" and thousands separators are read.
export function parseAmount(s) {
  let t = String(s ?? "").trim().replace(/\s/g, "");
  if (t === "" || /^-+$/.test(t)) return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  t = t.replace(/[$€£]|USD|EUR|GBP|CAD|AUD/gi, "");
  if (t.startsWith("-")) { neg = !neg; t = t.slice(1); } else if (t.startsWith("+")) t = t.slice(1);
  let u = t;
  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(t)) u = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d+,\d{1,2}$/.test(t)) u = t.replace(",", ".");
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) u = t.replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(u)) return NaN;
  const c = Math.round(parseFloat(u) * 100);
  return neg ? -c : c;
}

const FEE_COLUMNS = [["fvf-fixed", "final value fee - fixed", "final value fee – fixed", "final value fee fixed"], ["fvf-var", "final value fee - variable", "final value fee – variable", "final value fee variable"], ["nad", 'very high "not as described" fee', "very high 'not as described' fee", "very high not as described fee", "very high item not as described fee"], ["below", "below standard performance fee"], ["intl", "international fee"], ["deposit", "deposit processing fee"]];
const normHead = (h) => h.trim().toLowerCase().replace(/^﻿/, "").replace(/^"|"$/g, "").replace(/""/g, '"').replace(/\s+/g, " ");

// The report opens with a few metadata lines (name, seller, period) before the header, so the header is found, not assumed.
export function parsePayouts(text, opts = {}) {
  const findings = [];
  const add = (severity, title, detail, line) => findings.push({ severity, title, detail, line: line || 0 });
  const lines = String(text || "").replace(/^﻿/, "").split(/\r?\n/);
  const none = { payouts: [], findings, summary: { rows: 0, payouts: 0 } };
  if (!lines.some((l) => l.trim())) { add("error", "The file is empty", "Paste or choose an eBay Transaction report CSV."); return none; }
  const delim = (l) => ((l.match(/\t/g) || []).length > (l.match(/,/g) || []).length ? "\t" : ",");
  let first = -1;
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const h = splitLine(lines[i], delim(lines[i])).map(normHead);
    if (h.includes("type") && h.includes("net amount")) { first = i; break; }
  }
  if (first < 0) { add("error", "This does not look like an eBay Transaction report", "No header row with the columns Type and Net amount was found in the first 30 lines. In Seller Hub open Payments > Reports > Downloads and download the Transaction report as CSV.", 1); return none; }
  const d = delim(lines[first]);
  const head = splitLine(lines[first], d).map(normHead);
  const col = (...names) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; };
  const I = {
    date: col("transaction creation date", "date", "transaction date"), type: col("type", "transaction type"), order: col("order number", "order id"), net: col("net amount", "net"),
    payout: col("payout id"), pdate: col("payout date"), currency: col("payout currency", "transaction currency"), tcur: col("transaction currency"), item: col("item id"), title: col("item title"),
    sub: col("item subtotal", "item price"), ship: col("shipping and handling", "shipping & handling", "postage and packaging"), stax: col("seller collected tax"), desc: col("description"), pstatus: col("payout status"),
  };
  const feeCols = FEE_COLUMNS.map((names) => col(...names)).filter((i) => i >= 0);
  if (I.date < 0) { add("error", "No Transaction creation date column", "The header has Type and Net amount but no date column, so rows cannot be assigned to months.", first + 1); return none; }
  const get = (cells, k) => (I[k] >= 0 ? (cells[I[k]] ?? "").trim() : "");
  const byId = new Map();
  const bucket = (id) => { if (!byId.has(id)) byId.set(id, { id, effective: null, stated: null, currency: "", rows: [] }); return byId.get(id); };
  let rows = 0;
  for (let i = first + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = splitLine(lines[i], d);
    if (cells.length < 3) continue; // trailing summary lines
    const type = get(cells, "type"), tl = type.toLowerCase();
    const netS = get(cells, "net"), net = parseAmount(netS);
    if (net === null) { add("warning", "Row has no net amount", `${type || "row"} was skipped.`, i + 1); continue; }
    if (Number.isNaN(net)) { add("error", `Net amount "${netS}" is not a number`, "The row is left out, so its payout will not add up.", i + 1); continue; }
    const date = parseDate(get(cells, "date"), opts.dateOrder);
    if (!date) { add("error", `Date "${get(cells, "date")}" is not a date`, "The row is left out, so its payout will not add up.", i + 1); continue; }
    const num = (k) => parseAmount(get(cells, k));
    const sub = num("sub"), ship = num("ship"), stax = num("stax");
    const feeVals = feeCols.map((c) => parseAmount(cells[c] ?? ""));
    if ([sub, ship, stax, ...feeVals].some(Number.isNaN)) { add("error", "An amount column is not a number", `Row ${get(cells, "order") || i + 1} was left out.`, i + 1); continue; }
    // eBay shows fees as negatives; a credit is positive. Whatever the sign, the sum is what moved the net.
    const feeSum = feeVals.reduce((a, v) => a + (v ?? 0), 0);
    const pid = get(cells, "payout"), pidKey = !pid || /^-+$/.test(pid) ? UNPAID : pid;
    const s = bucket(pidKey);
    const cur = get(cells, "currency").toUpperCase(), tcur = get(cells, "tcur").toUpperCase();
    if (cur && s.currency && cur !== s.currency) add("warning", `Mixed currencies in payout ${pidKey}`, `${cur} row among ${s.currency} rows. Journals assume one currency per payout.`, i + 1);
    if (cur && tcur && cur !== tcur) add("warning", `Row ${get(cells, "order") || i + 1} was sold in ${tcur} but paid out in ${cur}`, "The Net amount is read as already converted to the payout currency; the exchange difference is not separated.", i + 1);
    if (cur && !s.currency) s.currency = cur;
    const eff = parseDate(get(cells, "pdate"), opts.dateOrder);
    if (eff && !s.effective) s.effective = eff;
    if (tl === "payout") { s.stated = (s.stated || 0) + Math.abs(net); continue; } // the deposit itself, not an activity row
    const row = { line: i + 1, id: get(cells, "order") || get(cells, "item"), type, desc: get(cells, "desc") || get(cells, "title"), net, date, sub, ship, stax, feeSum, hasItemCols: sub !== null || ship !== null || stax !== null };
    if (row.hasItemCols && (sub ?? 0) + (ship ?? 0) + (stax ?? 0) + feeSum !== net) add("error", `Item subtotal, shipping, tax and fees do not equal net on ${row.id || `line ${i + 1}`}`, `${money((sub ?? 0) + (ship ?? 0) + (stax ?? 0) + feeSum)} computed from the columns, but the row says ${money(net)}. The journal uses the net; check the file was not edited.`, i + 1);
    s.rows.push(row);
    rows++;
  }
  const payouts = [...byId.values()].filter((s) => s.rows.length || s.stated !== null);
  if (!payouts.length) add("error", "No rows found", "The header was read but there were no data rows.");
  if (opts.expected != null && Number.isFinite(opts.expected)) {
    const real = payouts.filter((s) => s.id !== UNPAID);
    if (real.length === 1 && real[0].stated === null) real[0].stated = opts.expected;
    else if (real.length !== 1) add("info", "Expected deposit ignored", "It can only be applied when the file holds exactly one payout without a Payout row of its own.");
  }
  return { payouts, findings, summary: { rows, payouts: payouts.length } };
}

// ---- categorising ------------------------------------------------------------

// Type first, then the Description, because eBay files ads, listing fees and store fees all as "Other fee".
export function categoryOf(row) {
  const t = String(row.type || "").toLowerCase().trim(), d = String(row.desc || "").toLowerCase();
  if (t === "order" || t === "sale") return "sales";
  if (t === "refund" || (/^refund/.test(d) && t !== "other fee")) return "refunds";
  if (t === "shipping label" || /shipping label|postage label/.test(t)) return "labels";
  if (/^(claim|dispute|payment dispute|chargeback|case)/.test(t) || /chargeback|payment dispute/.test(d)) return "disputes";
  if (/promoted listing|promoted offsite|ad fee|advertis/.test(d)) return "ads";
  if (/insertion|listing fee|listing upgrade|store subscription|subscription/.test(d)) return "listing";
  if (/not as described|below standard|performance|international fee|final value|deposit processing|regulatory/.test(d)) return "fees";
  if (/^(hold|release|transfer|reserve|adjustment|credit|payout reversal|payout failure|charge|payment to)/.test(t) || /credit|reversal|adjust|reserve|hold/.test(d)) return "other";
  if (t === "other fee" || /fee/.test(t)) return "fees";
  return "uncategorised";
}

// A row's journal contribution as [category, signed cents] pairs that always sum to the row's net.
export function partsOf(row) {
  const cat = categoryOf(row);
  const out = [];
  if (cat === "sales" && row.hasItemCols) {
    if (row.sub) out.push(["sales", row.sub]);
    if (row.ship) out.push(["shipping", row.ship]);
    if (row.stax) out.push(["tax", row.stax]);
    if (row.feeSum) out.push(["fees", row.feeSum]);
    const rest = row.net - out.reduce((a, [, v]) => a + v, 0);
    if (rest) out.push(["sales", rest]);
    return out;
  }
  if (row.feeSum && cat === "sales") { out.push(["fees", row.feeSum]); out.push([cat, row.net - row.feeSum]); return out; }
  out.push([cat, row.net]);
  return out;
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
    const endDate = s.effective || [...s.rows].map((r) => r.date).filter(Boolean).sort().pop() || null;
    if (s.id === UNPAID) findings.push({ severity: "warning", title: `${s.rows.length} row${s.rows.length === 1 ? "" : "s"} have no payout ID`, detail: "They are not yet paid out (or the report omits the payout column). They are journalled to eBay clearing as a separate group and will not match a bank deposit yet.", line: 0 });
    else if (s.stated === null) findings.push({ severity: "warning", title: `Payout ${s.id} has no payout row and no expected deposit`, detail: `The rows add up to ${money(sum, cur)}. Enter the deposit from your bank or eBay in the box above to check it.`, line: 0 });
    else if (s.stated !== sum) findings.push({ severity: "error", title: `Payout ${s.id}: rows add up to ${money(sum, cur)} but the payout is ${money(s.stated, cur)}`, detail: `Off by ${money(s.stated - sum, cur)}. Rows are missing from the paste, or an amount was skipped. Do not post this journal until the figures agree.`, line: 0 });
    const periods = new Map();
    let undated = 0;
    for (const r of s.rows) {
      let ym = r.date ? r.date.slice(0, 7) : (endDate || "").slice(0, 7);
      if (!r.date) undated++;
      if (split === "none") ym = (endDate || ym || "").slice(0, 7);
      if (!ym) ym = "undated";
      if (!periods.has(ym)) periods.set(ym, new Map());
      const m = periods.get(ym);
      const add = (k, amt) => { if (!amt) return; const e = m.get(k) || { net: 0, count: 0 }; e.net += amt; e.count++; m.set(k, e); };
      for (const [k, amt] of partsOf(r)) add(k, amt);
    }
    if (undated) findings.push({ severity: "warning", title: `${undated} row${undated === 1 ? "" : "s"} in payout ${s.id} had no created date`, detail: "They were placed in the payout's final month.", line: 0 });
    const keys = [...periods.keys()].sort();
    if (keys.length > 1) findings.push({ severity: "info", title: `Payout ${s.id} spans ${keys.length} months`, detail: `Written as ${keys.length} journals (${keys.join(", ")}), each balanced to eBay clearing, so every month's revenue and fees land in the month they happened. The bank deposit of ${s.stated === null ? "the full amount" : money(s.stated, cur)} then clears both.`, line: 0 });
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
      journals.push({ payoutId: s.id, period: ym, date, deposit: s.effective, currency: cur, narration: `eBay payout ${s.id}${keys.length > 1 ? ` ${ym}` : ""}`, lines, clearing: net });
    });
    const unknown = s.rows.filter((r) => categoryOf(r) === "uncategorised");
    if (unknown.length) findings.push({ severity: "warning", title: `Payout ${s.id} has ${unknown.length} item${unknown.length === 1 ? "" : "s"} no rule recognised`, detail: `${[...new Set(unknown.map((r) => r.cat || r.desc))].slice(0, 5).join(", ")}. They are journalled to "${mapping.uncategorised}" so the journal still equals the net. Review them and reclassify by hand if needed.`, line: unknown[0].line });
  }
  return { journals, findings };
}

export function uncategorisedRows(payouts) {
  return payouts.flatMap((s) => s.rows.filter((r) => categoryOf(r) === "uncategorised").map((r) => ({ payout: s.id, ...r })));
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

const HEAD = ["Transaction creation date", "Type", "Order number", "Legacy order ID", "Buyer username", "Net amount", "Payout currency", "Payout date", "Payout ID", "Payout status", "Item ID", "Item title", "Quantity", "Item subtotal", "Shipping and handling", "Seller collected tax", "eBay collected tax", "Final Value Fee - fixed", "Final Value Fee - variable", '"Very high ""not as described"" fee"', "Below standard performance fee", "International fee", "Deposit processing fee", "Gross transaction amount", "Transaction currency", "Description"];
const MN = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ebayDate = (iso) => { const [y, m, d] = iso.split("-"); return `"${MN[+m]} ${+d}, ${y}"`; };
const amt = (n) => (n === undefined || n === null ? "--" : (n < 0 ? "-" : "") + Math.abs(n).toFixed(2));
const csvq = (v) => (/[",]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

// items: { date, type, order, sub, ship, tax, fixed, variable, intl, net, desc, title }. Fees are given as positive costs and written negative, as eBay does.
// A Payout row is added when `withPayoutRow`; eBay's own report carries one per payout, but a report cut by date may not.
export function buildReport({ id = "5000123456", effective = "2026-10-08", currency = "USD", items, withPayoutRow = true, totalOverride }) {
  const out = ["Transaction report", "Seller ID,samplestore", 'Report period,"Sep 28, 2026 - Oct 8, 2026"', "", HEAD.join(",")];
  let total = 0;
  const row = (o) => {
    const bad = typeof o.net === "string";
    const fees = (o.fixed ?? 0) + (o.variable ?? 0) + (o.intl ?? 0);
    const net = bad ? o.net : o.net ?? Math.round(((o.sub ?? 0) + (o.ship ?? 0) + (o.tax ?? 0) - fees) * 100) / 100;
    if (!bad && o.type !== "Payout") total += Math.round(net * 100);
    const cells = [ebayDate(o.date), o.type, o.order ?? "--", "--", "--", bad ? net : amt(net), currency, ebayDate(effective), id, "Paid", o.item ?? "--", o.title ? csvq(o.title) : "--", o.sub !== undefined ? 1 : "--", amt(o.sub), amt(o.ship), amt(o.tax), "--", o.fixed ? amt(-o.fixed) : "--", o.variable ? amt(-o.variable) : "--", "--", "--", o.intl ? amt(-o.intl) : "--", "--", o.sub !== undefined ? amt((o.sub ?? 0) + (o.ship ?? 0) + (o.tax ?? 0)) : "--", currency, o.desc ? csvq(o.desc) : "--"];
    out.push(cells.join(","));
  };
  for (const it of items) row(it);
  if (withPayoutRow) row({ date: effective, type: "Payout", net: -(totalOverride ?? total) / 100, desc: "Payout" });
  return out.join("\n") + "\n";
}

export const SAMPLE_ITEMS = [
  { date: "2026-09-28", type: "Order", order: "27-11001-50001", item: "334455667788", title: "Vintage Leather Camera Strap", sub: 38.0, ship: 5.0, tax: 3.1, fixed: 0.4, variable: 5.7 },
  { date: "2026-09-29", type: "Order", order: "27-11002-50002", item: "334455667799", title: "Brass Desk Lamp", sub: 64.5, ship: 0, tax: 0, fixed: 0.4, variable: 8.55 },
  { date: "2026-09-30", type: "Order", order: "27-11003-50003", item: "334455667788", title: "Vintage Leather Camera Strap", sub: 38.0, ship: 5.0, tax: 0, fixed: 0.4, variable: 5.7, intl: 0.7 },
  { date: "2026-09-30", type: "Shipping label", order: "27-11001-50001", net: -4.35, desc: "Shipping label" },
  { date: "2026-10-01", type: "Other fee", net: -6.2, desc: "Promoted Listings - General fee" },
  { date: "2026-10-02", type: "Order", order: "27-11004-50004", item: "334455667700", title: "Mid-century Ceramic Vase", sub: 112.0, ship: 12.0, tax: 0, fixed: 0.4, variable: 16.43 },
  { date: "2026-10-03", type: "Refund", order: "27-11002-50002", net: -73.05, desc: "Refund" },
  { date: "2026-10-04", type: "Other fee", net: -11.95, desc: "Store subscription fee" },
  { date: "2026-10-05", type: "Shipping label", order: "27-11004-50004", net: -9.8, desc: "Shipping label" },
  { date: "2026-10-06", type: "Hold", net: 2.0, desc: "Hold released" },
];
export const sampleReport = () => buildReport({ items: SAMPLE_ITEMS });
// The same report after a hand edit: a row dropped from the paste so the payout no longer agrees, one Type no rule
// recognises, an amount that is not a number and a row whose columns disagree with its net.
export function sampleBrokenReport() {
  const full = buildReport({ items: SAMPLE_ITEMS });
  const total = full.split("\n").slice(5).filter((l) => /,Payout,/.test(l)).length ? SAMPLE_ITEMS.reduce((a, o) => a + (o.net !== undefined ? Math.round(o.net * 100) : Math.round(((o.sub ?? 0) + (o.ship ?? 0) + (o.tax ?? 0) - (o.fixed ?? 0) - (o.variable ?? 0) - (o.intl ?? 0)) * 100)), 0) : 0;
  const items = SAMPLE_ITEMS.filter((o) => o.desc !== "Store subscription fee").map((o) => (o.order === "27-11003-50003" && o.type === "Order" ? { ...o, net: 41.0 } : o));
  items.push({ date: "2026-10-06", type: "Mystery", net: 1.23, desc: "Marketplace thing" }, { date: "2026-10-06", type: "Other fee", net: "12..5", desc: "Insertion fee" });
  return buildReport({ items, totalOverride: total });
}
