// A cleaning business's month (fixtures/cleaning-checking.csv, made up): client and marketplace deposits are sales;
// fuel, software, leads and insurance get their usual accounts; Sam's Club stays blank.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newBooks, importStatement } from "./engine.mjs";

const csv = readFileSync(new URL("./fixtures/cleaning-checking.csv", import.meta.url), "utf8");

test("cleaning lines get the accounts the page says", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  const code = (re) => b.transactions.find((t) => re.test(t.desc ?? t.description))?.suggestion?.account;
  for (const re of [/MARTINEZ/, /THUMBTACK PAYOUT/, /STRIPE/]) assert.equal(code(re), "4000", String(re));
  assert.equal(code(/SHELL/), "6160");
  assert.equal(code(/JOBBER/), "6060");
  assert.equal(code(/GUSTO/), "6060");
  assert.equal(code(/LEAD FEE/), "6000");
  assert.equal(code(/HARTFORD/), "6030");
  assert.ok(!code(/SAMS CLUB/), "Sam's Club could be supplies or something else");
});

test("the worked month sums as the page says", () => {
  const rows = csv.trim().split("\n").slice(1).map((l) => Number(l.split(",").at(-5)));
  const sales = rows.filter((x) => x > 0).reduce((a, x) => a + x, 0);
  const costs = -rows.filter((x) => x < 0).reduce((a, x) => a + x, 0);
  assert.equal(Math.round(sales * 100), 128500);
  assert.equal(Math.round(costs * 100), 44780);
  assert.equal(Math.round((sales - costs) * 100), 83720);
});
