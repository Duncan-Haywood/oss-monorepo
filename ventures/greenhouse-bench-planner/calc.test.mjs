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

test("hold and late weeks are capped at a year, so an extra zero cannot hang the page", async () => {
  const { MAX_SHIFT_WEEKS } = await import("./calc.mjs");
  const t0 = performance.now();
  const big = analyze(DEFAULT_CROPS, { maxHoldWeeks: 100000 });
  assert.ok(performance.now() - t0 < 3000);
  const capped = analyze(DEFAULT_CROPS, { maxHoldWeeks: MAX_SHIFT_WEEKS });
  assert.deepEqual(big.rows, capped.rows);
  assert.ok(big.warnings.some((w) => /capped at 52 weeks; you entered 100000/.test(w.text)));
  assert.ok(!capped.warnings.some((w) => /capped/.test(w.text)));
  const late = analyze(DEFAULT_CROPS.replace("92, 3.50, 1.10, 1", "92, 3.50, 1.10, 100000"));
  assert.ok(late.warnings.some((w) => /Tomato 4in: selling late is capped/.test(w.text)));
});

test("the worked example finds room for a crop the plain margin-order pass strands", () => {
  const r = analyze(DEFAULT_CROPS);
  // The margin-per-sq-ft order alone sold 1,534 units for $3,801.60 and grew no peppers, baskets or geraniums.
  // The best of all 5,040 booking orders, by brute force, is $4,548.10 and 1,723 units.
  assert.ok(Math.abs(r.summary.margin - 4548.1) < 0.01, `margin ${r.summary.margin}`);
  assert.equal(r.summary.planned, 1723);
  for (const name of ["Petunia hanging basket", "Geranium 6in"]) assert.equal(r.rows.find((x) => x.crop === name).short, 0);
  for (const w of r.weeks) { assert.ok(w.bench <= 400 + 1e-6); assert.ok(w.germ <= 30 + 1e-6); }
});

test("the search never does worse than the margin-order pass, and a long list stays quick", () => {
  const text = "Rich, 2027-05-22, 100, 1, 5, 2, 100, 9, 1, 0\nCheap, 2027-05-22, 100, 1, 5, 2, 100, 2, 1.5, 0";
  assert.equal(analyze(text, { benchSqft: 50, germSqft: 100 }).rows.find((x) => x.crop === "Rich").sold, 100);
  const lines = [];
  for (let i = 0; i < 40; i++) for (const l of DEFAULT_CROPS.split("\n").slice(1)) lines.push(l.replace(/^([^,]+)/, `$1 ${i}`));
  const t0 = performance.now();
  const r = analyze(lines.join("\n"), { maxHoldWeeks: 8 });
  assert.ok(performance.now() - t0 < 5000);
  assert.equal(r.rows.length, 280);
  for (const w of r.weeks) assert.ok(w.bench <= 400 + 1e-6);
});

// Red-team 2026-11-17: guards for mutants that escaped.
test("full margin is units times (price - cost)", () => {
  assert.equal(analyze(one).rows[0].fullMargin, 200);
  assert.equal(analyze("Basil, 2027-05-22, 100, 1, 5, 2, 100, 5, 1, 0").rows[0].fullMargin, 400);
});

test("a crop can take the bench in the week another crop is sold (bench weeks end before the sale week)", () => {
  // A is on the bench for the 5 weeks before 2027-05-22's week; B's 2 bench weeks start that week.
  const t = "A, 2027-05-22, 100, 1, 5, 2, 100, 3, 1, 0\nB, 2027-06-05, 100, 1, 2, 2, 100, 3, 1, 0";
  const r = analyze(t, { benchSqft: 50, germSqft: 100, maxHoldWeeks: 0 });
  for (const x of r.rows) assert.equal(x.sold, 100, x.crop);
});

test("the worked example's plan, row by row", () => {
  const rows = analyze(DEFAULT_CROPS).rows.map((x) => [x.crop, x.units, x.sold, x.sown, x.sow, Math.round(x.benchSqft * 1000) / 1000]);
  assert.deepEqual(rows, [
    ["Geranium 6in", 60, 60, 71, "2027-01-30", 60],
    ["Petunia hanging basket", 60, 60, 69, "2027-02-13", 75],
    ["Pepper 4in", 200, 63, 70, "2027-03-06", 28.636],
    ["Tomato 4in", 300, 300, 327, "2027-03-13", 136.364],
    ["Marigold 6-pack", 600, 600, 632, "2027-03-13", 100],
    ["Basil 4in", 250, 240, 267, "2027-04-17", 100],
    ["Zinnia 6-pack", 400, 400, 422, "2027-04-24", 66.667],
  ]);
});

test("a crop sold in a week leaves that week's bench free for the next one (found by fuzzing a <= mutant)", () => {
  const t = ["C0, 2027-05-01, 90, 2, 1, 2, 100, 5, 1, 0", "C1, 2027-05-15, 10, 1, 1, 2, 100, 5, 1, 1",
    "C2, 2027-05-22, 100, 1, 4, 2, 100, 6, 1, 1", "C3, 2027-05-04, 60, 1, 1, 2, 100, 4, 1, 0"].join("\n");
  const r = analyze(t, { benchSqft: 30, germSqft: 100, maxHoldWeeks: 0 });
  const by = Object.fromEntries(r.rows.map((x) => [x.crop, x.sold]));
  // Counting the sale week as occupied strands C3 and C1 (120 sold instead of 130).
  assert.deepEqual(by, { C0: 60, C3: 10, C2: 50, C1: 10 });
  for (const w of r.weeks) assert.ok(w.bench <= 30 + 1e-6);
});

// quality audit 2026-11-19 (portfolio/quality/audits/2026-11-19-greenhouse-bench-planner.json)
test("an unquoted thousands comma is rejected, not read as a 1-unit crop", () => {
  const r = analyze("Tomato, 2027-05-08, 1,200, 2, 6, 2.2, 92, 3.50, 1.10, 1");
  assert.equal(r.rows.length, 0);
  assert.match(r.errors[0], /too many columns/);
});

test("the germination-space limit counts survival losses", () => {
  // 1 sq ft at 20 cells/sq ft holds 20 seeds; at 90% survival that sells floor(20 * 0.9) = 18
  const r = analyze("Basil, 2027-05-22, 100, 1, 5, 2, 90, 3, 1, 0", { germSqft: 1, germDensity: 20, benchSqft: 1000 });
  assert.equal(r.rows[0].sold, 18);
  assert.ok(r.rows[0].sown <= 20);
});
