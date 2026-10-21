import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement, confirm } from "./engine.mjs";
import { scheduleC, scheduleCCsv } from "./taxforms.mjs";

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

import { contractors1099, setVendor, contractorsCsv } from "./taxforms.mjs";

const PAY = `Date,Description,Amount
2025-03-01,UPWORK ESCROW 1,-400.00
2025-06-01,UPWORK ESCROW 22,-300.00
2025-04-01,JANE DOE DESIGN,-550.00
2025-05-01,ACME STAFFING LLC,-5000.00
2026-02-01,JANE DOE DESIGN,-1500.00
`;
function paid() {
  let { books } = importStatement(newBooks(), PAY, "1000");
  return confirm(books, Object.fromEntries(books.transactions.map((t) => [t.id, "6020"])));
}

test("1099-NEC: payments to one payee add up across descriptions, and the year threshold applies", () => {
  const r25 = contractors1099(paid(), { year: 2025 });
  assert.equal(r25.threshold, 60000);
  const up = r25.rows.find((x) => /upwork/.test(x.key));
  assert.equal(up.cents, 70000);
  assert.deepEqual(r25.toFile.map((x) => x.key).sort(), ["acme staffing", "upwork escrow"]);
  assert.ok(!r25.toFile.some((x) => /jane/.test(x.key)), "550 is under 600");
  assert.ok(r25.warnings.some((w) => /Jane|JANE/i.test(w) && /threshold/.test(w)));
  const r26 = contractors1099(paid(), { year: 2026 });
  assert.equal(r26.threshold, 200000);
  assert.equal(r26.toFile.length, 0, "1500 is under 2000 in 2026");
});

test("1099-NEC: corporations drop off, W-9s clear the warning, card payments are not counted", () => {
  let b = paid();
  const acme = contractors1099(b, { year: 2025 }).rows.find((x) => /acme/.test(x.key));
  assert.ok(acme.owed);
  b = setVendor(b, acme.key, { corp: true });
  assert.ok(!contractors1099(b, { year: 2025 }).rows.find((x) => x.key === acme.key).owed);
  const r = contractors1099(b, { year: 2025 });
  const up = r.toFile[0];
  assert.ok(r.warnings.some((w) => /no W-9/.test(w)));
  b = setVendor(b, up.key, { w9: true });
  assert.ok(!contractors1099(b, { year: 2025 }).warnings.some((w) => /no W-9/.test(w)));
  const card = importStatement(newBooks(), "Date,Description,Amount\n2025-03-01,FREELANCER CO,-900.00\n", "2000").books;
  const cb = confirm(card, { [card.transactions[0].id]: "6020" });
  const cr = contractors1099(cb, { year: 2025 });
  assert.equal(cr.toFile.length, 0);
  assert.ok(cr.warnings.some((w) => /1099-K/.test(w)));
  assert.match(contractorsCsv(r), /^Payee,Key/);
});
