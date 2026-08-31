import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  formatBidSummary,
  STORY_PRESETS,
  PITCH_PRESETS,
  GUARD_PRESETS,
  DEBRIS_PRESETS,
} from './calc.mjs';

const house = () => ({
  runs: [
    { name: 'Front and sides', linearFeet: 80, story: '1', pitch: 'low', guards: 'none', debris: 'leaves', downspouts: 3 },
    { name: 'Rear two-story', linearFeet: 40, story: '2', pitch: 'moderate', guards: 'none', debris: 'leaves', downspouts: 1 },
    { name: 'Garage screens', linearFeet: 30, story: '1', pitch: 'low', guards: 'screens', debris: 'mixed', downspouts: 1 },
  ],
  hourlyWage: 22,
  burdenRate: 30,
  minutesPer10ft: 8,
  minutesPerDownspout: 8,
  travelMinutes: 20,
  disposalPerVisit: 15,
  equipmentPerVisit: 10,
  overheadRate: 15,
  targetMargin: 25,
  visitsPerYear: 2,
  minimumCharge: 125,
});

test('a two-story run takes more than its share of the linear footage', () => {
  const result = calculateBid(house());
  const rear = result.runs.find(run => run.name === 'Rear two-story');
  const front = result.runs.find(run => run.name === 'Front and sides');
  const footageShare = rear.linearFeet / result.totalLinearFeet * 100;
  assert.ok(footageShare < 30, `rear is ${footageShare.toFixed(1)}% of the footage`);
  assert.ok(rear.laborHours > front.laborHours * 40 / 80, 'rear hours beat a flat per-foot split');
  assert.equal(result.totalLinearFeet, 150);
  assert.equal(result.totalDownspouts, 5);
});

test('micro-mesh and pine needles more than double open-leaf time on the same run', () => {
  const open = calculateBid({
    ...house(),
    runs: [{ name: 'Same run', linearFeet: 100, story: '1', pitch: 'low', guards: 'none', debris: 'leaves', downspouts: 0 }],
    travelMinutes: 0,
  });
  const hard = calculateBid({
    ...house(),
    runs: [{ name: 'Same run', linearFeet: 100, story: '1', pitch: 'low', guards: 'mesh', debris: 'needles', downspouts: 0 }],
    travelMinutes: 0,
  });
  assert.ok(Math.abs(hard.gutterHours / open.gutterHours - 2.2 * 1.6) < 1e-9);
});

test('price stacks burden, disposal, overhead, then margin as a share of price', () => {
  const result = calculateBid({ ...house(), minimumCharge: 0 });
  assert.equal(result.loadedWage, 22 * 1.3);

  const direct = result.laborCost + 15 + 10;
  assert.ok(Math.abs(result.overhead - direct * 0.15) < 1e-9);
  assert.ok(Math.abs(result.visitCost - direct * 1.15) < 1e-9);
  assert.ok(Math.abs(result.visitProfit / result.visitPrice * 100 - 25) < 1e-9);
  assert.ok(Math.abs(result.annualPrice - result.visitPrice * 2) < 1e-9);
  assert.equal(result.minimumApplied, false);
});

test('a minimum charge lifts a small-ranch bid without changing walk-away cost', () => {
  const tiny = calculateBid({
    ...house(),
    runs: [{ name: 'Ranch', linearFeet: 20, story: '1', pitch: 'low', guards: 'none', debris: 'leaves', downspouts: 1 }],
    travelMinutes: 10,
    disposalPerVisit: 0,
    equipmentPerVisit: 0,
    minimumCharge: 150,
  });
  assert.equal(tiny.minimumApplied, true);
  assert.equal(tiny.visitPrice, 150);
  assert.ok(tiny.rawVisitPrice < 150);
  assert.equal(tiny.breakEvenVisitPrice, tiny.visitCost);
  assert.ok(tiny.visitProfit > 0);
});

test('a zero-margin bid prices at cost when the minimum does not bind', () => {
  const result = calculateBid({ ...house(), targetMargin: 0, minimumCharge: 0 });
  assert.ok(Math.abs(result.visitPrice - result.visitCost) < 1e-9);
  assert.ok(Math.abs(result.visitProfit) < 1e-9);
});

test('a proposed price is scored against the same cost base', () => {
  const bid = calculateBid({ ...house(), minimumCharge: 0 });
  const scored = calculateBid({ ...house(), minimumCharge: 0, proposedPrice: bid.visitPrice });
  assert.ok(Math.abs(scored.proposed.margin - 25) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.hourlyRate - bid.effectiveHourlyRate) < 1e-9);
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const bid = calculateBid(house());
  const scored = calculateBid({ ...house(), proposedPrice: bid.visitCost - 20 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(house()).proposed, null);
  assert.equal(calculateBid({ ...house(), proposedPrice: '' }).proposed, null);
  assert.equal(calculateBid({ ...house(), proposedPrice: 0 }).proposed.price, 0);
});

test('travel is charged once per visit, not per run', () => {
  const one = calculateBid({
    ...house(),
    runs: [{ name: 'Only', linearFeet: 50, story: '1', pitch: 'low', guards: 'none', debris: 'leaves', downspouts: 0 }],
    travelMinutes: 30,
  });
  const two = calculateBid({
    ...house(),
    runs: [
      { name: 'A', linearFeet: 25, story: '1', pitch: 'low', guards: 'none', debris: 'leaves', downspouts: 0 },
      { name: 'B', linearFeet: 25, story: '1', pitch: 'low', guards: 'none', debris: 'leaves', downspouts: 0 },
    ],
    travelMinutes: 30,
  });
  assert.ok(Math.abs(one.travelHours - 0.5) < 1e-9);
  assert.ok(Math.abs(two.travelHours - 0.5) < 1e-9);
  assert.ok(Math.abs(one.gutterHours - two.gutterHours) < 1e-9);
});

test('a nameless run still reports under a stable label', () => {
  const result = calculateBid({
    ...house(),
    runs: [
      { linearFeet: 10, story: '1', pitch: 'low', guards: 'none', debris: 'leaves', downspouts: 0 },
      { name: '   ', linearFeet: 10, story: '1', pitch: 'low', guards: 'none', debris: 'leaves', downspouts: 0 },
    ],
  });
  assert.equal(result.runs[0].name, 'Run 1');
  assert.equal(result.runs[1].name, 'Run 2');
});

test('a house with no linear footage still prices travel and disposal', () => {
  const result = calculateBid({
    ...house(),
    runs: [{ name: 'Empty', linearFeet: 0, story: '1', pitch: 'low', guards: 'none', debris: 'leaves', downspouts: 0 }],
    travelMinutes: 20,
    disposalPerVisit: 15,
    equipmentPerVisit: 0,
    minimumCharge: 0,
  });
  assert.equal(result.gutterHours, 0);
  assert.equal(result.pricePerLinearFoot, null);
  assert.ok(result.hoursPerVisit > 0);
  assert.ok(result.visitPrice > 0);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...house(), runs: [] }), /at least one gutter run/);
  assert.throws(
    () => calculateBid({ ...house(), minutesPer10ft: 0 }),
    /Minutes per 10 linear feet must be greater than zero/,
  );
  assert.throws(
    () => calculateBid({ ...house(), runs: [{ name: 'Front', linearFeet: -5, story: '1', pitch: 'low', guards: 'none', debris: 'leaves', downspouts: 0 }] }),
    /Front: linear feet must be at least 0/,
  );
  assert.throws(
    () => calculateBid({ ...house(), runs: [{ name: 'Front', linearFeet: 10, story: 'attic', pitch: 'low', guards: 'none', debris: 'leaves', downspouts: 0 }] }),
    /Front: stories must be one of/,
  );
  assert.throws(() => calculateBid({ ...house(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...house(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...house(), visitsPerYear: 0 }), /Visits per year must be at least 1/);
});

test('presets are usable positive factors', () => {
  for (const group of [STORY_PRESETS, PITCH_PRESETS, GUARD_PRESETS, DEBRIS_PRESETS]) {
    assert.ok(group.length >= 3);
    for (const preset of group) {
      assert.ok(preset.label.length > 0);
      assert.ok(Number.isFinite(preset.factor) && preset.factor > 0);
    }
  }
  assert.equal(STORY_PRESETS.find(p => p.id === '1').factor, 1);
  assert.ok(STORY_PRESETS.find(p => p.id === '2').factor > 1.5);
});

test('the copied summary names the visit price and the runs, not the wage', () => {
  const text = formatBidSummary(calculateBid(house()));
  assert.match(text, /GUTTER CLEANING BID/);
  assert.match(text, /Proposed visit price/);
  assert.match(text, /Front and sides/);
  assert.match(text, /Seasonal contract \(2 visits\/year\)/);
  assert.doesNotMatch(text, /22/);
  assert.doesNotMatch(text, /burden/i);
});
