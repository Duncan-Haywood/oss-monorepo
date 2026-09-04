import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  ACCESS_PRESETS,
  HAUL_PRESETS,
  HAZARD_PREMIUMS,
  REFERENCE_DBH_INCHES,
  REFERENCE_HEIGHT_FEET,
  SPECIES_PRESETS,
  calculateBid,
  heightFactor,
  stumpGrindHours,
} from './calc.mjs';

const stop = (overrides = {}) => ({
  trees: [
    {
      name: 'Backyard oak',
      dbhInches: 24,
      heightFeet: 60,
      species: 'hardwood',
      access: 'backyard',
      haul: 'chip_haul',
      grindStump: true,
      nearStructure: true,
      nearPower: false,
      deadHazard: false,
    },
    {
      name: 'Street pine',
      dbhInches: 12,
      heightFeet: 40,
      species: 'softwood',
      access: 'street',
      haul: 'leave',
      grindStump: false,
    },
  ],
  crewHourlyRate: 180,
  burdenRate: 30,
  equipmentHourly: 45,
  craneDayRate: 1200,
  dumpFeePerTree: 85,
  otherJobCost: 0,
  overheadRate: 15,
  targetMargin: 25,
  minimumJob: 450,
  travelMinutes: 40,
  ...overrides,
});

test('hours scale with the square of DBH, not linearly', () => {
  const twelve = calculateBid(stop({
    trees: [{ dbhInches: 12, heightFeet: 50, species: 'mixed', access: 'street', haul: 'leave' }],
    travelMinutes: 0,
    minimumJob: 0,
  }));
  const twentyFour = calculateBid(stop({
    trees: [{ dbhInches: 24, heightFeet: 50, species: 'mixed', access: 'street', haul: 'leave' }],
    travelMinutes: 0,
    minimumJob: 0,
  }));
  assert.ok(Math.abs(twentyFour.onSiteHours / twelve.onSiteHours - 4) < 1e-9);
});

test('a backyard oak next to the house consumes most of a two-tree stop', () => {
  const result = calculateBid(stop());
  const oak = result.trees.find(tree => tree.name === 'Backyard oak');
  const pine = result.trees.find(tree => tree.name === 'Street pine');
  assert.ok(oak.hoursShare > 80, `oak is only ${oak.hoursShare.toFixed(1)}% of hours`);
  assert.ok(pine.hoursShare < 20);
  assert.ok(oak.onSiteHours > pine.onSiteHours * 4);
});

test('access and structure premiums raise hours without changing wood volume', () => {
  const easy = calculateBid(stop({
    trees: [{ dbhInches: 18, heightFeet: 50, species: 'mixed', access: 'street', haul: 'leave' }],
    travelMinutes: 0,
  }));
  const hard = calculateBid(stop({
    trees: [{
      dbhInches: 18,
      heightFeet: 50,
      species: 'mixed',
      access: 'backyard',
      haul: 'leave',
      nearStructure: true,
    }],
    travelMinutes: 0,
  }));
  const expected = easy.onSiteHours * 1.4 * (1 + HAZARD_PREMIUMS.nearStructure);
  assert.ok(Math.abs(hard.onSiteHours - expected) < 1e-9);
  assert.equal(hard.trees[0].sizeFactor, easy.trees[0].sizeFactor);
});

test('stump grinding and haul are extra lines, not folded into removal', () => {
  const bare = calculateBid(stop({
    trees: [{ dbhInches: 24, heightFeet: 50, species: 'mixed', access: 'street', haul: 'leave' }],
    travelMinutes: 0,
  }));
  const full = calculateBid(stop({
    trees: [{
      dbhInches: 24,
      heightFeet: 50,
      species: 'mixed',
      access: 'street',
      haul: 'chip_haul',
      grindStump: true,
    }],
    travelMinutes: 0,
  }));
  const tree = full.trees[0];
  assert.ok(tree.grindHours > 0);
  assert.ok(tree.haulHours > 0);
  assert.ok(Math.abs(tree.onSiteHours - (tree.removalHours + tree.grindHours + tree.haulHours)) < 1e-9);
  assert.ok(full.onSiteHours > bare.onSiteHours);
  assert.equal(full.dumpFees, 85);
  assert.equal(bare.dumpFees, 0);
});

test('travel is billed once for the stop, not once per tree', () => {
  const one = calculateBid(stop({
    trees: [{ dbhInches: 12, heightFeet: 50, species: 'mixed', access: 'street', haul: 'leave' }],
    travelMinutes: 40,
  }));
  const two = calculateBid(stop({
    trees: [
      { dbhInches: 12, heightFeet: 50, species: 'mixed', access: 'street', haul: 'leave' },
      { dbhInches: 12, heightFeet: 50, species: 'mixed', access: 'street', haul: 'leave' },
    ],
    travelMinutes: 40,
  }));
  assert.equal(one.travelHours, 40 / 60);
  assert.equal(two.travelHours, one.travelHours);
  assert.ok(Math.abs(two.onSiteHours - one.onSiteHours * 2) < 1e-9);
});

test('price stacks burden, equipment, overhead, then margin as a share of price', () => {
  const result = calculateBid(stop({ minimumJob: 0 }));
  assert.equal(result.loadedCrewRate, 180 * 1.3);
  assert.ok(Math.abs(result.laborCost - result.laborHours * result.loadedCrewRate) < 1e-9);
  assert.ok(Math.abs(result.overhead - result.directCost * 0.15) < 1e-9);
  assert.ok(Math.abs(result.jobCost - result.directCost * 1.15) < 1e-9);
  assert.ok(Math.abs(result.profit / result.recommendedPrice * 100 - 25) < 1e-9);
  assert.equal(result.minimumApplied, false);
});

test('a small stop is lifted to the mobilization minimum', () => {
  const result = calculateBid(stop({
    trees: [{ dbhInches: 8, heightFeet: 25, species: 'softwood', access: 'street', haul: 'leave' }],
    travelMinutes: 10,
    minimumJob: 450,
    targetMargin: 20,
  }));
  assert.equal(result.minimumApplied, true);
  assert.equal(result.recommendedPrice, 450);
  assert.ok(result.marginPrice < 450);
  assert.equal(result.quoteFloor, 450);
});

test('a crane day is charged once if any tree needs a crane', () => {
  const result = calculateBid(stop({
    trees: [
      { dbhInches: 18, heightFeet: 50, species: 'mixed', access: 'crane', haul: 'leave' },
      { dbhInches: 12, heightFeet: 40, species: 'mixed', access: 'street', haul: 'leave' },
    ],
    craneDayRate: 1200,
    travelMinutes: 0,
    minimumJob: 0,
  }));
  assert.equal(result.craneCost, 1200);
  assert.equal(result.trees.filter(tree => tree.needsCrane).length, 1);
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const bid = calculateBid(stop());
  const scored = calculateBid(stop({ proposedPrice: bid.jobCost - 100 }));
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
  assert.ok(scored.proposed.margin < 0);
});

test('a proposed price under the minimum is called out even when it covers cost', () => {
  const cheap = calculateBid(stop({
    trees: [{ dbhInches: 8, heightFeet: 25, species: 'softwood', access: 'street', haul: 'leave' }],
    travelMinutes: 10,
    minimumJob: 450,
    proposedPrice: 300,
  }));
  assert.equal(cheap.proposed.belowMinimum, true);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(stop()).proposed, null);
  assert.equal(calculateBid(stop({ proposedPrice: '' })).proposed, null);
  assert.equal(calculateBid(stop({ proposedPrice: null })).proposed, null);
  assert.equal(calculateBid(stop({ proposedPrice: 0 })).proposed.price, 0);
});

test('a nameless tree still reports under a stable label', () => {
  const result = calculateBid(stop({
    trees: [
      { dbhInches: 12, heightFeet: 50, species: 'mixed', access: 'street', haul: 'leave' },
      { name: '   ', dbhInches: 14, heightFeet: 50, species: 'mixed', access: 'street', haul: 'leave' },
    ],
  }));
  assert.equal(result.trees[0].name, 'Tree 1');
  assert.equal(result.trees[1].name, 'Tree 2');
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid(stop({ trees: [] })), /at least one tree/);
  assert.throws(
    () => calculateBid(stop({ trees: [{ dbhInches: 0, species: 'mixed', access: 'street', haul: 'leave' }] })),
    /DBH must be greater than zero/,
  );
  assert.throws(() => calculateBid(stop({ crewHourlyRate: 'abc' })), /Crew hourly rate must be a number/);
  assert.throws(() => calculateBid(stop({ targetMargin: 100 })), /less than 100/);
  assert.throws(() => calculateBid(stop({ overheadRate: -1 })), /Overhead must be at least 0/);
  assert.throws(
    () => calculateBid(stop({ trees: [{ dbhInches: 12, species: 'banana', access: 'street', haul: 'leave' }] })),
    /species is not a recognised option/,
  );
});

test('height factor is clamped so a 10-foot ornamental is not free and a 120-foot pine is not unbounded', () => {
  assert.equal(heightFactor(50), 1);
  assert.ok(heightFactor(10) >= 0.55);
  assert.ok(heightFactor(200) <= 1.8);
  assert.equal(heightFactor(REFERENCE_HEIGHT_FEET), 1);
});

test('stump grind hours grow with diameter and are zero when there is no stump', () => {
  assert.equal(stumpGrindHours(0), 0);
  assert.ok(Math.abs(stumpGrindHours(12) - 0.6) < 1e-9);
  assert.ok(stumpGrindHours(36) > stumpGrindHours(12));
});

test('stump grind hours scale with stump area (diameter squared), not linearly with diameter', () => {
  // Doubling the diameter quadruples the cross-sectional face a grinder wheel
  // has to sweep, so the *growth* term (hours minus the fixed setup) should
  // roughly quadruple too, not double. A linear model would only double it.
  const growth = (diameter) => stumpGrindHours(diameter) - stumpGrindHours(0.0001);
  const at12 = growth(12);
  const at24 = growth(24);
  const at36 = growth(36);
  assert.ok(Math.abs(at24 / at12 - 4) < 0.05, `expected ~4x growth at double the diameter, got ${at24 / at12}`);
  assert.ok(Math.abs(at36 / at12 - 9) < 0.05, `expected ~9x growth at triple the diameter, got ${at36 / at12}`);
  assert.ok(Math.abs(stumpGrindHours(36) - 3.8) < 1e-9);
});

test('presets are usable positive numbers', () => {
  assert.equal(REFERENCE_DBH_INCHES, 12);
  for (const preset of SPECIES_PRESETS) {
    assert.ok(preset.label.length > 0);
    assert.ok(preset.factor > 0);
  }
  for (const preset of ACCESS_PRESETS) {
    assert.ok(preset.multiplier >= 1);
  }
  for (const preset of HAUL_PRESETS) {
    assert.ok(preset.hourShare >= 0);
  }
});

test('browser escapes tree labels before inserting the hour split', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const html = readFileSync(path.join(here, 'index.html'), 'utf8');
  assert.match(html, /const escapeHtml = value =>/);
  assert.match(html, /value="\$\{escapeHtml\(tree\.name \|\| ''\)\}"/);
  assert.match(html, /<span>\$\{escapeHtml\(tree\.name\)\}/);
});

test('sanity ratios land in the range a tree service recognises', () => {
  const result = calculateBid(stop());
  // A hard-access 24" oak with stump and haul plus a street pine lands
  // well above a $25/inch street-side ornamental and well below a
  // crane-and-power-line special. The bound is a sanity check, not a
  // market claim.
  assert.ok(result.pricePerInch > 40 && result.pricePerInch < 300);
  assert.ok(result.effectiveHourlyRate > 200 && result.effectiveHourlyRate < 600);
  assert.equal(result.breakEvenPrice, result.jobCost);
  assert.ok(result.recommendedPrice > result.jobCost);
});
