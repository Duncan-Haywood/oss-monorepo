// A farmers-market and cottage-food vendor's month (fixtures/marketvendor-checking.csv, made up): Square deposits are sales;
// ingredients and packaging are supplies; the market fee and cottage permit are taxes and licenses; the Venmo cash-out stays in review.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newBooks, importStatement } from "./engine.mjs";

const csv = readFileSync(new URL("./fixtures/marketvendor-checking.csv", import.meta.url), "utf8");

test("market vendor lines get the accounts the page says", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  const code = (re) => b.transactions.find((t) => re.test(t.desc ?? t.description))?.suggestion?.account;
  assert.equal(code(/SQUARE INC 2026100301/), "4000");
  for (const re of [/RESTAURANT DEPOT/, /ULINE/, /WEBSTAURANT/, /GFS/, /SAMS CLUB/]) assert.equal(code(re), "6100", String(re));
  assert.equal(code(/VENDOR FEE/), "6110");
  assert.equal(code(/COTTAGE FOOD PERMIT/), "6110");
  assert.equal(code(/LIABILITY INSURANCE/), "6030");
  assert.equal(code(/SHELL/), "6160");
  assert.equal(code(/SQUARESPACE/), "6060");
  assert.equal(code(/SERVSAFE/), "6170");
  assert.equal(code(/VENMO/) ?? null, null);
});

test("the worked month sums as the page says", () => {
  const rows = csv.trim().split("\n").slice(1).map((l) => Number(l.split(",").at(-5)));
  const sales = rows.filter((x) => x > 0).reduce((a, x) => a + x, 0);
  const costs = -rows.filter((x) => x < 0).reduce((a, x) => a + x, 0);
  assert.equal(Math.round(sales * 100), 199865);
  assert.equal(Math.round(costs * 100), 101379);
  assert.equal(Math.round((sales - costs) * 100), 98486);
});
