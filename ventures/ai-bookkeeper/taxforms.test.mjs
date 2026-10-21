import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement, confirm, parseSplit } from "./engine.mjs";
import { scheduleC, scheduleCCsv, contractors1099, contractors1099Csv, markW9, NEC_THRESHOLD, mergePayees, unmergePayee, suggestPayeeMerges, contractors1099NecCsv } from "./taxforms.mjs";

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
  const marked = markW9(books, "UPWORK PAYMENT ANNA LOPEZ");
  assert.deepEqual(Object.values(marked.vendors), [{ w9: true }]);
  const after = contractors1099(marked, { year: 2026 });
  assert.equal(after.missingW9.length, 0);
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

const SPELLINGS = `Date,Description,Amount
2026-01-10,UPWORK PAYMENT ANNA LOPEZ,-1200.00
2026-02-10,ZELLE A LOPEZ,-900.00
2026-03-10,UPWORK PAYMENT ANNA LOPES,-300.00
2026-02-02,ZELLE BEN OKAFOR,-1200.00
`;
function spellingBooks() {
  const { books } = importStatement(newBooks(), SPELLINGS, "1000");
  return confirm(books, Object.fromEntries(books.transactions.map((t) => [t.id, "6020"])));
}

test("1099-NEC: spelling variants of one person are suggested, and merging them crosses the line", () => {
  const books = spellingBooks();
  const r = contractors1099(books, { year: 2026 });
  assert.equal(r.reportable.length, 0, "ANNA LOPEZ and ANNA LOPES already share a key; with A LOPEZ apart, $1,500 each way");
  const sugg = suggestPayeeMerges(r);
  assert.equal(sugg.length, 1, "A LOPEZ matches ANNA LOPEZ; Ben matches nobody");
  assert.ok(!/BEN/.test(sugg[0].from + sugg[0].into));
  const merged = mergePayees(books, "ZELLE A LOPEZ", "UPWORK PAYMENT ANNA LOPEZ");
  const m = contractors1099(merged, { year: 2026 });
  assert.equal(m.payees.length, 2);
  assert.equal(m.payees[0].cents, 240000);
  assert.equal(m.payees[0].count, 3, "three bank lines under two spellings");
  assert.equal(m.payees[0].over, true);
  assert.equal(m.reportable.length, 1);
  assert.equal(books.vendors, undefined, "merging returns new books and leaves the bank lines alone");
  assert.equal(contractors1099(unmergePayee(merged, "ZELLE A LOPEZ"), { year: 2026 }).payees.length, 3);
  assert.throws(() => mergePayees(books, "ZELLE A LOPEZ", "ZELLE A LOPEZ"), /already the same/);
  assert.throws(() => mergePayees(books, "NOBODY AT ALL", "ZELLE A LOPEZ"), /No bank line/);
});

test("1099-NEC: a W-9 flag follows a merge, and the filing CSV lists reportable payees with blank tax fields", () => {
  let books = mergePayees(spellingBooks(), "ZELLE A LOPEZ", "UPWORK PAYMENT ANNA LOPEZ");
  books = markW9(books, "ZELLE A LOPEZ");
  assert.deepEqual(books.vendors, { "zelle lopez": { mergedInto: "upwork anna" }, "upwork anna": { w9: true } }, "the flag lands on the merge target");
  const r = contractors1099(books, { year: 2026, threshold: 200000 });
  assert.equal(r.reportable.length, 1);
  assert.equal(r.reportable[0].w9, true);
  const rows = contractors1099NecCsv(r).trim().split("\n");
  assert.equal(rows.length, 2);
  assert.match(rows[0], /^Recipient name,Recipient TIN,/);
  assert.match(rows[1], /,,,,,2400\.00,0\.00$/);
});
