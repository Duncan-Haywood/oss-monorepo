// A mobile detailer's month (fixtures/detailing-checking.csv, made up): Square and Stripe deposits are sales; chemicals, polish and
// hand tools are supplies; parts and fuel are vehicle costs; the Zelle to the owner is a draw, not a cost.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newBooks, importStatement } from "./engine.mjs";

const csv = readFileSync(new URL("./fixtures/detailing-checking.csv", import.meta.url), "utf8");

test("detailing lines get the accounts the page says", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  const code = (re) => b.transactions.find((t) => re.test(t.desc ?? t.description))?.suggestion?.account;
  assert.equal(code(/STRIPE TRANSFER/), "4000");
  assert.equal(code(/CHEMICAL GUYS/), "6100");
  assert.equal(code(/MEGUIARS/), "6100");
  assert.equal(code(/HARBOR FREIGHT/), "6100");
  assert.equal(code(/AUTOZONE/), "6160");
  assert.equal(code(/SHELL OIL/), "6160");
  assert.equal(code(/JOBBER/), "6060");
  assert.equal(code(/GEICO/), "6030");
  assert.equal(code(/BUSINESS LICENSE/), "6110");
  assert.equal(code(/ZELLE TO OWNER/), "3100");
});

test("every line has a suggestion and the worked month sums", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  assert.equal(b.transactions.filter((t) => !t.suggestion?.account).length, 0);
  const rows = csv.trim().split("\n").slice(1).map((l) => Number(l.split(",").at(-5)));
  const sales = rows.filter((x) => x > 0).reduce((a, x) => a + x, 0);
  const out = -rows.filter((x) => x < 0).reduce((a, x) => a + x, 0);
  assert.equal(Math.round(sales * 100), 406550);
  assert.equal(Math.round(out * 100), 145712);
  assert.equal(Math.round((sales - out + 500) * 100), 310838);
});
