// A food truck's month (fixtures/foodtruck-checking.csv, made up): Square and catering deposits are sales; commissary rent, propane, the event fee and the generator service land in their own accounts;
// the Zelle to the owner is a draw. Every line gets a suggestion.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newBooks, importStatement } from "./engine.mjs";

const csv = readFileSync(new URL("./fixtures/foodtruck-checking.csv", import.meta.url), "utf8");

test("food truck lines get the accounts the page says", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  const code = (re) => b.transactions.find((t) => re.test(t.desc ?? t.description))?.suggestion?.account;
  assert.equal(code(/SQUARE INC/), "4000");
  assert.equal(code(/CATERING DEPOSIT/), "4000");
  assert.equal(code(/RESTAURANT DEPOT/), "6100");
  assert.equal(code(/COMMISSARY/), "6080");
  assert.equal(code(/PROPANE/), "6140");
  assert.equal(code(/HEALTH DEPT/), "6110");
  assert.equal(code(/SHELL OIL/), "6160");
  assert.equal(code(/WEBSTAURANT/), "6100");
  assert.equal(code(/TRUCK INSURANCE/), "6030");
  assert.equal(code(/ROAMING HUNGER/), "6000");
  assert.equal(code(/GENERATOR/), "6090");
  assert.equal(code(/ZELLE TRANSFER TO OWNER/), "3100");
});

test("nothing is left for review and the month sums as the page says", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  assert.equal(b.transactions.filter((t) => !t.suggestion?.account).length, 0);
  const rows = csv.trim().split("\n").slice(1).map((l) => Number(l.split(",").at(-5)));
  const sales = rows.filter((x) => x > 0).reduce((a, x) => a + x, 0);
  const out = -rows.filter((x) => x < 0).reduce((a, x) => a + x, 0);
  assert.equal(Math.round(sales * 100), 638835);
  assert.equal(Math.round((out - 1200) * 100), 284700);
  assert.equal(Math.round((sales - out + 1200) * 100), 354135);
});
