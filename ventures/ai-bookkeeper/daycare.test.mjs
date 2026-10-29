// A home daycare's month (fixtures/daycare-checking.csv, made up): tuition by Zelle and Brightwheel and a food-program
// reimbursement are sales; software, craft and toy supplies, accreditation dues and an infant CPR class each land in their
// own account; the Venmo cash-out is an owner draw, not a cost.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newBooks, importStatement } from "./engine.mjs";

const csv = readFileSync(new URL("./fixtures/daycare-checking.csv", import.meta.url), "utf8");

test("daycare lines get the accounts the page says", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  const code = (re) => b.transactions.find((t) => re.test(t.desc ?? t.description))?.suggestion?.account;
  assert.equal(code(/ZELLE FROM JORDAN/), "4000");
  assert.equal(code(/BRIGHTWHEEL TUITION/), "4000");
  assert.equal(code(/CACFP REIMBURSEMENT/), "4000");
  assert.equal(code(/BRIGHTWHEEL SUBSCRIPTION/), "6060");
  assert.equal(code(/HOBBY LOBBY/), "6100");
  assert.equal(code(/TARGET TOYS/), "6100");
  assert.equal(code(/NAFCC/), "6170");
  assert.equal(code(/SPONSOR FEE/), "6170");
  assert.equal(code(/INFANT CPR/), "6170");
  assert.equal(code(/LIABILITY INSURANCE/), "6030");
  assert.equal(code(/VENMO CASHOUT/), "3100");
});

test("every line has a suggestion and the worked month sums as the page says", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  assert.equal(b.transactions.filter((t) => !t.suggestion?.account).length, 0);
  const rows = csv.trim().split("\n").slice(1).map((l) => Number(l.split(",").at(-5)));
  const sales = rows.filter((x) => x > 0).reduce((a, x) => a + x, 0);
  const out = -rows.filter((x) => x < 0).reduce((a, x) => a + x, 0);
  assert.equal(Math.round(sales * 100), 276275);
  assert.equal(Math.round(out * 100), 96992);
  assert.equal(Math.round((out - 300) * 100), 66992);
  assert.equal(Math.round((sales - out + 300) * 100), 209283);
});
