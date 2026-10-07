import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, perBlock, parseInputs, weeksCsv, money, DEFAULTS } from "./calc.mjs";

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
const base = (o = {}) => parseInputs({ ...DEFAULTS, ...o }).p;

test("one flush: hand-checked per-block profit", () => {
  // 1.4 lb, 95% sold at $9-0.40, harvest 3 min/lb at $18/h, start cost 3.2+10min*18/60=6.2, 92% survive
  const b = perBlock(base(), 1);
  near(b.yieldLb, 1.4);
  near(b.revenue, 1.4 * 0.95 * 8.6);
  near(b.harvestLabor, 1.4 * 3 / 60 * 18);
  near(b.startCost, 6.2);
  near(b.profit, 0.92 * (b.revenue - b.harvestLabor) - 6.2);
  assert.equal(b.slotWeeks, 2 + 0 + 1);
});

test("slot-weeks grow by the gap for each extra flush", () => {
  const p = base();
  assert.equal(perBlock(p, 3).slotWeeks, 2 + 2 * 2 + 1);
});

test("more contamination never raises profit", () => {
  let last = Infinity;
  for (const c of [0, 5, 10, 20, 40]) {
    const pr = perBlock(base({ contaminationPct: c }), 2).profit;
    assert.ok(pr <= last);
    last = pr;
  }
});

test("room capacity: max starts fills but does not exceed slots", () => {
  const r = analyze({ startsPerWeek: 10 });
  const n = r.summary.flushes;
  const b = perBlock(base(), n);
  assert.ok(r.summary.maxStarts * b.survive * b.slotWeeks <= 200 + 1e-9);
  assert.ok((r.summary.maxStarts + 1) * b.survive * b.slotWeeks > 200);
});

test("overfilled room is flagged and uses the best flush count per slot-week", () => {
  const r = analyze({ startsPerWeek: 80 });
  assert.ok(r.warnings.some((w) => w.level === "high" && /fruiting slots/.test(w.text)));
  assert.equal(r.summary.flushes, r.bestPerSlot);
});

test("a spare room runs the flush count that earns most per block", () => {
  const r = analyze({ startsPerWeek: 5 });
  assert.equal(r.summary.flushes, r.bestPerBlock);
});

test("break-even contamination really gives zero profit", () => {
  const r = analyze({});
  const b = perBlock(base({ contaminationPct: r.summary.breakEvenContam }), r.summary.flushes);
  near(b.profit, 0, 1e-6);
});

test("break-even price really gives zero profit", () => {
  const r = analyze({});
  const b = perBlock(base({ pricePerLb: r.summary.breakEvenPrice }), r.summary.flushes);
  near(b.profit, 0, 1e-6);
});

test("no sales before incubation plus first flush; cash dips then recovers", () => {
  const r = analyze({});
  assert.equal(r.summary.firstSale, 2 + 2);
  assert.ok(r.summary.lowCash < 0);
  assert.ok(r.summary.payback > r.summary.lowWeek);
});

test("buying ready-to-fruit blocks (no incubation, no contamination) sells sooner", () => {
  const r = analyze({ incubationWeeks: 0, contaminationPct: 0 });
  assert.equal(r.summary.firstSale, 2);
});

test("total harvest matches blocks started that finish inside the horizon", () => {
  const r = analyze({ startsPerWeek: 10, weeks: 40, flushYields: "1", firstFlushWeeks: 2, incubationWeeks: 2, contaminationPct: 0 });
  // a block started in week t is harvested in week t+4, so starts in weeks 1..37 finish inside 40 weeks
  near(r.summary.totalLb, 10 * 37);
});

test("bad input is reported, not computed", () => {
  const r = analyze({ pricePerLb: "abc", flushYields: "1, x" });
  assert.equal(r.summary, null);
  assert.equal(r.errors.length, 2);
  assert.equal(analyze({ slots: 0 }).summary, null);
  assert.equal(analyze({ contaminationPct: 100 }).summary, null);
});

test("a losing setup says so and gives no break-even starts", () => {
  const r = analyze({ pricePerLb: 2 });
  assert.ok(r.summary.profitPerBlock < 0);
  assert.equal(r.summary.breakEvenStarts, null);
  assert.ok(r.warnings.some((w) => /loses/.test(w.text)));
});

test("sensitivity centre cell equals the plan's weekly profit", () => {
  const r = analyze({});
  near(r.sens[1].cells[2].weekly, r.summary.weeklyProfit);
});

test("csv has a header and one line per week", () => {
  const r = analyze({ weeks: 10 });
  const lines = weeksCsv(r).trim().split("\n");
  assert.equal(lines.length, 11);
  assert.match(lines[0], /^week,blocks_started/);
});

test("money formats negatives", () => {
  assert.equal(money(-1241.4), "-$1,241");
});
