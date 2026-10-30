// A pool service route's month (fixtures/poolservice-checking.csv, made up): route-software payouts and a customer Zelle are sales; chemicals and equipment are supplies;
// fuel is a vehicle cost; route software, insurance, payroll and the CPO certification land in their own accounts; the Zelle to the owner is a draw.
// One line, a warehouse-club run, has no suggestion on purpose: it could be supplies or something else.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newBooks, importStatement } from "./engine.mjs";

const csv = readFileSync(new URL("./fixtures/poolservice-checking.csv", import.meta.url), "utf8");

test("pool service lines get the accounts the page says", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  const code = (re) => b.transactions.find((t) => re.test(t.desc ?? t.description))?.suggestion?.account;
  assert.equal(code(/SKIMMER PAYOUT/), "4000");
  assert.equal(code(/POOLBRAIN PAYOUT/), "4000");
  assert.equal(code(/HOLLIS POOL SERVICE/), "4000");
  assert.equal(code(/LESLIES POOL/), "6100");
  assert.equal(code(/CHLORINE/), "6100");
  assert.equal(code(/SHELL OIL/), "6160");
  assert.equal(code(/SKIMMER SUBSCRIPTION/), "6060");
  assert.equal(code(/NEXT INSURANCE/), "6030");
  assert.equal(code(/PAYCHEX/), "6150");
  assert.equal(code(/CPO CERTIFICATION/), "6110");
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
  assert.equal(Math.round(sales * 100), 425500);
  assert.equal(Math.round(out * 100), 350565);
  assert.equal(Math.round((out - 1000) * 100), 250565);
  assert.equal(Math.round((sales - out + 1000) * 100), 174935);
});
