import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  formatBidSummary,
  suggestedJobHours,
  JOB_PRESETS,
  JOB_TYPE_PRESETS,
} from './calc.mjs';

const rates = () => ({
  includedAffectedSqFt: 80,
  includedContainmentZones: 1,
  hoursBaseSetup: 4,
  hoursPerExtra100SqFt: 1.5,
  hoursPerExtraZone: 2.5,
  hoursPer100DemoSqFt: 3,
  hoursPerDryoutDay: 0.75,
  hoursClearance: 1.5,
  hoursHvac: 3.5,
  hoursDumpster: 1.5,
  hoursOccupied: 2,
  siteHours: 1.5,
  hepaDaily: 125,
  dehumidifierDaily: 65,
  containmentKit: 185,
  extraZoneKit: 95,
  demoDisposalPerSqFt: 2.4,
  antimicrobialPerSqFt: 0.85,
  encapsulantPerSqFt: 0.65,
  clearanceFee: 425,
  hvacCleanCost: 550,
  dumpsterFee: 525,
  hourlyWage: 45,
  burdenRate: 36,
  travelAndEquipment: 145,
  overheadRate: 18,
  targetMargin: 30,
});

const special = () => ({
  ...rates(),
  jobType: 'closet',
  affectedSqFt: 80,
  containmentZones: 1,
  demoSqFt: 0,
  hepaDays: 1,
  dehumidifierDays: 1,
  clearanceTest: false,
  hvacClean: false,
  dumpster: false,
  occupied: false,
});

const basement = () => ({
  ...rates(),
  jobType: 'basement',
  affectedSqFt: 800,
  containmentZones: 2,
  demoSqFt: 240,
  hepaDays: 4,
  dehumidifierDays: 4,
  clearanceTest: true,
  hvacClean: true,
  dumpster: true,
  occupied: true,
  hoursBaseSetup: 5.5,
});

test('closet-special hours come from the base setup, not from extra zones or demo', () => {
  const result = calculateBid(special());
  assert.equal(result.extraSqFt, 0);
  assert.equal(result.extraZones, 0);
  assert.equal(result.setupHours, 4);
  assert.equal(result.areaHours, 0);
  assert.equal(result.zoneHours, 0);
  assert.equal(result.demoHours, 0);
  assert.equal(result.dryoutHours, 0.75);
  assert.equal(result.clearanceHours, 0);
  assert.equal(result.hvacHours, 0);
  assert.equal(result.dumpsterHours, 0);
  assert.equal(result.occupiedHours, 0);
  assert.equal(result.siteHours, 1.5);
});

test('basement extras do not scale with the closet special', () => {
  const result = calculateBid(basement());
  assert.equal(result.affectedSqFt, 800);
  assert.equal(result.extraSqFt, 720);
  assert.equal(result.extraZones, 1);
  assert.ok(Math.abs(result.areaHours - 10.8) < 1e-9);
  assert.ok(Math.abs(result.zoneHours - 2.5) < 1e-9);
  assert.ok(Math.abs(result.demoHours - 7.2) < 1e-9);
  assert.equal(result.dryoutHours, 3);
  assert.equal(result.clearanceHours, 1.5);
  assert.equal(result.hvacHours, 3.5);
  assert.equal(result.dumpsterHours, 1.5);
  assert.equal(result.occupiedHours, 2);
  // Containment + extras outrun the base setup itself — that is the
  // user-visible reason a per-square-foot quote fails even when the
  // first closet looks ordinary.
  assert.ok(result.containmentHours + result.serviceHours > result.setupHours);
});

test('a finished basement prices well above the closet special despite a similar first zone', () => {
  const closet = calculateBid(special());
  const job = calculateBid(basement());
  assert.equal(closet.containmentZones, 1);
  assert.ok(job.containmentZones > closet.containmentZones);
  assert.ok(job.price > closet.price * 4, 'the basement is a different job');
  assert.ok(job.totalHours > closet.totalHours * 4);
});

test('price stacks burden, kits, overhead, then margin as a share of price', () => {
  const result = calculateBid(special());
  assert.ok(Math.abs(result.loadedWage - 45 * 1.36) < 1e-9);

  const expectedHours = 4 + 0.75 + 1.5;
  assert.ok(Math.abs(result.totalHours - expectedHours) < 1e-9);
  assert.ok(Math.abs(result.laborCost - expectedHours * 45 * 1.36) < 1e-9);

  const expectedMaterials = 125 + 65 + 185 + 80 * 0.85 + 80 * 0.65;
  assert.ok(Math.abs(result.materialCost - expectedMaterials) < 1e-9);
  assert.ok(Math.abs(result.directCost - (result.laborCost + result.materialCost + 145)) < 1e-9);
  assert.ok(Math.abs(result.overhead - result.directCost * 0.18) < 1e-9);
  assert.ok(Math.abs(result.totalCost - result.directCost * 1.18) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 30) < 1e-9);
  assert.equal(result.breakEvenPrice, result.totalCost);
});

test('a zero-margin bid prices at cost', () => {
  const result = calculateBid({ ...special(), targetMargin: 0 });
  assert.ok(Math.abs(result.price - result.totalCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
});

test('a proposed price is scored against the same cost base', () => {
  const bid = calculateBid(special());
  const scored = calculateBid({ ...special(), proposedPrice: bid.price });
  assert.ok(Math.abs(scored.proposed.margin - 30) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.hourlyRate - bid.effectiveHourlyRate) < 1e-9);
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const bid = calculateBid(special());
  const scored = calculateBid({ ...special(), proposedPrice: bid.totalCost - 50 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(special()).proposed, null);
  assert.equal(calculateBid({ ...special(), proposedPrice: '' }).proposed, null);
  assert.equal(calculateBid({ ...special(), proposedPrice: null }).proposed, null);
  assert.equal(calculateBid({ ...special(), proposedPrice: 0 }).proposed.price, 0);
});

test('turning off clearance, HVAC, dumpster, and occupied drops those hours and kits', () => {
  const full = calculateBid(basement());
  const stripped = calculateBid({
    ...basement(),
    clearanceTest: false,
    hvacClean: false,
    dumpster: false,
    occupied: false,
  });
  assert.equal(stripped.clearanceHours, 0);
  assert.equal(stripped.hvacHours, 0);
  assert.equal(stripped.dumpsterHours, 0);
  assert.equal(stripped.occupiedHours, 0);
  assert.equal(stripped.clearanceMaterial, 0);
  assert.equal(stripped.hvacMaterial, 0);
  assert.equal(stripped.dumpsterMaterial, 0);
  assert.ok(stripped.price < full.price);
  // Extra area, extra zone, and demo still fire because the house is unchanged.
  assert.ok(stripped.areaHours > 0);
  assert.ok(stripped.zoneHours > 0);
  assert.ok(stripped.demoHours > 0);
});

test('dry-out hours follow the longer of HEPA and dehumidifier days', () => {
  const hepaLonger = calculateBid({ ...special(), hepaDays: 3, dehumidifierDays: 1 });
  const dehuLonger = calculateBid({ ...special(), hepaDays: 1, dehumidifierDays: 4 });
  assert.equal(hepaLonger.dryoutDays, 3);
  assert.equal(hepaLonger.dryoutHours, 2.25);
  assert.equal(dehuLonger.dryoutDays, 4);
  assert.equal(dehuLonger.dryoutHours, 3);
});

test('a vacant closet does not bill occupied-home hours even if that hour field is filled', () => {
  const result = calculateBid({ ...special(), hoursOccupied: 2, occupied: false });
  assert.equal(result.occupiedHours, 0);
  assert.equal(result.occupied, false);
});

test('suggested job hours match the shipped presets', () => {
  assert.deepEqual(suggestedJobHours('closet'), { hoursBaseSetup: 4 });
  assert.deepEqual(suggestedJobHours('bedroom'), { hoursBaseSetup: 4.5 });
  assert.deepEqual(suggestedJobHours('basement'), { hoursBaseSetup: 5.5 });
  assert.deepEqual(suggestedJobHours('sewage'), { hoursBaseSetup: 6.5 });
  assert.throws(() => suggestedJobHours('attic'), /Unknown job type/);
});

test('unknown job type is rejected', () => {
  assert.throws(() => calculateBid({ ...special(), jobType: 'attic' }), /Unknown job type/);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...special(), affectedSqFt: 0 }), /Affected square feet must be greater than zero/);
  assert.throws(() => calculateBid({ ...special(), containmentZones: 0 }), /Containment zones must be greater than zero/);
  assert.throws(() => calculateBid({ ...special(), includedAffectedSqFt: 0 }), /Included affected square feet must be greater than zero/);
  assert.throws(() => calculateBid({ ...special(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...special(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...special(), demoSqFt: -1 }), /Demo square feet must be at least 0/);
  assert.throws(() => calculateBid({ ...special(), hepaDays: -1 }), /HEPA days must be at least 0/);
});

test('job presets are usable and the basement is not a markup on the special', () => {
  assert.ok(JOB_PRESETS.length >= 4);
  const closet = JOB_PRESETS[0];
  const combo = JOB_PRESETS[2];
  assert.equal(closet.jobType, 'closet');
  assert.equal(closet.containmentZones, 1);
  assert.equal(closet.clearanceTest, false);
  assert.equal(combo.jobType, 'basement');
  assert.equal(combo.clearanceTest, true);
  assert.ok(combo.affectedSqFt > closet.affectedSqFt);
  assert.ok(combo.containmentZones > closet.containmentZones);
});

test('preset catalogs are labeled positive options', () => {
  for (const preset of JOB_TYPE_PRESETS) {
    assert.ok(preset.label.length > 0);
    assert.ok(preset.id.length > 0);
  }
});

test('customer-facing summary omits wages and names the containment extras', () => {
  const result = calculateBid(basement());
  const text = formatBidSummary(result, 'Finished basement');
  assert.match(text, /MOLD REMEDIATION BID/);
  assert.match(text, /800 sq ft affected/);
  assert.match(text, /2 containment zones/);
  assert.match(text, /240 sq ft demolition included/);
  assert.match(text, /third-party clearance included/);
  assert.match(text, /HVAC \/ duct cleaning included/);
  assert.doesNotMatch(text, /45/);
  assert.doesNotMatch(text, /wage/i);
});
