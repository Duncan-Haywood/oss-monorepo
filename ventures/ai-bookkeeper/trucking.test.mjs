// An owner-operator trucker's month (fixtures/trucking-checking.csv, made up): factoring and broker payments are sales; the fuel card,
// scales and truck wash are vehicle costs; Form 2290, IFTA and PrePass are taxes and licenses; the Zelle to the owner is a draw.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newBooks, importStatement } from "./engine.mjs";

const csv = readFileSync(new URL("./fixtures/trucking-checking.csv", import.meta.url), "utf8");

test("trucking lines get the accounts the page says", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  const code = (re) => b.transactions.find((t) => re.test(t.desc ?? t.description))?.suggestion?.account;
  assert.equal(code(/TRIUMPH PAY/), "4000");
  assert.equal(code(/RTS FINANCIAL/), "4000");
  assert.equal(code(/TQL FREIGHT/), "4000");
  assert.equal(code(/COMDATA/), "6160");
  assert.equal(code(/CAT SCALE/), "6160");
  assert.equal(code(/BLUE BEACON/), "6160");
  assert.equal(code(/DAT SOLUTIONS/), "6060");
  assert.equal(code(/MOTIVE ELD/), "6060");
  assert.equal(code(/PROGRESSIVE/), "6030");
  assert.equal(code(/FLEETPRIDE/), "6090");
  assert.equal(code(/IFTA/), "6110");
  assert.equal(code(/2290/), "6110");
  assert.equal(code(/LUMPER/), "5000");
  assert.equal(code(/ZELLE TO OWNER/), "3100");
});

test("every line has a suggestion and the worked month sums", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  assert.equal(b.transactions.filter((t) => !t.suggestion?.account).length, 0);
  const rows = csv.trim().split("\n").slice(1).map((l) => Number(l.split(",").at(-5)));
  const sales = rows.filter((x) => x > 0).reduce((a, x) => a + x, 0);
  const out = -rows.filter((x) => x < 0).reduce((a, x) => a + x, 0);
  assert.equal(Math.round(sales * 100), 1175575);
  assert.equal(Math.round(out * 100), 578326);
  assert.equal(Math.round((sales - out + 1500) * 100), 747249);
});
