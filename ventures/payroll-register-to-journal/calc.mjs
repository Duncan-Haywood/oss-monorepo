// Payroll register CSV -> accounting journal.
//
// Payroll providers (Gusto, ADP, Paychex, QuickBooks Payroll, a spreadsheet) export a register with one
// row per employee per pay date: gross pay, each employee tax and deduction, net pay, and the employer's
// own taxes and contributions. Bookkeepers have to turn that into one balanced journal per pay run:
// wages and employer costs as expenses, every withholding as a liability, and net pay to a payroll
// clearing account that the bank withdrawal then clears. This module reads the register, checks every
// row (gross pay less every withholding and deduction must equal net pay), totals what each run creates
// owing to the IRS and states, and writes balanced journals for Xero, QuickBooks Online, QuickBooks
// Desktop (IIF) and plain CSV.
//
// Column names and importer layouts are from memory of public payroll and accounting help documents; no
// real payroll export and no live import was available when this was written. Money that no column
// explains goes to an uncategorised line and is reported, never dropped. Employee names are shown on
// screen in findings only; they are never written into a journal.
//
// Everything is integer cents. Nothing here touches the network or the DOM.

export const CATEGORIES = {
  wages: { label: "Gross wages", account: "Wages and Salaries" },
  ertax: { label: "Employer payroll taxes", account: "Payroll Tax Expense" },
  erben: { label: "Employer retirement and benefit contributions", account: "Employee Benefits Expense" },
  fit: { label: "Federal income tax withheld (liability)", account: "Federal Withholding Payable" },
  fica: { label: "Social Security and Medicare, employee and employer (liability)", account: "FICA Payable" },
  state: { label: "State and local withholding (liability)", account: "State Withholding Payable" },
  unemp: { label: "FUTA and SUTA (liability)", account: "Unemployment Tax Payable" },
  retire: { label: "401(k) deferrals plus employer match (liability)", account: "Retirement Plan Payable" },
  health: { label: "Benefit deductions (liability)", account: "Benefits Payable" },
  otherded: { label: "Other deductions and garnishments (liability)", account: "Other Payroll Deductions Payable" },
  uncategorised: { label: "Gross pay no column explains", account: "Payroll Uncategorised" },
  clearing: { label: "Net pay (payroll clearing)", account: "Payroll Clearing" },
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

const norm = (h) => h.trim().toLowerCase().replace(/^﻿/, "").replace(/\(k\)/g, "k").replace(/[\s_/]+/g, "-").replace(/\(.*\)$/, "").replace(/-+$/, "");

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

// "$1,250.00", "($3.00)", "-$1.63", "--" -> cents; null when blank, NaN when not a number.
export function parseMoney(s) {
  const t = String(s ?? "").trim();
  if (t === "" || /^-+$/.test(t)) return null;
  const neg = /^\(.*\)$/.test(t) || /^[-−]/.test(t) || /[-−]$/.test(t);
  const core = t.replace(/[^0-9.,]/g, "");
  if (!core) return NaN;
  const v = parseAmount(core);
  return v === null || Number.isNaN(v) ? NaN : neg ? -Math.abs(v) : v;
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

// Several names per column because every payroll provider spells them differently. When a register
// carries two columns that match one field (say "Social Security" and "Employee Social Security"), the
// first one found is read, and the second is reported as unread so nothing is silently dropped.
const COLUMNS = {
  date: ["pay-date", "check-date", "payment-date", "date"],
  employee: ["employee", "employee-name", "name"],
  gross: ["gross-pay", "gross-wages", "total-gross", "gross"],
  net: ["net-pay", "net-check", "net-amount", "take-home", "net"],
  fit: ["federal-income-tax", "federal-withholding", "federal-income-tax-withheld", "federal-tax", "fit"],
  eess: ["social-security", "employee-social-security", "social-security-employee", "oasdi", "fica-social-security", "ss-employee"],
  eemed: ["medicare", "employee-medicare", "medicare-employee"],
  addmed: ["additional-medicare", "addl-medicare"],
  sit: ["state-income-tax", "state-withholding", "state-tax", "state-income-tax-withheld"],
  local: ["local-tax", "local-income-tax", "city-tax", "local-withholding"],
  sdi: ["state-disability", "sdi", "state-disability-insurance", "ca-sdi"],
  eeret: ["401k", "401", "401k-employee", "employee-401k", "retirement", "roth-401k", "roth-401"],
  health: ["health-insurance", "medical", "health", "dental", "vision", "hsa", "fsa", "benefit-deductions"],
  other: ["other-deductions", "garnishment", "garnishments", "post-tax-deductions", "deductions", "union-dues"],
  erss: ["employer-social-security", "er-social-security", "social-security-employer", "employer-ss"],
  ermed: ["employer-medicare", "er-medicare", "medicare-employer"],
  futa: ["futa", "federal-unemployment", "employer-futa"],
  suta: ["suta", "state-unemployment", "sui", "employer-suta", "state-unemployment-insurance"],
  erret: ["employer-401k", "employer-401k-match", "401k-match", "employer-match", "er-401k", "employer-retirement", "401k-employer"],
  erben: ["employer-health", "employer-benefits", "er-health", "employer-health-insurance"],
};
const MONEY_FIELDS = ["gross", "net", "fit", "eess", "eemed", "addmed", "sit", "local", "sdi", "eeret", "health", "other", "erss", "ermed", "futa", "suta", "erret", "erben"];

const lastDay = (ym) => { const [y, m] = ym.split("-").map(Number); return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`; };

// Rows are grouped by pay date (default) or calendar month (opts.group = "month"). A run's total net pay
// can be checked against a figure the caller types in via opts.expected, only when the file holds exactly
// one group.
export function parseRegister(text, opts = {}) {
  const findings = [];
  const add = (severity, title, detail, line) => findings.push({ severity, title, detail, line: line || 0 });
  const lines = String(text || "").replace(/^﻿/, "").split(/\r?\n/);
  const first = lines.findIndex((l) => l.trim());
  const none = { payouts: [], remit: [], findings, summary: { rows: 0, payouts: 0 } };
  if (first < 0) { add("error", "The file is empty", "Paste or choose a payroll register export."); return none; }
  const d = (lines[first].match(/\t/g) || []).length > (lines[first].match(/,/g) || []).length ? "\t" : ",";
  const head = splitLine(lines[first], d).map(norm);
  const I = {};
  for (const [k, names] of Object.entries(COLUMNS)) { I[k] = -1; for (const n of names) { const i = head.indexOf(n); if (i >= 0) { I[k] = i; break; } } }
  const missing = [];
  if (I.date < 0) missing.push("Pay Date");
  if (I.gross < 0) missing.push("Gross Pay");
  if (I.net < 0) missing.push("Net Pay");
  if (missing.length) {
    add("error", "This does not look like a payroll register", `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Export the payroll register (one row per employee per pay date, with gross pay, each tax and deduction, and net pay) from your payroll provider, not a pay stub or a tax form.`, first + 1);
    return none;
  }
  const used = new Set(Object.values(I).filter((i) => i >= 0));
  head.forEach((h, i) => { if (h && !used.has(i) && /tax|insur|401|medic|social|fica|futa|suta|garnish|deduct|benefit|match|retire/.test(h)) add("warning", `Column "${h}" is not recognised and is not read`, "If it holds a withholding or an employer cost, any amount in it is not journalled on its own. Net pay is still proved against gross pay, so a withholding in it shows as unexplained pay on every row that uses it. Rename the header to one the page knows (see the list below) and read it again.", first + 1); });
  const get = (cells, k) => (I[k] >= 0 ? (cells[I[k]] ?? "").trim() : "");
  const byId = new Map();
  let rows = 0;
  for (let i = first + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = splitLine(lines[i], d);
    const who = get(cells, "employee");
    const label = who || `line ${i + 1}`;
    if (/^(total|totals|grand total|company total)/i.test(who) || (!who && /^total/i.test(cells[0] || ""))) { add("info", `Totals row skipped`, `Line ${i + 1} looks like a totals row and is not journalled, so it is not counted twice.`, i + 1); continue; }
    const date = parseDate(get(cells, "date"), opts.dateOrder);
    if (!date) { add("error", `Pay date "${get(cells, "date")}" not understood`, `${label}'s row is left out, so its pay run will not add up.`, i + 1); continue; }
    const f = {};
    let bad = false;
    for (const k of MONEY_FIELDS) {
      const v = parseMoney(get(cells, k));
      if (Number.isNaN(v)) { add("error", "An amount is not a number", `"${get(cells, k)}" in ${k} on ${label} was left out with its row.`, i + 1); bad = true; break; }
      f[k] = v ?? 0;
    }
    if (bad) continue;
    if (!get(cells, "gross") && !get(cells, "net")) { add("warning", "Row has no gross or net pay", `${label} was skipped.`, i + 1); continue; }
    const abs = Math.abs;
    // Withholdings print as positives or negatives depending on the provider; either sign is read as money taken out.
    const fica = abs(f.eess) + abs(f.eemed) + abs(f.addmed) + abs(f.erss) + abs(f.ermed);
    const eeTotal = abs(f.fit) + abs(f.eess) + abs(f.eemed) + abs(f.addmed) + abs(f.sit) + abs(f.local) + abs(f.sdi) + abs(f.eeret) + abs(f.health) + abs(f.other);
    const unexplained = f.gross - eeTotal - f.net;
    if (unexplained < 0) add("error", `Net pay is more than gross pay less withholdings on ${label}`, `${money(f.gross)} gross less ${money(eeTotal)} of withholdings leaves ${money(f.gross - eeTotal)}, but net pay is ${money(f.net)}: ${money(-unexplained)} too much. Reimbursements or a manual check can do this; a hand-edited file will too. The journal books the difference as a debit to the uncategorised account.`, i + 1);
    const parts = {
      wages: -f.gross,
      ertax: -(abs(f.erss) + abs(f.ermed) + abs(f.futa) + abs(f.suta)),
      erben: -(abs(f.erret) + abs(f.erben)),
      fit: abs(f.fit),
      fica,
      state: abs(f.sit) + abs(f.local) + abs(f.sdi),
      unemp: abs(f.futa) + abs(f.suta),
      retire: abs(f.eeret) + abs(f.erret),
      health: abs(f.health) + abs(f.erben),
      otherded: abs(f.other),
      uncategorised: unexplained,
    };
    const id = opts.group === "month" ? date.slice(0, 7) : date;
    if (!byId.has(id)) byId.set(id, { id, effective: opts.group === "month" ? lastDay(id) : date, last: date, stated: null, currency: "USD", rows: [] });
    const s = byId.get(id);
    if (date > s.last) s.last = date;
    s.rows.push({ line: i + 1, label, created: date, parts, net: f.net });
    rows++;
  }
  const payouts = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  if (!payouts.length) add("error", "No employees found", "The header was read but there were no usable data rows.");
  if (opts.expected != null && Number.isFinite(opts.expected)) {
    if (payouts.length === 1) payouts[0].stated = opts.expected;
    else add("info", "Expected total ignored", "It can only be applied when the file holds exactly one pay run (or one month).");
  }
  const remit = payouts.map((s) => {
    const sum = (k) => s.rows.reduce((a, r) => a + r.parts[k], 0);
    const fit = sum("fit"), fica = sum("fica");
    return { id: s.id, rows: s.rows.length, fit, fica, form941: fit + fica, state: sum("state"), unemp: sum("unemp"), retire: sum("retire"), health: sum("health"), net: s.rows.reduce((a, r) => a + r.net, 0) };
  });
  return { payouts, remit, findings, summary: { rows, payouts: payouts.length } };
}

// ---- categorising ------------------------------------------------------------

export function categoryOf(row) { return Object.entries(row.parts).filter(([, v]) => v).map(([k]) => k); }

// ---- journals ----------------------------------------------------------------

export function buildJournals(payouts, opts = {}) {
  const mapping = opts.mapping || defaultMapping();
  const findings = [];
  const journals = [];
  for (const s of payouts) {
    const sum = s.rows.reduce((a, r) => a + r.net, 0);
    if (s.stated === null) findings.push({ severity: "info", title: `${s.id}: no expected net pay to check against`, detail: `Net pay for ${s.id} adds up to ${money(sum)}. Type the run's total net pay (the payroll bank withdrawal for net pay) into the optional box to prove it.`, line: 0 });
    else if (s.stated !== sum) findings.push({ severity: "error", title: `${s.id}: net pay adds up to ${money(sum)} but the total you gave is ${money(s.stated)}`, detail: `Off by ${money(s.stated - sum)}. Employees are missing from the paste, or an amount was skipped. Do not post this journal until the figures agree.`, line: 0 });
    const m = new Map();
    for (const r of s.rows) for (const [k, v] of Object.entries(r.parts)) {
      if (!v) continue;
      const e = m.get(k) || { net: 0, count: 0 };
      e.net += v; e.count++; m.set(k, e);
    }
    const lines = [];
    for (const k of CATEGORY_ORDER) {
      if (k === "clearing" || !m.has(k)) continue;
      const { net, count } = m.get(k);
      if (net === 0) continue;
      lines.push({ category: k, account: mapping[k], debit: net < 0 ? -net : 0, credit: net > 0 ? net : 0, memo: `${CATEGORIES[k].label} (${count} employee${count === 1 ? "" : "s"})` });
    }
    const net = lines.reduce((a, l) => a + l.credit - l.debit, 0);
    if (net !== 0 || !lines.length) lines.push({ category: "clearing", account: mapping.clearing, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0, memo: `Net pay ${s.id}` });
    journals.push({ payoutId: s.id, period: s.id, date: s.effective, deposit: s.last, currency: "USD", narration: `Payroll ${s.id}`, lines, clearing: net });
    const unk = s.rows.filter((r) => r.parts.uncategorised);
    if (unk.length) findings.push({ severity: "warning", title: `${s.id} has ${unk.length} employee${unk.length === 1 ? "" : "s"} where gross pay is not explained by the withholdings and net pay`, detail: `${money(unk.reduce((a, r) => a + r.parts.uncategorised, 0))} in total (a withholding in a column the page does not read, a reimbursement, or a net pay that was edited). It is journalled to "${mapping.uncategorised}" so the journal still balances. Review those rows and reclassify by hand.`, line: unk[0].line });
  }
  return { journals, findings };
}

export function uncategorisedRows(payouts) {
  return payouts.flatMap((s) => s.rows.filter((r) => r.parts.uncategorised).map((r) => ({ payout: s.id, ...r })));
}

export function reconciliation(payouts, journals) {
  return payouts.map((s) => {
    const sum = s.rows.reduce((a, r) => a + r.net, 0);
    return { id: s.id, deposit: s.last, currency: "USD", stated: s.stated, journalled: sum, periods: journals.filter((j) => j.payoutId === s.id).map((j) => ({ period: j.period, date: j.date, clearing: j.clearing })), agrees: s.stated === null ? null : s.stated === sum };
  });
}

export function validate(text, opts = {}) {
  const p = parseRegister(text, opts);
  const b = buildJournals(p.payouts, opts);
  const findings = [...p.findings, ...b.findings];
  const order = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b2) => order[a.severity] - order[b2.severity]);
  return { payouts: p.payouts, remit: p.remit, journals: b.journals, findings, reconciliation: reconciliation(p.payouts, b.journals), summary: { ...p.summary, journals: b.journals.length } };
}

// ---- exports -----------------------------------------------------------------

const csvCell = (v) => { const s = String(v ?? ""); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csvRow = (a) => a.map(csvCell).join(",");
const fmtDate = (iso, order) => { if (!iso) return ""; const [y, m, d] = iso.split("-"); return order === "dmy" ? `${d}/${m}/${y}` : order === "mdy" ? `${m}/${d}/${y}` : iso; };
const docNo = (j) => `PR-${j.payoutId}`;

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
  for (const j of journals) for (const l of j.lines) rows.push(csvRow([docNo(j), fmtDate(j.date, o.dateOrder || "mdy"), l.account, l.debit ? dollars(l.debit) : "", l.credit ? dollars(l.credit) : "", l.memo, "", j.currency]));
  return rows.join("\r\n") + "\r\n";
}

// QuickBooks Desktop IIF general journal: positive = debit, a transaction's lines sum to zero.
export function toIif(journals) {
  const t = (s) => String(s ?? "").replace(/[\t\r\n]+/g, " ");
  const out = ["!TRNS\tTRNSID\tTRNSTYPE\tDATE\tACCNT\tAMOUNT\tDOCNUM\tMEMO", "!SPL\tSPLID\tTRNSTYPE\tDATE\tACCNT\tAMOUNT\tDOCNUM\tMEMO", "!ENDTRNS"];
  for (const j of journals) {
    const date = fmtDate(j.date, "mdy"), doc = t(docNo(j));
    j.lines.forEach((l, i) => out.push(`${i === 0 ? "TRNS" : "SPL"}\t\tGENERAL JOURNAL\t${date}\t${t(l.account)}\t${((l.debit - l.credit) / 100).toFixed(2)}\t${doc}\t${t(l.memo)}`));
    out.push("ENDTRNS");
  }
  return out.join("\r\n") + "\r\n";
}

export function journalsCsv(journals) {
  const rows = [csvRow(["payroll", "period", "date", "category", "account", "debit", "credit", "memo"])];
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

const HEAD = ["Pay Date", "Employee", "Gross Pay", "Federal Income Tax", "Social Security", "Medicare", "State Income Tax", "401(k)", "Health Insurance", "Other Deductions", "Net Pay", "Employer Social Security", "Employer Medicare", "FUTA", "SUTA", "Employer 401(k) Match"];
const usd = (c) => "$" + (c / 100).toFixed(2);
const cents = (v) => Math.round((v || 0) * 100);

// items in dollars. Social Security 6.2% and Medicare 1.45% are computed for both sides; net pay is computed.
export function buildReport(items) {
  const out = [HEAD.join(",")];
  for (const it of items) {
    const g = cents(it.gross), ss = Math.round(g * 0.062), med = Math.round(g * 0.0145);
    const net = g - cents(it.fit) - ss - med - cents(it.state) - cents(it.ret) - cents(it.health) - cents(it.other);
    const futa = it.futa === undefined ? 0 : cents(it.futa);
    out.push([it.date, it.emp, usd(g), usd(cents(it.fit)), usd(ss), usd(med), usd(cents(it.state)), usd(cents(it.ret)), usd(cents(it.health)), usd(cents(it.other)), usd(net), usd(ss), usd(med), usd(futa), usd(cents(it.suta)), usd(cents(it.match))].join(","));
  }
  return out.join("\n") + "\n";
}

export const SAMPLE_ITEMS = [
  { date: "2026-09-15", emp: "A. Example", gross: 2400, fit: 260, state: 90, ret: 120, health: 85, other: 0, futa: 14.4, suta: 24, match: 72 },
  { date: "2026-09-15", emp: "B. Sample", gross: 1800, fit: 150, state: 62, ret: 0, health: 85, other: 50, futa: 10.8, suta: 18, match: 0 },
  { date: "2026-09-30", emp: "A. Example", gross: 2400, fit: 260, state: 90, ret: 120, health: 85, other: 0, futa: 0, suta: 0, match: 72 },
  { date: "2026-09-30", emp: "B. Sample", gross: 1950, fit: 168, state: 68, ret: 0, health: 85, other: 50, futa: 0, suta: 0, match: 0 },
  { date: "2026-10-15", emp: "A. Example", gross: 2400, fit: 260, state: 90, ret: 120, health: 85, other: 0, futa: 0, suta: 0, match: 72 },
];
export const SAMPLE_NET_SEPT15 = (() => {
  let t = 0;
  for (const it of SAMPLE_ITEMS.filter((x) => x.date === "2026-09-15")) {
    const g = cents(it.gross);
    t += g - cents(it.fit) - Math.round(g * 0.062) - Math.round(g * 0.0145) - cents(it.state) - cents(it.ret) - cents(it.health) - cents(it.other);
  }
  return t / 100;
})();

export const sampleReport = () => buildReport(SAMPLE_ITEMS);
// The same register after a hand edit: a net pay that no longer matches, a garbled amount and a stray totals row.
export function sampleBrokenReport() {
  const lines = buildReport(SAMPLE_ITEMS).trimEnd().split("\n");
  const a = lines[1].split(","); a[10] = "$2100.00"; lines[1] = a.join(",");
  const b = lines[2].split(","); b[3] = "$1..50"; lines[2] = b.join(",");
  lines.push("Total,,$10950.00");
  return lines.join("\n") + "\n";
}
