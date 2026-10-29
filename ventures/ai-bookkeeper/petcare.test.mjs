// A pet sitter and dog walker's month (fixtures/petcare-checking.csv, made up): Rover, Wag and Square payouts are sales;
// scheduling software, pet-store supplies, association dues and a first-aid class each land in their own account;
// the Zelle from a person and the shelter donation stay in review.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newBooks, importStatement } from "./engine.mjs";

const csv = readFileSync(new URL("./fixtures/petcare-checking.csv", import.meta.url), "utf8");

test("pet care lines get the accounts the page says", () => {
  const b = importStatement(newBooks(), csv, "1000").books;
  const code = (re) => b.transactions.find((t) => re.test(t.desc ?? t.description))?.suggestion?.account;
  assert.equal(code(/ROVER/), "4000");
  assert.equal(code(/WAG LABS/), "4000");
  assert.equal(code(/TIME TO PET/), "6060");
  assert.equal(code(/PETCO/), "6100");
  assert.equal(code(/POOP BAGS/), "6100");
  assert.equal(code(/PROFESSIONAL PET SITTERS/), "6170");
  assert.equal(code(/FIRST AID/), "6170");
  assert.equal(code(/INSURANCE/), "6030");
  assert.equal(code(/SHELL/), "6160");
  assert.equal(code(/ZELLE/) ?? null, null);
  assert.equal(code(/HUMANE/) ?? null, null);
});

test("the worked month sums as the page says", () => {
  const rows = csv.trim().split("\n").slice(1).map((l) => Number(l.split(",").at(-5)));
  const sales = rows.filter((x) => x > 0).reduce((a, x) => a + x, 0);
  const costs = -rows.filter((x) => x < 0).reduce((a, x) => a + x, 0);
  assert.equal(Math.round(sales * 100), 166050);
  assert.equal(Math.round(costs * 100), 49340);
  assert.equal(Math.round((sales - costs) * 100), 116710);
});
