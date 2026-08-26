import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  countPosts,
  applyGatePosts,
  MATERIAL_PRESETS,
  DIG_PRESETS,
  SLOPE_PRESETS,
  WALK_GATE_WIDTH_FT,
  DRIVE_GATE_WIDTH_FT,
  presetById,
} from './calc.mjs';

const wood = () => presetById('wood-privacy-6');

const backyard = () => {
  const preset = wood();
  return {
    runs: [{
      name: 'Back yard',
      linearFeet: 140,
      postSpacingFt: preset.postSpacingFt,
      corners: 2,
      walkGates: 1,
      driveGates: 1,
      materialPerLf: preset.materialPerLf,
      linePostCost: preset.linePostCost,
      terminalPostCost: preset.terminalPostCost,
      walkGateCost: preset.walkGateCost,
      driveGateCost: preset.driveGateCost,
      concretePerPost: preset.concretePerPost,
      hoursPerLf: preset.hoursPerLf,
      hoursPerPost: preset.hoursPerPost,
      hoursPerWalkGate: preset.hoursPerWalkGate,
      hoursPerDriveGate: preset.hoursPerDriveGate,
    }],
    tearOutFeet: 40,
    hoursPerTearOutLf: preset.hoursPerTearOutLf,
    tearOutPerFoot: 4,
    dig: 'clay',
    slope: 'flat',
    hourlyWage: 25,
    burdenRate: 28,
    otherCost: 150,
    overheadRate: 15,
    targetMargin: 25,
  };
};

test('posts follow ceil(length / spacing) + 1, plus an extra terminal per corner', () => {
  assert.deepEqual(countPosts(16, 8, 0), { linePosts: 1, terminalPosts: 2, totalPosts: 3 });
  assert.deepEqual(countPosts(20, 8, 0), { linePosts: 2, terminalPosts: 2, totalPosts: 4 });
  assert.deepEqual(countPosts(8, 8, 0), { linePosts: 0, terminalPosts: 2, totalPosts: 2 });
  assert.deepEqual(countPosts(140, 8, 2), { linePosts: 17, terminalPosts: 4, totalPosts: 21 });
  assert.deepEqual(countPosts(0, 8, 2), { linePosts: 0, terminalPosts: 0, totalPosts: 0 });
});

test('gates upgrade line posts to terminals and add extras on a short run', () => {
  const long = applyGatePosts(countPosts(140, 8, 2), 1, 1);
  assert.equal(long.gatePosts, 4);
  assert.equal(long.totalPosts, 21);
  assert.equal(long.terminalPosts, 8);
  assert.equal(long.linePosts, 13);

  const short = applyGatePosts(countPosts(12, 8, 0), 1, 1);
  // 12 ft at 8 ft spacing is 3 posts, 2 already terminals, 1 line post to
  // upgrade, so 3 more terminals have to be added for four gate posts.
  assert.equal(short.gatePosts, 4);
  assert.equal(short.totalPosts, 6);
  assert.equal(short.terminalPosts, 6);
  assert.equal(short.linePosts, 0);
});

test('infill subtracts the gate openings so a gated run is not billed as solid fence', () => {
  const result = calculateBid(backyard());
  assert.equal(result.runs[0].infillFeet, 140 - WALK_GATE_WIDTH_FT - DRIVE_GATE_WIDTH_FT);
  assert.equal(result.totalInfillFeet, 124);
  assert.equal(result.totalLinearFeet, 140);
});

test('posts, gates, and tear-out are a large share of material, not just the panels', () => {
  const result = calculateBid(backyard());
  const run = result.runs[0];
  const hardware = run.gateMaterial + run.postMaterial + run.concreteCost;
  assert.ok(hardware / run.materialCost > 0.4, `hardware is only ${(hardware / run.materialCost * 100).toFixed(1)}% of run material`);
  assert.ok(result.postsAndGatesShare > 45, `posts/gates/tear-out are only ${result.postsAndGatesShare.toFixed(1)}% of material`);
});

test('price stacks burden, overhead, then margin as a share of price', () => {
  const result = calculateBid(backyard());
  assert.equal(result.loadedWage, 25 * 1.28);
  assert.equal(result.digMultiplier, 1.3);
  assert.equal(result.slopeMultiplier, 1);

  const direct = result.laborCost + result.materialCost + 150;
  assert.ok(Math.abs(result.overhead - direct * 0.15) < 1e-9);
  assert.ok(Math.abs(result.totalCost - direct * 1.15) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 25) < 1e-9);
});

test('clay and slope multiply labor hours, not material', () => {
  const clay = calculateBid(backyard());
  const easy = calculateBid({ ...backyard(), dig: 'normal' });
  const steep = calculateBid({ ...backyard(), slope: 'steep' });
  assert.ok(Math.abs(clay.laborHours / easy.laborHours - 1.3) < 1e-9);
  assert.ok(Math.abs(steep.laborHours / clay.laborHours - 1.4) < 1e-9);
  assert.ok(Math.abs(clay.materialCost - easy.materialCost) < 1e-9);
  assert.ok(Math.abs(steep.materialCost - clay.materialCost) < 1e-9);
});

test('sanity ratios land in the range a contractor recognises', () => {
  const result = calculateBid(backyard());
  assert.ok(result.pricePerLf > 40 && result.pricePerLf < 80, `got ${result.pricePerLf}`);
  assert.ok(result.effectiveHourlyRate > 90 && result.effectiveHourlyRate < 200, `got ${result.effectiveHourlyRate}`);
  assert.equal(result.breakEvenPrice, result.totalCost);
  assert.ok(result.laborHours > 40 && result.laborHours < 80);
});

test('a zero-margin bid prices at cost', () => {
  const result = calculateBid({ ...backyard(), targetMargin: 0 });
  assert.ok(Math.abs(result.price - result.totalCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
});

test('a proposed price is scored against the same cost base', () => {
  const bid = calculateBid(backyard());
  const scored = calculateBid({ ...backyard(), proposedPrice: bid.price });
  assert.ok(Math.abs(scored.proposed.margin - 25) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.hourlyRate - bid.effectiveHourlyRate) < 1e-9);
  assert.ok(Math.abs(scored.proposed.perLf - bid.pricePerLf) < 1e-9);
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const bid = calculateBid(backyard());
  const scored = calculateBid({ ...backyard(), proposedPrice: bid.totalCost - 200 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
  assert.ok(scored.proposed.margin < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(backyard()).proposed, null);
  assert.equal(calculateBid({ ...backyard(), proposedPrice: '' }).proposed, null);
  assert.equal(calculateBid({ ...backyard(), proposedPrice: null }).proposed, null);
  assert.equal(calculateBid({ ...backyard(), proposedPrice: 0 }).proposed.price, 0);
});

test('a nameless run still reports under a stable label', () => {
  const input = backyard();
  input.runs = [
    { ...input.runs[0], name: '' },
    { ...input.runs[0], name: '   ', linearFeet: 40, walkGates: 0, driveGates: 0, corners: 0 },
  ];
  const result = calculateBid(input);
  assert.equal(result.runs[0].name, 'Run 1');
  assert.equal(result.runs[1].name, 'Run 2');
  assert.equal(result.totalLinearFeet, 180);
});

test('a run with no length reports no per-foot ratio instead of dividing by zero', () => {
  const input = backyard();
  input.runs = [{ ...input.runs[0], linearFeet: 0, walkGates: 0, driveGates: 0, corners: 0 }];
  input.tearOutFeet = 0;
  input.otherCost = 100;
  const result = calculateBid(input);
  assert.equal(result.laborHours, 0);
  assert.equal(result.pricePerLf, null);
  assert.equal(result.effectiveHourlyRate, null);
  assert.equal(result.runs[0].hoursShare, 0);
  assert.ok(result.price > 100);
});

test('tear-out adds hours and haul cost without inventing fence', () => {
  const withTear = calculateBid(backyard());
  const without = calculateBid({ ...backyard(), tearOutFeet: 0 });
  assert.ok(withTear.laborHours > without.laborHours);
  assert.ok(Math.abs(withTear.tearOutCost - 160) < 1e-9);
  assert.equal(withTear.totalLinearFeet, without.totalLinearFeet);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...backyard(), runs: [] }), /at least one fence run/);
  assert.throws(
    () => calculateBid({
      ...backyard(),
      runs: [{ ...backyard().runs[0], postSpacingFt: 0 }],
    }),
    /post spacing must be greater than zero/,
  );
  assert.throws(
    () => calculateBid({
      ...backyard(),
      runs: [{ ...backyard().runs[0], linearFeet: 10, walkGates: 1, driveGates: 1 }],
    }),
    /gates are wider than the run/,
  );
  assert.throws(() => calculateBid({ ...backyard(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...backyard(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...backyard(), overheadRate: -1 }), /Overhead must be at least 0/);
  assert.throws(() => calculateBid({ ...backyard(), dig: 'sand' }), /Dig condition/);
  assert.throws(
    () => calculateBid({
      ...backyard(),
      runs: [{ ...backyard().runs[0], corners: 1.5 }],
    }),
    /corners must be a whole number/,
  );
});

test('material presets are usable positive numbers', () => {
  assert.ok(MATERIAL_PRESETS.length >= 5);
  for (const preset of MATERIAL_PRESETS) {
    assert.ok(preset.label.length > 0);
    assert.ok(preset.id.length > 0);
    assert.ok(Number.isFinite(preset.materialPerLf) && preset.materialPerLf > 0);
    assert.ok(Number.isFinite(preset.postSpacingFt) && preset.postSpacingFt > 0);
    assert.ok(Number.isFinite(preset.hoursPerLf) && preset.hoursPerLf > 0);
  }
  assert.ok(DIG_PRESETS.every(p => p.laborMultiplier >= 1));
  assert.ok(SLOPE_PRESETS.every(p => p.laborMultiplier >= 1));
});

test('a flat per-foot quote on this backyard is the losing bid the tool exists to catch', () => {
  const bid = calculateBid(backyard());
  // $35/ft is a number contractors still hear on Facebook. On a gated
  // privacy run with tear-out it is under water.
  const naive = calculateBid({ ...backyard(), proposedPrice: 140 * 35 });
  assert.ok(bid.price > 140 * 35);
  assert.equal(naive.proposed.belowBreakEven, true);
});
