import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  formatBidSummary,
  wallAreaSqFt,
  suggestedSystem,
  suggestedPump,
  suggestedBackup,
  JOB_PRESETS,
} from './calc.mjs';

function shopRates() {
  return {
    hoursPerWell: 3.2,
    hoursPerFloorCrackLf: 0.35,
    hoursPerWallCrack: 1.8,
    hoursPerNewSump: 4.5,
    hoursPerExistingSump: 1,
    hoursPerDischargeLf: 0.12,
    hoursPerFreezeKit: 0.4,
    hoursPerDehumidifier: 1.5,
    siteHours: 2,
    wellCoverCost: 220,
    floorCrackCostPerLf: 8,
    wallCrackCost: 45,
    pitLinerCost: 380,
    dischargeCostPerLf: 9,
    freezeKitCost: 185,
    dehumidifierCost: 650,
    hourlyWage: 36,
    burdenRate: 32,
    travelAndEquipment: 185,
    overheadRate: 15,
    targetMargin: 25,
  };
}

function brochureJob() {
  const system = suggestedSystem('interior_drain');
  const pump = suggestedPump('third');
  const backup = suggestedBackup('none');
  return {
    ...shopRates(),
    ...system,
    perimeterLf: 80,
    wallHeightFt: 7.5,
    floorSqFt: 600,
    windowWells: 0,
    floorCrackLf: 0,
    wallCrackCount: 0,
    newSumpPit: false,
    hoursPerPump: pump.hours,
    pumpCost: pump.cost,
    hoursPerBackup: backup.hours,
    backupCost: backup.cost,
    dischargeLf: 20,
    freezeDischarge: false,
    includeDehumidifier: false,
  };
}

function seepageTrap() {
  const system = suggestedSystem('interior_drain');
  const pump = suggestedPump('half');
  const backup = suggestedBackup('battery');
  return {
    ...shopRates(),
    ...system,
    perimeterLf: 55,
    wallHeightFt: 8,
    floorSqFt: 480,
    windowWells: 4,
    floorCrackLf: 12,
    wallCrackCount: 2,
    newSumpPit: true,
    hoursPerPump: pump.hours,
    pumpCost: pump.cost,
    hoursPerBackup: backup.hours,
    backupCost: backup.cost,
    dischargeLf: 60,
    freezeDischarge: true,
    includeDehumidifier: false,
  };
}

test('a 55 lf seepage house can cost more than an 80 lf brochure job', () => {
  const brochure = calculateBid(brochureJob());
  const trap = calculateBid(seepageTrap());

  assert.ok(trap.perimeterLf < brochure.perimeterLf);
  assert.ok(trap.price > brochure.price);
  assert.ok(trap.pricePerLf > brochure.pricePerLf);
  assert.ok(trap.wellHours > 0);
  assert.equal(brochure.wellHours, 0);
  assert.ok(trap.sumpHours > brochure.sumpHours);
  assert.ok(trap.backupHours > brochure.backupHours);
});

test('wall membrane area is perimeter times height, not a blended add-on to lineal feet', () => {
  assert.equal(wallAreaSqFt(80, 7.5), 600);
  const result = calculateBid(brochureJob());
  assert.equal(result.wallArea, 600);
  assert.ok(Math.abs(result.wallMaterial - 600 * 2.4) < 1e-9);
});

test('preset helpers return the published starting points', () => {
  assert.equal(suggestedSystem('interior_drain').hoursPerDrainLf, 0.55);
  assert.equal(suggestedSystem('exterior_excavate').hoursPerExteriorLf, 1.85);
  assert.equal(suggestedSystem('crawl_encapsulate').hoursPer100Floor, 2.2);
  assert.deepEqual(suggestedPump('half'), { hours: 1.4, cost: 380 });
  assert.deepEqual(suggestedBackup('battery'), { hours: 1.5, cost: 480 });
});

test('labor hours come from wells, pit, and discharge, not drain footage alone', () => {
  const result = calculateBid(seepageTrap());
  // drain 55*0.55 = 30.25
  // wall 440/100*1.4 = 6.16
  // wells 4*3.2 = 12.8
  // floor cracks 12*0.35 = 4.2
  // wall cracks 2*1.8 = 3.6
  // new pit 4.5, pump 1.4, backup 1.5
  // discharge 60*0.12 + 0.4 = 7.6
  // site 2
  const expected = 30.25 + 6.16 + 12.8 + 4.2 + 3.6 + 4.5 + 1.4 + 1.5 + 7.6 + 2;
  assert.ok(Math.abs(result.totalHours - expected) < 1e-9);
  assert.ok(result.wellHours + result.mechanicalHours + result.dischargeHours > result.drainHours * 0.7);
});

test('price stacks burden, materials, overhead, then margin as a share of price', () => {
  const result = calculateBid(brochureJob());
  assert.equal(result.loadedWage, 36 * 1.32);

  const direct = result.laborCost + result.materialCost + 185;
  assert.ok(Math.abs(result.overhead - direct * 0.15) < 1e-9);
  assert.ok(Math.abs(result.totalCost - direct * 1.15) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 25) < 1e-9);
});

test('a zero-margin bid prices at cost', () => {
  const result = calculateBid({ ...brochureJob(), targetMargin: 0 });
  assert.ok(Math.abs(result.price - result.totalCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
});

test('a proposed price is scored against the same cost base', () => {
  const bid = calculateBid(brochureJob());
  const scored = calculateBid({ ...brochureJob(), proposedPrice: bid.price });
  assert.ok(Math.abs(scored.proposed.margin - 25) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.hourlyRate - bid.effectiveHourlyRate) < 1e-9);
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const bid = calculateBid(brochureJob());
  const scored = calculateBid({ ...brochureJob(), proposedPrice: bid.totalCost - 100 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(brochureJob()).proposed, null);
  assert.equal(calculateBid({ ...brochureJob(), proposedPrice: '' }).proposed, null);
});

test('rejects a takeoff with no perimeter and no floor', () => {
  assert.throws(
    () => calculateBid({ ...brochureJob(), perimeterLf: 0, floorSqFt: 0 }),
    /perimeter lineal feet or floor area/,
  );
});

test('rejects a margin of 100% or more', () => {
  assert.throws(() => calculateBid({ ...brochureJob(), targetMargin: 100 }), /less than 100/);
});

test('rejects non-finite inputs', () => {
  assert.throws(() => calculateBid({ ...brochureJob(), perimeterLf: 'wet' }), /must be a number/);
});

test('unknown preset ids fail closed', () => {
  assert.throws(() => suggestedSystem('spray_foam'), /Unknown waterproofing system/);
  assert.throws(() => suggestedPump('one_hp'), /Unknown sump pump/);
  assert.throws(() => suggestedBackup('generator'), /Unknown backup pump/);
});

test('boolean flags accept form-string true/false and 1/0', () => {
  const asString = calculateBid({ ...brochureJob(), newSumpPit: 'true' });
  const asNumber = calculateBid({ ...brochureJob(), newSumpPit: 1 });
  const off = calculateBid({ ...brochureJob(), newSumpPit: 'false' });
  assert.equal(asString.newSumpPit, true);
  assert.equal(asNumber.newSumpPit, true);
  assert.equal(off.newSumpPit, false);
  assert.ok(asString.sumpHours > off.sumpHours);
});

test('customer-facing summary omits wages and invoice costs', () => {
  const text = formatBidSummary(calculateBid(brochureJob()), 'Interior French drain + wall membrane');
  assert.match(text, /BASEMENT WATERPROOFING BID/);
  assert.match(text, /Proposed waterproofing price/);
  assert.doesNotMatch(text, /36/);
  assert.doesNotMatch(text, /wage/i);
  assert.doesNotMatch(text, /burden/i);
});

test('exterior excavation hours dwarf an interior drain of the same footage', () => {
  const interior = calculateBid(brochureJob());
  const exterior = calculateBid({
    ...brochureJob(),
    ...suggestedSystem('exterior_excavate'),
    perimeterLf: 80,
  });
  assert.ok(exterior.exteriorHours > interior.drainHours);
  assert.ok(exterior.price > interior.price);
  assert.equal(interior.exteriorHours, 0);
});

test('every job preset produces a finite bid a contractor can send', () => {
  for (const job of JOB_PRESETS) {
    const system = suggestedSystem(job.systemId);
    const pump = suggestedPump(job.pumpId);
    const backup = suggestedBackup(job.backupId);
    const result = calculateBid({
      ...shopRates(),
      ...system,
      perimeterLf: job.perimeterLf,
      wallHeightFt: job.wallHeightFt,
      floorSqFt: job.floorSqFt,
      windowWells: job.windowWells,
      floorCrackLf: job.floorCrackLf,
      wallCrackCount: job.wallCrackCount,
      newSumpPit: job.newSumpPit,
      hoursPerPump: pump.hours,
      pumpCost: pump.cost,
      hoursPerBackup: backup.hours,
      backupCost: backup.cost,
      dischargeLf: job.dischargeLf,
      freezeDischarge: job.freezeDischarge,
      includeDehumidifier: job.includeDehumidifier,
    });
    assert.ok(Number.isFinite(result.price), job.label);
    assert.ok(result.price > result.totalCost, job.label);
    assert.ok(result.totalHours > 0, job.label);
  }
});
