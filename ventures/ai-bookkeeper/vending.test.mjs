// A vending route operator's month (fixtures/vending-checking.csv, made up): cashless-reader settlements and route cash are sales; the location commission is rent;
// machine parts are repairs; fuel, insurance, the reader fee and the state licence land in their own accounts; the Zelle to the owner is a draw.
// One line, a warehouse-club run, has no suggestion on purpose: it could be stock or supplies.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newBooks, importStatement } from "./engine.mjs";

const csv = readFileSync(new URL("./fixtures/vending-checking.csv", import.meta.url), "utf8");

test("vending route lines get the accounts the page says", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  const code = (re) => b.transactions.find((t) => re.test(t.desc ?? t.description))?.suggestion?.account;
  assert.equal(code(/CANTALOUPE DEPOSIT/), "4000");
  assert.equal(code(/NAYAX/), "4000");
  assert.equal(code(/CASH DEPOSIT VENDING/), "4000");
  assert.equal(code(/RESTAURANT DEPOT/), "6100");
  assert.equal(code(/MONTHLY SERVICE FEE/), "6010");
  assert.equal(code(/LOCATION COMMISSION/), "6080");
  assert.equal(code(/MACHINE PARTS/), "6090");
  assert.equal(code(/SHELL OIL/), "6160");
  assert.equal(code(/HISCOX/), "6030");
  assert.equal(code(/DEPT OF AGRICULTURE/), "6110");
  assert.equal(code(/ZELLE TRANSFER TO OWNER/), "3100");
});

test("only the warehouse-club run is left for review and the month sums as the page says", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  const open = b.transactions.filter((t) => !t.suggestion?.account);
  assert.equal(open.length, 1);
  assert.match(open[0].desc ?? open[0].description, /SAMS CLUB/);
  const rows = csv.trim().split("\n").slice(1).map((l) => Number(l.split(",").at(-5)));
  const sales = rows.filter((x) => x > 0).reduce((a, x) => a + x, 0);
  const out = -rows.filter((x) => x < 0).reduce((a, x) => a + x, 0);
  assert.equal(Math.round(sales * 100), 491615);
  assert.equal(Math.round(out * 100), 335350);
  assert.equal(Math.round((out - 1000) * 100), 235350);
  assert.equal(Math.round((sales - out + 1000) * 100), 256265);
});
