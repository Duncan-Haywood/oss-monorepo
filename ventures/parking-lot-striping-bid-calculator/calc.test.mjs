import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  compareAda,
  compareCoats,
  compareLayout,
  formatBidSummary,
  stallLineLf,
  adaExtraLineLf,
  crosswalkAreaSqFt,
  stencilAreaSqFt,
  gallonsForLines,
  gallonsForArea,
  suggestedKit,
  JOB_PRESETS,
  LAYOUT_PRESETS,
} from './calc.mjs';

const retail = () => ({
  layout: 'restripe',
  standardStalls: 48,
  adaStalls: 2,
  arrows: 8,
  stopBars: 2,
  crosswalks: 0,
  handicapSymbols: 2,
  fireLaneFeet: 0,
  curbPaintFeet: 0,
  coats: 1,
  nightWork: false,
  hourlyWage: 28,
  burdenRate: 28,
  overheadRate: 15,
  targetMargin: 25,
  otherCost: 0,
  ...suggestedKit('restripe'),
});

const newLayoutShop = () => ({
  ...retail(),
  layout: 'new',
  standardStalls: 114,
  adaStalls: 6,
  arrows: 24,
  stopBars: 6,
  crosswalks: 2,
  handicapSymbols: 6,
  fireLaneFeet: 240,
  curbPaintFeet: 200,
  coats: 2,
  nightWork: true,
  ...suggestedKit('new'),
});

test('stall lines come from stall count, not lot square footage', () => {
  assert.equal(stallLineLf(50, 18), 900);
  assert.equal(stallLineLf(0, 18), 0);
});

test('ADA hash is extra line a per-stall special never sees', () => {
  assert.equal(adaExtraLineLf(4, 70), 280);
  assert.equal(adaExtraLineLf(0, 70), 0);
});

test('crosswalk area is bars times width times crossing, not a stall count', () => {
  // 2 crossings × 8 bars × 2 ft × 24 ft
  assert.equal(crosswalkAreaSqFt(2, 8, 2, 24), 768);
});

test('stencil area scales with count', () => {
  assert.equal(stencilAreaSqFt(8, 6, 'Arrows'), 48);
});

test('paint gallons multiply by coats and reject a free gallon', () => {
  assert.equal(gallonsForLines(360, 360, 1), 1);
  assert.equal(gallonsForLines(360, 360, 2), 2);
  assert.equal(gallonsForArea(110, 110, 2), 2);
  assert.throws(() => gallonsForLines(100, 0, 1), /greater than zero/);
  assert.throws(() => gallonsForArea(100, 110, 0), /greater than zero/);
});

test('labor hours come from lines, ADA, and stencils, not stall count alone', () => {
  const result = calculateBid(retail());
  assert.equal(result.totalStalls, 50);
  assert.equal(result.stallLf, 50 * 18);
  assert.equal(result.adaHashLf, 2 * 70);
  // Two ADA stalls add hash the 48 regular stalls do not.
  assert.ok(result.adaHashLf > 0);
  assert.ok(result.hoursAda > 0);
  assert.ok(result.hoursArrows > 0);
  assert.ok(result.totalHours > result.hoursLines);
});

test('ADA stalls consume paint and labor out of proportion to their count', () => {
  const result = calculateBid(retail());
  const adaShareOfStalls = result.adaStalls / result.totalStalls * 100;
  const adaLineShare = result.adaHashLf / result.lineLf * 100;
  assert.ok(adaShareOfStalls < 5, `ADA is ${adaShareOfStalls.toFixed(1)}% of stalls`);
  assert.ok(adaLineShare > 12, `but hash is only ${adaLineShare.toFixed(1)}% of the line`);
});

test('price stacks burden, paint, overhead, then margin as a share of price', () => {
  const result = calculateBid(retail());
  assert.equal(result.loadedWage, 28 * 1.28);
  assert.ok(result.paintCost > 0);
  assert.ok(result.signCost > 0);

  const direct = result.laborCost + result.materialCost + result.softCost;
  assert.ok(Math.abs(result.directCost - direct) < 1e-9);
  assert.ok(Math.abs(result.overhead - direct * 0.15) < 1e-9);
  assert.ok(Math.abs(result.totalCost - direct * 1.15) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 25) < 1e-9);
});

test('a zero-margin bid prices at cost', () => {
  const result = calculateBid({ ...retail(), targetMargin: 0 });
  assert.ok(Math.abs(result.price - result.totalCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
});

test('a proposed price is scored against the same cost base', () => {
  const bid = calculateBid(retail());
  const scored = calculateBid({ ...retail(), proposedPrice: bid.price });
  assert.ok(Math.abs(scored.proposed.margin - 25) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.hourlyRate - bid.effectiveHourlyRate) < 1e-9);
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const bid = calculateBid(retail());
  const scored = calculateBid({ ...retail(), proposedPrice: bid.totalCost - 100 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(retail()).proposed, null);
  assert.equal(calculateBid({ ...retail(), proposedPrice: '' }).proposed, null);
  assert.equal(calculateBid({ ...retail(), proposedPrice: 0 }).proposed.price, 0);
});

test('two coats almost double the paint but not the labor', () => {
  const one = calculateBid({ ...retail(), coats: 1, secondCoatLaborFactor: 0 });
  const two = calculateBid({ ...retail(), coats: 2, secondCoatLaborFactor: 0.7 });
  assert.ok(Math.abs(two.totalGallons - one.totalGallons * 2) < 1e-9);
  assert.ok(two.hoursSecondCoat > 0);
  assert.ok(two.totalHours < one.totalHours * 1.9, 'second coat is not another full crew day');
  assert.ok(two.price > one.price);
});

test('new layout adds string-line hours a restripe does not', () => {
  const restripe = calculateBid({ ...retail(), layout: 'restripe', ...suggestedKit('restripe') });
  const fresh = calculateBid({ ...retail(), layout: 'new', ...suggestedKit('new') });
  assert.ok(fresh.hoursLayout > restripe.hoursLayout);
  assert.ok(fresh.hoursTrip > restripe.hoursTrip);
  assert.ok(fresh.price > restripe.price);
});

test('night work adds a premium on the same scope', () => {
  const day = calculateBid({ ...retail(), nightWork: false, nightPremium: 0 });
  const night = calculateBid({ ...retail(), nightWork: true, nightPremium: 25 });
  assert.equal(night.nightWork, true);
  assert.ok(Math.abs(night.hoursNight - day.totalHours * 0.25) < 1e-9);
  assert.ok(night.price > day.price);
});

test('a lot with no stalls still prices mobilization instead of dividing by zero', () => {
  const result = calculateBid({
    ...retail(),
    standardStalls: 0,
    adaStalls: 0,
    arrows: 0,
    stopBars: 0,
    handicapSymbols: 0,
    mobilization: 200,
  });
  assert.equal(result.totalStalls, 0);
  assert.equal(result.pricePerStall, null);
  assert.equal(result.hourShares.lines, 0);
  assert.ok(result.price > 200);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...retail(), layout: 'thermoplastic' }), /Unknown layout/);
  assert.throws(() => calculateBid({ ...retail(), coats: 3 }), /Coats must be 1 or 2/);
  assert.throws(() => calculateBid({ ...retail(), coats: 0 }), /greater than zero/);
  assert.throws(() => calculateBid({ ...retail(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...retail(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...retail(), standardStalls: -1 }), /at least 0/);
  assert.throws(() => calculateBid({ ...retail(), lfPerGallon: 0 }), /greater than zero/);
});

test('compareLayout shows new layout costing more than a restripe of the same lot', () => {
  const rows = compareLayout(retail());
  assert.equal(rows.length, 2);
  const restripe = rows.find((row) => row.layout === 'restripe');
  const fresh = rows.find((row) => row.layout === 'new');
  assert.ok(fresh.price > restripe.price);
  assert.ok(fresh.hoursLayout > restripe.hoursLayout);
  assert.equal(rows.filter((row) => row.cheapest).length, 1);
});

test('compareAda shows the extra a per-stall special hides', () => {
  const compared = compareAda(retail());
  assert.ok(compared.extraPrice > 0);
  assert.ok(compared.extraHours > 0);
  assert.ok(compared.extraGallons > 0);
  assert.ok(compared.extraSigns > 0);
  assert.equal(compared.asRegular.adaHashLf, 0);
  assert.equal(compared.asRegular.signCost, 0);
  assert.equal(compared.full.adaHashLf, 140);
});

test('compareCoats shows two coats as extra paint, not another setup day', () => {
  const rows = compareCoats(retail());
  assert.equal(rows[0].coats, 1);
  assert.equal(rows[1].coats, 2);
  assert.ok(Math.abs(rows[1].totalGallons - rows[0].totalGallons * 2) < 1e-9);
  assert.ok(rows[1].hoursSecondCoat > 0);
  assert.ok(rows[1].delta > 0);
});

test('a new-layout shop job prices well above the cheap retail special', () => {
  const special = calculateBid(retail());
  const shop = calculateBid(newLayoutShop());
  assert.ok(shop.price > special.price * 2, 'the 120-stall new layout is not a 50-stall restripe');
  assert.ok(shop.totalGallons > special.totalGallons * 2);
  assert.ok(shop.hoursNight > 0);
});

test('formatBidSummary is customer-facing and omits wages', () => {
  const text = formatBidSummary(calculateBid(retail()), '50-stall retail restripe');
  assert.match(text, /PARKING LOT STRIPING/);
  assert.match(text, /50-stall retail restripe/);
  assert.match(text, /Restripe existing lines/);
  assert.doesNotMatch(text, /28/);
  assert.doesNotMatch(text, /wage/i);
  assert.match(text, /not a traffic-engineering specification/);
});

test('job presets are usable and distinct', () => {
  assert.ok(JOB_PRESETS.length >= 4);
  const labels = new Set(JOB_PRESETS.map((job) => job.label));
  assert.equal(labels.size, JOB_PRESETS.length);
  for (const job of JOB_PRESETS) {
    const bid = calculateBid({
      ...retail(),
      ...job,
      ...suggestedKit(job.layout),
    });
    assert.ok(bid.price > 0);
  }
});

test('layout presets are the two jobs the trade actually quotes', () => {
  assert.deepEqual(LAYOUT_PRESETS.map((item) => item.id), ['restripe', 'new']);
});
