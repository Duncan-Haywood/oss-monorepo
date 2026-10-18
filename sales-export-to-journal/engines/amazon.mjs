// Amazon seller settlement report -> accounting journal.
//
// Amazon pays a marketplace seller a net deposit every settlement period. That one
// deposit hides sales, shipping income, tax, promotions, refunds, referral and FBA
// fees, storage, advertising and reserves. Bookkeepers need those split out, and a
// settlement that straddles a month end split in two. This module reads the
// "Flat File V2" settlement report (tab-delimited text, or the same columns as CSV),
// proves the rows add up to the deposit Amazon states, groups them into categories,
// and writes balanced journals for Xero, QuickBooks Online, QuickBooks Desktop (IIF)
// and a plain CSV.
//
// The report layout, the amount-type / amount-description names and each importer's
// column layout are from memory of public seller-help and import-help documents; no
// real settlement file and no live Xero or QuickBooks import was available when this
// was written. Rows no rule recognises are never dropped: they land in an
// "uncategorised" line and are reported, so the journal still equals the deposit.
//
// Everything is integer cents. Nothing here touches the network or the DOM.

export const CATEGORIES = {
  sales: { label: "Product sales", account: "Amazon Sales" },
  shipping: { label: "Shipping income", account: "Amazon Shipping Income" },
  promo: { label: "Promotional rebates", account: "Amazon Promotional Rebates" },
  refunds: { label: "Refunds and returns", account: "Amazon Refunds" },
  tax: { label: "Sales tax (collected and facilitator-withheld)", account: "Sales Tax Payable" },
  referral: { label: "Referral fees", account: "Amazon Referral Fees" },
  fba: { label: "FBA fulfilment fees", account: "Amazon FBA Fees" },
  storage: { label: "FBA storage and inventory fees", account: "Amazon Storage Fees" },
  advertising: { label: "Advertising", account: "Amazon Advertising" },
  subscription: { label: "Seller subscription", account: "Amazon Subscription Fees" },
  reimbursements: { label: "FBA reimbursements", account: "Amazon Reimbursements" },
  otherfees: { label: "Other selling fees", account: "Amazon Other Fees" },
  reserve: { label: "Reserve held / released", account: "Amazon Reserve" },
  uncategorised: { label: "Uncategorised Amazon items", account: "Amazon Uncategorised" },
  clearing: { label: "Amazon clearing (matches the bank deposit)", account: "Amazon Clearing" },
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

const norm = (h) => h.trim().toLowerCase().replace(/^﻿/, "").replace(/[\s_]+/g, "-");

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

const REQUIRED = ["settlement-id", "amount"];

export function parseSettlements(text, opts = {}) {
  const findings = [];
  const add = (severity, title, detail, line) => findings.push({ severity, title, detail, line: line || 0 });
  const lines = String(text || "").replace(/^﻿/, "").split(/\r?\n/);
  const first = lines.findIndex((l) => l.trim());
  if (first < 0) { add("error", "The file is empty", "Paste or choose a settlement report."); return { settlements: [], findings, summary: { rows: 0, settlements: 0 } }; }
  const d = (lines[first].match(/\t/g) || []).length >= (lines[first].match(/,/g) || []).length ? "\t" : ",";
  const head = splitLine(lines[first], d).map(norm);
  const col = (n) => head.indexOf(n);
  const missing = REQUIRED.filter((n) => col(n) < 0);
  if (missing.length) {
    add("error", "This does not look like a settlement report", `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Download the "Flat File V2" settlement report from Seller Central > Reports > Payments > All Statements.`, first + 1);
    return { settlements: [], findings, summary: { rows: 0, settlements: 0 } };
  }
  const I = Object.fromEntries(["settlement-id", "settlement-start-date", "settlement-end-date", "deposit-date", "total-amount", "currency", "transaction-type", "order-id", "amount-type", "amount-description", "amount", "posted-date", "sku", "marketplace-name"].map((n) => [n, col(n)]));
  const get = (cells, n) => (I[n] >= 0 ? (cells[I[n]] ?? "").trim() : "");
  const byId = new Map();
  const bucket = (id) => { if (!byId.has(id)) byId.set(id, { id, start: null, end: null, deposit: null, total: null, currency: "", rows: [], summaryRows: 0 }); return byId.get(id); };
  let rows = 0;
  for (let i = first + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = splitLine(lines[i], d);
    const id = get(cells, "settlement-id");
    if (!id) { add("warning", "Row has no settlement ID", "It was skipped.", i + 1); continue; }
    const s = bucket(id);
    const type = get(cells, "transaction-type"), amt = get(cells, "amount"), tot = get(cells, "total-amount");
    if (!type && !amt && tot) { // the summary row
      s.summaryRows++;
      if (s.summaryRows > 1) add("warning", `Settlement ${id} has more than one summary row`, "The first one is used.", i + 1);
      else {
        const t = parseAmount(tot);
        if (Number.isNaN(t)) add("error", `Total amount "${tot}" is not a number`, `Settlement ${id}.`, i + 1); else s.total = t;
        s.start = parseDate(get(cells, "settlement-start-date"), opts.dateOrder);
        s.end = parseDate(get(cells, "settlement-end-date"), opts.dateOrder);
        s.deposit = parseDate(get(cells, "deposit-date"), opts.dateOrder);
        s.currency = get(cells, "currency");
      }
      continue;
    }
    const a = parseAmount(amt);
    if (a === null) { if (type || get(cells, "amount-description")) add("warning", "Row has no amount", `${type} / ${get(cells, "amount-description")} was skipped.`, i + 1); continue; }
    if (Number.isNaN(a)) { add("error", `Amount "${amt}" is not a number`, "The row is left out, so this settlement will not add up to its deposit.", i + 1); continue; }
    const cur = get(cells, "currency");
    if (cur && s.currency && cur !== s.currency) add("warning", `Mixed currencies in settlement ${id}`, `${cur} row among ${s.currency} rows.`, i + 1);
    if (cur && !s.currency) s.currency = cur;
    s.rows.push({ line: i + 1, type, orderId: get(cells, "order-id"), sku: get(cells, "sku"), amountType: get(cells, "amount-type"), desc: get(cells, "amount-description"), amount: a, posted: parseDate(get(cells, "posted-date"), opts.dateOrder), marketplace: get(cells, "marketplace-name") });
    rows++;
  }
  const settlements = [...byId.values()].filter((s) => s.rows.length || s.summaryRows);
  if (!settlements.length) add("error", "No settlement rows found", "The header was read but there were no data rows.");
  return { settlements, findings, summary: { rows, settlements: settlements.length } };
}

// ---- categorising ------------------------------------------------------------

export function categoryOf(row) {
  const type = row.type.toLowerCase(), at = row.amountType.toLowerCase(), desc = row.desc.toLowerCase();
  const refund = /refund|chargeback/.test(type);
  if (/tax|vat|gst/.test(desc) && !/taxable/.test(desc)) return "tax";
  if (/tax/.test(at)) return "tax";
  if (at === "promotion" || /^promotion|promotional/.test(desc)) return "promo";
  if (at === "itemfees") {
    if (/commission/.test(desc)) return "referral";
    if (/fba|fulfil|weightbased|pickandpack|perunit|perorder/.test(desc)) return "fba";
    return "otherfees";
  }
  if (at === "itemprice" || /^(principal|shipping|giftwrap)$/.test(desc)) {
    if (refund) return "refunds";
    if (/^shipping/.test(desc)) return "shipping";
    return "sales";
  }
  if (/cost of advertising|advertising/.test(desc) || /advertising/.test(type)) return "advertising";
  if (/subscription/.test(desc)) return "subscription";
  if (/reimburs/.test(desc) || /reimburs/.test(type)) return "reimbursements";
  if (/reserve/.test(desc)) return "reserve";
  if (/storage|long.?term/.test(desc)) return "storage";
  if (/disposal|removal|inbound|placement|labell?ing|prep service|return processing|fba/.test(desc)) return "storage";
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
    if (s.total === null) findings.push({ severity: "warning", title: `Settlement ${s.id} has no summary row`, detail: "The deposit Amazon states could not be checked against the rows.", line: 0 });
    else if (s.total !== sum) findings.push({ severity: "error", title: `Settlement ${s.id}: rows add up to ${money(sum, cur)} but the deposit is ${money(s.total, cur)}`, detail: `Off by ${money(s.total - sum, cur)}. Rows are missing from the paste, or an amount was skipped. Do not post this journal until the figures agree.`, line: 0 });
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
    if (undated) findings.push({ severity: "warning", title: `${undated} row${undated === 1 ? "" : "s"} in settlement ${s.id} had no posted date`, detail: "They were placed in the settlement's final month.", line: 0 });
    if (outside) findings.push({ severity: "info", title: `${outside} row${outside === 1 ? "" : "s"} in settlement ${s.id} posted outside its start and end dates`, detail: "Amazon sometimes books late adjustments this way. They are journalled in the month they posted.", line: 0 });
    const keys = [...periods.keys()].sort();
    if (keys.length > 1) findings.push({ severity: "info", title: `Settlement ${s.id} spans ${keys.length} months`, detail: `Written as ${keys.length} journals (${keys.join(", ")}), each balanced to Amazon clearing, so every month's revenue and fees land in the month they happened. The bank deposit of ${s.total === null ? "the full amount" : money(s.total, cur)} then clears both.`, line: 0 });
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
      if (net !== 0 || !lines.length) lines.push({ category: "clearing", account: mapping.clearing, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0, memo: `Settlement ${s.id}${keys.length > 1 ? ` (${ym})` : ""}` });
      journals.push({ settlementId: s.id, period: ym, date, deposit: s.deposit, currency: cur, narration: `Amazon settlement ${s.id}${keys.length > 1 ? ` ${ym}` : ""}`, lines, clearing: net });
    });
    const unknown = s.rows.filter((r) => categoryOf(r) === "uncategorised");
    if (unknown.length) findings.push({ severity: "warning", title: `Settlement ${s.id} has ${unknown.length} item${unknown.length === 1 ? "" : "s"} no rule recognised`, detail: `${[...new Set(unknown.map((r) => r.desc || r.type))].slice(0, 5).join(", ")}. They are journalled to "${mapping.uncategorised}" so the journal still equals the deposit. Review them and reclassify by hand if needed.`, line: unknown[0].line });
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

const HEAD = ["settlement-id", "settlement-start-date", "settlement-end-date", "deposit-date", "total-amount", "currency", "transaction-type", "order-id", "merchant-order-id", "adjustment-id", "shipment-id", "marketplace-name", "amount-type", "amount-description", "amount", "fulfillment-id", "posted-date", "posted-date-time", "order-item-code", "merchant-order-item-id", "merchant-adjustment-item-id", "sku", "quantity-purchased", "promotion-id"];

export function buildReport({ id = "12345678901", start = "2026-09-24", end = "2026-10-08", deposit = "2026-10-09", currency = "USD", items, totalOverride }) {
  const sum = items.reduce((a, r) => a + Math.round(r[5] * 100), 0);
  const total = totalOverride ?? sum / 100;
  const row = (o) => HEAD.map((h) => o[h] ?? "").join("\t");
  const out = [HEAD.join("\t"), row({ "settlement-id": id, "settlement-start-date": `${start} 00:00:00 UTC`, "settlement-end-date": `${end} 00:00:00 UTC`, "deposit-date": `${deposit} 00:00:00 UTC`, "total-amount": total.toFixed(2), currency })];
  for (const [type, order, at, desc, posted, amt, sku] of items)
    out.push(row({ "settlement-id": id, currency, "transaction-type": type, "order-id": order, "marketplace-name": "Amazon.com", "amount-type": at, "amount-description": desc, amount: typeof amt === "string" ? amt : amt.toFixed(2), "posted-date": posted, sku: sku || "" }));
  return out.join("\n") + "\n";
}

const O1 = "111-0000001-0000001", O2 = "111-0000002-0000002";
const SAMPLE_ITEMS = [
  ["Order", O1, "ItemPrice", "Principal", "2026-09-28", 129.99, "WIDGET-1"],
  ["Order", O1, "ItemPrice", "Tax", "2026-09-28", 9.10, "WIDGET-1"],
  ["Order", O1, "ItemPrice", "Shipping", "2026-09-28", 4.99, "WIDGET-1"],
  ["Order", O1, "ItemPrice", "ShippingTax", "2026-09-28", 0.35, "WIDGET-1"],
  ["Order", O1, "Promotion", "Principal", "2026-09-28", -5.00, "WIDGET-1"],
  ["Order", O1, "ItemFees", "Commission", "2026-09-28", -19.50, "WIDGET-1"],
  ["Order", O1, "ItemFees", "FBAPerUnitFulfillmentFee", "2026-09-28", -3.22, "WIDGET-1"],
  ["Order", O1, "ItemWithheldTax", "MarketplaceFacilitatorTax-Principal", "2026-09-28", -9.10, "WIDGET-1"],
  ["Order", O1, "ItemWithheldTax", "MarketplaceFacilitatorTax-Shipping", "2026-09-28", -0.35, "WIDGET-1"],
  ["Order", O2, "ItemPrice", "Principal", "2026-10-02", 449.99, "GADGET-2"],
  ["Order", O2, "ItemPrice", "Tax", "2026-10-02", 31.50, "GADGET-2"],
  ["Order", O2, "ItemFees", "Commission", "2026-10-02", -67.50, "GADGET-2"],
  ["Order", O2, "ItemFees", "FBAPerUnitFulfillmentFee", "2026-10-02", -5.40, "GADGET-2"],
  ["Order", O2, "ItemWithheldTax", "MarketplaceFacilitatorTax-Principal", "2026-10-02", -31.50, "GADGET-2"],
  ["Refund", O1, "ItemPrice", "Principal", "2026-10-04", -129.99, "WIDGET-1"],
  ["Refund", O1, "ItemPrice", "Tax", "2026-10-04", -9.10, "WIDGET-1"],
  ["Refund", O1, "ItemWithheldTax", "MarketplaceFacilitatorTax-Principal", "2026-10-04", 9.10, "WIDGET-1"],
  ["Refund", O1, "ItemFees", "RefundCommission", "2026-10-04", 3.90, "WIDGET-1"],
  ["other-transaction", "", "other-transaction", "Subscription Fee", "2026-09-25", -39.99],
  ["other-transaction", "", "other-transaction", "Storage Fee", "2026-10-03", -12.40],
  ["other-transaction", "", "other-transaction", "Cost of Advertising", "2026-10-05", -85.00],
  ["other-transaction", "", "other-transaction", "Current Reserve Amount", "2026-10-08", -100.00],
  ["other-transaction", "", "other-transaction", "Previous Reserve Amount Balance", "2026-10-08", 100.00],
];

export const sampleReport = () => buildReport({ items: SAMPLE_ITEMS });
// The same report after a hand edit: a row dropped from the paste, so the deposit no longer
// agrees, plus one adjustment no rule recognises and one amount that is not a number.
export function sampleBrokenReport() {
  const items = SAMPLE_ITEMS.filter((r) => r[3] !== "Cost of Advertising");
  items.push(["other-transaction", "", "other-transaction", "Mystery Adjustment", "2026-10-06", 1.23], ["other-transaction", "", "other-transaction", "Subscription Fee", "2026-10-06", "12..5"]);
  return buildReport({ items, totalOverride: SAMPLE_ITEMS.reduce((a, r) => a + Math.round(r[5] * 100), 0) / 100 });
}
