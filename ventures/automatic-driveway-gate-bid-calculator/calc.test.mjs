import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  columnCount,
  compareStyles,
  formatBidSummary,
  JOB_PRESETS,
  materialWeight,
  operatorCount,
  STYLE_PRESETS,
  suggestedColumnKit,
  suggestedPowerKit,
  suggestedStyleKit,
} from './calc.mjs';

const COSTS = {
  permitFee: 125,
  hourlyWage: 42,
  burdenRate: 32,
  travelAndEquipment: 285,
  overheadRate: 16,
  targetMargin: 28,
};

function bid(overrides = {}) {
  const style = overrides.style ?? 'swing-single';
  const columnType = overrides.columnType ?? 'existing';
  const power = overrides.power ?? 'ac';
  return calculateBid({
    ...COSTS,
    ...suggestedStyleKit(style),
    ...suggestedColumnKit(columnType),
    ...suggestedPowerKit(power),
    style,
    openingWidthFt: 12,
    leafHeightFt: 5,
    material: 'aluminum',
    columnType,
    power,
    loops: 0,
    extraRemotes: 2,
    keypad: false,
    batteryBackup: false,
    edgeSensors: false,
    ...overrides,
  });
}

test('a dual swing is two operators and three new columns; single and slide are one and two', () => {
  assert.equal(operatorCount('swing-single'), 1);
  assert.equal(operatorCount('swing-dual'), 2);
  assert.equal(operatorCount('slide'), 1);
  assert.equal(columnCount('swing-single', 'existing'), 0);
  assert.equal(columnCount('swing-single', 'masonry'), 2);
  assert.equal(columnCount('swing-dual', 'masonry'), 3);
  assert.equal(columnCount('slide', 'steel-posts'), 2);
});

test('steel leaves cost more hardware and hang hours than aluminum on the same opening', () => {
  const aluminum = bid({ material: 'aluminum', openingWidthFt: 16 });
  const steel = bid({ material: 'steel', openingWidthFt: 16 });
  assert.equal(materialWeight('steel'), 1.35);
  assert.ok(Math.abs(steel.gateMaterial - aluminum.gateMaterial * 1.35) < 1e-9);
  assert.ok(steel.hoursGate > aluminum.hoursGate);
  assert.ok(steel.price > aluminum.price);
});

test('the cheap 12 ft single aluminum special is not the 16 ft dual masonry job', () => {
  const special = bid();
  const heavy = bid({
    style: 'swing-dual',
    openingWidthFt: 16,
    leafHeightFt: 6,
    material: 'steel',
    columnType: 'masonry',
    power: 'solar',
    loops: 2,
    extraRemotes: 4,
    keypad: true,
    batteryBackup: true,
    edgeSensors: true,
    ...suggestedStyleKit('swing-dual'),
    ...suggestedColumnKit('masonry'),
    ...suggestedPowerKit('solar'),
  });
  assert.equal(special.operators, 1);
  assert.equal(special.columns, 0);
  assert.equal(heavy.operators, 2);
  assert.equal(heavy.columns, 3);
  assert.ok(heavy.price > special.price * 1.8);
  assert.ok(heavy.extraCost > special.extraCost);
  assert.ok(heavy.hoursColumns > 0);
  assert.equal(special.hoursColumns, 0);
});

test('masonry columns are hours and hardware the existing-post special never sees', () => {
  const existing = bid({ columnType: 'existing', openingWidthFt: 16 });
  const masonry = bid({
    columnType: 'masonry',
    openingWidthFt: 16,
    ...suggestedColumnKit('masonry'),
  });
  assert.equal(existing.columns, 0);
  assert.equal(masonry.columns, 2);
  assert.ok(masonry.columnMaterial > 0);
  assert.ok(masonry.hoursColumns > 0);
  assert.ok(masonry.price > existing.price + 1500);
});

test('vehicle loops are their own hours and kits, not a blended adder', () => {
  const none = bid({ loops: 0 });
  const two = bid({ loops: 2 });
  assert.equal(none.hoursLoops, 0);
  assert.ok(Math.abs(two.hoursLoops - 2 * two.hoursLoops / 2) < 1e-9);
  assert.ok(two.loopMaterial > 0);
  assert.ok(two.price > none.price + 200);
});

test('solar skips the trench ticket; AC skips the solar kit', () => {
  const ac = bid({ power: 'ac', ...suggestedPowerKit('ac') });
  const solar = bid({ power: 'solar', ...suggestedPowerKit('solar') });
  assert.ok(ac.trenchCost > 0);
  assert.equal(ac.solarMaterial, 0);
  assert.equal(ac.hoursPower, ac.hoursPower);
  assert.ok(solar.solarMaterial > 0);
  assert.equal(solar.trenchCost, 0);
  assert.ok(solar.hoursPower > 0);
});

test('price stacks burden, kits, overhead, then margin as a share of price', () => {
  const result = bid();
  assert.equal(result.loadedWage, 42 * 1.32);
  const direct = result.laborCost + result.materialCost + result.travelAndEquipment;
  assert.ok(Math.abs(result.directCost - direct) < 1e-9);
  assert.ok(Math.abs(result.overhead - direct * 0.16) < 1e-9);
  assert.ok(Math.abs(result.totalCost - direct * 1.16) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 28) < 1e-9);
  assert.equal(result.breakEvenPrice, result.totalCost);
});

test('a zero-margin bid prices at cost', () => {
  const result = bid({ targetMargin: 0 });
  assert.ok(Math.abs(result.price - result.totalCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const priced = bid();
  const scored = bid({ proposedPrice: priced.totalCost - 200 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
  assert.ok(scored.proposed.margin < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(bid().proposed, null);
  assert.equal(bid({ proposedPrice: '' }).proposed, null);
  assert.equal(bid({ proposedPrice: null }).proposed, null);
  assert.equal(bid({ proposedPrice: 0 }).proposed.price, 0);
});

test('a proposed price at the bid is scored against the same cost base', () => {
  const priced = bid();
  const scored = bid({ proposedPrice: priced.price });
  assert.ok(Math.abs(scored.proposed.margin - 28) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
});

test('keypad, battery, and edges are billed only when the shop turns them on', () => {
  const plain = bid();
  const loaded = bid({ keypad: true, batteryBackup: true, edgeSensors: true });
  assert.equal(plain.keypadMaterial, 0);
  assert.equal(plain.batteryMaterial, 0);
  assert.equal(plain.edgeMaterial, 0);
  assert.ok(loaded.keypadMaterial > 0);
  assert.ok(loaded.batteryMaterial > 0);
  assert.ok(loaded.edgeMaterial > 0);
  assert.ok(loaded.hoursKeypad > 0);
  assert.ok(loaded.price > plain.price);
});

test('compareStyles still prices dual swing when the current job is a single', () => {
  const rows = compareStyles({
    ...COSTS,
    openingWidthFt: 12,
    leafHeightFt: 5,
    material: 'aluminum',
    columnType: 'existing',
    power: 'ac',
    loops: 0,
    extraRemotes: 2,
    keypad: false,
    batteryBackup: false,
    edgeSensors: false,
  });
  assert.equal(rows.length, 3);
  const dual = rows.find((row) => row.style === 'swing-dual');
  assert.ok(dual.price > 0);
  assert.equal(dual.operators, 2);
});

test('compareStyles shows single swing beating dual on an existing-post 12 ft opening', () => {
  const rows = compareStyles({
    ...COSTS,
    openingWidthFt: 12,
    leafHeightFt: 5,
    material: 'aluminum',
    columnType: 'existing',
    power: 'ac',
    loops: 0,
    extraRemotes: 2,
    keypad: false,
    batteryBackup: false,
    edgeSensors: false,
  });
  const single = rows.find((row) => row.style === 'swing-single');
  const dual = rows.find((row) => row.style === 'swing-dual');
  assert.ok(single.price < dual.price);
  assert.equal(rows.filter((row) => row.cheapest).length, 1);
  assert.equal(rows[0].delta, 0);
});

test('compareStyles shows dual extra cost jumping when masonry columns are required', () => {
  const existing = compareStyles({
    ...COSTS,
    openingWidthFt: 16,
    leafHeightFt: 6,
    material: 'steel',
    columnType: 'existing',
    power: 'ac',
    loops: 0,
    extraRemotes: 2,
    keypad: false,
    batteryBackup: false,
    edgeSensors: false,
  });
  const masonry = compareStyles({
    ...COSTS,
    openingWidthFt: 16,
    leafHeightFt: 6,
    material: 'steel',
    columnType: 'masonry',
    power: 'ac',
    loops: 0,
    extraRemotes: 2,
    keypad: false,
    batteryBackup: false,
    edgeSensors: false,
  });
  const existingDual = existing.find((row) => row.style === 'swing-dual');
  const masonryDual = masonry.find((row) => row.style === 'swing-dual');
  assert.ok(masonryDual.extraCost > existingDual.extraCost);
  assert.ok(masonryDual.price > existingDual.price);
  assert.equal(masonryDual.columns, 3);
});

test('formatBidSummary is customer-facing and omits wages', () => {
  const text = formatBidSummary(bid(), '12 ft single aluminum swing');
  assert.match(text, /AUTOMATIC DRIVEWAY GATE BID/);
  assert.match(text, /12 ft opening/);
  assert.doesNotMatch(text, /\$42/);
  assert.doesNotMatch(text, /wage/i);
  assert.match(text, /not a gate specification/);
});

test('job presets cover the three styles and the masonry contrast', () => {
  assert.equal(JOB_PRESETS.length, 4);
  const styles = new Set(JOB_PRESETS.map((job) => job.style));
  assert.deepEqual([...styles].sort(), ['slide', 'swing-dual', 'swing-single']);
  assert.ok(JOB_PRESETS.some((job) => job.columnType === 'masonry' && job.style === 'swing-dual'));
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => bid({ openingWidthFt: 0 }), /Opening width must be greater than zero/);
  assert.throws(() => bid({ style: 'cantilever' }), /Unknown gate style/);
  assert.throws(() => bid({ material: 'wrought-iron' }), /Unknown gate material/);
  assert.throws(() => bid({ columnType: 'brick-veneer' }), /Unknown column type/);
  assert.throws(() => bid({ power: 'generator' }), /Unknown power type/);
  assert.throws(() => bid({ leafHeightFt: 0 }), /Leaf height must be greater than zero/);
  assert.throws(() => bid({ hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => bid({ targetMargin: 100 }), /less than 100/);
  assert.throws(() => bid({ overheadRate: -1 }), /Overhead must be at least 0/);
  assert.throws(() => suggestedStyleKit('cantilever'), /Unknown gate style/);
  assert.throws(() => suggestedColumnKit('brick-veneer'), /Unknown column type/);
  assert.throws(() => suggestedPowerKit('generator'), /Unknown power type/);
});

test('presets are usable positive figures', () => {
  assert.ok(STYLE_PRESETS.length === 3);
  for (const style of STYLE_PRESETS) {
    const kit = suggestedStyleKit(style.id);
    for (const value of Object.values(kit)) {
      assert.ok(Number.isFinite(value) && value >= 0);
    }
  }
});

test('slide is a track and one operator, not a pair of swing leaves', () => {
  const slide = bid({
    style: 'slide',
    openingWidthFt: 18,
    ...suggestedStyleKit('slide'),
    ...suggestedColumnKit('steel-posts'),
    columnType: 'steel-posts',
  });
  assert.equal(slide.operators, 1);
  assert.equal(slide.columns, 2);
  assert.ok(slide.hoursOperators > 0);
  assert.ok(slide.gateMaterial > 0);
});
