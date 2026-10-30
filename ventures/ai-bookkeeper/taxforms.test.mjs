import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement, confirm, parseSplit } from "./engine.mjs";
import { selfEmployment, estimatedDueDates, seSetAside, scheduleC, scheduleCCsv, contractors1099, contractors1099Csv, nec1099FilingCsv, markW9, mergePayees, NEC_THRESHOLD, necDeadline } from "./taxforms.mjs";

const CSV = `Date,Description,Amount
2026-01-05,CLIENT PAYMENT ACME,5000.00
2026-01-06,CLIENT PAYMENT BIRCH,1000.00
2026-01-07,FACEBK ADS,-200.00
2026-01-08,LUNCH WITH CLIENT,-80.00
2026-01-09,ADOBE CREATIVE CLOUD,-60.00
2026-01-10,WEIRD VENDOR,-33.33
2026-02-01,STATE FARM INSURANCE,-120.00
`;
function filed(extra = {}) {
  let { books } = importStatement(newBooks(), CSV, "1000");
  const id = (s) => books.transactions.find((t) => t.desc.includes(s)).id;
  books = confirm(books, { [id("ACME")]: "4000", [id("BIRCH")]: "4000", [id("FACEBK")]: "6000", [id("LUNCH")]: "6130", [id("ADOBE")]: "6060", [id("WEIRD")]: "6100", [id("STATE FARM")]: "6030", ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [id(k), v])) });
  return books;
}

test("the profit and loss lands on Schedule C lines, with meals cut to half", () => {
  const sc = scheduleC(filed());
  const by = Object.fromEntries(sc.lines.map((l) => [l.line, l.cents]));
  assert.equal(by["1"], 600000);
  assert.equal(by["8"], 20000);
  assert.equal(by["15"], 12000);
  assert.equal(by["22"], 3333);
  assert.equal(by["24b"], 4000);
  assert.deepEqual(sc.meals, { booked: 8000, deductible: 4000, pct: 50 });
  assert.equal(by["27a"], 6000, "software is itemised under other expenses");
  assert.equal(sc.grossIncome, 600000);
  assert.equal(sc.totalExpenses, 20000 + 12000 + 3333 + 4000 + 6000);
  assert.equal(sc.netProfit, sc.grossIncome - sc.totalExpenses);
  assert.deepEqual(sc.warnings, []);
});

test("the meals percentage and the line map can be changed", () => {
  const books = filed();
  assert.equal(scheduleC(books, { mealsPct: 100 }).meals.deductible, 8000);
  const moved = scheduleC(books, { map: { "6060": "18" } });
  assert.equal(moved.lines.find((l) => l.line === "18").cents, 6000);
  assert.equal(moved.lines.find((l) => l.line === "27a"), undefined);
});

test("an account the map does not know goes to 27a and is flagged; the suspense account is left off", () => {
  const books = filed();
  books.accounts.push({ code: "6200", name: "Pet grooming", type: "expense" });
  const t = books.transactions.find((x) => x.desc.includes("WEIRD"));
  const b2 = confirm(books, { [t.id]: "6200" });
  const sc = scheduleC(b2);
  assert.deepEqual(sc.unmapped.map((u) => u.code), ["6200"]);
  assert.ok(sc.warnings.some((w) => /Pet grooming/.test(w)));
  assert.equal(sc.otherExpenses.find((a) => a.code === "6200").cents, 3333);
  const b3 = confirm(books, { [t.id]: "9999" });
  const s3 = scheduleC(b3);
  assert.ok(s3.warnings.some((w) => /Uncategorized/.test(w)));
  assert.equal(s3.lines.find((l) => l.line === "22"), undefined);
});

test("lines still in review are counted as a warning, and a date range narrows the figures", () => {
  const { books } = importStatement(newBooks(), CSV, "1000");
  assert.ok(scheduleC(books).warnings.some((w) => /waiting for an account/.test(w)));
  const feb = scheduleC(filed(), { from: "2026-02-01", to: "2026-02-28" });
  assert.equal(feb.totalExpenses, 12000);
  assert.equal(feb.grossIncome, 0);
});

test("the CSV has one row per account and the form totals", () => {
  const csv = scheduleCCsv(scheduleC(filed()));
  const rows = csv.trim().split("\n");
  assert.equal(rows[0], "Line,Description,Account,Amount");
  assert.ok(rows.includes("1,Gross receipts or sales,4000 Sales,6000.00"));
  assert.ok(rows.includes("24b,Deductible meals,6130 Meals,40.00"));
  assert.ok(rows.at(-1).startsWith("31,Net profit"));
});

const NEC = `Date,Description,Amount
2026-01-10,UPWORK PAYMENT ANNA LOPEZ,-1500.00
2026-03-10,UPWORK PAYMENT ANNA LOPEZ,-900.00
2026-02-02,ZELLE BEN OKAFOR,-1200.00
2026-02-03,CLIENT ACME,4000.00
2025-12-30,UPWORK PAYMENT ANNA LOPEZ,-700.00
`;
function necBooks() {
  let { books } = importStatement(newBooks(), NEC, "1000");
  const id = (s, d) => books.transactions.find((t) => t.desc.includes(s) && (!d || t.date === d)).id;
  return confirm(books, { [id("ANNA", "2026-01-10")]: "6020", [id("ANNA", "2026-03-10")]: "6020", [id("ANNA", "2025-12-30")]: "6020", [id("BEN")]: "6020", [id("ACME")]: "4000" });
}

test("1099-NEC: payees are totalled by year against the threshold, which changed in 2026", () => {
  assert.equal(NEC_THRESHOLD(2025), 60000);
  assert.equal(NEC_THRESHOLD(2026), 200000);
  const r = contractors1099(necBooks(), { year: 2026 });
  assert.equal(r.payees.length, 2);
  assert.equal(r.payees[0].cents, 240000);
  assert.equal(r.payees[0].count, 2);
  assert.equal(r.payees[0].over, true);
  assert.equal(r.payees[1].cents, 120000);
  assert.equal(r.payees[1].over, false, "1,200 is under the 2026 line");
  assert.equal(contractors1099(necBooks(), { year: 2026, threshold: 100000 }).reportable.length, 2);
  assert.equal(contractors1099(necBooks(), { year: 2025 }).payees[0].cents, 70000, "other years are kept apart");
  assert.equal(contractors1099(necBooks(), { year: 2025 }).reportable.length, 1);
});

test("1099-NEC: the W-9 flag is stored without any tax ID and clears the missing-W-9 warning", () => {
  const books = necBooks();
  const before = contractors1099(books, { year: 2026 });
  assert.equal(before.missingW9.length, 1);
  assert.ok(before.warnings.some((w) => /no W-9/.test(w)));
  assert.equal(before.backupWithholdingCents, Math.round(before.missingW9[0].cents * 0.24), "24% backup withholding exposure on payees with no W-9");
  assert.ok(before.warnings.some((w) => /backup withholding of 24%/.test(w)));
  assert.ok(before.warnings.some((w) => /Form 945, line 2/.test(w) && /box 4/.test(w)));
  assert.ok(before.warnings.some((w) => /Pub\. 1281/.test(w) && /applied for/.test(w)), "no awaiting-TIN grace for contractor pay");
  const marked = markW9(books, "UPWORK PAYMENT ANNA LOPEZ");
  assert.deepEqual(Object.values(marked.vendors), [{ w9: true }]);
  const after = contractors1099(marked, { year: 2026 });
  assert.equal(after.missingW9.length, 0);
  assert.equal(after.backupWithholdingCents, 0);
  assert.equal(after.payees[0].w9, true);
  assert.equal(contractors1099(markW9(marked, "UPWORK PAYMENT ANNA LOPEZ", false), { year: 2026 }).missingW9.length, 1);
  assert.throws(() => markW9(books, "NOBODY AT ALL"), /No bank line/);
});

test("1099-NEC: card payments are left out, split parts count, unfiled lines are warned about", () => {
  let { books } = importStatement(newBooks(), "Date,Description,Amount\n2026-04-01,FIVERR GIG JO,-3000.00\n", "2000");
  books = importStatement(books, "Date,Description,Amount\n2026-04-02,MIXED SHOP PAT,-1000.00\n2026-04-03,UNKNOWN PAYEE,-50.00\n", "1000").books;
  const id = (s) => books.transactions.find((t) => t.desc.includes(s)).id;
  books = confirm(books, { [id("FIVERR")]: "6020", [id("MIXED")]: parseSplit("6020:-400.00,6100:-600.00") });
  const r = contractors1099(books, { year: 2026 });
  const fiverr = r.payees.find((p) => /FIVERR/.test(p.name));
  assert.equal(fiverr.cents, 0);
  assert.equal(fiverr.cardCents, 300000);
  assert.equal(fiverr.over, false);
  assert.equal(r.payees.find((p) => /MIXED/.test(p.name)).cents, 40000);
  assert.ok(r.warnings.some((w) => /1099-K/.test(w)));
  assert.ok(r.warnings.some((w) => /still waiting/.test(w)));
  assert.equal(contractors1099Csv(r).split("\n")[0], "Payee,Paid by bank,Payments,Paid by card (not 1099-NEC),Reportable,W-9 on file");
});

test("1099-NEC: two spellings of one payee can be merged, which carries the total over the line, and undone", () => {
  let { books } = importStatement(newBooks(), "Date,Description,Amount\n2026-01-10,UPWORK PAYMENT ANNA LOPEZ,-1500.00\n2026-02-10,ZELLE ANNA LOPEZ,-600.00\n", "1000");
  books = confirm(books, Object.fromEntries(books.transactions.map((t) => [t.id, "6020"])));
  const apart = contractors1099(books, { year: 2026, threshold: 200000 });
  assert.equal(apart.payees.length, 2);
  assert.equal(apart.reportable.length, 0);
  const merged = mergePayees(markW9(books, "ZELLE ANNA LOPEZ"), "ZELLE ANNA LOPEZ", "UPWORK PAYMENT ANNA LOPEZ");
  const r = contractors1099(merged, { year: 2026, threshold: 200000 });
  assert.equal(r.payees.length, 1);
  assert.equal(r.payees[0].cents, 210000);
  assert.equal(r.payees[0].count, 2);
  assert.equal(r.reportable.length, 1);
  assert.equal(r.payees[0].w9, true, "a W-9 marked on the merged-away spelling carries to the survivor");
  assert.equal(contractors1099(mergePayees(merged, "ZELLE ANNA LOPEZ", "UPWORK PAYMENT ANNA LOPEZ", false), { year: 2026 }).payees.length, 2);
  assert.throws(() => mergePayees(books, "ZELLE ANNA LOPEZ", "NOBODY"), /No bank line/);
  assert.throws(() => mergePayees(books, "ZELLE ANNA LOPEZ", "zelle anna lopez"), /same payee/);
});

test("1099-NEC: the filing-prep CSV lists only payees over the line, in the form's boxes, with no TIN", () => {
  let { books } = importStatement(newBooks(), "Date,Description,Amount\n2026-01-10,UPWORK PAYMENT ANNA LOPEZ,-2500.00\n2026-02-10,ZELLE BOB SMALL,-300.00\n", "1000");
  books = confirm(books, Object.fromEntries(books.transactions.map((t) => [t.id, "6020"])));
  const lines = nec1099FilingCsv(contractors1099(books, { year: 2026 })).trim().split("\n");
  assert.equal(lines.length, 2, "header plus the one payee over $2,000");
  assert.match(lines[0], /^Tax year,Recipient name,Recipient TIN/);
  assert.match(lines[1], /^2026,.*ANNA LOPEZ,,,,,,2500\.00,0\.00,no$/);
});

test("1099-NEC: the due date rolls off weekends and 2027 is flagged as indexed", () => {
  assert.equal(necDeadline(2025), "2026-02-02"); // Jan 31 2026 is a Saturday
  assert.equal(necDeadline(2026), "2027-02-01"); // a Sunday
  assert.equal(necDeadline(2027), "2028-01-31"); // a Monday
  assert.ok(contractors1099(necBooks(), { year: 2026 }).warnings.every((w) => !/indexed/.test(w)));
  assert.ok(contractors1099(necBooks(), { year: 2027 }).warnings.some((w) => /indexed/.test(w)));
  assert.ok(!contractors1099(necBooks(), { year: 2027, threshold: 250000 }).warnings.some((w) => /indexed/.test(w)));
});

test("Schedule SE: 92.35% of profit, 15.3% under the wage base, half deductible", () => {
  const se = selfEmployment(10000000, { year: 2025 });
  assert.equal(se.netEarnings, 9235000);
  assert.equal(se.socialSecurity, 1145140);
  assert.equal(se.medicare, 267815);
  assert.equal(se.tax, 1412955);
  assert.equal(se.deduction, 706478);
  assert.equal(se.warnings.length, 0); // 2025 base matches the IRS Schedule SE instructions
  assert.ok(selfEmployment(10000000, { year: 2026 }).warnings.some((w) => /unchecked/.test(w)));
});

test("Schedule SE: social security stops at the wage base, wages use it up, tiny and negative profits owe nothing", () => {
  const hi = selfEmployment(30000000, { year: 2025, wageBase: 17610000 });
  assert.equal(hi.socialSecurity, Math.round(17610000 * 0.124));
  assert.equal(hi.medicare, Math.round(Math.round(30000000 * 0.9235) * 0.029));
  assert.equal(selfEmployment(5000000, { wageBase: 17610000, wages: 17610000 }).socialSecurity, 0);
  assert.equal(selfEmployment(40000, { year: 2025 }).tax, 0);
  assert.equal(selfEmployment(-500000, { year: 2025 }).tax, 0);
  assert.ok(selfEmployment(1000000, { year: 2031 }).warnings.some((w) => /No wage base/.test(w)));
  const y27 = selfEmployment(30000000, { year: 2027 });
  assert.equal(y27.socialSecurity, Math.round(19230000 * 0.124)); // $192,300, SSA Oct 2026
  assert.ok(y27.warnings.some((w) => /192,300/.test(w)));
});

test("estimated payment dates roll off weekends", () => {
  assert.deepEqual(estimatedDueDates(2026), ["2026-04-15", "2026-06-15", "2026-09-15", "2027-01-15"]);
  assert.deepEqual(estimatedDueDates(2025), ["2025-04-15", "2025-06-16", "2025-09-15", "2026-01-15"]);
  assert.equal(estimatedDueDates(2027)[3], "2028-01-18"); // Jan 15 2028 is a Saturday, Monday the 17th is MLK Day
});

test("seSetAside annualises the profit to date and splits the tax into four payments that add up", () => {
  const r = seSetAside(filed(), { year: 2026, monthsElapsed: 3 });
  assert.equal(r.profitToDate, 600000 - 20000 - 4000 - 12000 - 3333 - 6000);
  assert.equal(r.annualisedProfit, r.profitToDate * 4);
  assert.equal(r.payments.length, 4);
  assert.equal(r.payments.reduce((a, p) => a + p.cents, 0), r.se.tax);
});

import { bNoticeDates } from "./taxforms.mjs";
test("B notice dates count business days past weekends and holidays", () => {
  const r = bNoticeDates("2026-10-05"); // Monday
  assert.equal(r.mailBNoticeBy, "2026-10-27"); // 15 business days, Oct 12 (Columbus Day) skipped
  assert.equal(r.startWithholdingBy, "2026-11-18"); // 30 business days, Nov 11 (Veterans Day) skipped
  assert.equal(bNoticeDates("2026-10-05", { received: "2026-10-09" }).mailBNoticeBy, "2026-11-02");
  assert.match(bNoticeDates("2026-10-05", { second: true }).enclose, /147C/);
  assert.throws(() => bNoticeDates("10/05/2026"));
});

test("Second B Notice runs 30 business days from the B notice date; same-year second CP2100 may be disregarded (Pub. 1281)", () => {
  const r = bNoticeDates("2026-10-05", { second: true, bNoticeSent: "2026-10-20", firstNotice: "2026-03-02" });
  assert.equal(r.startWithholdingBy, "2026-12-03"); // 30 business days after Oct 20, skipping Nov 11 and Thanksgiving
  assert.equal(r.disregard, true);
  assert.equal(bNoticeDates("2026-10-05", { second: true, firstNotice: "2025-03-02" }).disregard, false);
  assert.equal(r.stopWithholdingWithinDays, 30);
});
