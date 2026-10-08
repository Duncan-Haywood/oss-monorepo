import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRows, evaluate, taxOn, sampleList, reportCsv, money } from "./calc.mjs";

test("box 11 aggregate = realized - prior unrealized + current unrealized", () => {
  const p = parseRows("A,1000,200,300");
  assert.equal(p.rows[0].aggregate, 1100);
});

test("header row is skipped, parentheses are negatives", () => {
  const p = parseRows("Account,Box 8,Box 9,Box 10\nA,(500),0,0");
  assert.equal(p.rows.length, 1);
  assert.equal(p.rows[0].aggregate, -500);
});

test("60/40 split and saving at 32% ordinary, 15% long-term", () => {
  const r = evaluate("A,10000,0,0", { ordinary: 32, longTerm: 15 });
  assert.equal(r.summary.lt, 6000);
  assert.equal(r.summary.st, 4000);
  // blended = .6*.15 + .4*.32 = .218
  assert.equal(r.summary.as1256, 2180);
  assert.equal(r.summary.asShortTerm, 3200);
  assert.equal(r.summary.saving, 1020);
});

test("NIIT adds 3.8 points to both sides and leaves the saving unchanged", () => {
  const a = taxOn(10000, { ordinary: 0.32, longTerm: 0.15 });
  const b = taxOn(10000, { ordinary: 0.32, longTerm: 0.15, niit: true });
  assert.equal(a.saving, b.saving);
  assert.equal(b.asShortTerm, 3580);
});

test("a net loss carries the carryback note and no saving claim", () => {
  const r = evaluate("A,-5000,0,0");
  assert.equal(r.summary.net, -5000);
  assert.match(r.notes.join(" "), /carry it back up to three years/);
  assert.doesNotMatch(r.notes.join(" "), /saves about/);
});

test("unreadable rows are reported, not guessed", () => {
  const r = evaluate("A,1000,0,0\nB,abc,0,0");
  assert.equal(r.rows.length, 1);
  assert.equal(r.errors.length, 1);
  assert.equal(evaluate("").error, "No rows found.");
});

test("sample list evaluates and the report csv carries the total", () => {
  const r = evaluate(sampleList());
  assert.equal(r.summary.net, 18250 + 1200 + 3400 - 6400 + 850 + 4100 - 900 - 2250);
  assert.match(reportCsv(r), /Total,,,,18250/);
  assert.equal(money(-1234.5), "-$1,234.50");
});
