// A drone pilot's month (fixtures/drone-checking.csv, made up): survey fees and Square deposits are sales; the drone store is supplies;
// mapping software and the airspace app are software; drone insurance is insurance; the Part 107 exam is education; fuel is vehicle;
// the Zelle to the owner is a draw, not a cost.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newBooks, importStatement } from "./engine.mjs";

const csv = readFileSync(new URL("./fixtures/drone-checking.csv", import.meta.url), "utf8");

test("drone lines get the accounts the page says", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  const code = (re) => b.transactions.find((t) => re.test(t.desc ?? t.description))?.suggestion?.account;
  assert.equal(code(/AERIAL SURVEY/), "4000");
  assert.equal(code(/SQUARE INC/), "4000");
  assert.equal(code(/DJI STORE/), "6100");
  assert.equal(code(/DRONEDEPLOY/), "6060");
  assert.equal(code(/ALTITUDE ANGEL/), "6060");
  assert.equal(code(/SKYWARD/), "6030");
  assert.equal(code(/PART 107/), "6170");
  assert.equal(code(/SHELL/), "6160");
  assert.equal(code(/INSTAGRAM/), "6000");
  assert.equal(code(/ZELLE TO OWNER/), "3100");
});

test("every line has a suggestion and the worked month sums as the page says", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  assert.equal(b.transactions.filter((t) => !t.suggestion?.account).length, 0);
  const rows = csv.trim().split("\n").slice(1).map((l) => Number(l.split(",").at(-5)));
  const sales = rows.filter((x) => x > 0).reduce((a, x) => a + x, 0);
  const out = -rows.filter((x) => x < 0).reduce((a, x) => a + x, 0);
  assert.equal(Math.round(sales * 100), 355000);
  assert.equal(Math.round(out * 100), 118819);
  assert.equal(Math.round((out - 500) * 100), 68819);
  assert.equal(Math.round((sales - out + 500) * 100), 286181);
});
