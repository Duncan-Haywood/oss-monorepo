// A restaurant's month (fixtures/restaurant-checking.csv, made up): POS and delivery-app payouts
// are sales; food-service distributors are supplies; POS and scheduling subscriptions are software.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newBooks, importStatement } from "./engine.mjs";

const csv = readFileSync(new URL("./fixtures/restaurant-checking.csv", import.meta.url), "utf8");

test("restaurant payouts are sales; distributors are supplies; subscriptions are software", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  const code = (re) => b.transactions.find((t) => re.test(t.desc ?? t.description))?.suggestion?.account;
  for (const re of [/TOAST INC/, /DOORDASH/, /UBER EATS/, /GRUBHUB/]) assert.equal(code(re), "4000", String(re));
  for (const re of [/SYSCO/, /US FOODS/]) assert.equal(code(re), "6100", String(re));
  for (const re of [/TOAST POS/, /7SHIFTS/]) assert.equal(code(re), "6060", String(re));
  assert.equal(code(/ECOLAB/), "6090");
  assert.equal(code(/HEALTH DEPT/), "6110");
  assert.equal(code(/SERVSAFE/), "6170");
});

test("the worked month sums as the page says", () => {
  const rows = csv.trim().split("\n").slice(1).map((l) => Number(l.split(",").at(-5)));
  const sales = rows.filter((x) => x > 0).reduce((a, x) => a + x, 0);
  const costs = -rows.filter((x) => x < 0).reduce((a, x) => a + x, 0);
  assert.equal(Math.round(sales * 100), 609570);
  assert.equal(Math.round(costs * 100), 274457);
  assert.equal(Math.round((sales - costs) * 100), 335113);
});
