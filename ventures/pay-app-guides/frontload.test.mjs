import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, apportion, withinTolerance, cashCurve, sovCsv, reportCsv, summaryText, sampleSov, SAMPLE_SETTINGS } from "./frontload.mjs";
import * as calc from "./calc.mjs";
import { parseCsv } from "./colog.mjs";

const sov = (...rows) => ["Item,Description,Scheduled value,Cost", ...rows].join("\n");
const sum = (xs) => xs.reduce((a, x) => a + x, 0);

test("apportion: sums exactly, respects the rounding unit, proportional to weight", () => {
  assert.deepEqual(apportion(1000, [1, 1, 1]), [334, 333, 333]);
  const d = apportion(1_234_567, [3, 5, 2], 100);
  assert.equal(sum(d), 1_234_567);
  assert.equal(d.filter((x) => x % 100 !== 0).length, 1); // the odd 67 cents land on one line
  assert.deepEqual(apportion(600, [0, 0]), [600, 0]);
});

test("a balanced SOV (same markup on every line) has no findings above note level", () => {
  const r = compute(sov("1,Mobilization,11500,10000", "2,Rough-in,57500,50000", "3,Trim,34500,30000", "4,Punch list,11500,10000"));
  assert.deepEqual(r.errors, []);
  assert.equal(r.totals.markup.toFixed(4), "0.1500");
  assert.equal(r.totals.flagged, 0);
  assert.equal(r.totals.pulledForward, 0);
  assert.deepEqual(r.findings.map((f) => f.severity), ["info"]);
  for (const x of r.lines) { assert.equal(x.balanced, x.value); assert.equal(x.fitted, x.value); }
});

test("hand example: mobilization loaded at the expense of punch list", () => {
  // Cost 10,000 + 50,000 + 30,000 + 10,000 = 100,000; value 115,000, markup 15%.
  // Mobilization billed 21,500 (balanced 11,500): +10,000. Punch list 1,500 (balanced 11,500): -10,000.
  const r = compute(sov("1,Mobilization,21500,10000", "2,Rough-in,57500,50000", "3,Trim,34500,30000", "4,Punch list,1500,10000"));
  const [mob, , , punch] = r.lines;
  assert.equal(mob.balanced, 1_150_000);
  assert.equal(mob.loading, 1_000_000);
  assert.equal(punch.loading, -1_000_000);
  assert.ok(mob.early && !mob.late);
  assert.ok(punch.late && !punch.early);
  assert.equal(r.totals.pulledForward, 1_000_000);
  assert.equal(r.totals.starved, 1_000_000);
  assert.equal(r.totals.flagged, 2);
  assert.ok(r.findings.some((f) => f.severity === "high" && /priced below cost/.test(f.title) && /Punch list/.test(f.title)));
  assert.ok(r.findings.some((f) => f.severity === "high" && /\$10,000\.00 of value sits on early lines/.test(f.title)));
});

test("within tolerance: every line ends inside the band, the total is kept, and an in-band line moves least", () => {
  const values = [3_800_000, 2_200_000, 6_400_000, 14_800_000, 400_000];
  const costs = [1_400_000, 600_000, 5_200_000, 12_800_000, 1_200_000];
  const x = withinTolerance(values, costs, 0.1);
  const M = sum(values) / sum(costs) - 1;
  assert.ok(Math.abs(sum(x) - sum(values)) < 1);
  x.forEach((v, i) => { const m = v / costs[i] - 1; assert.ok(m >= M - 0.1 - 1e-9 && m <= M + 0.1 + 1e-9, `line ${i}: ${m}`); });
  // Already-balanced values do not move.
  const flat = withinTolerance([1150, 5750], [1000, 5000], 0.1);
  assert.ok(Math.abs(flat[0] - 1150) < 1e-6 && Math.abs(flat[1] - 5750) < 1e-6);
});

test("sample: totals, rounding to dollars, and the fitted SOV sums to the contract inside the band", () => {
  const r = compute(sampleSov(), SAMPLE_SETTINGS);
  assert.deepEqual(r.errors, []);
  assert.equal(r.totals.value, 58_000_000);
  assert.equal(r.totals.cost, 49_900_000);
  assert.equal(sum(r.lines.map((x) => x.balanced)), r.totals.value);
  assert.equal(sum(r.lines.map((x) => x.fitted)), r.totals.value);
  for (const x of r.lines) { assert.equal(x.balanced % 100, 0); assert.equal(x.fitted % 100, 0); }
  for (const x of r.lines) assert.ok(Math.abs(x.fitted / x.cost - 1 - r.totals.markup) <= 0.1 + 0.001, x.label);
  assert.ok(r.lines[0].early && r.lines[9].late);
  assert.ok(r.months && r.months.rows.length === 10);
});

test("cash curve: billing ends at the contract, cost at total cost; front-loading raises the low point", () => {
  const r = compute(sampleSov(), SAMPLE_SETTINGS);
  const m = r.months, end = m.rows.at(-1);
  assert.equal(end.billed, r.totals.value);
  assert.equal(end.balanced, r.totals.value);
  assert.equal(end.cost, r.totals.cost);
  assert.equal(end.over, 0);
  assert.ok(m.peakOver > 0);
  assert.ok(m.lowestCash >= m.lowestCashBalanced);
  // A line over two months bills half each month.
  const c = cashCurve([{ start: 1, finish: 2, value: 1001, balanced: 1001, cost: 801 }], 2, 0, 0);
  assert.deepEqual(c.rows.map((x) => x.billed), [501, 1001]);
});

test("the balanced SOV reads in the calculator with the right contract sum", () => {
  const r = compute(sampleSov(), SAMPLE_SETTINGS);
  const grid = parseCsv(sovCsv(r));
  const lines = grid.slice(1).map((g) => ({ item: g[0], description: g[1], scheduled: g[2], previous: g[3], thisPeriod: g[4], stored: g[5] }));
  const c = calc.compute(lines, { workRetainage: "10" });
  assert.equal(c.totals.contractSumToDate, r.totals.value);
  assert.equal(c.rows.length, r.lines.length);
  assert.deepEqual(c.findings.filter((f) => f.level === "high"), []);
});

test("errors: missing columns, bad money, bad months, no cost", () => {
  assert.match(compute("Item,Description,Cost\n1,a,100").errors[0], /scheduled value/);
  assert.match(compute("Item,Description,Scheduled value\n1,a,100").errors[0], /cost column/);
  assert.match(compute(sov("1,a,abc,100")).errors[0], /not a dollar figure/);
  assert.match(compute(sov("1,a,100,0")).errors[0], /adds up to zero/);
  assert.match(compute("Item,Description,Scheduled value,Cost,Start,Finish\n1,a,100,90,3,2").errors[0], /finish not before start/);
  assert.match(compute(sov("1,a,100,90"), { tolerance: "x" }).errors[0], /Tolerance/);
});

test("a value with no cost is flagged; a mobilization over the contract's cap is flagged", () => {
  const r = compute(sov("1,Mobilization,20000,5000", "2,Bond,3000,0", "3,Work,100000,95000"), { mobilizationCap: "10" });
  assert.ok(r.findings.some((f) => /no cost against it/.test(f.title)));
  assert.ok(r.findings.some((f) => /over the 10% cap you entered/.test(f.title)));
});

test("CSV output neutralises formula cells and the summary names the low cash points", () => {
  const r = compute(sov("1,=HYPERLINK(1),11500,10000", "2,Work,57500,50000"));
  assert.match(sovCsv(r), /'=HYPERLINK/);
  assert.match(reportCsv(r), /'=HYPERLINK/);
  const s = compute(sampleSov(), SAMPLE_SETTINGS);
  assert.match(summaryText(s), /Lowest job cash, balanced/);
});

// Red-team 2026-11-25: the within-tolerance SOV is offered as the fix, so re-checking it must pass.
// It used to sit exactly on the band edge and rounding pushed 3 or 4 sample lines just outside it.
test("the within-tolerance SOV passes its own check at every rounding unit", () => {
  for (const round of ["cent", "dollar", "hundred"]) {
    const s = { ...SAMPLE_SETTINGS, round };
    const r = compute(sampleSov(), s);
    const again = compute(sov(...r.lines.map((x) => `${x.item},"${x.desc}",${(x.fitted / 100).toFixed(2)},${(x.cost / 100).toFixed(2)}`)), s);
    assert.deepEqual(again.errors, []);
    assert.equal(again.totals.value, r.totals.value, round);
    assert.deepEqual(again.lines.filter((x) => x.flag).map((x) => x.label), [], round);
    assert.ok(r.lines.every((x) => x.fitted >= 0), round);
  }
});

test("apportion: the leftover units go to the largest remainders, one each", () => {
  assert.deepEqual(apportion(100, [3, 2, 1]), [50, 33, 17]); // remainders 0, .33, .67: the last line takes the cent
  assert.deepEqual(apportion(200, [1, 1, 1]), [67, 67, 66]); // two leftover cents go to the first two (ties by order)
});

test("a wide tolerance never fits a line below zero", () => {
  const x = withinTolerance([40000, 0, 6000], [10000, 10000, 10000], 1.6);
  assert.ok(x.every((v) => v >= 0), String(x));
  const r = compute(sov("1,Mobilization,400,100", "2,Rough-in,0,100", "3,Punch list,60,100"), { tolerance: "160", round: "cent" });
  assert.ok(r.lines.every((v) => v.fitted >= 0));
});

test("early and late: a middle line is neither; a closeout line listed first is still late", () => {
  const r = compute(sov("1,Mobilization,11500,10000", "2,Rough-in,57500,50000", "3,Trim,34500,30000", "4,Punch list,11500,10000"));
  assert.ok(!r.lines[2].early && !r.lines[2].late, "Trim");
  const c = compute(sov("1,Punch list,11500,10000", "2,Mobilization,57500,50000", "3,Trim,34500,30000"));
  assert.ok(c.lines[0].late && !c.lines[0].early);
});

test("retainage defaults to 10% in the cash view", () => {
  const blank = compute(sampleSov(), { ...SAMPLE_SETTINGS, retainage: "" });
  const ten = compute(sampleSov(), { ...SAMPLE_SETTINGS, retainage: "10" });
  assert.deepEqual(blank.months, ten.months);
});

test("a line exactly on the tolerance edge is inside it", () => {
  // Cost 10,000 + 10,000, value 23,000: job markup 15%. 12,500 is 25% (10 points over), 10,500 is 5%.
  const r = compute(sov("1,Rough-in,12500,10000", "2,Trim,10500,10000"));
  assert.equal(r.totals.flagged, 0);
});

test("property: on random schedules the within-tolerance SOV sums to the contract, is never negative, and re-checks clean", () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const UNIT = { cent: 1, dollar: 100, hundred: 10000 };
  for (let t = 0; t < 300; t++) {
    const rows = [];
    for (let i = 0, n = 2 + Math.floor(rnd() * 10); i < n; i++) {
      const c = rnd() < 0.05 ? 0 : Math.round(rnd() * 2e7) + 50;
      rows.push(`${i + 1},Line ${i + 1},${(Math.round(c * (0.3 + rnd() * 2.5)) / 100).toFixed(2)},${(c / 100).toFixed(2)}`);
    }
    const s = { tolerance: String([0, 1, 5, 10, 25, 200][Math.floor(rnd() * 6)]), round: ["cent", "dollar", "hundred"][Math.floor(rnd() * 3)] };
    const r = compute(sov(...rows), s);
    if (r.errors.length) continue;
    assert.equal(sum(r.lines.map((x) => x.fitted)), r.totals.value);
    assert.ok(r.lines.every((x) => x.fitted >= 0));
    const again = compute(sov(...r.lines.map((x) => `${x.item},${x.desc},${(x.fitted / 100).toFixed(2)},${(x.cost / 100).toFixed(2)}`)), s);
    const u = UNIT[s.round], M = again.totals.markup, tol = Number(s.tolerance) / 100;
    // A line whose band holds no whole rounding unit cannot be fitted; every other line must be inside.
    const fittable = (x) => x.cost > 0 && Math.floor((x.cost * (1 + M + tol)) / u) >= Math.ceil((x.cost * (1 + Math.max(M - tol, -1))) / u);
    assert.deepEqual(again.lines.filter((x) => x.flag && fittable(x)).map((x) => x.label), [], JSON.stringify({ t, s }));
  }
});
