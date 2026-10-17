// Shopify Payments payout transactions export -> accounting journal.
//
// Shopify pays out a net deposit that hides gross sales, processing fees, refunds,
// chargebacks and shipping-label purchases. Bookkeepers need those split out, and a
// payout that straddles a month end split in two. This module reads the payout
// transactions CSV (Payments > Payouts > Export, or the all-transactions export: same
// columns), proves each payout's rows add up to the payout, groups them into
// categories and writes balanced journals for Xero, QuickBooks Online, QuickBooks
// Desktop (IIF) and a plain CSV.
//
// The report layout, the Type values and each importer's column layout are from memory
// of public Shopify and accounting help documents; no real Shopify export and no live
// Xero or QuickBooks import was available when this was written.
// Rows no rule recognises are never dropped: they land in an "uncategorised" line and
// are reported, so the journal still equals the net.
//
// Everything is integer cents. Nothing here touches the network or the DOM.

export const CATEGORIES = {
  sales: { label: "Order payments (gross)", account: "Shopify Sales" },
  refunds: { label: "Refunds", account: "Shopify Refunds" },
  disputes: { label: "Chargebacks and dispute fees", account: "Shopify Chargebacks" },
  shipping: { label: "Shipping labels bought in Shopify", account: "Shopify Shipping Labels" },
  fees: { label: "Shopify Payments fees (processing, FX, app and referral)", account: "Shopify Fees" },
  other: { label: "Adjustments and transfers", account: "Shopify Adjustments" },
  uncategorised: { label: "Uncategorised Shopify items", account: "Shopify Uncategorised" },
  clearing: { label: "Shopify clearing (matches the bank deposit)", account: "Shopify Clearing" },
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
const UNPAID = "(not yet paid out)";

// Rows are grouped by automatic payout id. `payout` rows (an export may carry one per payout) state the deposit; the payout transactions export usually does not,
// so the caller may supply the deposit from the bank / dashboard via opts.expected.
export function parsePayouts(text, opts = {}) {
  const findings = [];
  const add = (severity, title, detail, line) => findings.push({ severity, title, detail, line: line || 0 });
  const lines = String(text || "").replace(/^﻿/, "").split(/\r?\n/);
  const first = lines.findIndex((l) => l.trim());
  const none = { payouts: [], findings, summary: { rows: 0, payouts: 0 } };
  if (first < 0) { add("error", "The file is empty", "Paste or choose a Shopify payout transactions CSV."); return none; }
  const d = (lines[first].match(/\t/g) || []).length > (lines[first].match(/,/g) || []).length ? "\t" : ",";
  const head = splitLine(lines[first], d).map(norm);
  const col = (...names) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; };
  const I = {
    payout: col("payout-id", "automatic-payout-id", "payout"),
    effective: col("payout-date", "automatic-payout-effective-at", "arrival-date"),
    id: col("balance-transaction-id", "id", "order"),
    created: col("transaction-date", "created", "created-utc", "created-date"),
    currency: col("currency"),
    gross: col("gross", "amount"),
    fee: col("fee"),
    net: col("net"),
    cat: col("type", "reporting-category"),
    type: col("reporting-category"),
    source: col("source-id", "source"),
    desc: col("description"),
  };
  const missing = [];
  if (I.net < 0) missing.push("net");
  if (I.cat < 0 && I.type < 0) missing.push("Type");
  if (missing.length) {
    add("error", "This does not look like a Shopify payout transactions export", `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. In Shopify admin open Settings > Payments > Shopify Payments > Payouts, open a payout and choose Export (or use Finances > Payouts > Export transactions).`, first + 1);
    return none;
  }
  const get = (cells, k) => (I[k] >= 0 ? (cells[I[k]] ?? "").trim() : "");
  const byId = new Map();
  const bucket = (id) => { if (!byId.has(id)) byId.set(id, { id, effective: null, stated: null, currency: "", rows: [] }); return byId.get(id); };
  let rows = 0;
  for (let i = first + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = splitLine(lines[i], d);
    const cat = (get(cells, "cat") || get(cells, "type")).toLowerCase();
    const netS = get(cells, "net");
    const net = parseAmount(netS);
    if (net === null) { add("warning", "Row has no net amount", `${cat || "row"} was skipped.`, i + 1); continue; }
    if (Number.isNaN(net)) { add("error", `Net amount "${netS}" is not a number`, "The row is left out, so its payout will not add up.", i + 1); continue; }
    const grossS = get(cells, "gross"), feeS = get(cells, "fee");
    let gross = grossS === "" ? net : parseAmount(grossS), fee = feeS === "" ? 0 : parseAmount(feeS);
    if (Number.isNaN(gross) || Number.isNaN(fee)) { add("error", "Gross or fee is not a number", `Row ${get(cells, "id") || i + 1} was left out.`, i + 1); continue; }
    if (gross - fee !== net) add("error", `Gross minus fee does not equal net on ${get(cells, "id") || `line ${i + 1}`}`, `${money(gross)} - ${money(fee)} = ${money(gross - fee)}, but the row says ${money(net)}. The journal uses the net; check the file was not edited.`, i + 1);
    const pid = get(cells, "payout") || UNPAID;
    const s = bucket(pid);
    const cur = get(cells, "currency").toUpperCase();
    if (cur && s.currency && cur !== s.currency) add("warning", `Mixed currencies in payout ${pid}`, `${cur} row among ${s.currency} rows. Journals assume one currency per payout.`, i + 1);
    if (cur && !s.currency) s.currency = cur;
    const eff = parseDate(get(cells, "effective"), opts.dateOrder);
    if (eff && !s.effective) s.effective = eff;
    const row = { line: i + 1, id: get(cells, "id"), cat, desc: get(cells, "desc"), source: get(cells, "source"), gross, fee, net, created: parseDate(get(cells, "created"), opts.dateOrder) };
    if (cat === "payout") { s.stated = (s.stated || 0) + -net; continue; } // the deposit itself, not an activity row
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

const FEE_CATS = /^(fee|.*_fee|.*_fees|.*_cost|.*_costs|app_fee|referral_fee|tax|vat|billing|currency_conversion|fx)$/;
export function categoryOf(row) {
  const c = String(row.cat || "").toLowerCase().trim().replace(/[\s-]+/g, "_");
  if (c === "charge" || c === "payment" || c === "capture" || c === "sale") return "sales";
  if (c === "refund" || c === "refund_failure" || c === "refund_reversal") return "refunds";
  if (c === "dispute" || c === "chargeback" || c === "chargeback_won" || c === "chargeback_hold" || c === "chargeback_hold_release" || c === "dispute_reversal" || c === "dispute_withdrawal" || c === "dispute_fee") return "disputes";
  if (c === "shipping_label" || c === "shipping_label_refund" || c === "shipping_label_adjustment" || c === "shipping_return_to_sender") return "shipping";
  if (FEE_CATS.test(c)) return "fees";
  if (c === "adjustment" || c === "credit" || c === "debit" || c === "transfer" || c === "payout_reversal" || c === "payout_failure" || c === "reserve" || c === "reserved_funds" || c === "reserved_funds_release" || c === "advance" || c === "capital") return "other";
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
    if (s.id === UNPAID) findings.push({ severity: "warning", title: `${s.rows.length} row${s.rows.length === 1 ? "" : "s"} have no payout ID`, detail: "They are not yet paid out (or the report omits the payout column). They are journalled to Shopify clearing as a separate group and will not match a bank deposit yet.", line: 0 });
    else if (s.stated === null) findings.push({ severity: "warning", title: `Payout ${s.id} has no payout row and no expected deposit`, detail: `The rows add up to ${money(sum, cur)}. Enter the deposit from your bank or Shopify in the box above to check it.`, line: 0 });
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
    if (keys.length > 1) findings.push({ severity: "info", title: `Payout ${s.id} spans ${keys.length} months`, detail: `Written as ${keys.length} journals (${keys.join(", ")}), each balanced to Shopify clearing, so every month's revenue and fees land in the month they happened. The bank deposit of ${s.stated === null ? "the full amount" : money(s.stated, cur)} then clears both.`, line: 0 });
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
      journals.push({ payoutId: s.id, period: ym, date, deposit: s.effective, currency: cur, narration: `Shopify payout ${s.id}${keys.length > 1 ? ` ${ym}` : ""}`, lines, clearing: net });
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

const HEAD = ["Transaction Date", "Type", "Order", "Card Brand", "Card Source", "Payout Status", "Payout Date", "Payout ID", "Available On", "Amount", "Fee", "Net", "Checkout", "Payment Method Name", "Presentment Amount", "Presentment Currency", "Currency", "Vat"];

// items: [date, type, amount, fee, order]. A payout row is added when `withPayoutRow`
// (real exports usually have none, so the deposit is then typed in from the bank).
export function buildReport({ id = "1234567890", effective = "2026-10-08", currency = "USD", items, withPayoutRow = false, totalOverride }) {
  const csv = (v) => (/[",]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const out = [HEAD.join(",")];
  let net = 0, n = 0;
  const row = (date, type, order, amt, fee, netS) => out.push([`${date} 12:00:00 -0400`, type, order, type === "charge" ? "visa" : "", type === "charge" ? "online" : "", "paid", effective, id, effective, amt, fee, netS, "", type === "charge" ? "shopify_payments" : "", amt, currency, currency, ""].map(csv).join(","));
  for (const [date, type, amount, fee, order] of items) {
    n++;
    const bad = typeof amount === "string";
    const nn = bad ? NaN : amount - fee;
    if (!Number.isNaN(nn)) net += Math.round(nn * 100);
    row(date, type, order || `#${1000 + n}`, bad ? amount : amount.toFixed(2), fee.toFixed(2), bad ? amount : nn.toFixed(2));
  }
  if (withPayoutRow) {
    const total = totalOverride ?? net / 100;
    row(effective, "payout", "", (-total).toFixed(2), "0.00", (-total).toFixed(2));
  }
  return out.join("\n") + "\n";
}

const SAMPLE_ITEMS = [
  ["2026-09-28", "charge", 129.99, 3.97, "#1041"],
  ["2026-09-29", "charge", 49.00, 1.72, "#1042"],
  ["2026-09-30", "charge", 19.00, 0.85, "#1043"],
  ["2026-10-01", "charge", 449.99, 13.35, "#1044"],
  ["2026-10-02", "charge", 19.00, 0.85, "#1045"],
  ["2026-10-03", "refund", -49.00, 0.00, "#1042"],
  ["2026-10-04", "chargeback", -19.00, 15.00, "#1043"],
  ["2026-10-05", "shipping_label", -14.20, 0.00, "#1044"],
  ["2026-10-06", "app_fee", -4.50, 0.00, ""],
  ["2026-10-07", "adjustment", 2.00, 0.00, ""],
];

export const sampleReport = () => buildReport({ items: SAMPLE_ITEMS, withPayoutRow: true });
// The same export after a hand edit: a row dropped from the paste so the payout no longer
// agrees, one Type no rule recognises and one amount that is not a number.
export function sampleBrokenReport() {
  const total = SAMPLE_ITEMS.reduce((a, r) => a + Math.round((r[2] - r[3]) * 100), 0) / 100;
  const items = SAMPLE_ITEMS.filter((r) => r[1] !== "shipping_label");
  items.push(["2026-10-06", "mystery_item", 1.23, 0, "#1099"], ["2026-10-06", "charge", "12..5", 0, "#1098"]);
  return buildReport({ items, totalOverride: total, withPayoutRow: true });
}
