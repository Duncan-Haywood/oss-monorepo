import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  compareMethods,
  formatBidSummary,
  JOB_PRESETS,
  METHOD_PRESETS,
  SURFACE_PRESETS,
  suggestedMethodKit,
  suggestedSurfaceKit,
} from './calc.mjs';

const COSTS = {
  hoursTrip: 1,
  hoursPerCleanout: 1.5,
  hoursBypass: 2,
  hoursPerFootLawnRestore: 0.04,
  siteHours: 0.75,
  trenchWidthFt: 1.5,
  cleanoutFitting: 95,
  bypassPumpRental: 175,
  permitFee: 150,
  hourlyWage: 42,
  burdenRate: 35,
  travelAndEquipment: 185,
  overheadRate: 18,
  targetMargin: 30,
};

function bid(overrides = {}) {
  const method = overrides.method ?? 'open-cut';
  const surface = overrides.surface ?? 'lawn';
  const diameterIn = overrides.diameterIn ?? 4;
  return calculateBid({
    ...COSTS,
    ...suggestedMethodKit(method, diameterIn),
    ...suggestedSurfaceKit(surface),
    method,
    surface,
    runFeet: 40,
    hardFeet: 0,
    depthFt: 5,
    diameterIn,
    laterals: 0,
    cleanouts: 1,
    pits: method === 'pipe-burst' ? 2 : 0,
    occupiedHouse: false,
    ...overrides,
  });
}

test('labor hours come from footage, depth, and restoration — not a flat per-foot special', () => {
  const result = bid();
  // Open-cut 40 ft at 5 ft bury: excavate 40 * 0.18 * (5/6) + pipe 40 * 0.06
  assert.ok(Math.abs(result.hoursExcavate - 40 * 0.18 * (5 / 6)) < 1e-9);
  assert.ok(Math.abs(result.hoursPipe - 2.4) < 1e-9);
  assert.ok(Math.abs(result.hoursRestore - 40 * 0.04) < 1e-9);
  assert.ok(result.totalHours > 12 && result.totalHours < 15);
  assert.equal(result.method, 'open-cut');
});

test('the same 80 ft under a driveway is a different job from 80 ft under lawn', () => {
  const lawn = bid({ runFeet: 80, hardFeet: 0, depthFt: 6, cleanouts: 0 });
  const driveway = bid({
    runFeet: 80,
    hardFeet: 80,
    depthFt: 6,
    cleanouts: 0,
    surface: 'driveway',
    ...suggestedSurfaceKit('driveway'),
  });
  assert.ok(driveway.hoursRestore > lawn.hoursRestore * 4);
  // Dump tickets are the same trench either way; the extra is asphalt
  // hours and patch material, so restoration dollars do not 4x.
  assert.ok(driveway.restorationCost > lawn.restorationCost * 2);
  assert.ok(driveway.price > lawn.price + 2000);
  assert.ok(driveway.shares.restore > 20, `driveway restore is only ${driveway.shares.restore.toFixed(1)}% of cost`);
});

test('price stacks burden, materials, overhead, then margin as a share of price', () => {
  const result = bid();
  assert.equal(result.loadedWage, 42 * 1.35);
  const direct = result.laborCost + result.materialCost + result.travelAndEquipment;
  assert.ok(Math.abs(result.directCost - direct) < 1e-9);
  assert.ok(Math.abs(result.overhead - direct * 0.18) < 1e-9);
  assert.ok(Math.abs(result.totalCost - direct * 1.18) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 30) < 1e-9);
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
  assert.ok(Math.abs(scored.proposed.margin - 30) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
});

test('CIPP skips excavation and surface restore; laterals become the expensive part', () => {
  const lined = bid({
    method: 'cipp',
    runFeet: 120,
    hardFeet: 0,
    depthFt: 6,
    diameterIn: 6,
    laterals: 3,
    cleanouts: 0,
    occupiedHouse: true,
    ...suggestedMethodKit('cipp', 6),
    ...suggestedSurfaceKit('lawn'),
  });
  assert.equal(lined.hoursExcavate, 0);
  assert.equal(lined.hoursRestore, 0);
  assert.equal(lined.pipeMaterial, 0);
  assert.ok(lined.linerMaterial > 0);
  assert.ok(lined.hoursLaterals > lined.hoursCipp * 0.4);
  assert.ok(lined.hoursOccupied > 0);
  assert.equal(lined.bypassMaterial, 175);
});

test('pipe-burst restores pits, not the whole driveway', () => {
  const burst = bid({
    method: 'pipe-burst',
    surface: 'driveway',
    runFeet: 80,
    hardFeet: 80,
    depthFt: 6,
    laterals: 2,
    cleanouts: 0,
    pits: 2,
    ...suggestedMethodKit('pipe-burst', 4),
    ...suggestedSurfaceKit('driveway'),
  });
  const open = bid({
    method: 'open-cut',
    surface: 'driveway',
    runFeet: 80,
    hardFeet: 80,
    depthFt: 6,
    laterals: 2,
    cleanouts: 0,
    ...suggestedMethodKit('open-cut', 4),
    ...suggestedSurfaceKit('driveway'),
  });
  assert.ok(burst.hoursRestore < open.hoursRestore);
  assert.ok(burst.restoreMaterial < open.restoreMaterial);
  assert.equal(burst.hoursPits, 2 * 2.75);
  assert.ok(burst.hoursBurst > 0);
});

test('compareMethods shows trenchless beating open-cut on an 80 ft driveway', () => {
  const rows = compareMethods({
    ...COSTS,
    surface: 'driveway',
    runFeet: 80,
    hardFeet: 80,
    depthFt: 6,
    diameterIn: 4,
    laterals: 2,
    cleanouts: 1,
    pits: 2,
    occupiedHouse: false,
    hoursPerFootLawnRestore: 0.04,
    hoursPerCleanout: 1.5,
    hoursBypass: 2,
  });
  assert.equal(rows.length, 3);
  const open = rows.find((row) => row.method === 'open-cut');
  const cheapestTrenchless = rows.find((row) => row.method !== 'open-cut' && row.cheapest)
    ?? rows.find((row) => row.method !== 'open-cut');
  assert.ok(open.price > cheapestTrenchless.price);
  assert.ok(open.restoreShare > cheapestTrenchless.restoreShare);
  assert.equal(rows.filter((row) => row.cheapest).length, 1);
  assert.equal(rows[0].delta, 0);
});

test('compareMethods keeps open-cut competitive on a short lawn run', () => {
  const rows = compareMethods({
    ...COSTS,
    surface: 'lawn',
    runFeet: 40,
    hardFeet: 0,
    depthFt: 5,
    diameterIn: 4,
    laterals: 0,
    cleanouts: 1,
    pits: 2,
    occupiedHouse: false,
    hoursPerFootLawnRestore: 0.04,
    hoursPerCleanout: 1.5,
    hoursBypass: 2,
  });
  const open = rows.find((row) => row.method === 'open-cut');
  const cipp = rows.find((row) => row.method === 'cipp');
  assert.ok(open.price < cipp.price, 'a 40 ft lawn job should not lose to lining');
});

test('formatBidSummary is customer-facing and omits wages', () => {
  const text = formatBidSummary(bid(), '40 ft open-cut under lawn');
  assert.match(text, /SEWER LINE REPLACEMENT BID/);
  assert.match(text, /40 ft of 4-inch line/);
  assert.doesNotMatch(text, /42/);
  assert.doesNotMatch(text, /wage/i);
  assert.match(text, /not a plumbing specification/);
});

test('job presets cover the three methods and the driveway contrast', () => {
  assert.equal(JOB_PRESETS.length, 4);
  const methods = new Set(JOB_PRESETS.map((job) => job.method));
  assert.deepEqual([...methods].sort(), ['cipp', 'open-cut', 'pipe-burst']);
  assert.ok(JOB_PRESETS.some((job) => job.surface === 'driveway' && job.hardFeet === job.runFeet));
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => bid({ runFeet: 0 }), /Run footage must be greater than zero/);
  assert.throws(() => bid({ hardFeet: 50, runFeet: 40 }), /cannot exceed the run footage/);
  assert.throws(() => bid({ method: 'laser' }), /Unknown replacement method/);
  assert.throws(() => bid({ surface: 'brick' }), /Unknown surface/);
  assert.throws(() => bid({ diameterIn: 8 }), /4 or 6/);
  assert.throws(() => bid({ laterals: 1.5 }), /whole number/);
  assert.throws(() => bid({ hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => bid({ targetMargin: 100 }), /less than 100/);
  assert.throws(() => bid({ overheadRate: -1 }), /Overhead must be at least 0/);
  assert.throws(() => suggestedMethodKit('laser'), /Unknown replacement method/);
  assert.throws(() => suggestedSurfaceKit('brick'), /Unknown surface/);
});

test('presets are usable positive figures', () => {
  assert.ok(METHOD_PRESETS.length === 3);
  assert.ok(SURFACE_PRESETS.length === 4);
  for (const method of METHOD_PRESETS) {
    const kit = suggestedMethodKit(method.id, 4);
    for (const value of Object.values(kit)) {
      assert.ok(Number.isFinite(value) && value >= 0);
    }
  }
});
