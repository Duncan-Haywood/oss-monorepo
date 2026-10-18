// Stripe payout reconciliation report -> accounting journal.
//
// Stripe pays out a net deposit that hides gross sales, processing fees, refunds and
// disputes. Bookkeepers need those split out, and a payout that straddles a month end
// split in two. This module reads the itemised payout reconciliation report (or the
// balance-transactions export: same columns under Title Case names), proves each
// payout's rows add up to the payout, groups them into categories and writes balanced
// journals for Xero, QuickBooks Online, QuickBooks Desktop (IIF) and a plain CSV.
//
// The report layout, the reporting_category values and each importer's column layout
// are from memory of public Stripe and accounting help documents; no real Stripe
// export and no live Xero or QuickBooks import was available when this was written.
// Rows no rule recognises are never dropped: they land in an "uncategorised" line and
// are reported, so the journal still equals the net.
//
// Everything is integer cents. Nothing here touches the network or the DOM.

export const CATEGORIES = {
  sales: { label: "Card and wallet sales (gross)", account: "Stripe Sales" },
  refunds: { label: "Refunds", account: "Stripe Refunds" },
  disputes: { label: "Disputes and reversals", account: "Stripe Disputes" },
  fees: { label: "Stripe fees (processing, billing, tax, FX, network)", account: "Stripe Fees" },
  other: { label: "Adjustments and transfers", account: "Stripe Adjustments" },
  uncategorised: { label: "Uncategorised Stripe items", account: "Stripe Uncategorised" },
  clearing: { label: "Stripe clearing (matches the bank deposit)", account: "Stripe Clearing" },
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

// Rows are grouped by automatic payout id. `payout` rows (the balance-transactions export
// carries one per payout) state the deposit; the itemised reconciliation report does not,
// so the caller may supply the deposit from the bank / dashboard via opts.expected.
export function parsePayouts(text, opts = {}) {
  const findings = [];
  const add = (severity, title, detail, line) => findings.push({ severity, title, detail, line: line || 0 });
  const lines = String(text || "").replace(/^﻿/, "").split(/\r?\n/);
  const first = lines.findIndex((l) => l.trim());
  const none = { payouts: [], findings, summary: { rows: 0, payouts: 0 } };
  if (first < 0) { add("error", "The file is empty", "Paste or choose a Stripe report."); return none; }
  const d = (lines[first].match(/\t/g) || []).length > (lines[first].match(/,/g) || []).length ? "\t" : ",";
  const head = splitLine(lines[first], d).map(norm);
  const col = (...names) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; };
  const I = {
    payout: col("automatic-payout-id", "payout-id", "payout"),
    effective: col("automatic-payout-effective-at", "automatic-payout-effective-at-utc", "payout-date", "arrival-date"),
    id: col("balance-transaction-id", "id"),
    created: col("created", "created-utc", "created-date"),
    currency: col("currency"),
    gross: col("gross", "amount"),
    fee: col("fee"),
    net: col("net"),
    cat: col("reporting-category"),
    type: col("type"),
    source: col("source-id", "source"),
    desc: col("description"),
  };
  const missing = [];
  if (I.net < 0) missing.push("net");
  if (I.cat < 0 && I.type < 0) missing.push("reporting_category");
  if (missing.length) {
    add("error", "This does not look like a Stripe payout report", `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. In the Stripe Dashboard open Reports > Payout reconciliation (or Balance > All activity) and download the itemised CSV.`, first + 1);
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

const FEE_CATS = /^(fee|stripe_fee|stripe_fx_fee|network_cost|tax|stripe_tax|billing|radar|climate|connect|issuing|terminal|treasury|payment_network|.*_fee|.*_fees|.*_cost)$/;
export function categoryOf(row) {
  const c = String(row.cat || "").toLowerCase().replace(/-/g, "_");
  if (c === "charge" || c === "payment" || c === "payment_intent" || c === "capture") return "sales";
  if (c === "refund" || c === "payment_refund" || c === "refund_failure") return "refunds";
  if (c === "dispute" || c === "dispute_reversal" || c === "chargeback" || c === "payment_failure_refund") return "disputes";
  if (FEE_CATS.test(c)) return "fees";
  if (c === "adjustment" || c === "transfer" || c === "payout_reversal" || c === "advance" || c === "advance_funding" || c === "other_adjustment" || c === "reserve_hold" || c === "reserve_release") return "other";
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
    if (s.id === UNPAID) findings.push({ severity: "warning", title: `${s.rows.length} row${s.rows.length === 1 ? "" : "s"} have no payout ID`, detail: "They are not yet paid out (or the report omits the payout column). They are journalled to Stripe clearing as a separate group and will not match a bank deposit yet.", line: 0 });
    else if (s.stated === null) findings.push({ severity: "warning", title: `Payout ${s.id} has no payout row and no expected deposit`, detail: `The rows add up to ${money(sum, cur)}. Enter the deposit from your bank or Stripe in the box above to check it.`, line: 0 });
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
    if (keys.length > 1) findings.push({ severity: "info", title: `Payout ${s.id} spans ${keys.length} months`, detail: `Written as ${keys.length} journals (${keys.join(", ")}), each balanced to Stripe clearing, so every month's revenue and fees land in the month they happened. The bank deposit of ${s.stated === null ? "the full amount" : money(s.stated, cur)} then clears both.`, line: 0 });
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
      journals.push({ payoutId: s.id, period: ym, date, deposit: s.effective, currency: cur, narration: `Stripe payout ${s.id}${keys.length > 1 ? ` ${ym}` : ""}`, lines, clearing: net });
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

const HEAD = ["automatic_payout_id", "automatic_payout_effective_at", "balance_transaction_id", "created", "available_on", "currency", "gross", "fee", "net", "reporting_category", "source_id", "description"];

// items: [created, category, gross, fee, description]. A payout row is added when `withPayoutRow`.
export function buildReport({ id = "po_1TESTPAYOUT01", effective = "2026-10-08 00:00:00", currency = "usd", items, withPayoutRow = true, totalOverride }) {
  let n = 0;
  const row = (o) => HEAD.map((h) => o[h] ?? "").join(",").replace(/\n/g, " ");
  const csv = (v) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const out = [HEAD.join(",")];
  let net = 0;
  for (const [created, cat, gross, fee, desc] of items) {
    n++;
    const g = typeof gross === "string" ? gross : gross.toFixed(2), f = typeof fee === "string" ? fee : fee.toFixed(2);
    const nn = typeof gross === "string" ? NaN : gross - fee;
    if (!Number.isNaN(nn)) net += Math.round(nn * 100);
    out.push(row({ automatic_payout_id: id, automatic_payout_effective_at: effective, balance_transaction_id: `txn_1T${String(n).padStart(6, "0")}`, created: `${created} 12:00:00`, available_on: `${effective}`, currency, gross: g, fee: f, net: Number.isNaN(nn) ? g : nn.toFixed(2), reporting_category: cat, source_id: `${cat === "charge" ? "ch" : "src"}_3T${String(n).padStart(6, "0")}`, description: csv(desc || "") }));
  }
  if (withPayoutRow) {
    const total = totalOverride ?? net / 100;
    out.push(row({ automatic_payout_id: id, automatic_payout_effective_at: effective, balance_transaction_id: "txn_1TPAYOUT", created: `${effective}`, available_on: `${effective}`, currency, gross: (-total).toFixed(2), fee: "0.00", net: (-total).toFixed(2), reporting_category: "payout", source_id: id, description: "STRIPE PAYOUT" }));
  }
  return out.join("\n") + "\n";
}

const SAMPLE_ITEMS = [
  ["2026-09-28", "charge", 129.99, 3.97, "Pro plan, annual"],
  ["2026-09-29", "charge", 49.00, 1.72, "Starter plan"],
  ["2026-09-30", "charge", 19.00, 0.85, "Add-on"],
  ["2026-10-01", "charge", 449.99, 13.35, "Team plan"],
  ["2026-10-02", "charge", 19.00, 0.85, "Add-on"],
  ["2026-10-03", "refund", -49.00, 0.00, "Refund: Starter plan"],
  ["2026-10-04", "dispute", -19.00, 15.00, "Dispute: Add-on"],
  ["2026-10-05", "stripe_fee", -4.50, 0.00, "Billing usage fee"],
  ["2026-10-06", "network_cost", -1.20, 0.00, "Card network assessment"],
  ["2026-10-07", "adjustment", 2.00, 0.00, "Courtesy credit"],
];

export const sampleReport = () => buildReport({ items: SAMPLE_ITEMS });
// The same report after a hand edit: a row dropped from the paste so the payout no longer
// agrees, one category no rule recognises and one amount that is not a number.
export function sampleBrokenReport() {
  const total = SAMPLE_ITEMS.reduce((a, r) => a + Math.round((r[2] - r[3]) * 100), 0) / 100;
  const items = SAMPLE_ITEMS.filter((r) => r[1] !== "network_cost");
  items.push(["2026-10-06", "mystery_item", 1.23, 0, "Unknown"], ["2026-10-06", "charge", "12..5", 0, "Typo"]);
  return buildReport({ items, totalOverride: total });
}
