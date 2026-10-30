// A pressure-washing and window-cleaning crew's month (fixtures/pressurewash-checking.csv, made up): Jobber payouts and HOA or property-manager Zelles are sales;
// washer gear, chemicals and squeegees are supplies; fuel, field-service software and insurance use the general rules.
// One line, a warehouse-club run, has no suggestion on purpose.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newBooks, importStatement } from "./engine.mjs";

const csv = readFileSync(new URL("./fixtures/pressurewash-checking.csv", import.meta.url), "utf8");

test("crew lines get the accounts the page says", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  const code = (re) => b.transactions.find((t) => re.test(t.desc ?? t.description))?.suggestion?.account;
  assert.equal(code(/JOBBER PAYOUT/), "4000");
  assert.equal(code(/OAKRIDGE HOA/), "4000");
  assert.equal(code(/SUNRISE PROPERTY/), "4000");
  assert.equal(code(/NORTHERN TOOL/), "6100");
  assert.equal(code(/SODIUM HYPOCHLORITE/), "6100");
  assert.equal(code(/SIMPLE GREEN/), "6100");
  assert.equal(code(/UNGER/), "6100");
  assert.equal(code(/SHELL OIL/), "6160");
  assert.equal(code(/JOBBER SUBSCRIPTION/), "6060");
  assert.equal(code(/NEXT INSURANCE/), "6030");
  assert.equal(code(/ZELLE TRANSFER TO OWNER/), "3100");
});

test("only the warehouse-club run is left for review and the month sums as the page says", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  const open = b.transactions.filter((t) => !t.suggestion?.account);
  assert.equal(open.length, 1);
  assert.match(open[0].desc ?? open[0].description, /COSTCO/);
  const rows = csv.trim().split("\n").slice(1).map((l) => Number(l.split(",").at(-5)));
  const sales = rows.filter((x) => x > 0).reduce((a, x) => a + x, 0);
  const out = -rows.filter((x) => x < 0).reduce((a, x) => a + x, 0);
  assert.equal(Math.round(sales * 100), 393000);
  assert.equal(Math.round(out * 100), 183964);
  assert.equal(Math.round((out - 800) * 100), 103964);
  assert.equal(Math.round((sales - out + 800) * 100), 289036);
});
