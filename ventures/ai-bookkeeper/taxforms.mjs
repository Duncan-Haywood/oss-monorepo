// US Schedule C worksheet: the profit and loss read off the ledger, regrouped
// onto the lines of IRS Form 1040 Schedule C (Profit or Loss From Business) for
// a sole proprietor or single-member LLC. It is a worksheet for you or your
// preparer to copy from, not a filing: it does not know your return, and it does
// not compute self-employment tax or the home-office, depreciation, mileage or
// health-insurance figures that are not in a bank feed. Depreciation comes from
// the asset register (assets.mjs) and goes to line 13 as straight-line book depreciation;
// tax depreciation (MACRS, section 179) is for you or your preparer.

import { mileageDeduction, homeOfficeDeduction } from "./deductions.mjs";
import { journal } from "./engine.mjs";
import { payeeKey } from "./categorize.mjs";
import { nextBusinessDay } from "./salestaxreturn.mjs";
import { accountMap, profitAndLoss } from "./ledger.mjs";

// Line labels are the form's own wording, shortened. "27a" is "Other expenses",
// itemised on Part V, so every account sent there keeps its own row.
export const LINES = {
  "1": "Gross receipts or sales", "6": "Other income", "4": "Cost of goods sold",
  "8": "Advertising", "9": "Car and truck expenses", "10": "Commissions and fees", "11": "Contract labor", "13": "Depreciation and section 179",
  "15": "Insurance (other than health)", "16b": "Interest (other)", "17": "Legal and professional services",
  "18": "Office expense", "20b": "Rent (other business property)", "21": "Repairs and maintenance",
  "22": "Supplies", "23": "Taxes and licenses", "24a": "Travel", "24b": "Deductible meals",
  "25": "Utilities", "26": "Wages", "27a": "Other expenses", "30": "Expenses for business use of your home",
};

// Chart code -> Schedule C line. Codes the chart does not name, and any expense
// code added by the user, fall to 27a and are listed as `unmapped` so a person
// decides. Pass `map` to override or extend (`{ "6065": "18" }`).
export const SCHEDULE_C_MAP = {
  "4000": "1", "4100": "6", "4200": "6", "5000": "4",
  "6000": "8", "6010": "27a", "6020": "11", "6030": "15", "6040": "16b", "6050": "17", "6060": "27a",
  "6070": "18", "6080": "20b", "6090": "21", "6100": "22", "6110": "23", "6120": "24a", "6130": "24b",
  "6140": "25", "6150": "26", "6160": "9", "6170": "27a", "6180": "27a", "6900": "27a", "6950": "13",
};

const EXPENSE_ORDER = ["8", "9", "10", "11", "13", "15", "16b", "17", "18", "20b", "21", "22", "23", "24a", "24b", "25", "26", "27a"];

// scheduleC(books, { from, to, mealsPct = 50, map }) ->
//   { period, lines: [{ line, label, cents, accounts: [{ code, name, cents }] }],
//     grossReceipts (line 1), grossIncome (line 7, receipts less cost of goods plus other income),
//     totalExpenses (line 28), tentativeProfit (line 29), netProfit (line 31),
//     meals: { booked, deductible, pct }, otherExpenses (Part V rows),
//     unmapped: [{ code, name, cents }], warnings: [string] }
// Meals are booked in full to 6130 and only `mealsPct` percent is carried to line
// 24b (50 by default; the rule has exceptions, so check yours). Dates run on the
// books' own basis, cash unless invoices were added.
// With `year`, the mileage log goes to line 9 and the simplified home office to line 30
// (deductions.mjs); net profit is line 29 less line 30. Both are left out without it.
export function scheduleC(books, { from = null, to = null, mealsPct = 50, map = {}, year = null, mileageRate } = {}) {
  const accts = accountMap(books.accounts);
  const entries = journal(books);
  const pl = profitAndLoss(entries, books.accounts, { from, to });
  const route = { ...SCHEDULE_C_MAP, ...map };
  const byLine = new Map();
  const unmapped = [], warnings = [];
  const put = (line, code, cents) => {
    if (!byLine.has(line)) byLine.set(line, []);
    byLine.get(line).push({ code, name: accts.get(code)?.name ?? code, cents });
  };
  let mealsBooked = 0;
  for (const side of [pl.income, pl.expense]) for (const l of side) {
    if (accts.get(l.code)?.suspense) { warnings.push(`${fmt(l.total)} sits in ${l.name} (${l.code}). File those lines first; they are left off this worksheet.`); continue; }
    let line = route[l.code];
    if (!line) { line = side === pl.income ? "6" : "27a"; unmapped.push({ code: l.code, name: l.name, cents: l.total }); }
    let cents = l.total;
    if (line === "24b") { mealsBooked += cents; cents = Math.round((cents * mealsPct) / 100); }
    put(line, l.code, cents);
  }
  let mileage = null, home = null;
  if (year) {
    mileage = mileageDeduction(books, year, { rate: mileageRate });
    warnings.push(...mileage.warnings);
    const actualCar = (byLine.get("9") ?? []).reduce((n, r) => n + r.cents, 0);
    if (mileage.cents && actualCar) warnings.push(`Line 9 holds ${fmt(actualCar)} of car and truck costs booked from the bank and ${fmt(mileage.cents)} of standard-mileage deduction for the same year. The standard mileage rate is used instead of actual costs such as fuel, oil, repairs, insurance and depreciation, so only parking and tolls can be added to it; pick one method for the vehicle (the IRS also bars switching in some cases), then take the other amount off.`);
    const insured = (byLine.get("15") ?? []).reduce((n, r) => n + r.cents, 0);
    if (mileage.cents && insured) warnings.push(`Line 15 holds ${fmt(insured)} of insurance next to ${fmt(mileage.cents)} of standard-mileage deduction. The standard mileage rate already covers vehicle insurance, so take any auto insurance premium out of line 15; business liability or other insurance stays.`);
    if (mileage.cents) put("9", "miles", mileage.cents), byLine.get("9").at(-1).name = `Business miles (${mileage.label})`;
  }
  const sum = (line) => (byLine.get(line) ?? []).reduce((a, r) => a + r.cents, 0);
  const row = (line) => ({ line, label: LINES[line] ?? line, cents: sum(line), accounts: byLine.get(line) ?? [] });
  const order = ["1", "4", "6", ...EXPENSE_ORDER];
  const lines = order.filter((k) => byLine.has(k)).map(row);
  const grossReceipts = sum("1");
  const grossIncome = grossReceipts - sum("4") + sum("6");
  const totalExpenses = EXPENSE_ORDER.reduce((a, k) => a + sum(k), 0);
  const tentativeProfit = grossIncome - totalExpenses;
  let homeCents = 0;
  if (year) {
    home = homeOfficeDeduction(books, year, { profit: tentativeProfit });
    warnings.push(...home.warnings);
    homeCents = home.cents;
    if (homeCents) lines.push({ line: "30", label: LINES["30"], cents: homeCents, accounts: [{ code: "home", name: `Simplified method, ${home.sqft} sq ft, ${home.months} months`, cents: homeCents }] });
  }
  const pending = (books.transactions ?? []).filter((t) => t.status === "review").length;
  if (pending) warnings.push(`${pending} bank line${pending === 1 ? " is" : "s are"} still waiting for an account and ${pending === 1 ? "is" : "are"} not in these totals.`);
  if (unmapped.length) warnings.push(`${unmapped.map((u) => `${u.name} (${u.code})`).join(", ")} ${unmapped.length === 1 ? "has" : "have"} no Schedule C line of its own and went to ${unmapped.some((u) => accts.get(u.code)?.type === "income") ? "line 6 or " : ""}27a. Pass a map to move ${unmapped.length === 1 ? "it" : "them"}.`);
  if (!lines.length) warnings.push("No income or expense in this period.");
  return {
    period: { from, to }, lines, grossReceipts, grossIncome, totalExpenses, tentativeProfit, homeOffice: homeCents, netProfit: tentativeProfit - homeCents, mileage, home,
    meals: { booked: mealsBooked, deductible: sum("24b"), pct: mealsPct },
    otherExpenses: byLine.get("27a") ?? [], unmapped, warnings,
  };
}

const q = (s) => (/[",\n]/.test(s) ? `"${String(s).replace(/"/g, '""')}"` : String(s));
// One row per account, so a preparer can see what sits under each line.
export function scheduleCCsv(sc) {
  const d = (c) => (c / 100).toFixed(2);
  const rows = ["Line,Description,Account,Amount"];
  for (const l of sc.lines) for (const a of l.accounts) rows.push([l.line, q(l.label), q(`${a.code} ${a.name}`), d(a.cents)].join(","));
  rows.push(["7", "Gross income", "", d(sc.grossIncome)].join(","), ["28", "Total expenses", "", d(sc.totalExpenses)].join(","), ["31", "Net profit or (loss)", "", d(sc.netProfit)].join(","));
  return rows.join("\n") + "\n";
}

function fmt(c) { const v = Math.abs(c); return `${c < 0 ? "-" : ""}${Math.floor(v / 100).toLocaleString("en-US")}.${String(v % 100).padStart(2, "0")}`; }

// 1099-NEC worksheet: who you paid for contract labor in a calendar year, and
// whether each person crosses the reporting threshold and has a W-9 on file.
// It reads bank lines filed to the contract-labor account (whole lines and
// split parts), by payee. It stores no tax ID numbers, only a yes/no "W-9 on
// file" per payee. A worksheet, not a filing: payments by card or PayPal are
// reported by the processor on a 1099-K, corporations are usually exempt, and
// whether someone is a contractor at all is a judgment this cannot make.
//
// The threshold was $600 through payments made in 2025 and is $2,000 for
// payments made in 2026 (IRS Form 1099-NEC pages and FS-2025-08, read
// 2026-10-21); check the current instructions, or pass `threshold` in cents.
// From 2027 the $2,000 is indexed to inflation, so for later years this is a
// floor and the worksheet says so.
export const BACKUP_WITHHOLDING_RATE = 0.24;
export const NEC_THRESHOLD = (year) => (year >= 2026 ? 200000 : 60000);

// The due date for 1099-NEC copies and the IRS filing: January 31 of the next
// year, or the next weekday when that is a weekend (2026 payments: Feb 1, 2027).
export function necDeadline(year) {
  const d = new Date(Date.UTC(year + 1, 0, 31));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Dates for a CP2100 / CP2100A notice (IRS "Backup withholding B program" and
// "Understanding your CP2100 or CP2100A Notice" pages, then read against Pub.
// 1281 itself, Rev. 12-2023 text (the current irs.gov PDF), 2026-10-23: First B Notice pp. 14-15,
// Second B Notice p. 15, Q&A 15-19). The payer mails the
// First B Notice (with a blank W-9) within 15 business days of the notice date
// or the day it arrived, whichever is later; the Second B Notice (a second
// CP2100 within three years, no W-9 enclosed, the payee must get a Letter 147C
// or SSA proof from the IRS/SSA) goes out in the same window; and if the payee
// has not answered, backup withholding of 24% starts on later payments no
// later than 30 business days after. Business days skip weekends and observed
// federal holidays (`usHolidays`). Worksheet dates, not legal advice.
// Pub. 1281 adds: a second CP2100 received in the same calendar year as the
// first may be disregarded (Q17; pass `firstNotice`), the Second B Notice's
// 30 business days run from the date of that B notice (pass `bNoticeSent`), and
// withholding stops within 30 calendar days of a signed W-9 / validation.
export function bNoticeDates(noticeDate, { received = null, second = false, firstNotice = null, bNoticeSent = null } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(noticeDate ?? "")) throw new Error("noticeDate must be YYYY-MM-DD");
  const base = received && received > noticeDate ? received : noticeDate;
  const add = (n, from = base) => { let d = from; for (let i = 0; i < n; i++) { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + 1); d = nextBusinessDay(t.toISOString().slice(0, 10)); } return d; };
  return {
    base, second,
    mailBNoticeBy: add(15),
    startWithholdingBy: second && bNoticeSent ? add(30, bNoticeSent) : add(30),
    disregard: second && firstNotice ? firstNotice.slice(0, 4) === base.slice(0, 4) : false,
    stopWithholdingWithinDays: 30,
    enclose: second ? "no W-9: the payee must give you a Letter 147C (EIN) or an SSA proof of the number (SSN)" : "a blank Form W-9",
    rate: BACKUP_WITHHOLDING_RATE,
    note: "If the payee returns a signed W-9 before the withholding date, stop the process and do not withhold; otherwise withhold 24% of later reportable payments, report it in box 4 of the 1099-NEC and on Form 945.",
  };
}
const CONTRACT_CODES = ["6020"];

// contractors1099(books, { year, threshold, codes }) ->
//   { year, threshold, payees: [{ key, name, cents, count, over, w9, cardCents }],
//     reportable (payees over the line), missingW9 (reportable without a W-9), warnings }
export function contractors1099(books, { year, threshold, codes = CONTRACT_CODES } = {}) {
  year = year ?? new Date().getFullYear();
  threshold = threshold ?? NEC_THRESHOLD(year);
  const accts = accountMap(books.accounts);
  const byKey = new Map();
  const warnings = [];
  const get = (t) => {
    const raw = payeeKey(t.desc) || t.desc.toLowerCase();
    const key = books.vendors?.[raw]?.mergeInto ?? raw;
    if (!byKey.has(key)) byKey.set(key, { key, names: new Map(), cents: 0, count: 0, cardCents: 0 });
    const p = byKey.get(key);
    p.names.set(t.desc, (p.names.get(t.desc) ?? 0) + 1);
    return p;
  };
  for (const t of books.transactions ?? []) {
    if (!t.date?.startsWith(String(year)) || !t.posted) continue;
    if (t.status === "review" || t.status === "new") continue;
    const parts = t.status === "split" ? t.split.filter((x) => codes.includes(x.account)).map((x) => x.cents) : codes.includes(t.posted) ? [t.cents] : [];
    if (!parts.length) continue;
    const paid = -parts.reduce((a, c) => a + c, 0); // a payment is a negative bank line
    const p = get(t);
    if (accts.get(t.account)?.type === "liability") p.cardCents += paid; else p.cents += paid;
    p.count++;
  }
  const vendors = books.vendors ?? {};
  const payees = [...byKey.values()].map((p) => ({
    key: p.key, name: [...p.names.entries()].sort((a, b) => b[1] - a[1])[0][0], cents: p.cents, count: p.count, cardCents: p.cardCents,
    over: p.cents >= threshold, w9: !!vendors[p.key]?.w9,
  })).sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name));
  const reportable = payees.filter((p) => p.over);
  const missingW9 = reportable.filter((p) => !p.w9);
  if (payees.some((p) => p.cardCents)) warnings.push("Some contract labor was paid by card; the card processor reports those on a 1099-K, so they are left out of the totals (shown as card).");
  const pending = (books.transactions ?? []).filter((t) => t.date?.startsWith(String(year)) && (t.status === "review" || t.status === "new")).length;
  if (pending) warnings.push(`${pending} bank line${pending === 1 ? " is" : "s are"} from ${year} and still waiting for an account; one may be a contractor payment.`);
  // Backup withholding (IRC 3406(a)(1), read 2026-10-23: the fourth lowest section 1(c) rate = 24%): a payer that has no TIN for a payee must withhold 24% of
  // reportable payments (IRC 3406; reported on Form 945). Shown as an exposure
  // estimate on payments already made, not as an amount that was withheld.
  const backupWithholdingCents = missingW9.reduce((a, p) => a + Math.round(p.cents * BACKUP_WITHHOLDING_RATE), 0);
  if (missingW9.length) warnings.push(`${missingW9.length} payee${missingW9.length === 1 ? "" : "s"} over the line ${missingW9.length === 1 ? "has" : "have"} no W-9 on file. Ask before you file, ahead of ${necDeadline(year)}. Without a TIN, backup withholding of 24% (${(backupWithholdingCents / 100).toFixed(2)} on what was paid so far) applies to further payments, starting at once: IRS Pub. 1281 says non-employee compensation is subject to it even if the payee says a TIN is applied for (the 60-day grace is for interest and dividends only); whatever you do withhold goes in box 4 of the 1099-NEC (which is then required whatever the amount) and on Form 945, line 2, deposited by EFT.`);
  if (year >= 2027 && threshold === NEC_THRESHOLD(year)) warnings.push(`From 2027 the $2,000 line is indexed to inflation; ${year}'s may be higher. Check the IRS instructions or pass a threshold.`);
  if (!payees.length) warnings.push(`No contract labor paid by bank in ${year}.`);
  return { year, threshold, payees, reportable, missingW9, backupWithholdingCents, warnings };
}

// Record that a W-9 is (or is no longer) on file for a payee. Only a flag is kept.
export function markW9(books, payee, on = true) {
  const next = JSON.parse(JSON.stringify(books));
  const key = payeeKey(payee) || payee.toLowerCase();
  if (!next.transactions.some((t) => (payeeKey(t.desc) || t.desc.toLowerCase()) === key)) throw new Error(`No bank line matches the payee "${payee}".`);
  next.vendors = next.vendors ?? {};
  if (on) next.vendors[key] = { ...next.vendors[key], w9: true };
  else if (next.vendors[key]) { delete next.vendors[key].w9; if (!Object.keys(next.vendors[key]).length) delete next.vendors[key]; }
  return next;
}

// Count two spellings of one payee as one ("ZELLE ANNA LOPEZ" and "UPWORK PAYMENT
// ANNA LOPEZ"): the first is summed under the second. Only a pointer is kept.
// `mergePayees(books, from, into, false)` undoes it.
export function mergePayees(books, from, into, on = true) {
  const next = JSON.parse(JSON.stringify(books));
  const keyOf = (n) => payeeKey(n) || n.toLowerCase();
  const [a, b] = [keyOf(from), keyOf(into)];
  const known = (k) => next.transactions.some((t) => keyOf(t.desc) === k);
  if (!known(a)) throw new Error(`No bank line matches the payee "${from}".`);
  if (on && !known(b)) throw new Error(`No bank line matches the payee "${into}".`);
  if (on && a === b) throw new Error("Those are already the same payee.");
  next.vendors = next.vendors ?? {};
  if (on) {
    const root = next.vendors[b]?.mergeInto ?? b;
    for (const v of Object.values(next.vendors)) if (v.mergeInto === a) v.mergeInto = root; // keep chains flat
    next.vendors[a] = { ...next.vendors[a], mergeInto: root };
    if (next.vendors[a].w9) { next.vendors[root] = { ...next.vendors[root], w9: true }; delete next.vendors[a].w9; }
  } else if (next.vendors[a]) { delete next.vendors[a].mergeInto; if (!Object.keys(next.vendors[a]).length) delete next.vendors[a]; }
  return next;
}

export function contractors1099Csv(r) {
  const d = (c) => (c / 100).toFixed(2);
  const rows = ["Payee,Paid by bank,Payments,Paid by card (not 1099-NEC),Reportable,W-9 on file"];
  for (const p of r.payees) rows.push([q(p.name), d(p.cents), p.count, d(p.cardCents), p.over ? "yes" : "no", p.w9 ? "yes" : "no"].join(","));
  return rows.join("\n") + "\n";
}

// A filing-prep CSV: one row per payee over the line, with the Form 1099-NEC
// box names as columns, to paste into a filing service's import sheet. Filing
// services each take their own column layout, so this is the form's own boxes,
// not any one service's file. The recipient's TIN and address are left blank
// on purpose: this tool never stores them; fill them from the W-9 in the
// service. Box 4 (federal tax withheld) is left at 0.00.
export function nec1099FilingCsv(r) {
  const d = (c) => (c / 100).toFixed(2);
  const rows = ["Tax year,Recipient name,Recipient TIN (fill from W-9),Street address,City,State,ZIP,Box 1 Nonemployee compensation,Box 4 Federal income tax withheld,W-9 on file"];
  for (const p of r.reportable) rows.push([r.year, q(p.name), "", "", "", "", "", d(p.cents), "0.00", p.w9 ? "yes" : "no"].join(","));
  return rows.join("\n") + "\n";
}

// Schedule SE worksheet: US self-employment tax on a Schedule C profit.
// Net earnings are 92.35% of profit; social security is 12.4% of them up to the
// year's wage base (less any wages already counted toward it, `wages`), Medicare
// 2.9% on all of them. Nothing is owed under $400 of net earnings. Half the tax is
// an income-tax deduction (Schedule 1, line 15). Left out: the 0.9% additional
// Medicare tax (Form 8959), farm income, church income and more than one business.
// Wage bases: 2024 168,600 and 2025 176,100 match the IRS Schedule SE instructions for
// those years (read 2026-10-26); 2026 184,500 and 2027 192,300 (announced Oct 2026) are
// seen in trade-press reports only, unchecked against SSA or IRS text, so those results carry a warning; pass `wageBase`
// in cents to override. A worksheet, not a filing.
export const SS_WAGE_BASE = { 2024: 16860000, 2025: 17610000, 2026: 18450000, 2027: 19230000 };
export function selfEmployment(profitCents, { year = new Date().getFullYear(), wageBase, wages = 0 } = {}) {
  const warnings = [];
  const base = wageBase ?? SS_WAGE_BASE[year];
  if (wageBase === undefined && year !== 2024 && year !== 2025) warnings.push(base === undefined ? `No wage base on file for ${year}; pass wageBase.` : (year >= 2026 && year <= 2027) ? `The ${year} social security wage base ($${(base / 100).toLocaleString("en-US")}) matches published reports of the SSA announcement (compared 2026-10-23), not the SSA page itself; unchecked there, so confirm it on ssa.gov or pass wageBase.` : `The ${year} social security wage base is from memory and unchecked; confirm it on ssa.gov or pass wageBase.`);
  const limit = base ?? Infinity;
  if (profitCents <= 0) return { year, profit: profitCents, netEarnings: 0, socialSecurity: 0, medicare: 0, tax: 0, deduction: 0, warnings: [...warnings, "No profit, so no self-employment tax."] };
  const netEarnings = Math.round(profitCents * 0.9235);
  if (netEarnings < 40000) return { year, profit: profitCents, netEarnings, socialSecurity: 0, medicare: 0, tax: 0, deduction: 0, warnings: [...warnings, "Net earnings under $400: no self-employment tax."] };
  const ssRoom = Math.max(0, limit - Math.max(0, wages));
  const socialSecurity = Math.round(Math.min(netEarnings, ssRoom) * 0.124);
  const medicare = Math.round(netEarnings * 0.029);
  const tax = socialSecurity + medicare;
  return { year, profit: profitCents, netEarnings, socialSecurity, medicare, tax, deduction: Math.round(tax / 2), warnings };
}

// The four federal estimated-payment dates for a tax year: Apr 15, Jun 15, Sep 15
// and Jan 15 of the next year. A date on a weekend or a legal holiday in
// Washington, DC moves to the next day that is neither (IRC 7503). The two
// holidays that can reach these dates are Emancipation Day (Apr 16, observed on
// the Friday or Monday when it falls on a weekend; it pushed the April 2022 and
// 2023 deadlines to the 18th) and Martin Luther King Jr. Day (third Monday of
// January; the January 2023 payment was due on the 17th).
function dcHoliday(dt) {
  const y = dt.getUTCFullYear(), m = dt.getUTCMonth() + 1, d = dt.getUTCDate(), dow = dt.getUTCDay();
  if (m === 1) return dow === 1 && d >= 15 && d <= 21;
  if (m === 4) {
    const e = new Date(Date.UTC(y, 3, 16)), ed = e.getUTCDay();
    const obs = ed === 6 ? 15 : ed === 0 ? 17 : 16;
    return d === obs;
  }
  return false;
}
export function estimatedDueDates(year) {
  return [[year, 4, 15], [year, 6, 15], [year, 9, 15], [year + 1, 1, 15]].map(([y, m, d]) => {
    const dt = new Date(Date.UTC(y, m - 1, d));
    while (dt.getUTCDay() === 0 || dt.getUTCDay() === 6 || dcHoliday(dt)) dt.setUTCDate(dt.getUTCDate() + 1);
    return dt.toISOString().slice(0, 10);
  });
}

// Quarter-by-quarter set-aside for the self-employment part: the year's Schedule C
// profit so far, annualised to the months covered, taxed with selfEmployment() and
// split into four equal payments. Income tax is not estimated.
export function seSetAside(books, { year, monthsElapsed = 12, wages = 0, wageBase } = {}) {
  const sc = scheduleC(books, { from: `${year}-01-01`, to: `${year}-12-31` });
  const months = Math.min(12, Math.max(1, monthsElapsed));
  const annual = Math.round((sc.netProfit * 12) / months);
  const se = selfEmployment(annual, { year, wages, wageBase });
  const each = Math.round(se.tax / 4);
  const dates = estimatedDueDates(year);
  return { year, monthsElapsed: months, profitToDate: sc.netProfit, annualisedProfit: annual, se, payments: dates.map((due, i) => ({ due, cents: i < 3 ? each : se.tax - each * 3 })), warnings: [...sc.warnings, ...se.warnings] };
}
