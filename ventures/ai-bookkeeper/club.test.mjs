// A club treasurer's month (fixtures/club-checking.csv, made up): donation-platform and fundraiser
// payouts are income; web, post and insurance costs get their usual accounts; Sam's Club stays blank.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newBooks, importStatement } from "./engine.mjs";

const csv = readFileSync(new URL("./fixtures/club-checking.csv", import.meta.url), "utf8");

test("club donation payouts are income; warehouse-club buys stay for review", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  const code = (re) => b.transactions.find((t) => re.test(t.desc ?? t.description))?.suggestion?.account;
  for (const re of [/ZEFFY/, /GIVEBUTTER/, /FUNDRAISER/]) assert.equal(code(re), "4000", String(re));
  assert.equal(code(/SQUARESPACE/), "6060");
  assert.equal(code(/MARKEL/), "6030");
  assert.equal(code(/SECRETARY/), "6110");
  assert.ok(!code(/SAMS CLUB/), "Sam's Club could be food, supplies or prizes");
});
