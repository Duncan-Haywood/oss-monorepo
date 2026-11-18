// A pest control operator's month (fixtures/pest-checking.csv, made up): plan and Square deposits are sales; the chemical distributor is supplies;
// route software is software; the pesticide licence is licences; insurance, fuel and ads as named; the Zelle to the owner is a draw.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newBooks, importStatement } from "./engine.mjs";

const csv = readFileSync(new URL("./fixtures/pest-checking.csv", import.meta.url), "utf8");

test("pest control lines get the accounts the page says", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  const code = (re) => b.transactions.find((t) => re.test(t.desc ?? t.description))?.suggestion?.account;
  assert.equal(code(/QUARTERLY PEST/), "4000");
  assert.equal(code(/SQUARE INC/), "4000");
  assert.equal(code(/BASF/), "6100");
  assert.equal(code(/PESTROUTES/), "6060");
  assert.equal(code(/PESTICIDE LICENSE/), "6110");
  assert.equal(code(/HARTFORD/), "6030");
  assert.equal(code(/SHELL/), "6160");
  assert.equal(code(/GOOGLE ADS/), "6000");
  assert.equal(code(/ZELLE TO OWNER/), "3100");
});

test("every line has a suggestion and the worked month sums as the page says", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  assert.equal(b.transactions.filter((t) => !t.suggestion?.account).length, 0);
  const rows = csv.trim().split("\n").slice(1).map((l) => Number(l.split(",").at(-5)));
  const sales = rows.filter((x) => x > 0).reduce((a, x) => a + x, 0);
  const out = -rows.filter((x) => x < 0).reduce((a, x) => a + x, 0);
  assert.equal(Math.round(sales * 100), 317000);
  assert.equal(Math.round(out * 100), 142180);
  assert.equal(Math.round((out - 600) * 100), 82180);
  assert.equal(Math.round((sales - out + 600) * 100), 234820);
});
