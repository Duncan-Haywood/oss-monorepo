// A wedding DJ and planner's month (fixtures/eventpro-checking.csv, made up): Stripe and Square deposits are sales; wholesale flowers are
// supplies; planner software is software; sound gear, rentals, listings and fuel keep their existing accounts; the Zelle to the owner is a draw.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newBooks, importStatement } from "./engine.mjs";

const csv = readFileSync(new URL("./fixtures/eventpro-checking.csv", import.meta.url), "utf8");

test("event-pro lines get the accounts the page says", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  const code = (re) => b.transactions.find((t) => re.test(t.desc ?? t.description))?.suggestion?.account;
  assert.equal(code(/STRIPE TRANSFER/), "4000");
  assert.equal(code(/SQUARE INC/), "4000");
  assert.equal(code(/SWEETWATER/), "6070");
  assert.equal(code(/GROWERS DIRECT/), "6100");
  assert.equal(code(/AISLE PLANNER/), "6060");
  assert.equal(code(/WEDDINGWIRE/), "6000");
  assert.equal(code(/HISCOX/), "6030");
  assert.equal(code(/SHELL OIL/), "6160");
  assert.equal(code(/PARTY RENTAL/), "6090");
  assert.equal(code(/BUSINESS LICENSE/), "6110");
  assert.equal(code(/ZELLE TO OWNER/), "3100");
});

test("every line has a suggestion and the worked month sums", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  assert.equal(b.transactions.filter((t) => !t.suggestion?.account).length, 0);
  const rows = csv.trim().split("\n").slice(1).map((l) => Number(l.split(",").at(-5)));
  const sales = rows.filter((x) => x > 0).reduce((a, x) => a + x, 0);
  const out = -rows.filter((x) => x < 0).reduce((a, x) => a + x, 0);
  assert.equal(Math.round(sales * 100), 700000);
  assert.equal(Math.round(out * 100), 236045);
  assert.equal(Math.round((sales - out + 1000) * 100), 563955);
});
