// A real estate agent's month (fixtures/realtor-checking.csv, made up): commission deposits are sales;
// MLS, association dues, lockboxes, leads, CRM and E&O each land in their own account.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newBooks, importStatement } from "./engine.mjs";

const csv = readFileSync(new URL("./fixtures/realtor-checking.csv", import.meta.url), "utf8");

test("realtor lines get the accounts the page says", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  const code = (re) => b.transactions.find((t) => re.test(t.desc ?? t.description))?.suggestion?.account;
  assert.equal(code(/LAKESHORE/), "4000");
  assert.equal(code(/FIRST AMERICAN/), "4000");
  assert.equal(code(/MLS/), "6110");
  assert.equal(code(/FOLLOW UP/), "6060");
  assert.equal(code(/ZILLOW/), "6000");
  assert.equal(code(/REALTOR\.COM/), "6000");
  assert.equal(code(/NAR DUES/), "6170");
  assert.equal(code(/SUPRA/), "6070");
  assert.equal(code(/HISCOX/), "6030");
});

test("the worked month sums as the page says", () => {
  const rows = csv.trim().split("\n").slice(1).map((l) => Number(l.split(",").at(-5)));
  const sales = rows.filter((x) => x > 0).reduce((a, x) => a + x, 0);
  const costs = -rows.filter((x) => x < 0).reduce((a, x) => a + x, 0);
  assert.equal(Math.round(sales * 100), 1011500);
  assert.equal(Math.round(costs * 100), 116300);
  assert.equal(Math.round((sales - costs) * 100), 895200);
});
