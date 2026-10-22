import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readStatement, checkRunningBalance } from "./bank.mjs";

const read = (f) => readStatement(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8"));

test("Revolut: completed rows only, fee taken off, balance chain holds", () => {
  const r = read("revolut-current.csv");
  assert.equal(r.bank, "revolut");
  assert.deepEqual(r.rows.map((x) => x.cents), [-1500, 120000, -10150]);
  assert.deepEqual(r.rows.map((x) => x.date), ["2026-03-03", "2026-03-04", "2026-03-05"]);
  assert.equal(r.problems.length, 2, "pending and reverted rows are reported, not imported");
  const c = checkRunningBalance(r.rows);
  assert.equal(c.checked, true);
  assert.deepEqual(c.breaks, []);
  assert.equal(c.opening, 200000);
});

test("Revolut: a file with two currencies is flagged", () => {
  const t = readFileSync(new URL("./fixtures/revolut-current.csv", import.meta.url), "utf8").replace("Figma,-15.00,0.00,EUR", "Figma,-15.00,0.00,USD");
  assert.ok(readStatement(t).problems.some((p) => /mixes currencies/.test(p)));
});

test("Wise: DD-MM-YYYY dates read day first, running balance chains", () => {
  const r = read("wise-statement.csv");
  assert.equal(r.bank, "wise");
  assert.deepEqual(r.rows.map((x) => x.date), ["2026-03-13", "2026-03-12"]);
  assert.deepEqual(r.rows.map((x) => x.cents), [-2499, 100000]);
  assert.deepEqual(checkRunningBalance(r.rows).breaks, []);
});

test("Monzo: day-first dates, merchant name, signed amounts", () => {
  const r = read("monzo.csv");
  assert.equal(r.bank, "monzo");
  assert.deepEqual(r.rows.map((x) => x.date), ["2026-03-14", "2026-03-13"]);
  assert.deepEqual(r.rows.map((x) => x.cents), [-800, 150000]);
  assert.equal(r.rows[0].desc, "Notion");
});

test("Starling: counter party as description, balance chain holds", () => {
  const r = read("starling.csv");
  assert.equal(r.bank, "starling");
  assert.deepEqual(r.rows.map((x) => x.cents), [-1250, 100000]);
  assert.equal(r.rows[0].desc, "Figma");
  assert.deepEqual(checkRunningBalance(r.rows).breaks, []);
});
