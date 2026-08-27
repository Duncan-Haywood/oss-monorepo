import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  compareCellBids,
  formatBidSummary,
  suggestedAreaSf,
  suggestedAreaBf,
  suggestedOpenBf,
  suggestedClosedBf,
  suggestedRimBf,
  suggestedWastePercent,
  suggestedOrderBf,
  suggestedNominalR,
  suggestedHybridClosedInches,
  suggestedCellKit,
  suggestedAccessKit,
  suggestedBarrierKit,
  JOB_PRESETS,
  AREA_PRESETS,
  CELL_PRESETS,
  PITCH_PRESETS,
  BARRIER_PRESETS,
  ACCESS_PRESETS,
} from './calc.mjs';

const coupon = () => ({
  area: 'attic-floor',
  cell: 'open',
  pitch: '6/12',
  barrier: 'none',
  access: 'open',
  lengthFeet: 40,
  widthFeet: 30,
  thicknessInches: 8,
  areaSf: 1200,
  openBf: 9600,
  closedBf: 0,
  rimLf: 0,
  rimHeightInches: 9.25,
  rimThicknessInches: 3,
  rimBf: 0,
  wastePercent: 10,
  orderOpenBf: 10560,
  orderClosedBf: 0,
  hoursTrip: 2.5,
  hoursPer1000Bf: 1.4,
  hoursRimPerLf: 0.09,
  hoursBarrierPer100Sf: 0.8,
  hoursAccess: 0,
  siteHours: 0.8,
  foamPerBfOpen: 0.55,
  foamPerBfClosed: 1.25,
  barrierPerSf: 1.1,
  consumablesLump: 185,
  mobilizationFee: 275,
  permitFee: 185,
  hourlyWage: 32,
  burdenRate: 32,
  travelAndEquipment: 185,
  overheadRate: 15,
  targetMargin: 25,
  includePermit: false,
});

test('an attic floor is length × width; cathedral is pitch-adjusted; crawl is perimeter × height', () => {
  assert.equal(suggestedAreaSf(40, 30, 'attic-floor', '6/12'), 1200);
  assert.equal(suggestedAreaSf(80, 4, 'crawl-wall', '6/12'), 320);
  assert.ok(Math.abs(suggestedAreaSf(40, 36, 'cathedral', '6/12') - 40 * 36 * 1.118) < 1e-9);
  assert.ok(suggestedAreaSf(40, 36, 'cathedral', '12/12') > suggestedAreaSf(40, 36, 'cathedral', '6/12'));
});

test('board feet are square feet times inches — the unit an attic-sf coupon cannot see', () => {
  assert.equal(suggestedAreaBf(1200, 8), 9600);
  assert.equal(suggestedAreaBf(1800, 5.5), 9900);
  assert.equal(suggestedOpenBf(1200, 8, 'open'), 9600);
  assert.equal(suggestedClosedBf(1200, 8, 'open'), 0);
  assert.equal(suggestedOpenBf(1200, 8, 'closed'), 0);
  assert.equal(suggestedClosedBf(1800, 5.5, 'closed'), 9900);
});

test('hybrid is 1" closed plus open-cell fill, not a blended attic-sf guess', () => {
  assert.equal(suggestedHybridClosedInches('hybrid', 8), 1);
  assert.equal(suggestedClosedBf(1200, 8, 'hybrid'), 1200);
  assert.equal(suggestedOpenBf(1200, 8, 'hybrid'), 8400);
  assert.equal(suggestedOpenBf(1200, 8, 'hybrid') + suggestedClosedBf(1200, 8, 'hybrid'), 9600);
});

test('an 80 lf rim at 9.25" sprayed 3" is 185 board feet of closed-cell', () => {
  assert.equal(suggestedRimBf(80, 9.25, 3), 80 * (9.25 / 12) * 3);
  assert.equal(suggestedRimBf(0, 9.25, 3), 0);
  assert.equal(suggestedWastePercent('open'), 10);
  assert.equal(suggestedWastePercent('closed'), 8);
  assert.equal(suggestedWastePercent('hybrid'), 12);
  assert.equal(suggestedOrderBf(9600, 10), 10560);
});

test('nominal R is a starting figure from per-inch rates, not a code table', () => {
  assert.equal(suggestedNominalR(8, 'open'), 29.6);
  assert.equal(suggestedNominalR(5.5, 'closed'), 35.75);
  assert.equal(suggestedNominalR(8, 'hybrid'), 6.5 + 7 * 3.7);
});

test('the $3.50/sf special undercounts 8" of open-cell on a 1,200 sf attic', () => {
  const small = calculateBid(coupon());
  assert.equal(small.areaSf, 1200);
  assert.equal(small.openBf, 9600);
  assert.equal(small.orderOpenBf, 10560);
  assert.ok(small.pricePerAreaSf > 7 && small.pricePerAreaSf < 12, `open attic is ${small.pricePerAreaSf}/sf`);
  assert.ok(small.price > 4200, 'the $3,50/sf × 1,200 coupon does not cover 8" of open-cell');
  assert.ok(small.breakEvenPrice > 4200, 'walk-away is already above the coupon');
  assert.ok(small.foamShareOfDirect > 60, 'foam is most of the direct cost');
});

test('adding a closed-cell rim and an ignition coating is a different job than the attic coupon', () => {
  const plain = calculateBid(coupon());
  const rimBf = suggestedRimBf(80, 9.25, 3);
  const withRim = calculateBid({
    ...coupon(),
    barrier: 'intumescent',
    rimLf: 80,
    rimBf,
    orderClosedBf: suggestedOrderBf(rimBf, 10),
  });
  assert.ok(withRim.rimHours > 0);
  assert.ok(withRim.barrierHours > 0);
  assert.ok(withRim.price > plain.price);
  assert.ok(withRim.barrierMaterial > 0);
  assert.ok(withRim.closedMaterial > 0);
});

test('5.5" closed-cell on a cathedral is not the same $3.50/sf as 8" open-cell on a floor', () => {
  const attic = calculateBid(coupon());
  const roofSf = suggestedAreaSf(40, 36, 'cathedral', '6/12');
  const closedBf = suggestedClosedBf(roofSf, 5.5, 'closed');
  const cathedral = calculateBid({
    ...coupon(),
    area: 'cathedral',
    cell: 'closed',
    lengthFeet: 40,
    widthFeet: 36,
    thicknessInches: 5.5,
    areaSf: roofSf,
    openBf: 0,
    closedBf,
    wastePercent: 8,
    orderOpenBf: 0,
    orderClosedBf: suggestedOrderBf(closedBf, 8),
    hoursPer1000Bf: 1.8,
    barrier: 'intumescent',
    includePermit: true,
  });
  assert.ok(cathedral.areaSf > 1400);
  assert.ok(cathedral.closedMaterial > attic.openMaterial);
  assert.ok(cathedral.price > attic.price);
  assert.ok(cathedral.permitMaterial > 0);
});

test('a $4,200 proposed price on the coupon attic is underwater', () => {
  const scored = calculateBid({ ...coupon(), proposedPrice: 4200 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
});

test('a proposed price above walk-away reports the kept margin', () => {
  const scored = calculateBid({ ...coupon(), proposedPrice: 14000 });
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(scored.proposed.profit > 0);
  assert.ok(scored.proposed.margin > 20);
});

test('target margin at or above 100% is rejected', () => {
  assert.throws(() => calculateBid({ ...coupon(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...coupon(), targetMargin: 110 }), /less than 100/);
});

test('unknown kits and zero geometry are rejected', () => {
  assert.throws(() => calculateBid({ ...coupon(), cell: 'batt' }), /Unknown cell/);
  assert.throws(() => calculateBid({ ...coupon(), area: 'wall-cavity' }), /Unknown area/);
  assert.throws(() => calculateBid({ ...coupon(), lengthFeet: 0 }), /greater than zero/);
  assert.throws(() => suggestedAreaSf(40, 30, 'cathedral', '3/12'), /Unknown pitch/);
  assert.throws(() => suggestedAccessKit('ladder'), /Unknown access/);
  assert.throws(() => suggestedBarrierKit('paint'), /Unknown barrier/);
});

test('the customer-facing summary names board feet and omits wages', () => {
  const text = formatBidSummary(calculateBid(coupon()), JOB_PRESETS[0].label);
  assert.match(text, /SPRAY FOAM INSULATION BID/);
  assert.match(text, /1,200 sf attic/);
  assert.match(text, /9600 bf open/);
  assert.match(text, /not a construction specification/);
  assert.doesNotMatch(text, /32/);
  assert.doesNotMatch(text, /wage/i);
  assert.doesNotMatch(text, /burden/i);
});

test('job presets cover the coupon, the rim, the cathedral, and the crawl', () => {
  assert.equal(JOB_PRESETS.length, 4);
  assert.ok(JOB_PRESETS.some((job) => job.rimLf === 80 && job.barrier === 'intumescent'));
  assert.ok(JOB_PRESETS.some((job) => job.area === 'cathedral' && job.cell === 'closed'));
  assert.ok(JOB_PRESETS.some((job) => job.area === 'crawl-wall' && job.access === 'tight-crawl'));
  assert.ok(AREA_PRESETS.length >= 3);
  assert.ok(CELL_PRESETS.length === 3);
  assert.ok(PITCH_PRESETS.length === 4);
  assert.ok(BARRIER_PRESETS.length === 3);
  assert.ok(ACCESS_PRESETS.length === 3);
  const kit = suggestedCellKit('open');
  assert.equal(kit.hoursPer1000Bf, 1.4);
  assert.equal(kit.foamPerBfOpen, 0.55);
});

test('same attic, three cells: closed-cell is not the open-cell coupon', () => {
  const rows = compareCellBids(coupon());
  assert.equal(rows.length, 3);
  assert.equal(rows[0].cell, 'open');
  assert.equal(rows[0].selected, true);
  assert.equal(rows[0].vsSelected, 0);
  const closed = rows.find((row) => row.cell === 'closed');
  const hybrid = rows.find((row) => row.cell === 'hybrid');
  assert.ok(closed.price > rows[0].price, '8" closed-cell costs more than 8" open-cell');
  assert.ok(hybrid.price > rows[0].price, 'hybrid (1" closed + open fill) is not the open-cell coupon');
  assert.ok(closed.openBf === 0 && closed.closedBf === 9600);
  assert.equal(hybrid.openBf, 8400);
  assert.equal(hybrid.closedBf, 1200);
  const closedSelected = compareCellBids({ ...coupon(), cell: 'closed' });
  assert.equal(closedSelected.find((row) => row.cell === 'closed').selected, true);
  assert.ok(closedSelected.find((row) => row.cell === 'open').vsSelected < 0);
});

test('tight crawl access adds hours the attic-floor coupon never had', () => {
  const open = calculateBid(coupon());
  const crawl = calculateBid({
    ...coupon(),
    access: 'tight-crawl',
    hoursAccess: suggestedAccessKit('tight-crawl').extraHours,
  });
  assert.ok(crawl.totalHours > open.totalHours);
  assert.ok(crawl.price > open.price);
});
