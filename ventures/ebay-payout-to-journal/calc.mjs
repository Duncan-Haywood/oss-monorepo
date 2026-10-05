// eBay Transaction report -> accounting journal.
//
// eBay pays out a net deposit that hides gross sales, final value fees, ad charges,
// shipping labels, refunds and disputes. Bookkeepers need those split out, and a payout
// that straddles a month end split in two. This module reads the Transaction report
// (Seller Hub > Payments > Reports, or Reports > Downloads), proves each payout's rows add
// up to the payout row eBay prints, groups them into categories and writes balanced
// journals for Xero, QuickBooks Online, QuickBooks Desktop (IIF) and a plain CSV.
//
// The report layout, the Type values and each importer's column layout are from memory
// of public eBay and accounting help documents; no real eBay export and no live
// Xero or QuickBooks import was available when this was written.
// Rows no rule recognises are never dropped: they land in an "uncategorised" line and
// are reported, so the journal still equals the net.
//
// Everything is integer cents. Nothing here touches the network or the DOM.

export const CATEGORIES = {
  sales: { label: "Order sales (item, shipping charged and seller-collected tax, before fees)", account: "eBay Sales" },
  refunds: { label: "Refunds", account: "eBay Refunds" },
  disputes: { label: "Claims, disputes and chargebacks", account: "eBay Disputes" },
  shipping: { label: "Shipping labels bought on eBay", account: "eBay Shipping Labels" },
  fees: { label: "eBay fees (final value, international, performance and other fees)", account: "eBay Fees" },
  ads: { label: "Promoted Listings and advertising", account: "eBay Advertising" },
  other: { label: "Adjustments, credits and transfers", account: "eBay Adjustments" },
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

const norm = (h) => h.trim().toLowerCase().replace(/^﻿/, "").replace(/["'“”]/g, "").replace(/[–—]/g, "-").replace(/\s+/g, " ");

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

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// Returns YYYY-MM-DD or null. Also reads eBay's "Sep 28, 2026". Accepts ISO (with a time), DD.MM.YYYY, and slashed dates read per `order`.
export function parseDate(s, order = "mdy") {
  const t = String(s ?? "").trim();
  if (!t) return null;
  let y, m, d, x;
  if ((x = t.match(/^(\d{4})-(\d{2})-(\d{2})/))) [y, m, d] = [x[1], x[2], x[3]];
  else if ((x = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/))) [d, m, y] = [x[1], x[2], x[3]];
  else if ((x = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) { if (order === "dmy") [d, m, y] = [x[1], x[2], x[3]]; else [m, d, y] = [x[1], x[2], x[3]]; }
  else if ((x = t.match(/^([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})/))) {
    const mi = MONTHS.indexOf(x[1].toLowerCase());
    if (mi < 0) return null;
    [y, m, d] = [x[3], mi + 1, x[2]];
  } else return null;
  const dt = new Date(Date.UTC(+y, +m - 1, +d));
  if (dt.getUTCFullYear() !== +y || dt.getUTCMonth() !== +m - 1 || dt.getUTCDate() !== +d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const UNPAID = "(not yet paid out)";
const FEE_COLUMNS = ["final value fee - fixed", "final value fee - variable", "very high not as described fee", "below standard performance fee", "international fee", "deposit processing fee"];
const isBlank = (v) => v === "" || v === "--" || v === "-";

// eBay prints a few preamble lines (seller, period) above the header, so the header is the
// first row in the top 40 that has both a Type and a Net amount column. Rows are grouped by
// Payout ID. A Payout row states the deposit; orders not yet paid out carry "--" and are
// journalled apart. The caller may supply the deposit from the bank via opts.expected.
export function parsePayouts(text, opts = {}) {
  const findings = [];
  const add = (severity, title, detail, line) => findings.push({ severity, title, detail, line: line || 0 });
  const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/);
  const none = { payouts: [], findings, summary: { rows: 0, payouts: 0 } };
  if (!lines.some((l) => l.trim())) { add("error", "The file is empty", "Paste or choose an eBay Transaction report CSV."); return none; }
  let hi = -1, d = ",", head = [];
  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    const dd = (lines[i].match(/\t/g) || []).length > (lines[i].match(/,/g) || []).length ? "\t" : ",";
    const h = splitLine(lines[i], dd).map(norm);
    if (h.includes("type") && h.includes("net amount")) { hi = i; d = dd; head = h; break; }
  }
  if (hi < 0) {
    add("error", "This does not look like an eBay Transaction report", "Missing the Type and Net amount columns. In Seller Hub open Payments > Reports (or Reports > Downloads), choose Transaction, pick the dates and download the CSV.", 1);
    return none;
  }
  const col = (...names) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; };
  const I = {
    payout: col("payout id"),
    effective: col("payout date"),
    id: col("order number", "transaction id", "reference id"),
    created: col("transaction creation date", "transaction date", "date"),
    currency: col("payout currency", "transaction currency"),
    net: col("net amount"),
    type: col("type", "transaction type"),
    desc: col("description"),
    title: col("item title"),
    subtotal: col("item subtotal"),
  };
  const feeIdx = FEE_COLUMNS.map((n) => head.indexOf(n)).filter((i) => i >= 0);
  const get = (cells, k) => (I[k] >= 0 ? (cells[I[k]] ?? "").trim() : "");
  const byId = new Map();
  const bucket = (id) => { if (!byId.has(id)) byId.set(id, { id, effective: null, stated: null, currency: "", rows: [] }); return byId.get(id); };
  let rows = 0;
  for (let i = hi + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = splitLine(lines[i], d);
    const type = get(cells, "type").toLowerCase();
    const netS = get(cells, "net");
    if (!type && isBlank(netS)) continue; // footer or spacer
    if (isBlank(netS)) { add("warning", "Row has no net amount", `${type || "row"} was skipped.`, i + 1); continue; }
    const net = parseAmount(netS);
    if (Number.isNaN(net)) { add("error", `Net amount "${netS}" is not a number`, "The row is left out, so its payout will not add up.", i + 1); continue; }
    let fee = 0, badFee = false;
    for (const fi of feeIdx) {
      const v = (cells[fi] ?? "").trim();
      if (isBlank(v)) continue;
      const a = parseAmount(v);
      if (Number.isNaN(a)) { badFee = true; break; }
      fee -= a; // eBay writes a fee as a negative number
    }
    if (badFee) { add("error", "A fee column is not a number", `Row ${get(cells, "id") || i + 1} was left out.`, i + 1); continue; }
    const pidRaw = get(cells, "payout");
    const pid = isBlank(pidRaw) ? UNPAID : pidRaw;
    const s = bucket(pid);
    const cur = get(cells, "currency").toUpperCase();
    if (cur && s.currency && cur !== s.currency) add("warning", `Mixed currencies in payout ${pid}`, `${cur} row among ${s.currency} rows. Journals assume one currency per payout.`, i + 1);
    if (cur && !s.currency) s.currency = cur;
    const eff = parseDate(get(cells, "effective"), opts.dateOrder);
    if (eff && !s.effective) s.effective = eff;
    if (type === "payout") { s.stated = (s.stated || 0) + Math.abs(net); continue; } // the deposit itself, not an activity row
    // An order's net is after its fee columns, so the sale is net plus those fees. Every other row is all gross.
    const row = { line: i + 1, id: get(cells, "id"), cat: type, desc: get(cells, "desc") || get(cells, "title"), gross: net + fee, fee, net, created: parseDate(get(cells, "created"), opts.dateOrder) };
    s.rows.push(row);
    rows++;
  }
  const payouts = [...byId.values()].filter((s) => s.rows.length || s.stated !== null);
  if (!payouts.length) add("error", "No payout rows found", "The header was read but there were no data rows.");
  if (opts.expected != null && Number.isFinite(opts.expected)) {
    const real = payouts.filter((s) => s.id !== UNPAID);
    if (real.length === 1 && real[0].stated === null) real[0].stated = opts.expected;
    else if (real.length !== 1) add("info", "Expected deposit ignored", "It can only be applied when the file holds exactly one payout without a payout row of its own.");
  }
  return { payouts, findings, summary: { rows, payouts: payouts.length } };
}

// ---- categorising ------------------------------------------------------------

export function categoryOf(row) {
  const t = String(row.cat || "").toLowerCase().trim();
  const desc = String(row.desc || "").toLowerCase();
  if (t === "order" || t === "sale") return "sales";
  if (t === "refund" || t === "refund adjustment") return "refunds";
  if (/^(claim|dispute|payment dispute|case|chargeback|return)/.test(t)) return "disputes";
  if (/shipping label|postage/.test(t)) return "shipping";
  if (t === "other fee" || t === "fee" || /fee$/.test(t) || t === "charge") return /promoted|offsite|advertis|ad fee/.test(desc) ? "ads" : "fees";
  if (t === "credit" && /fee/.test(desc)) return "fees";
  if (t === "credit" || t === "adjustment" || t === "transfer" || t === "hold" || t === "release" || t === "reserve" || t === "payment adjustment") return "other";
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
    const sum = s.rows.reduce((a, r) => a + r.net, 0);
    const cur = s.currency || "USD";
    const endDate = s.effective || [...s.rows].map((r) => r.created).filter(Boolean).sort().pop() || null;
    if (s.id === UNPAID) findings.push({ severity: "warning", title: `${s.rows.length} row${s.rows.length === 1 ? "" : "s"} have no payout ID`, detail: "They are not yet paid out (or the report omits the payout column). They are journalled to eBay clearing as a separate group and will not match a bank deposit yet.", line: 0 });
    else if (s.stated === null) findings.push({ severity: "warning", title: `Payout ${s.id} has no payout row and no expected deposit`, detail: `The rows add up to ${money(sum, cur)}. Enter the deposit from your bank or eBay in the box above to check it.`, line: 0 });
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
      add(categoryOf(r), r.gross);
      add("fees", -r.fee);
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

const HEAD = ["Transaction creation date", "Type", "Order number", "Legacy order ID", "Buyer username", "Buyer name", "Ship to city", "Ship to country", "Net amount", "Payout currency", "Payout date", "Payout ID", "Payout method", "Payout status", "Reason for hold", "Item ID", "Transaction ID", "Item title", "Custom label", "Quantity", "Item subtotal", "Shipping and handling", "Seller collected tax", "eBay collected tax", "Final Value Fee - fixed", "Final Value Fee - variable", "Very high \"item not as described\" fee", "Below standard performance fee", "International fee", "Deposit processing fee", "Gross transaction amount", "Transaction currency", "Exchange rate", "Reference ID", "Description"];

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ebayDate = (iso) => { const [y, m, d] = iso.split("-"); return `${MON[+m - 1]} ${+d}, ${y}`; };

// items: [date, type, net, fee, order, description]. For an Order, `fee` is the final value fee
// (fixed 0.30 plus a variable part is split across the two columns); for other rows it is ignored.
// A Payout row is added when `withPayoutRow`; real reports carry one per payout.
export function buildReport({ id = "5081234567", effective = "2026-10-08", currency = "USD", items, withPayoutRow = false, totalOverride }) {
  const csv = (v) => (/[",]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const out = ["Transaction report", "Seller ID: samplesel1", "Report period: sample", "", HEAD.map(csv).join(",")];
  let net = 0, n = 0;
  const row = (date, type, order, netS, fee, desc, payoutId = id) => {
    const c = HEAD.map(() => "--");
    const set = (name, v) => { c[HEAD.indexOf(name)] = v; };
    set("Transaction creation date", ebayDate(date)); set("Type", type); set("Order number", order || "--"); set("Net amount", netS);
    set("Payout currency", currency); set("Payout date", ebayDate(effective)); set("Payout ID", payoutId); set("Payout status", "Succeeded");
    set("Description", desc || "--"); set("Transaction currency", currency);
    if (type === "Order" && fee) { set("Final Value Fee - fixed", (-0.3).toFixed(2)); set("Final Value Fee - variable", (-(fee - 0.3)).toFixed(2)); }
    out.push(c.map(csv).join(","));
  };
  for (const [date, type, amount, fee, order, desc] of items) {
    n++;
    const bad = typeof amount === "string";
    if (!bad) net += Math.round(amount * 100);
    row(date, type, order || `12-0${1000 + n}-0000${n}`, bad ? amount : amount.toFixed(2), fee, desc);
  }
  if (withPayoutRow) {
    const total = totalOverride ?? net / 100;
    row(effective, "Payout", "", total.toFixed(2), 0, "--");
  }
  return out.join("\n") + "\n";
}

// [date, type, net, fee, order, description]. An Order's net is already after its fee.
const SAMPLE_ITEMS = [
  ["2026-09-28", "Order", 112.55, 17.44, "12-1001-1", ""],
  ["2026-09-29", "Order", 36.20, 5.60, "12-1002-1", ""],
  ["2026-09-30", "Order", 15.80, 3.20, "12-1003-1", ""],
  ["2026-10-01", "Order", 388.00, 49.99, "12-1004-1", ""],
  ["2026-10-02", "Refund", -36.20, 0, "12-1002-1", ""],
  ["2026-10-03", "Shipping label", -9.85, 0, "12-1001-1", ""],
  ["2026-10-04", "Claim", -15.80, 0, "12-1003-1", "Item not received"],
  ["2026-10-05", "Other fee", -6.40, 0, "", "Promoted Listings - General fee"],
  ["2026-10-06", "Other fee", -4.95, 0, "", "Store subscription fee"],
  ["2026-10-07", "Credit", 3.00, 0, "", "Final value fee credit"],
];

export const sampleReport = () => buildReport({ items: SAMPLE_ITEMS, withPayoutRow: true });
// The same report after a hand edit: a row dropped from the paste so the payout no longer
// agrees, one Type no rule recognises and one amount that is not a number.
export function sampleBrokenReport() {
  const total = SAMPLE_ITEMS.reduce((a, r) => a + Math.round(r[2] * 100), 0) / 100;
  const items = SAMPLE_ITEMS.filter((r) => r[1] !== "Shipping label");
  items.push(["2026-10-06", "Mystery item", 1.23, 0, "12-1099-1", ""], ["2026-10-06", "Order", "12..5", 0, "12-1098-1", ""]);
  return buildReport({ items, totalOverride: total, withPayoutRow: true });
}
