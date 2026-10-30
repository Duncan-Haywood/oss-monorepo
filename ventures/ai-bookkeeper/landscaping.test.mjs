// A landscaping business's month (fixtures/landscaping-checking.csv, made up): HOA, card-processor and Square deposits
// are sales; materials, fuel, software, equipment parts, auto insurance, ads and payroll fees get their usual accounts.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newBooks, importStatement } from "./engine.mjs";

const csv = readFileSync(new URL("./fixtures/landscaping-checking.csv", import.meta.url), "utf8");

test("landscaping lines get the accounts the page says", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  const code = (re) => b.transactions.find((t) => re.test(t.desc ?? t.description))?.suggestion?.account;
  for (const re of [/OAKRIDGE/, /STRIPE/, /SQUARE/]) assert.equal(code(re), "4000", String(re));
  assert.equal(code(/HOME DEPOT/), "6100");
  assert.equal(code(/STIHL/), "6100");
  assert.equal(code(/SHELL/), "6160");
  assert.equal(code(/JOBBER/), "6060");
  assert.equal(code(/GUSTO/), "6060");
  assert.equal(code(/PROGRESSIVE/), "6030");
  assert.equal(code(/GOOGLE ADS/), "6000");
});

test("the worked month sums as the page says", () => {
  const rows = csv.trim().split("\n").slice(1).map((l) => Number(l.split(",").at(-5)));
  const sales = rows.filter((x) => x > 0).reduce((a, x) => a + x, 0);
  const costs = -rows.filter((x) => x < 0).reduce((a, x) => a + x, 0);
  assert.equal(Math.round(sales * 100), 208000);
  assert.equal(Math.round(costs * 100), 72270);
  assert.equal(Math.round((sales - costs) * 100), 135730);
});
