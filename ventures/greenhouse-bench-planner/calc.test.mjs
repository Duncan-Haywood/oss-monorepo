import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, parseCrops, parseDate, weekIndex, weekStart, planCsv, sowList, DEFAULT_CROPS, money } from "./calc.mjs";

const one = "Basil, 2027-05-22, 100, 1, 5, 2, 100, 3, 1, 0";

test("dates parse strictly and weeks start on Monday", () => {
  assert.equal(parseDate("2027-02-30"), null);
  assert.ok(parseDate("5/22/2027") === parseDate("2027-05-22"));
  assert.equal(weekStart(weekIndex(parseDate("2027-05-22"))), "2027-05-17");
});

test("a bad line is named and skipped, good lines survive", () => {
  const r = parseCrops(`${one}\nKale, soon, 10, 1, 4, 3\nCrop, date\n# note`);
  assert.equal(r.crops.length, 1);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /Kale/);
});

test("sow date counts back germination plus growing weeks from the sale date", () => {
  const r = analyze(one);
  assert.equal(r.rows[0].sow, "2027-04-10");
  assert.equal(r.rows[0].sold, 100);
  assert.equal(r.summary.short, 0);
});

test("survival raises the number sown but not the number sold", () => {
  const r = analyze("Basil, 2027-05-22, 90, 1, 5, 2, 90, 3, 1, 0");
  assert.equal(r.rows[0].sown, 100);
  assert.equal(r.rows[0].sold, 90);
});

test("bench space limits what is sold and the shortfall is reported", () => {
  const r = analyze(one, { benchSqft: 25 });
  assert.equal(r.rows[0].sold, 50);
  assert.equal(r.rows[0].short, 50);
  assert.ok(r.warnings.some((w) => /only 50 of 100/.test(w.text)));
});

test("germination space can be the limit instead of the bench", () => {
  const r = analyze(one, { germSqft: 1, germDensity: 20, benchSqft: 1000 });
  assert.equal(r.rows[0].sold, 20);
});

test("two orders that overlap share the bench; the better margin per square foot gets it", () => {
  const text = "Cheap, 2027-05-22, 100, 1, 5, 2, 100, 2, 1.5, 0\nRich, 2027-05-22, 100, 1, 5, 2, 100, 9, 1, 0";
  const r = analyze(text, { benchSqft: 50, germSqft: 100, maxHoldWeeks: 0 });
  const by = Object.fromEntries(r.rows.map((x) => [x.crop, x.sold]));
  assert.equal(by.Rich, 100);
  assert.equal(by.Cheap, 0);
});

test("flex weeks let an order slip later to find free space, and say so", () => {
  const text = "A, 2027-05-22, 100, 1, 5, 2, 100, 9, 1, 0\nB, 2027-05-22, 100, 1, 5, 2, 100, 5, 1, 5";
  const r = analyze(text, { benchSqft: 50, germSqft: 100, maxHoldWeeks: 0 });
  const b = r.rows.find((x) => x.crop === "B");
  assert.equal(b.sold, 100);
  assert.ok(b.late >= 1);
  assert.ok(b.sow > "2027-04-10");
  assert.ok(r.warnings.some((w) => /sale slips/.test(w.text)));
});

test("a sow date that has already passed is flagged with the earliest sale date", () => {
  const r = analyze(one, { today: "2027-04-20" });
  assert.ok(r.warnings.some((w) => w.level === "high" && /2027-06-01/.test(w.text)));
});

test("the space sweep never gets worse as space grows, and the unlimited need is reported", () => {
  const r = analyze(DEFAULT_CROPS);
  for (let i = 1; i < r.sweep.length; i++) assert.ok(r.sweep[i].margin >= r.sweep[i - 1].margin - 1e-9);
  assert.ok(r.summary.needBench > r.summary.benchSqft);
  assert.equal(r.sweep[r.sweep.length - 1].short, 0);
});

test("weekly occupancy never exceeds the entered capacity", () => {
  const r = analyze(DEFAULT_CROPS, { benchSqft: 300, germSqft: 15 });
  for (const w of r.weeks) { assert.ok(w.bench <= 300 + 1e-6); assert.ok(w.germ <= 15 + 1e-6); }
});

test("exports quote names and list sowing by date", () => {
  const r = analyze(`"Tomato, 4in", 2027-05-08, 10, 2, 6, 2, 90, 3, 1, 0`);
  assert.match(planCsv(r), /"Tomato, 4in"/);
  assert.match(sowList(r), /^Sow 2027-03-13/);
});

test("empty and invalid input report an error and no summary", () => {
  assert.equal(analyze("").summary, null);
  assert.equal(analyze("x, y").errors.length, 1);
  assert.equal(money(-1234.5), "-$1,234");
});
