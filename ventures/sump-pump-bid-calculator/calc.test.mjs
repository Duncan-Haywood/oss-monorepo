import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  formatBidSummary,
  suggestedPumpKit,
  suggestedPitKit,
  suggestedBackupKit,
  JOB_PRESETS,
  PUMP_PRESETS,
  PIT_PRESETS,
  BACKUP_PRESETS,
} from './calc.mjs';

const rates = () => ({
  hoursTrip: 0.85,
  hoursSwap: 1.1,
  hoursNewPit: 0,
  hoursSlabCut: 0,
  hoursPerExtraDischargeFoot: 0.12,
  hoursBattery: 0,
  hoursWaterBackup: 0,
  hoursAlarm: 0.35,
  hoursFreeze: 0.45,
  siteHours: 0.5,
  pumpCost: 185,
  basinCost: 0,
  slabCutCost: 0,
  dischargePerFoot: 6.5,
  checkValveCost: 38,
  batteryCost: 0,
  waterBackupCost: 0,
  alarmCost: 45,
  freezeCost: 65,
  permitFee: 0,
  hourlyWage: 42,
  burdenRate: 34,
  travelAndEquipment: 85,
  overheadRate: 16,
  targetMargin: 30,
});

const brochure = () => ({
  ...rates(),
  pump: 'third-hp',
  pit: 'existing',
  backup: 'none',
  dischargeFeet: 15,
  includedDischargeFeet: 15,
  addAlarm: false,
  addCheckValve: true,
  freezeProtect: false,
});

const moneyLoser = () => ({
  ...rates(),
  pump: 'half-hp',
  pit: 'new-slab',
  backup: 'battery',
  dischargeFeet: 40,
  includedDischargeFeet: 15,
  addAlarm: true,
  addCheckValve: true,
  freezeProtect: false,
  hoursSwap: 1.25,
  hoursNewPit: 2.8,
  hoursSlabCut: 2.4,
  hoursBattery: 1.1,
  pumpCost: 265,
  basinCost: 95,
  slabCutCost: 285,
  batteryCost: 420,
});

test('brochure swap hours come from the trip, the swap, and the check valve — not from pit, backup, or extra discharge', () => {
  const result = calculateBid(brochure());
  assert.equal(result.pit, 'existing');
  assert.equal(result.backup, 'none');
  assert.equal(result.extraDischargeFeet, 0);
  assert.equal(result.tripHours, 0.85);
  assert.equal(result.swapHours, 1.1);
  assert.equal(result.pitHours, 0);
  assert.equal(result.slabHours, 0);
  assert.equal(result.dischargeHours, 0);
  assert.equal(result.backupHours, 0);
  assert.equal(result.alarmHours, 0);
  assert.equal(result.freezeHours, 0);
  assert.equal(result.dischargeMaterial, 0);
  assert.equal(result.backupMaterial, 0);
  assert.equal(result.alarmMaterial, 0);
  assert.ok(Math.abs(result.pumpMaterial - 185) < 1e-9);
  assert.ok(Math.abs(result.valveMaterial - 38) < 1e-9);
});

test('new pit, slab cut, extra discharge, battery, and alarm do not scale with the trip charge', () => {
  const result = calculateBid(moneyLoser());
  assert.equal(result.pit, 'new-slab');
  assert.equal(result.backup, 'battery');
  assert.equal(result.extraDischargeFeet, 25);
  assert.equal(result.addAlarm, true);
  assert.ok(Math.abs(result.pitHours - 2.8) < 1e-9);
  assert.ok(Math.abs(result.slabHours - 2.4) < 1e-9);
  assert.ok(Math.abs(result.dischargeHours - 25 * 0.12) < 1e-9);
  assert.ok(Math.abs(result.backupHours - 1.1) < 1e-9);
  assert.ok(Math.abs(result.alarmHours - 0.35) < 1e-9);
  assert.ok(Math.abs(result.pumpMaterial - 265) < 1e-9);
  assert.ok(Math.abs(result.pitMaterial - (95 + 285)) < 1e-9);
  assert.ok(Math.abs(result.dischargeMaterial - 25 * 6.5) < 1e-9);
  assert.ok(Math.abs(result.backupMaterial - 420) < 1e-9);
  assert.ok(Math.abs(result.alarmMaterial - 45) < 1e-9);
  assert.ok(result.packageHours > result.tripHours);
});

test('a new-pit-and-battery job prices well above the brochure special despite the same trip', () => {
  const special = calculateBid(brochure());
  const heavy = calculateBid(moneyLoser());
  assert.equal(special.tripHours, heavy.tripHours);
  assert.ok(heavy.price > special.price * 2.5, 'the slab-and-battery house is a different job');
  assert.ok(heavy.totalHours > special.totalHours * 2.5);
  assert.ok(heavy.materialCost > special.materialCost);
});

test('price stacks burden, materials, overhead, then margin as a share of price', () => {
  const result = calculateBid(brochure());
  assert.ok(Math.abs(result.loadedWage - 42 * 1.34) < 1e-9);

  const expectedHours = 0.85 + 1.1 + 0.5;
  assert.ok(Math.abs(result.totalHours - expectedHours) < 1e-9);
  assert.ok(Math.abs(result.laborCost - expectedHours * 42 * 1.34) < 1e-9);

  const expectedMaterials = 185 + 38;
  assert.ok(Math.abs(result.materialCost - expectedMaterials) < 1e-9);
  assert.ok(Math.abs(result.directCost - (result.laborCost + result.materialCost + 85)) < 1e-9);
  assert.ok(Math.abs(result.overhead - result.directCost * 0.16) < 1e-9);
  assert.ok(Math.abs(result.totalCost - result.directCost * 1.16) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 30) < 1e-9);
  assert.equal(result.breakEvenPrice, result.totalCost);
});

test('a zero-margin bid prices at cost', () => {
  const result = calculateBid({ ...brochure(), targetMargin: 0 });
  assert.ok(Math.abs(result.price - result.totalCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
});

test('a proposed price is scored against the same cost base', () => {
  const bid = calculateBid(brochure());
  const scored = calculateBid({ ...brochure(), proposedPrice: bid.price });
  assert.ok(Math.abs(scored.proposed.margin - 30) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.hourlyRate - bid.effectiveHourlyRate) < 1e-9);
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const bid = calculateBid(brochure());
  const scored = calculateBid({ ...brochure(), proposedPrice: bid.totalCost - 40 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(brochure()).proposed, null);
  assert.equal(calculateBid({ ...brochure(), proposedPrice: '' }).proposed, null);
  assert.equal(calculateBid({ ...brochure(), proposedPrice: null }).proposed, null);
  assert.equal(calculateBid({ ...brochure(), proposedPrice: 0 }).proposed.price, 0);
});

test('turning off pit, backup, extra discharge, and alarm drops those hours and kits', () => {
  const full = calculateBid(moneyLoser());
  const stripped = calculateBid({
    ...moneyLoser(),
    pump: 'third-hp',
    pit: 'existing',
    backup: 'none',
    hoursSwap: 1.1,
    hoursNewPit: 0,
    hoursSlabCut: 0,
    hoursBattery: 0,
    pumpCost: 185,
    basinCost: 0,
    slabCutCost: 0,
    batteryCost: 0,
    dischargeFeet: 15,
    addAlarm: false,
  });
  assert.equal(stripped.pitHours, 0);
  assert.equal(stripped.slabHours, 0);
  assert.equal(stripped.dischargeHours, 0);
  assert.equal(stripped.backupHours, 0);
  assert.equal(stripped.alarmHours, 0);
  assert.equal(stripped.backupMaterial, 0);
  assert.ok(stripped.price < full.price);
  assert.equal(full.extraDischargeFeet, 25);
  assert.ok(full.backupMaterial > 0);
});

test('a water-powered backup does not bill battery hours or kit when that flag is off', () => {
  const result = calculateBid({
    ...brochure(),
    backup: 'water-powered',
    hoursWaterBackup: 1.4,
    waterBackupCost: 380,
  });
  assert.equal(result.hoursBattery ?? 0, 0);
  assert.ok(Math.abs(result.backupHours - 1.4) < 1e-9);
  assert.ok(Math.abs(result.backupMaterial - 380) < 1e-9);
  assert.equal(result.batteryMaterial ?? 0, 0);
});

test('a shorter discharge run than the included footage still prices — extra footage is zero', () => {
  const result = calculateBid({ ...brochure(), dischargeFeet: 8 });
  assert.equal(result.extraDischargeFeet, 0);
  assert.equal(result.dischargeHours, 0);
  assert.equal(result.dischargeMaterial, 0);
});

test('suggested kits match the shipped presets', () => {
  assert.deepEqual(suggestedPumpKit('third-hp'), { pumpCost: 185, hoursSwap: 1.1 });
  assert.deepEqual(suggestedPumpKit('half-hp'), { pumpCost: 265, hoursSwap: 1.25 });
  assert.deepEqual(suggestedPumpKit('three-quarter-hp'), { pumpCost: 385, hoursSwap: 1.4 });
  assert.deepEqual(suggestedPitKit('existing'), {
    hoursNewPit: 0, hoursSlabCut: 0, basinCost: 0, slabCutCost: 0,
  });
  assert.deepEqual(suggestedPitKit('new-dirt'), {
    hoursNewPit: 2.8, hoursSlabCut: 0, basinCost: 95, slabCutCost: 0,
  });
  assert.deepEqual(suggestedPitKit('new-slab'), {
    hoursNewPit: 2.8, hoursSlabCut: 2.4, basinCost: 95, slabCutCost: 285,
  });
  assert.deepEqual(suggestedBackupKit('none'), {
    hoursBattery: 0, hoursWaterBackup: 0, batteryCost: 0, waterBackupCost: 0,
  });
  assert.deepEqual(suggestedBackupKit('battery'), {
    hoursBattery: 1.1, hoursWaterBackup: 0, batteryCost: 420, waterBackupCost: 0,
  });
  assert.deepEqual(suggestedBackupKit('water-powered'), {
    hoursBattery: 0, hoursWaterBackup: 1.4, batteryCost: 0, waterBackupCost: 380,
  });
  assert.throws(() => suggestedPumpKit('one-hp'), /Unknown pump size/);
  assert.throws(() => suggestedPitKit('cistern'), /Unknown pit type/);
  assert.throws(() => suggestedBackupKit('generator'), /Unknown backup type/);
});

test('unknown pump, pit, or backup is rejected', () => {
  assert.throws(() => calculateBid({ ...brochure(), pump: 'one-hp' }), /Unknown pump size/);
  assert.throws(() => calculateBid({ ...brochure(), pit: 'cistern' }), /Unknown pit type/);
  assert.throws(() => calculateBid({ ...brochure(), backup: 'generator' }), /Unknown backup type/);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...brochure(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...brochure(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...brochure(), dischargeFeet: -1 }), /Discharge footage must be at least 0/);
});

test('job presets are usable and the slab house is not a markup on the special', () => {
  assert.ok(JOB_PRESETS.length >= 4);
  const special = JOB_PRESETS[0];
  const heavy = JOB_PRESETS[2];
  assert.equal(special.pump, 'third-hp');
  assert.equal(special.pit, 'existing');
  assert.equal(special.backup, 'none');
  assert.equal(heavy.pump, 'half-hp');
  assert.equal(heavy.pit, 'new-slab');
  assert.equal(heavy.backup, 'battery');
  assert.ok(heavy.dischargeFeet > special.dischargeFeet);
  assert.equal(heavy.addAlarm, true);
});

test('preset catalogs are labeled positive options', () => {
  for (const preset of [...PUMP_PRESETS, ...PIT_PRESETS, ...BACKUP_PRESETS]) {
    assert.ok(preset.label.length > 0);
    assert.ok(preset.id.length > 0);
  }
});

test('customer-facing summary omits wages and names the pit and backup', () => {
  const result = calculateBid(moneyLoser());
  const text = formatBidSummary(result, 'New pit through slab with battery backup');
  assert.match(text, /SUMP PUMP INSTALL BID/);
  assert.match(text, /1\/2 HP submersible/);
  assert.match(text, /New pit — concrete slab cut/);
  assert.match(text, /Battery backup/);
  assert.match(text, /40 ft/);
  assert.match(text, /high-water alarm included/);
  assert.doesNotMatch(text, /42/);
  assert.doesNotMatch(text, /wage/i);
});

test('an omitted payroll burden prices as zero burden', () => {
  const { burdenRate, ...rest } = brochure();
  const result = calculateBid(rest);
  assert.ok(Math.abs(result.laborCost - result.totalHours * 42) < 1e-9);
});

test('a $0 proposed price scores a 0% margin, not a made-up one', () => {
  assert.equal(calculateBid({ ...brochure(), proposedPrice: 0 }).proposed.margin, 0);
});

test('hour shares are all zero when the job has no hours', () => {
  const result = calculateBid({
    ...brochure(),
    hoursTrip: 0, hoursSwap: 0, hoursAlarm: 0, siteHours: 0, hoursFreeze: 0,
    hoursPerExtraDischargeFoot: 0,
  });
  assert.equal(result.totalHours, 0);
  assert.deepEqual(result.hourShares, { trip: 0, swap: 0, extras: 0, site: 0 });
});

test('feature flags accept form strings: "false", "0", "" and null are off, "true" and "1" are on', () => {
  for (const off of ['false', '0', '', null, 0, false]) {
    assert.equal(calculateBid({ ...brochure(), addAlarm: off }).addAlarm, false, `off: ${String(off)}`);
  }
  for (const on of ['true', '1', 1, true]) {
    assert.equal(calculateBid({ ...brochure(), addAlarm: on }).addAlarm, true, `on: ${String(on)}`);
  }
});
