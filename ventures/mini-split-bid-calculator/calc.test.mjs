import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  formatBidSummary,
  HEAD_TYPE_PRESETS,
  STORY_PRESETS,
  ELECTRICAL_PRESETS,
  CONDENSATE_PRESETS,
  SYSTEM_PRESETS,
} from './calc.mjs';

const easyTwelveK = () => ({
  headCount: 1,
  btuPerHead: 12000,
  outdoorUnitCost: 1400,
  indoorHeadCostEach: 550,
  branchBoxCost: 0,
  lineSetFeet: 15,
  includedFeetPerHead: 15,
  lineSetMaterialPerExtraFoot: 12,
  hoursPerExtraTenFeet: 1,
  headTypeFactor: 1.0,
  storyFactor: 1.0,
  indoorHoursPerHead: 4,
  outdoorHours: 3,
  commissionHoursPerHead: 1,
  hourlyWage: 42,
  burdenRate: 30,
  electricalHours: 0,
  electricalMaterial: 0,
  condensateHours: 0,
  condensateMaterial: 0,
  permitFee: 175,
  travelAndLift: 85,
  overheadRate: 15,
  targetMargin: 22,
});

test('capacity is head count times BTU, not a rounded ton', () => {
  const result = calculateBid(easyTwelveK());
  assert.equal(result.totalBtu, 12000);
  const dual = calculateBid({ ...easyTwelveK(), headCount: 2, btuPerHead: 15000 });
  assert.equal(dual.totalBtu, 30000);
});

test('indoor labor scales with heads, then head type, then story', () => {
  const easy = calculateBid(easyTwelveK());
  const cassette = calculateBid({ ...easyTwelveK(), headTypeFactor: 1.35 });
  const upstairs = calculateBid({ ...easyTwelveK(), headTypeFactor: 1.35, storyFactor: 1.2 });
  assert.ok(Math.abs(easy.indoorHours - 4) < 1e-9);
  assert.ok(Math.abs(cassette.indoorHours - 4 * 1.35) < 1e-9);
  assert.ok(Math.abs(upstairs.indoorHours - 4 * 1.35 * 1.2) < 1e-9);
  assert.equal(easy.outdoorHours, cassette.outdoorHours);
  assert.equal(easy.outdoorHours, upstairs.outdoorHours);
  assert.ok(upstairs.price > cassette.price);
  assert.ok(cassette.price > easy.price);
});

test('line-set extras only start after the included feet per head', () => {
  const included = calculateBid(easyTwelveK());
  assert.equal(included.extraLineSetFeet, 0);
  assert.equal(included.lineSetHours, 0);
  assert.equal(included.lineSetMaterial, 0);

  const long = calculateBid({ ...easyTwelveK(), lineSetFeet: 35 });
  assert.equal(long.extraLineSetFeet, 20);
  assert.ok(Math.abs(long.lineSetHours - 2) < 1e-9);
  assert.equal(long.lineSetMaterial, 20 * 12);
  assert.ok(long.price > included.price);
});

test('extra line-set hours climb with the story; outdoor hours do not', () => {
  const first = calculateBid({ ...easyTwelveK(), lineSetFeet: 35 });
  const second = calculateBid({ ...easyTwelveK(), lineSetFeet: 35, storyFactor: 1.2 });
  assert.ok(Math.abs(second.lineSetHours - first.lineSetHours * 1.2) < 1e-9);
  assert.equal(first.outdoorHours, second.outdoorHours);
});

test('a new circuit does not scale with head count', () => {
  const single = calculateBid({
    ...easyTwelveK(),
    electricalHours: 4.5,
    electricalMaterial: 380,
  });
  const triple = calculateBid({
    ...easyTwelveK(),
    headCount: 3,
    electricalHours: 4.5,
    electricalMaterial: 380,
  });
  assert.equal(single.electricalHours, triple.electricalHours);
  assert.equal(single.electricalMaterial, triple.electricalMaterial);
  assert.ok(single.shares.extras > triple.shares.extras);
});

test('a cassette upstairs with a long run, pump, and new circuit is not a $2,800-a-head job', () => {
  const easy = calculateBid(easyTwelveK());
  const hard = calculateBid({
    ...easyTwelveK(),
    headCount: 2,
    btuPerHead: 15000,
    outdoorUnitCost: 2200,
    indoorHeadCostEach: 720,
    branchBoxCost: 350,
    lineSetFeet: 50,
    headTypeFactor: 1.35,
    storyFactor: 1.2,
    electricalHours: 4.5,
    electricalMaterial: 380,
    condensateHours: 1.5,
    condensateMaterial: 180,
  });
  const extra = hard.price - easy.price;
  assert.ok(extra > 4000, `hard job only added $${extra.toFixed(0)}`);
  assert.ok(hard.pricePerHead > easy.pricePerHead);
  assert.ok(hard.totalHours > easy.totalHours * 2);
});

test('price stacks burden, equipment, extras, overhead, then margin as a share of price', () => {
  const result = calculateBid(easyTwelveK());
  assert.equal(result.loadedWage, 42 * 1.3);
  assert.equal(result.equipmentCost, 1400 + 550);
  assert.equal(result.softCost, 175 + 85);
  assert.ok(Math.abs(result.totalHours - 8) < 1e-9);

  const direct = result.laborCost + result.equipmentCost + result.extraMaterial + result.softCost;
  assert.ok(Math.abs(result.directCost - direct) < 1e-9);
  assert.ok(Math.abs(result.overhead - direct * 0.15) < 1e-9);
  assert.ok(Math.abs(result.totalCost - direct * 1.15) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 22) < 1e-9);
});

test('a zero-margin bid prices at cost', () => {
  const result = calculateBid({ ...easyTwelveK(), targetMargin: 0 });
  assert.ok(Math.abs(result.price - result.totalCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
  assert.equal(result.breakEvenPrice, result.totalCost);
});

test('a proposed price is scored against the same cost base', () => {
  const bid = calculateBid(easyTwelveK());
  const scored = calculateBid({ ...easyTwelveK(), proposedPrice: bid.price });
  assert.ok(Math.abs(scored.proposed.margin - 22) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.perHead - bid.pricePerHead) < 1e-9);
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const bid = calculateBid(easyTwelveK());
  const scored = calculateBid({ ...easyTwelveK(), proposedPrice: bid.totalCost - 250 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
  assert.ok(scored.proposed.margin < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(easyTwelveK()).proposed, null);
  assert.equal(calculateBid({ ...easyTwelveK(), proposedPrice: '' }).proposed, null);
  assert.equal(calculateBid({ ...easyTwelveK(), proposedPrice: null }).proposed, null);
  assert.equal(calculateBid({ ...easyTwelveK(), proposedPrice: 0 }).proposed.price, 0);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...easyTwelveK(), headCount: 0 }), /Head count must be greater than zero/);
  assert.throws(() => calculateBid({ ...easyTwelveK(), btuPerHead: 0 }), /BTU per head must be greater than zero/);
  assert.throws(() => calculateBid({ ...easyTwelveK(), indoorHoursPerHead: 0 }), /Indoor hours per head must be greater than zero/);
  assert.throws(() => calculateBid({ ...easyTwelveK(), headTypeFactor: 0 }), /Head-type factor must be greater than zero/);
  assert.throws(() => calculateBid({ ...easyTwelveK(), storyFactor: 0 }), /Story factor must be greater than zero/);
  assert.throws(() => calculateBid({ ...easyTwelveK(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...easyTwelveK(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...easyTwelveK(), overheadRate: -1 }), /Overhead must be at least 0/);
  assert.throws(() => calculateBid({ ...easyTwelveK(), headCount: -2 }), /Head count must be at least 0/);
});

test('presets are usable positive numbers', () => {
  for (const preset of HEAD_TYPE_PRESETS) {
    assert.ok(preset.id && preset.label);
    assert.ok(Number.isFinite(preset.factor) && preset.factor > 0);
  }
  for (const preset of STORY_PRESETS) {
    assert.ok(preset.id && preset.label);
    assert.ok(Number.isFinite(preset.factor) && preset.factor > 0);
  }
  for (const preset of ELECTRICAL_PRESETS) {
    assert.ok(preset.id && preset.label);
    assert.ok(preset.hours >= 0 && preset.material >= 0);
  }
  for (const preset of CONDENSATE_PRESETS) {
    assert.ok(preset.id && preset.label);
    assert.ok(preset.hours >= 0 && preset.material >= 0);
  }
  assert.ok(SYSTEM_PRESETS.length >= 3);
  for (const preset of SYSTEM_PRESETS) {
    assert.ok(preset.headCount > 0 && preset.btuPerHead > 0);
  }
});

test('bid summary is customer-facing and omits wages and costs', () => {
  const result = calculateBid(easyTwelveK());
  const text = formatBidSummary(result);
  assert.match(text, /12\.0 kBTU/);
  assert.match(text, /1 indoor head/);
  assert.match(text, /Proposed install price/);
  assert.doesNotMatch(text, /wage/i);
  assert.doesNotMatch(text, /burden/i);
  assert.doesNotMatch(text, /overhead/i);
});

test('condensate line appears in the summary only when a pump is priced', () => {
  const none = formatBidSummary(calculateBid(easyTwelveK()));
  const withPump = formatBidSummary(calculateBid({
    ...easyTwelveK(),
    condensateHours: 1.5,
    condensateMaterial: 180,
  }));
  assert.doesNotMatch(none, /Condensate/);
  assert.match(withPump, /Condensate/);
});
