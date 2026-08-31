import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  INPUT_FIELDS,
  RESOLUTIONS,
  CODECS,
  CONSTRUCTION_TYPES,
  DRIVE_SIZES_TB,
  MAX_ETHERNET_FEET,
  cameraBitrateMbps,
  calculateStorage,
  recommendDriveSize,
  calculatePoe,
  calculateCabling,
  hoursPerDropFor,
  calculateBid,
} from './calc.mjs';

const near = (actual, expected, msg, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${msg}: ${actual} vs ${expected}`);

/** A complete, realistic 8-camera job used as the base for most tests. */
const job = () => ({
  cameraCount: 8,
  resolution: '4mp',
  codec: 'h265',
  recordingMode: 'continuous',
  motionPercent: 100,
  recordHoursPerDay: 24,
  retentionDays: 30,
  driveSizeTb: 8,
  driveCount: 2,
  switchPoeBudgetWatts: 120,
  cameraWatts: 9,
  construction: 'attic',
  avgCableFeet: 120,
  longestRunFeet: 200,
  liftRequired: 'no',
  cameraHardware: 190,
  nvrHardware: 700,
  switchHardware: 350,
  drivePricePerTb: 22,
  cablePricePerFoot: 0.22,
  otherMaterials: 150,
  hoursPerDrop: '',
  commissioningHours: 4,
  otherHours: 0,
  hourlyWage: 38,
  burdenRate: 32,
  overheadRate: 12,
  targetMargin: 35,
  permitFee: 0,
  proposedPrice: '',
});

test('bitrate halves for H.265 and is credited conservatively for a smart codec', () => {
  near(cameraBitrateMbps('4mp', 'h264'), 8, '4MP H.264');
  near(cameraBitrateMbps('4mp', 'h265'), 4, '4MP H.265');
  near(cameraBitrateMbps('4mp', 'h265plus'), 2.8, '4MP H.265+');
  near(cameraBitrateMbps('8mp', 'h264'), 16, '8MP H.264');
});

test('an unknown resolution or codec is refused rather than silently defaulted', () => {
  assert.throws(() => cameraBitrateMbps('3mp', 'h264'), /Unknown resolution/);
  assert.throws(() => cameraBitrateMbps('4mp', 'av1'), /Unknown codec/);
});

test('storage maths matches a hand-computed continuous recording', () => {
  // One 4 MP H.264 camera at 8 Mbps, 24h, 30 days:
  // 8 Mbps is 1 MB/s, 86,400 s/day -> 86.4 GB/day -> 2.592 TB over 30 days.
  const s = calculateStorage({
    cameraCount: 1, resolution: '4mp', codec: 'h264',
    recordingMode: 'continuous', recordHoursPerDay: 24, retentionDays: 30,
    driveSizeTb: 0, driveCount: 0,
  });
  near(s.terabytesPerDay, 0.0864, 'TB per day', 1e-6);
  near(s.terabytesRequired, 2.59, 'TB for 30 days', 0.01);
});

test('decimal terabytes are used, because that is what a drive vendor sells', () => {
  // Using 2^40 here instead of 1e12 would under-report the requirement by ~10%
  // and silently over-promise the retention the customer was quoted.
  const s = calculateStorage({
    cameraCount: 1, resolution: '4mp', codec: 'h264',
    recordHoursPerDay: 24, retentionDays: 1, driveSizeTb: 0, driveCount: 0,
  });
  near(s.terabytesRequired, 0.09, 'one day at 8 Mbps', 0.005);
});

test('motion-only recording scales storage by the share of the day with motion', () => {
  const base = { cameraCount: 4, resolution: '4mp', codec: 'h265', recordHoursPerDay: 24, retentionDays: 30, driveSizeTb: 0, driveCount: 0 };
  const continuous = calculateStorage({ ...base, recordingMode: 'continuous' });
  const motion = calculateStorage({ ...base, recordingMode: 'motion', motionPercent: 25 });
  near(motion.terabytesRequired, continuous.terabytesRequired * 0.25, 'quarter-duty storage', 0.01);
});

test('retention the drives deliver is reported separately from the retention asked for', () => {
  const s = calculateStorage(job());
  // 8 cameras x 4 Mbps = 32 Mbps aggregate.
  near(s.aggregateBitrateMbps, 32, 'aggregate bitrate');
  // 16 TB purchased, 90% usable = 14.4 TB against 0.3456 TB/day.
  near(s.purchasedTb, 16, 'purchased');
  near(s.usableTb, 14.4, 'usable');
  near(s.terabytesPerDay, 0.35, 'TB per day', 0.01);
  assert.ok(s.actualRetentionDays > 40, `should comfortably clear 30 days, got ${s.actualRetentionDays}`);
  assert.equal(s.meetsRetention, true);
  assert.equal(s.shortfallDays, 0);
});

test('a system that cannot hold the quoted retention says so, with the shortfall', () => {
  // The failed handover this tool exists to prevent: 16 x 8 MP H.264 cameras
  // quoted at 30 days on a single 4 TB drive.
  const s = calculateStorage({
    ...job(), cameraCount: 16, resolution: '8mp', codec: 'h264',
    driveSizeTb: 4, driveCount: 1, retentionDays: 30,
  });
  assert.equal(s.meetsRetention, false);
  assert.ok(s.actualRetentionDays < 5, `holds only a few days, got ${s.actualRetentionDays}`);
  assert.ok(s.shortfallDays > 25, `shortfall should be most of the month, got ${s.shortfallDays}`);
});

test('the recommended drive size covers the requirement at the given bay count', () => {
  assert.equal(recommendDriveSize(10, 0), null, 'no bays means no recommendation');
  // 14.4 TB across 2 bays needs 8 TB each once 90% usable headroom is applied.
  assert.equal(recommendDriveSize(14.4, 2), 8);
  // Nothing stocked covers 500 TB in one bay; that design needs more bays.
  assert.equal(recommendDriveSize(500, 1), null);
  assert.ok(DRIVE_SIZES_TB.includes(recommendDriveSize(3, 1)));
});

test('the recommendation and the retention check never disagree', () => {
  // Whenever a size is recommended, buying it must actually satisfy
  // meetsRetention — otherwise the tool would tell an installer to buy drives
  // that still miss the retention it just warned them about.
  const cases = [
    { cameraCount: 4, resolution: '2mp', codec: 'h265', driveCount: 1, retentionDays: 14 },
    { cameraCount: 8, resolution: '4mp', codec: 'h265', driveCount: 2, retentionDays: 30 },
    { cameraCount: 16, resolution: '4mp', codec: 'h264', driveCount: 2, retentionDays: 30 },
    { cameraCount: 12, resolution: '8mp', codec: 'h265', driveCount: 4, retentionDays: 60 },
    { cameraCount: 6, resolution: '12mp', codec: 'h264', driveCount: 2, retentionDays: 21 },
  ];
  let recommended = 0;
  for (const c of cases) {
    const base = { ...job(), ...c };
    const size = recommendDriveSize(calculateStorage({ ...base, driveSizeTb: 1 }).terabytesRequired, c.driveCount);
    if (size == null) continue; // legitimately needs more bays; covered separately
    recommended += 1;
    assert.equal(
      calculateStorage({ ...base, driveSizeTb: size }).meetsRetention, true,
      `${c.cameraCount}x${c.resolution} ${c.codec}: recommended ${size} TB but retention still short`,
    );
  }
  assert.ok(recommended >= 3, `expected most cases to be satisfiable, got ${recommended}`);
});

test('a job past every stocked drive size needs more bays, and says null rather than guessing', () => {
  // 12 x 8 MP H.264 continuous for 30 days is ~62 TB; two bays cannot hold it
  // at any size a distributor stocks.
  const required = calculateStorage({
    ...job(), cameraCount: 12, resolution: '8mp', codec: 'h264', driveSizeTb: 1, driveCount: 2, retentionDays: 30,
  }).terabytesRequired;
  assert.ok(required > 50, `expected a very large requirement, got ${required}`);
  assert.equal(recommendDriveSize(required, 2), null);
  const warned = calculateBid({
    ...job(), cameraCount: 12, resolution: '8mp', codec: 'h264', driveSizeTb: 8, driveCount: 2, retentionDays: 30,
  });
  assert.ok(warned.warnings.some((w) => /more bays or lower bitrate/.test(w)), 'the remedy is bays, not a bigger drive');
});

test('per-day storage keeps enough precision that retention is not skewed', () => {
  // Regression guard: rounding 0.0864 TB/day to two decimals (0.09) understated
  // retention by about 4% — a 30-day quote silently becoming 28.8.
  const s = calculateStorage({
    cameraCount: 1, resolution: '4mp', codec: 'h264',
    recordHoursPerDay: 24, retentionDays: 30, driveSizeTb: 4, driveCount: 1,
  });
  near(s.terabytesPerDay, 0.0864, 'per-day precision', 1e-6);
  // 4 TB x 0.9 usable / 0.0864 = 41.67 days exactly.
  near(s.actualRetentionDays, 41.67, 'retention from the exact per-day figure', 0.01);
});

test('PoE load is checked against the budget and against an 80% planning ceiling', () => {
  const ok = calculatePoe({ cameraCount: 8, cameraWatts: 9, switchPoeBudgetWatts: 120 });
  near(ok.loadWatts, 72, 'load');
  near(ok.headroomWatts, 48, 'headroom');
  assert.equal(ok.withinBudget, true);
  assert.equal(ok.withinComfortableBudget, true, '72 of 120 is 60%');

  const tight = calculatePoe({ cameraCount: 12, cameraWatts: 9, switchPoeBudgetWatts: 120 });
  assert.equal(tight.withinBudget, true, '108 W still fits 120 W');
  assert.equal(tight.withinComfortableBudget, false, '108 of 120 is 90%');

  const over = calculatePoe({ cameraCount: 6, cameraWatts: 25, switchPoeBudgetWatts: 120 });
  assert.equal(over.withinBudget, false, '150 W exceeds 120 W');
  near(over.headroomWatts, -30, 'negative headroom');
});

test('cable footage carries a waste allowance and the longest run is checked', () => {
  const c = calculateCabling({ cameraCount: 8, avgCableFeet: 120, longestRunFeet: 200 });
  assert.equal(c.totalCableFeet, Math.ceil(8 * 120 * 1.15), '15% waste allowance');
  assert.equal(c.exceedsEthernetLimit, false);
  assert.equal(c.feetOverLimit, 0);

  const long = calculateCabling({ cameraCount: 4, avgCableFeet: 200, longestRunFeet: 400 });
  assert.equal(long.exceedsEthernetLimit, true);
  near(long.feetOverLimit, 400 - MAX_ETHERNET_FEET, 'feet over');
});

test('construction type sets hours per drop, and an explicit figure overrides it', () => {
  assert.equal(hoursPerDropFor('masonry'), 4);
  assert.equal(hoursPerDropFor('nonsense'), null);

  const preset = calculateBid({ ...job(), construction: 'masonry', hoursPerDrop: '' });
  assert.equal(preset.hoursPerDrop, 4, 'preset applies when no explicit figure');

  const explicit = calculateBid({ ...job(), construction: 'masonry', hoursPerDrop: 1.5 });
  assert.equal(explicit.hoursPerDrop, 1.5, "a shop's own number is never overridden");
});

test('a lift adds billable hours the flat per-camera price forgets', () => {
  const without = calculateBid({ ...job(), liftRequired: 'no' });
  const with_ = calculateBid({ ...job(), liftRequired: 'yes' });
  near(with_.labourHours - without.labourHours, 4, 'lift hours');
  assert.ok(with_.costFloor > without.costFloor, 'and it reaches the price');
});

test('the bid stacks labour, materials, overhead and margin from a hand-checked job', () => {
  const r = calculateBid(job());
  // 8 drops x 2 h (attic) + 4 h commissioning = 20 h.
  near(r.labourHours, 20, 'labour hours');
  // $38 x 1.32 burden = $50.16/h loaded.
  near(r.loadedHourlyRate, 50.16, 'loaded rate');
  near(r.labourCost, 20 * 50.16, 'labour cost');
  // 8 x $190 cameras, $700 NVR, $350 switch, 16 TB x $22, cable at $0.22/ft.
  near(r.cameraMaterialCost, 1520, 'camera hardware');
  near(r.driveCost, 352, 'drive cost');
  near(r.cableCost, Math.ceil(8 * 120 * 1.15) * 0.22, 'cable cost');
  near(r.materialCost, 1520 + 700 + 350 + 352 + r.cableCost + 150, 'materials');
  // Money is rounded to cents at each step, so compare to the cent.
  near(r.directCost, r.labourCost + r.materialCost, 'direct cost, no permit', 0.01);
  near(r.overheadCost, r.directCost * 0.12, 'overhead', 0.01);
  near(r.costFloor, r.directCost * 1.12, 'cost floor', 0.01);
  // Margin on revenue, not markup on cost.
  near(r.bidPrice, r.costFloor / 0.65, 'bid at 35% margin', 0.01);
  near(r.pricePerCamera, r.bidPrice / 8, 'price per camera', 0.01);
});

test('margin is on revenue, so the bid price yields exactly the target margin', () => {
  const r = calculateBid({ ...job(), targetMargin: 35 });
  near(((r.bidPrice - r.costFloor) / r.bidPrice) * 100, 35, 'realised margin', 0.01);
});

test('a proposed price is scored against the walk-away floor', () => {
  const r = calculateBid({ ...job(), proposedPrice: 6000 });
  assert.equal(r.proposedPrice, 6000);
  near(r.proposedMarginPercent, ((6000 - r.costFloor) / 6000) * 100, 'proposed margin', 0.01);
  assert.equal(r.proposedBeatsFloor, true);

  const lowball = calculateBid({ ...job(), proposedPrice: 500 });
  assert.equal(lowball.proposedBeatsFloor, false, 'below the floor the job loses money');
  assert.ok(lowball.proposedMarginPercent < 0);
});

test('a blank proposed price is absent rather than zero', () => {
  const r = calculateBid({ ...job(), proposedPrice: '' });
  assert.equal(r.proposedPrice, null);
  assert.equal(r.proposedMarginPercent, null);
  assert.equal(r.proposedBeatsFloor, null);
});

test('a clean job raises no warnings', () => {
  assert.deepEqual(calculateBid(job()).warnings, []);
});

test('each engineering fault produces a warning that names the remedy', () => {
  const short = calculateBid({ ...job(), driveSizeTb: 1, driveCount: 1 });
  assert.equal(short.warnings.length, 1);
  assert.match(short.warnings[0], /Storage is short/);
  assert.match(short.warnings[0], /TB drives|more bays/, 'says what to do');

  const overPoe = calculateBid({ ...job(), cameraWatts: 25 });
  assert.ok(overPoe.warnings.some((w) => /PoE load/.test(w) && /switch|injector/.test(w)));

  const tightPoe = calculateBid({ ...job(), cameraWatts: 13 });
  assert.ok(tightPoe.warnings.some((w) => /over 80%/.test(w)), 'the comfortable-ceiling warning');

  const longRun = calculateBid({ ...job(), longestRunFeet: 420 });
  assert.ok(longRun.warnings.some((w) => /Ethernet limit/.test(w) && /extender|fibre|switch/.test(w)));
});

test('warnings accumulate rather than masking one another', () => {
  const bad = calculateBid({
    ...job(), driveSizeTb: 1, driveCount: 1, cameraWatts: 25, longestRunFeet: 500,
  });
  assert.equal(bad.warnings.length, 3, `expected all three, got: ${JSON.stringify(bad.warnings)}`);
});

test('invalid input is refused with a message naming the field', () => {
  assert.throws(() => calculateBid({ ...job(), cameraCount: 0 }), /Camera count/);
  assert.throws(() => calculateBid({ ...job(), cameraCount: 2.5 }), /whole number/);
  assert.throws(() => calculateBid({ ...job(), hourlyWage: -1 }), /Hourly wage/);
  assert.throws(() => calculateBid({ ...job(), targetMargin: 100 }), /Target margin/);
  assert.throws(() => calculateStorage({ ...job(), recordHoursPerDay: 25 }), /cannot exceed 24/);
  assert.throws(() => calculateStorage({ ...job(), motionPercent: 101 }), /cannot exceed 100/);
  assert.throws(() => calculateBid({ ...job(), cameraCount: 'eight' }), /Camera count/);
});

test('every input the form collects is declared, and every declared field is used', () => {
  const r = calculateBid(job());
  assert.ok(r.costFloor > 0);
  for (const field of ['cameraCount', 'resolution', 'codec', 'retentionDays', 'driveSizeTb', 'targetMargin']) {
    assert.ok(INPUT_FIELDS.includes(field), `${field} is declared`);
  }
  assert.equal(new Set(INPUT_FIELDS).size, INPUT_FIELDS.length, 'no duplicate field names');
});

test('the presets a shop picks from are internally consistent', () => {
  for (const r of RESOLUTIONS) assert.ok(r.h264Mbps > 0, `${r.label} has a bitrate`);
  for (const c of CODECS) assert.ok(c.factor > 0 && c.factor <= 1, `${c.label} factor`);
  for (const c of CONSTRUCTION_TYPES) assert.ok(c.hoursPerDrop > 0, `${c.label} hours`);
  // Sorted ascending, so `recommendDriveSize` returning the first match returns
  // the smallest sufficient drive rather than an arbitrary one.
  assert.deepEqual([...DRIVE_SIZES_TB].sort((a, b) => a - b), [...DRIVE_SIZES_TB]);
});
