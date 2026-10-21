// US Schedule C worksheet: the profit and loss read off the ledger, regrouped
// onto the lines of IRS Form 1040 Schedule C (Profit or Loss From Business) for
// a sole proprietor or single-member LLC. It is a worksheet for you or your
// preparer to copy from, not a filing: it does not know your return, and it does
// not compute self-employment tax or the home-office, depreciation, mileage or
// health-insurance figures that are not in a bank feed.

import { journal } from "./engine.mjs";
import { accountMap, profitAndLoss } from "./ledger.mjs";
import { payeeKey } from "./categorize.mjs";

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

// 1099-NEC worksheet: who was paid for services out of the contract-labor
// accounts in a calendar year, and who crossed the filing threshold. A list for
// you or your preparer, not a filing. Rules it applies, and the limits:
//  - Cash basis: a payment counts in the year its bank line is dated.
//  - Payments from a credit or debit card account (a liability account in the
//    chart) are left out of the totals and listed apart: the card network
//    reports those to the IRS on 1099-K, not you on 1099-NEC.
//  - Payees are grouped by the first two words of the bank description, the same
//    key the categorizer uses, so "UPWORK ESCROW 1" and "UPWORK ESCROW 22" merge
//    but "UPWORK INC" stays apart; check the list and add the rows by hand. Corporations are generally exempt, but the books do not know who
//    is one: `vendors[key].corp = true` (CLI `vendor KEY --corp`) drops them.
//  - The threshold is $600 for payments made through 2025 and $2,000 from 2026
//    (a 2025 law change; confirm against the current form instructions). Pass
//    `threshold` to override.
//  - W-9: `books.vendors[key].w9 = true` marks one on file. The books never hold
//    a taxpayer ID.
export const NEC_ACCOUNTS = ["6020"];
export const necThreshold = (year) => (year >= 2026 ? 200000 : 60000);

export function contractors1099(books, { year, threshold, accounts = NEC_ACCOUNTS } = {}) {
  year = year ?? new Date().getFullYear() - 1;
  threshold = threshold ?? necThreshold(year);
  const accts = accountMap(books.accounts);
  const want = new Set(accounts);
  const vendors = books.vendors ?? {};
  const byKey = new Map();
  const warnings = [];
  const bucket = (t) => {
    const key = payeeKey(t.desc) || t.desc.toLowerCase();
    if (!byKey.has(key)) byKey.set(key, { key, payee: t.desc, cents: 0, cardCents: 0, payments: 0 });
    return byKey.get(key);
  };
  for (const t of books.transactions ?? []) {
    if (!t.date.startsWith(`${year}-`) || t.cents >= 0) continue;
    let cents = 0;
    if (t.status === "confirmed" && want.has(t.posted)) cents = -t.cents;
    else if (t.status === "split") cents = t.split.filter((p) => want.has(p.account)).reduce((a, p) => a - p.cents, 0);
    if (cents <= 0) continue;
    const b = bucket(t);
    if (accts.get(t.account)?.type === "liability") b.cardCents += cents;
    else { b.cents += cents; b.payments++; }
  }
  const rows = [...byKey.values()].map((b) => {
    const v = vendors[b.key] ?? {};
    return { ...b, w9: !!v.w9, corp: !!v.corp, name: v.name ?? b.payee, owed: b.cents >= threshold && !v.corp };
  }).sort((a, b) => b.cents - a.cents);
  const toFile = rows.filter((r) => r.owed);
  for (const r of toFile) if (!r.w9) warnings.push(`${r.name}: paid ${fmt(r.cents)}, no W-9 on file. Ask for one before the filing date (or back-up withholding may apply).`);
  for (const r of rows) if (!r.owed && !r.corp && r.cents > 0 && r.cents < threshold && r.cents >= threshold * 0.8) warnings.push(`${r.name}: paid ${fmt(r.cents)}, just under the ${fmt(threshold)} threshold.`);
  for (const r of rows) if (r.cardCents) warnings.push(`${r.name}: ${fmt(r.cardCents)} was paid by card; the card processor reports that on 1099-K, so it is not counted.`);
  const pending = (books.transactions ?? []).filter((t) => t.status === "review" && t.date.startsWith(`${year}-`) && t.cents < 0).length;
  if (pending) warnings.push(`${pending} payment${pending === 1 ? " is" : "s are"} from ${year} still waiting for an account; one may be contract labor.`);
  return { year, threshold, rows, toFile, totalToFile: toFile.reduce((a, r) => a + r.cents, 0), warnings };
}

// Record what you know about a payee: { w9, corp, name }. Keyed as in the list.
export function setVendor(books, key, patch) {
  const vendors = { ...(books.vendors ?? {}) };
  vendors[key] = { ...(vendors[key] ?? {}), ...patch };
  return { ...books, vendors };
}

export function contractorsCsv(r) {
  const d = (c) => (c / 100).toFixed(2);
  const rows = ["Payee,Key,Paid (not by card),Paid by card,Payments,W-9 on file,Corporation,File 1099-NEC"];
  for (const x of r.rows) rows.push([q(x.name), q(x.key), d(x.cents), d(x.cardCents), x.payments, x.w9 ? "yes" : "no", x.corp ? "yes" : "no", x.owed ? "yes" : "no"].join(","));
  return rows.join("\n") + "\n";
}
