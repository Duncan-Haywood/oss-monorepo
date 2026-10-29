// A stylist's month (fixtures/salon-checking.csv, made up): Square deposits are sales; supplies, software,
// licence, insurance and ads each land in their own account; the towel laundry stays in review.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newBooks, importStatement } from "./engine.mjs";

const csv = readFileSync(new URL("./fixtures/salon-checking.csv", import.meta.url), "utf8");

test("salon lines get the accounts the page says", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  const code = (re) => b.transactions.find((t) => re.test(t.desc ?? t.description))?.suggestion?.account;
  assert.equal(code(/SQ260903/), "4000");
  assert.equal(code(/SALLY/), "6100");
  assert.equal(code(/SALON CENTRIC/), "6100");
  assert.equal(code(/VAGARO/), "6060");
  assert.equal(code(/COSMETOLOGY/), "6110");
  assert.equal(code(/ABMP/), "6030");
  assert.equal(code(/META ADS/), "6000");
  assert.equal(code(/LAUNDRY/) ?? null, null);
});

test("the worked month sums as the page says", () => {
  const rows = csv.trim().split("\n").slice(1).map((l) => Number(l.split(",").at(-5)));
  const sales = rows.filter((x) => x > 0).reduce((a, x) => a + x, 0);
  const costs = -rows.filter((x) => x < 0).reduce((a, x) => a + x, 0);
  assert.equal(Math.round(sales * 100), 820500);
  assert.equal(Math.round(costs * 100), 109070);
  assert.equal(Math.round((sales - costs) * 100), 711430);
});
