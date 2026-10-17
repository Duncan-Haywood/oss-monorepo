// Freelancer tax pack arithmetic, tax year 2026. Pure functions, no DOM, no network.
// It READS the data the sibling tools keep in this browser (Invoice Maker, Expense
// Tracker, Mileage Log) and never writes to it. Not tax advice.
//
// Federal figures (Rev. Proc. 2025-32, as recorded in
// ventures/inherited-ira-10-year-withdrawal-planner/calc.mjs and
// ventures/self-employment-tax-calculator/calc.mjs): standard deduction
// $16,100 single / $32,200 joint; SS wage base $184,500; 1099-NEC filing
// threshold $2,000 for payments made after 2025 (was $600).
// Money is whole cents everywhere except the bracket tables.

export const TAX_YEAR = 2026;
export const SS_WAGE_BASE = 18450000; // cents
export const STANDARD_DEDUCTION = { single: 1610000, mfj: 3220000 };
export const QBI_THRESHOLD = { single: 20177500, mfj: 40355000 };
export const BRACKETS = {
  single: [[12400, 0.10], [50400, 0.12], [105700, 0.22], [201775, 0.24], [256225, 0.32], [640600, 0.35], [Infinity, 0.37]],
  mfj: [[24800, 0.10], [100800, 0.12], [211400, 0.22], [403550, 0.24], [512450, 0.32], [768700, 0.35], [Infinity, 0.37]],
};
export const FORM_1099_THRESHOLD_CENTS = 200000;

const int = (n) => Math.round(Number(n) || 0);

export function toCents(v) {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100 + (n < 0 ? -1e-9 : 1e-9)) : 0;
}

export function formatMoney(cents) {
  const n = int(cents) / 100;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
const yearOfIso = (s) => (isDate(s) ? Number(String(s).slice(0, 4)) : NaN);

// ---- Expense Tracker box: { entries: [...] } under "expense-tracker-data" ----
const SHARE = { meals: 0.5, personal: 0 };
const LINES = {
  advertising: ["8", "Advertising"], car_truck: ["9", "Car and truck (actual costs)"], fees: ["10", "Commissions and fees"],
  contract_labor: ["11", "Contract labor"], insurance: ["15", "Insurance (not health)"], interest: ["16b", "Interest"],
  legal_professional: ["17", "Legal and professional"], office: ["18", "Office expense"], rent_equipment: ["20a", "Rent: equipment"],
  rent_property: ["20b", "Rent: space"], repairs: ["21", "Repairs and maintenance"], supplies: ["22", "Supplies"],
  taxes_licenses: ["23", "Taxes and licences"], travel: ["24a", "Travel"], meals: ["24b", "Business meals (50%)"],
  utilities: ["25", "Utilities"], other: ["27a", "Other expenses"],
};
const lineOrder = (l) => parseFloat(l) + (/[a-z]$/.test(l) ? (l.charCodeAt(l.length - 1) - 96) / 100 : 0);

function entryDeductible(e) {
  const share = e.category in SHARE ? SHARE[e.category] : 1;
  const p = Number(e.bizPct);
  const biz = Number.isFinite(p) && p >= 0 && p <= 100 ? p : 100;
  return Math.round((int(e.cents) * share * biz) / 100);
}

export function readBox(text, key) {
  try {
    const d = JSON.parse(text || "null");
    return d && Array.isArray(d[key]) ? d : null;
  } catch {
    return null;
  }
}

export function expenseSummary(box, year) {
  const entries = box && Array.isArray(box.entries) ? box.entries : [];
  const byLine = {};
  let spent = 0, deductible = 0, missingReceipts = 0, count = 0;
  for (const e of entries) {
    if (!e || yearOfIso(e.date) !== year) continue;
    if (e.category === "personal" || !(e.category in LINES)) {
      if (e.category !== "personal" && e.category) {
        const row = (byLine["27a"] ||= { line: "27a", label: LINES.other[1], spent: 0, deductible: 0, count: 0 });
        row.spent += int(e.cents); row.deductible += entryDeductible({ ...e, category: "other" }); row.count += 1;
        spent += int(e.cents); deductible += entryDeductible({ ...e, category: "other" }); count += 1;
      }
      continue;
    }
    const [line, label] = LINES[e.category];
    const d = entryDeductible(e);
    const row = (byLine[line] ||= { line, label, spent: 0, deductible: 0, count: 0 });
    row.spent += int(e.cents); row.deductible += d; row.count += 1;
    spent += int(e.cents); deductible += d; count += 1;
    if (!e.receipt && int(e.cents) >= 7500) missingReceipts += 1;
  }
  const rows = Object.values(byLine).sort((a, b) => lineOrder(a.line) - lineOrder(b.line));
  return { count, spent, deductible, rows, missingReceipts };
}

// ---- Invoice Maker box: { invoices: [...] } under "invoice-maker-data" ----
function pctOf(cents, pct) { const raw = (cents * (Number(pct) || 0)) / 100; return Math.sign(raw) * Math.round(Math.abs(raw) + 1e-9); }
export function invoiceParts(inv) {
  const lines = (inv.lines || []).map((l) => { const q = Number(l.qty), r = toCents(l.rate); const v = Number.isFinite(q) ? q * r : 0; return Math.round(v + (v < 0 ? -1e-9 : 1e-9)); });
  const subtotal = lines.reduce((a, b) => a + b, 0);
  let discount = 0;
  if (inv.discountType === "percent") discount = pctOf(subtotal, inv.discountValue);
  else if (inv.discountType === "amount") discount = Math.min(toCents(inv.discountValue), Math.max(subtotal, 0));
  discount = Math.min(discount, Math.max(subtotal, 0));
  const taxableLines = (inv.lines || []).reduce((a, l, i) => a + (l.taxable !== false ? lines[i] : 0), 0);
  const base = subtotal > 0 ? Math.max(0, taxableLines - Math.round((discount * taxableLines) / subtotal)) : 0;
  const tax = pctOf(base, inv.taxRate);
  const shipping = toCents(inv.shipping);
  const revenue = subtotal - discount;
  return { revenue, total: revenue + tax + shipping, paid: Math.max(0, toCents(inv.paid)) };
}

// Income by client for `year`. basis "paid": paid share of each non-void invoice
// issued that year, excluding sales tax and shipping. basis "invoiced": revenue of
// every sent, non-void invoice. Also returns invoices that are unpaid or overdue.
export function invoiceIncome(box, year, basis = "paid") {
  const invoices = box && Array.isArray(box.invoices) ? box.invoices : [];
  const byClient = new Map();
  let cents = 0, count = 0, unpaid = 0;
  for (const inv of invoices) {
    if (!inv || inv.void || yearOfIso(inv.issued) !== year) continue;
    const p = invoiceParts(inv);
    let c = 0;
    if (basis === "invoiced") {
      if (!inv.sent && p.paid <= 0) continue;
      c = p.revenue;
    } else {
      if (p.total > 0 && inv.sent) unpaid += Math.max(0, p.total - p.paid);
      if (p.paid <= 0 || p.total <= 0) continue;
      c = Math.round((Math.min(p.paid, p.total) * p.revenue) / p.total);
    }
    cents += c; count += 1;
    const name = String(inv.clientName || "").trim() || "(no client name)";
    const row = byClient.get(name) || { client: name, cents: 0, invoices: 0 };
    row.cents += c; row.invoices += 1; byClient.set(name, row);
  }
  const clients = [...byClient.values()].sort((a, b) => b.cents - a.cents);
  return { cents, count, clients, unpaid };
}

// 1099-NEC: clients that paid $2,000+ (2026 threshold) are expected to send one if they
// are businesses paying for services; corporations and card/PayPal payments are exempt.
export function form1099Clients(clients) {
  return clients.filter((c) => c.cents >= FORM_1099_THRESHOLD_CENTS && c.client !== "(no client name)");
}

// ---- Mileage Log box: { trips: [...], settings } under "mileage-log-data-v1" ----
const RATE_PERIODS = [
  { from: "2025-01-01", business: 0.70 },
  { from: "2026-01-01", business: 0.725 },
  { from: "2026-07-01", business: 0.76 },
];
function tripMiles(t) {
  const s = Number(t.odoStart), e = Number(t.odoEnd);
  if (t.odoStart !== "" && t.odoStart != null && t.odoEnd !== "" && t.odoEnd != null && e > s) return Math.round((e - s) * 10) / 10;
  const m = Number(t.miles);
  return Number.isFinite(m) && m > 0 ? m : 0;
}
export function mileageSummary(box, year, rateOverride = null) {
  const trips = box && Array.isArray(box.trips) ? box.trips : [];
  let miles = 0, count = 0, cents = 0, thin = 0;
  for (const t of trips) {
    if (!t || t.category !== "business" || yearOfIso(t.date) !== year) continue;
    const m = tripMiles(t);
    if (!(m > 0)) continue;
    let rate = RATE_PERIODS[0].business;
    for (const p of RATE_PERIODS) if (p.from <= t.date) rate = p.business;
    if (typeof rateOverride === "number" && rateOverride >= 0) rate = rateOverride;
    miles += m; count += 1; cents += Math.round(m * rate * 100);
    if (!String(t.to || "").trim() || !String(t.purpose || "").trim()) thin += 1;
  }
  return { miles: Math.round(miles * 10) / 10, trips: count, cents, thin };
}

// ---- Tax maths ----------------------------------------------------------
// Schedule SE. netProfit in cents. w2SsWages in cents reduces the SS room.
export function selfEmploymentTax(netProfit, w2SsWages = 0) {
  const np = Math.max(0, int(netProfit));
  const earnings = np * 0.9235;
  if (earnings < 40000) return { earnings: Math.round(earnings), ss: 0, medicare: 0, total: 0, half: 0 };
  const room = Math.max(0, SS_WAGE_BASE - Math.max(0, int(w2SsWages)));
  const ss = Math.min(earnings, room) * 0.124;
  const medicare = earnings * 0.029;
  const total = Math.round(ss + medicare);
  return { earnings: Math.round(earnings), ss: Math.round(ss), medicare: Math.round(medicare), total, half: Math.floor(total / 2) };
}

export function incomeTaxOn(taxableCents, status) {
  const table = BRACKETS[status] || BRACKETS.single;
  const t = Math.max(0, int(taxableCents)) / 100;
  let prev = 0, tax = 0;
  for (const [top, rate] of table) {
    if (t > prev) tax += (Math.min(t, top) - prev) * rate;
    prev = top;
  }
  return Math.round(tax * 100);
}

export function marginalRate(taxableCents, status) {
  const table = BRACKETS[status] || BRACKETS.single;
  const t = Math.max(0, int(taxableCents)) / 100;
  for (const [top, rate] of table) if (t <= top) return rate;
  return table[table.length - 1][1];
}

// Full-year planning estimate. All inputs cents. Returns every intermediate figure so
// the page can print the worksheet. QBI is only applied below the phase-in threshold,
// where it is simply 20% of the smaller of QBI and taxable income before QBI.
export function estimate({ grossIncome = 0, expenses = 0, mileage = 0, status = "single", otherIncome = 0, w2SsWages = 0, qbi = true, credits = 0 } = {}) {
  const st = status === "mfj" ? "mfj" : "single";
  const netProfit = int(grossIncome) - int(expenses) - int(mileage);
  const se = selfEmploymentTax(netProfit, w2SsWages);
  const agi = Math.max(0, netProfit) - se.half + int(otherIncome);
  const std = STANDARD_DEDUCTION[st];
  const beforeQbi = Math.max(0, agi - std);
  const qbiBase = Math.max(0, netProfit - se.half);
  let qbiDeduction = 0, qbiNote = null;
  if (qbi && qbiBase > 0) {
    if (beforeQbi > QBI_THRESHOLD[st]) qbiNote = "Taxable income is above the QBI phase-in threshold, where the deduction depends on your business type and wages. Not applied here: ask a preparer.";
    else qbiDeduction = Math.round(0.2 * Math.min(qbiBase, beforeQbi));
  }
  const taxable = Math.max(0, beforeQbi - qbiDeduction);
  const incomeTax = Math.max(0, incomeTaxOn(taxable, st) - Math.max(0, int(credits)));
  const totalTax = incomeTax + se.total;
  return { netProfit, se, agi, standardDeduction: std, qbiDeduction, qbiNote, taxable, incomeTax, totalTax, marginal: marginalRate(taxable, st) };
}

// Quarterly 1040-ES plan. Safe harbor = lesser of 90% of this year's tax or 100% of last
// year's (110% when last year's AGI was over $150,000, $75,000 if married filing separately).
// `paid` = four cents amounts already paid. Returns per-quarter due amounts.
export const QUARTERS = [
  { q: 1, due: "April 15", covers: "Jan 1 – Mar 31" },
  { q: 2, due: "June 15", covers: "Apr 1 – May 31" },
  { q: 3, due: "September 15", covers: "Jun 1 – Aug 31" },
  { q: 4, due: "January 15 next year", covers: "Sep 1 – Dec 31" },
];
export function quarterlyPlan({ totalTax, priorYearTax = 0, priorYearAgi = 0, withheld = 0, paid = [0, 0, 0, 0] }) {
  const current90 = Math.round(int(totalTax) * 0.9);
  const priorFactor = int(priorYearAgi) > 15000000 ? 1.1 : 1;
  const prior = int(priorYearTax) > 0 ? Math.round(int(priorYearTax) * priorFactor) : null;
  const target = prior !== null ? Math.min(current90, prior) : current90;
  const basis = prior !== null && prior < current90 ? "prior-year safe harbor" : "90% of this year's tax";
  const remaining = Math.max(0, target - int(withheld));
  const each = Math.round(remaining / 4);
  const rows = QUARTERS.map((qq, i) => {
    const already = int(paid[i]);
    return { ...qq, target: each, paid: already, due_now: Math.max(0, each - already), over: Math.max(0, already - each) };
  });
  const paidTotal = rows.reduce((a, r) => a + r.paid, 0);
  return { target, basis, rows, paidTotal, behind: Math.max(0, target - int(withheld) - paidTotal), notRequired: int(totalTax) - int(withheld) < 100000 };
}

// ---- Checks -------------------------------------------------------------
export function checks({ income, expenses, mileage, exp, mil, inv }) {
  const out = [];
  const add = (level, text) => out.push({ level, text });
  if (!inv) add("info", "No Invoice Maker data was found in this browser. Income is only what you type below. If you keep invoices in Invoice Maker on this same device, open it once, then reload this page.");
  if (!exp) add("info", "No Expense Tracker data was found in this browser, so expenses are only what you type below.");
  if (!mil) add("info", "No Mileage Log data was found in this browser, so there is no standard mileage deduction in the pack.");
  if (income.unpaid > 0) add("warn", `${formatMoney(income.unpaid)} on sent ${TAX_YEAR} invoices is unpaid. On a cash basis it is not income until you are paid, so it is left out; chase it before year end.`);
  if (expenses.missingReceipts > 0) add("warn", `${expenses.missingReceipts} expense${expenses.missingReceipts > 1 ? "s" : ""} of $75 or more ${expenses.missingReceipts > 1 ? "have" : "has"} no receipt flagged. Find the receipt or write down the business purpose now.`);
  if (mileage.thin > 0) add("warn", `${mileage.thin} business trip${mileage.thin > 1 ? "s are" : " is"} missing a destination or purpose. A log without those is the first thing disallowed.`);
  const car = expenses.rows.find((r) => r.line === "9");
  if (car && car.deductible > 0 && mileage.cents > 0) add("warn", "You have both actual car costs and standard-mileage trips. For one vehicle you must pick one method per year; do not claim both.");
  if (income.cents > 0 && expenses.deductible === 0 && mileage.cents === 0) add("info", "Income but no expenses or mileage recorded. That is possible, but check you are not missing deductible costs.");
  return out;
}

// Plain-text and CSV outputs for the printed pack.
export function packCsv(rows) {
  const esc = (v) => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join(",")).join("\n") + "\n";
}
