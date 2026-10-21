// US Schedule C worksheet: the profit and loss read off the ledger, regrouped
// onto the lines of IRS Form 1040 Schedule C (Profit or Loss From Business) for
// a sole proprietor or single-member LLC. It is a worksheet for you or your
// preparer to copy from, not a filing: it does not know your return, and it does
// not compute self-employment tax or the home-office, depreciation, mileage or
// health-insurance figures that are not in a bank feed.

import { journal } from "./engine.mjs";
import { payeeKey } from "./categorize.mjs";
import { accountMap, profitAndLoss } from "./ledger.mjs";

// Line labels are the form's own wording, shortened. "27a" is "Other expenses",
// itemised on Part V, so every account sent there keeps its own row.
export const LINES = {
  "1": "Gross receipts or sales", "6": "Other income", "4": "Cost of goods sold",
  "8": "Advertising", "9": "Car and truck expenses", "10": "Commissions and fees", "11": "Contract labor",
  "15": "Insurance (other than health)", "16b": "Interest (other)", "17": "Legal and professional services",
  "18": "Office expense", "20b": "Rent (other business property)", "21": "Repairs and maintenance",
  "22": "Supplies", "23": "Taxes and licenses", "24a": "Travel", "24b": "Deductible meals",
  "25": "Utilities", "26": "Wages", "27a": "Other expenses",
};

// Chart code -> Schedule C line. Codes the chart does not name, and any expense
// code added by the user, fall to 27a and are listed as `unmapped` so a person
// decides. Pass `map` to override or extend (`{ "6065": "18" }`).
export const SCHEDULE_C_MAP = {
  "4000": "1", "4100": "6", "4200": "6", "5000": "4",
  "6000": "8", "6010": "27a", "6020": "11", "6030": "15", "6040": "16b", "6050": "17", "6060": "27a",
  "6070": "18", "6080": "20b", "6090": "21", "6100": "22", "6110": "23", "6120": "24a", "6130": "24b",
  "6140": "25", "6150": "26", "6160": "9", "6170": "27a", "6180": "27a", "6900": "27a",
};

const EXPENSE_ORDER = ["8", "9", "10", "11", "15", "16b", "17", "18", "20b", "21", "22", "23", "24a", "24b", "25", "26", "27a"];

// scheduleC(books, { from, to, mealsPct = 50, map }) ->
//   { period, lines: [{ line, label, cents, accounts: [{ code, name, cents }] }],
//     grossReceipts (line 1), grossIncome (line 7, receipts less cost of goods plus other income),
//     totalExpenses (line 28), tentativeProfit (line 29), netProfit (line 31),
//     meals: { booked, deductible, pct }, otherExpenses (Part V rows),
//     unmapped: [{ code, name, cents }], warnings: [string] }
// Meals are booked in full to 6130 and only `mealsPct` percent is carried to line
// 24b (50 by default; the rule has exceptions, so check yours). Dates run on the
// books' own basis, cash unless invoices were added.
export function scheduleC(books, { from = null, to = null, mealsPct = 50, map = {} } = {}) {
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
  const sum = (line) => (byLine.get(line) ?? []).reduce((a, r) => a + r.cents, 0);
  const row = (line) => ({ line, label: LINES[line] ?? line, cents: sum(line), accounts: byLine.get(line) ?? [] });
  const order = ["1", "4", "6", ...EXPENSE_ORDER];
  const lines = order.filter((k) => byLine.has(k)).map(row);
  const grossReceipts = sum("1");
  const grossIncome = grossReceipts - sum("4") + sum("6");
  const totalExpenses = EXPENSE_ORDER.reduce((a, k) => a + sum(k), 0);
  const tentativeProfit = grossIncome - totalExpenses;
  const pending = (books.transactions ?? []).filter((t) => t.status === "review").length;
  if (pending) warnings.push(`${pending} bank line${pending === 1 ? " is" : "s are"} still waiting for an account and ${pending === 1 ? "is" : "are"} not in these totals.`);
  if (unmapped.length) warnings.push(`${unmapped.map((u) => `${u.name} (${u.code})`).join(", ")} ${unmapped.length === 1 ? "has" : "have"} no Schedule C line of its own and went to ${unmapped.some((u) => accts.get(u.code)?.type === "income") ? "line 6 or " : ""}27a. Pass a map to move ${unmapped.length === 1 ? "it" : "them"}.`);
  if (!lines.length) warnings.push("No income or expense in this period.");
  return {
    period: { from, to }, lines, grossReceipts, grossIncome, totalExpenses, tentativeProfit, netProfit: tentativeProfit,
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
// payments made in 2026 (IRS, as amended in 2025); check the current
// instructions, or pass `threshold` in cents.
export const NEC_THRESHOLD = (year) => (year >= 2026 ? 200000 : 60000);
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
  if (missingW9.length) warnings.push(`${missingW9.length} payee${missingW9.length === 1 ? "" : "s"} over the line ${missingW9.length === 1 ? "has" : "have"} no W-9 on file. Ask before you file, ahead of January 31.`);
  if (!payees.length) warnings.push(`No contract labor paid by bank in ${year}.`);
  return { year, threshold, payees, reportable, missingW9, warnings };
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
