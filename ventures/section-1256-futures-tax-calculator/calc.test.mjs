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
  assert.match(r.notes.join(" "), /carry the rest back three years/);
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

// Quality audit round 48 (portfolio/quality/audits/2026-11-12-section-1256-futures-tax-calculator.json).
test("tab-delimited paste from a spreadsheet is read", () => {
  assert.equal(parseRows("Account\tBox 8\tBox 9\tBox 10\nA\t1000\t200\t300").rows[0].aggregate, 1100);
});

test("a row with more than four fields (unquoted thousands separators) is refused, not misread", () => {
  const p = parseRows("A,18,250.00,0,0\nB,100,0,0");
  assert.equal(p.errors.length, 1);
  assert.equal(p.rows.length, 1);
  assert.equal(p.rows[0].label, "B");
});

test("an emptied rate field falls back to the default instead of NaN", () => {
  assert.equal(evaluate("A,1000,0,0", { ordinary: NaN, longTerm: 15 }).summary.as1256, 218);
  assert.equal(evaluate("A,1000,0,0", { ordinary: 32 }).summary.as1256, 218);
});

test("unicode minus and trailing minus are negatives", () => {
  assert.equal(parseRows("A,−1200,0,0").rows[0].aggregate, -1200);
  assert.equal(parseRows("A,1200-,0,0").rows[0].aggregate, -1200);
});

test("a net loss gets no negative tax figures, and the note names box D and the $3,000 limit", () => {
  const r = evaluate("A,-10000,0,0");
  assert.equal(r.summary.as1256, null);
  assert.equal(r.summary.saving, null);
  const n = r.notes.join(" ");
  assert.match(n, /box D/);
  assert.match(n, /\$3,000/);
  assert.doesNotMatch(n, /Part II/);
  assert.doesNotMatch(reportCsv(r), /null/);
});

test("a zero net result gets neither the loss note nor the saving note", () => {
  const n = evaluate("A,0,0,0").notes.join(" ");
  assert.doesNotMatch(n, /loss|saves/);
});

// Red-team 2026-11-12 (prompts/runs/2026-11-12-session_01AcxTtLTzXqEGdpixYVUsj4.json).
test("a minus after the currency sign or code is still a negative", () => {
  assert.equal(parseRows("A,$-1200,0,0").rows[0].aggregate, -1200);
  assert.equal(parseRows("A,USD -500,0,0").rows[0].aggregate, -500);
  assert.equal(parseRows('A,"-$1,200.00",0,0').rows[0].aggregate, -1200);
  assert.equal(parseRows('A,"($1,200.00)",0,0').rows[0].aggregate, -1200);
});

test("scientific notation from a spreadsheet export is read as the number it is", () => {
  assert.equal(parseRows("A,1.5E+04,0,0").rows[0].aggregate, 15000);
  assert.equal(parseRows("A,1e3,0,0").rows[0].aggregate, 1000);
});

test("an amount that is not one number is refused, not stitched together", () => {
  for (const bad of ["12-34", "1.2.3", "--500", "5 6"]) {
    const p = parseRows(`A,${bad},0,0\nB,100,0,0`);
    assert.equal(p.rows.length, 1, bad);
    assert.equal(p.rows[0].label, "B", bad);
  }
});

test("a row with only an account and box 8 is read, box 9 and 10 as zero", () => {
  const p = parseRows("A,1000");
  assert.equal(p.rows.length, 1);
  assert.equal(p.rows[0].aggregate, 1000);
});

test("when no row is readable the first row's reason is the error", () => {
  assert.match(parseRows("A,abc,0,0").error, /^Row 1 could not be read/);
  assert.match(evaluate("A,1,2,3,4,5").error, /has 6 fields/);
});

test("rates outside 0 to 100 are refused rather than giving a negative tax", () => {
  assert.match(evaluate("A,1000,0,0", { ordinary: -5, longTerm: 15 }).error, /between 0 and 100/);
  assert.match(evaluate("A,1000,0,0", { ordinary: 32, longTerm: 150 }).error, /between 0 and 100/);
  assert.equal(evaluate("A,1000,0,0", { ordinary: 0, longTerm: 0 }).summary.as1256, 0);
});

test("a long-term rate above the ordinary rate says 60/40 costs more, not 'saves about -$'", () => {
  const n = evaluate("A,1000,0,0", { ordinary: 10, longTerm: 15 }).notes.join(" ");
  assert.doesNotMatch(n, /saves about -/);
  assert.match(n, /costs about \$30\.00 more/);
  assert.match(n, /check the rates/);
});
