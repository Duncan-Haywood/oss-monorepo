import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  compareScope,
  comparePattern,
  leftoverBoxPlan,
  leftoverBoxNote,
  compareOwnerSupply,
  ownerSupplyNote,
  suggestedOwnerCallbackKit,
  compareAccess,
  accessNote,
  suggestedAccessKit,
  formatBidSummary,
  formatBoxPlanNote,
  travelHours,
  suggestedScopeKit,
  suggestedPatternKit,
  suggestedWallKit,
  suggestedExtraKit,
  JOB_PRESETS,
} from './calc.mjs';

function special() {
  const kit = {
    ...suggestedScopeKit('tile-only'),
    ...suggestedPatternKit('subway-running'),
    ...suggestedWallKit('painted-drywall'),
    ...suggestedExtraKit(),
  };
  return {
    wallSf: 30,
    edgeLf: 12,
    outlets: 2,
    scope: 'tile-only',
    pattern: 'subway-running',
    wall: 'painted-drywall',
    travelMiles: 8,
    includeCooktop: false,
    includeSchluter: false,
    includeAccent: false,
    hourlyWage: 38,
    burdenRate: 30,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 55,
    otherCost: 0,
    ...kit,
  };
}

function losingJob() {
  const kit = {
    ...suggestedScopeKit('demo-and-replace'),
    ...suggestedPatternKit('herringbone'),
    ...suggestedWallKit('existing-tile'),
    ...suggestedExtraKit(),
  };
  return {
    wallSf: 42,
    edgeLf: 18,
    outlets: 6,
    scope: 'demo-and-replace',
    pattern: 'herringbone',
    wall: 'existing-tile',
    travelMiles: 16,
    includeCooktop: true,
    includeSchluter: true,
    includeAccent: false,
    hourlyWage: 38,
    burdenRate: 30,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 55,
    otherCost: 0,
    ...kit,
  };
}

test('travel hours stack trip plus miles', () => {
  assert.ok(Math.abs(travelHours(1.2, 8, 0.035) - (1.2 + 0.28)) < 1e-9);
  assert.throws(() => travelHours('x', 8, 0.035), /must be a number/);
});

test('the cheap special is subway tile-only, not a herringbone demo', () => {
  const result = calculateBid(special());
  assert.equal(result.wallSf, 30);
  assert.equal(result.hoursPrep, 0);
  assert.equal(result.hoursDemo, 0);
  assert.equal(result.hoursCooktop, 0);
  assert.equal(result.hoursSchluter, 0);
  assert.equal(result.hoursAccent, 0);
  assert.equal(result.boardMaterial, 0);
  assert.equal(result.cooktopMaterial, 0);
  assert.ok(result.hoursTile > 0);
  assert.ok(result.hoursTravel > 0);
  assert.ok(result.hoursOutlets > 0);
  assert.ok(result.shares.finish + result.shares.labor > result.shares.extra);
  assert.ok(result.pricePerSf > 18 && result.pricePerSf < 90);
});

test('a herringbone demo job is a different bid than the cheap special', () => {
  const cheap = calculateBid(special());
  const heavy = calculateBid(losingJob());
  assert.equal(heavy.wallSf, 42);
  assert.ok(heavy.hoursTile > cheap.hoursTile);
  assert.ok(heavy.hoursPrep > 0);
  assert.ok(heavy.hoursDemo > 0);
  assert.ok(heavy.hoursCooktop > 0);
  assert.ok(heavy.hoursSchluter > 0);
  assert.ok(heavy.boardMaterial > 0);
  assert.ok(heavy.cooktopMaterial > 0);
  assert.ok(heavy.schluterMaterial > 0);
  assert.ok(heavy.shares.extra > cheap.shares.extra);
  const matchedSpecial = calculateBid({
    ...losingJob(),
    proposedPrice: cheap.pricePerSf * heavy.wallSf,
  });
  assert.equal(matchedSpecial.proposed.belowBreakEven, true);
  assert.ok(matchedSpecial.proposed.profit < 0);
  assert.ok(heavy.price / heavy.wallSf > cheap.price / cheap.wallSf);
});

test('price stacks burden, material, overhead, then margin as a share of price', () => {
  const result = calculateBid(special());
  assert.equal(result.loadedWage, 38 * 1.3);
  const direct = result.laborCost + result.materialCost + result.softCost;
  assert.ok(Math.abs(result.directCost - direct) < 1e-9);
  assert.ok(Math.abs(result.overhead - direct * 0.15) < 1e-9);
  assert.ok(Math.abs(result.totalCost - direct * 1.15) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 20) < 1e-9);
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
  assert.ok(Math.abs(scored.proposed.margin - 20) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.hourlyRate - bid.effectiveHourlyRate) < 1e-9);
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const bid = calculateBid(special());
  const scored = calculateBid({ ...special(), proposedPrice: bid.totalCost - 100 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
  assert.ok(scored.proposed.margin < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(special()).proposed, null);
  assert.equal(calculateBid({ ...special(), proposedPrice: '' }).proposed, null);
});

test('compareScope prices three scopes on the same wall', () => {
  const rows = compareScope(losingJob());
  assert.equal(rows.length, 3);
  assert.ok(rows.every((row, index) => index === 0 || row.price >= rows[index - 1].price));
  assert.equal(rows.filter((row) => row.cheapest).length, 1);
  const tileOnly = rows.find((row) => row.scope === 'tile-only');
  const prep = rows.find((row) => row.scope === 'new-prep');
  const demo = rows.find((row) => row.scope === 'demo-and-replace');
  assert.ok(prep.price > tileOnly.price);
  assert.ok(demo.price > tileOnly.price);
  assert.ok(demo.hoursDemo > tileOnly.hoursDemo);
  assert.ok(prep.boardMaterial > tileOnly.boardMaterial);
  assert.ok(demo.delta > 0);
});

test('comparePattern prices four patterns on the same wall', () => {
  const rows = comparePattern(special());
  assert.equal(rows.length, 4);
  assert.ok(rows.every((row, index) => index === 0 || row.price >= rows[index - 1].price));
  assert.equal(rows.filter((row) => row.cheapest).length, 1);
  const subway = rows.find((row) => row.pattern === 'subway-running');
  const herringbone = rows.find((row) => row.pattern === 'herringbone');
  const mosaic = rows.find((row) => row.pattern === 'mosaic');
  const large = rows.find((row) => row.pattern === 'large-format');
  assert.ok(subway);
  assert.ok(herringbone.price > subway.price);
  assert.ok(mosaic.price > subway.price);
  assert.ok(large.price > subway.price);
  assert.ok(herringbone.buySf > subway.buySf);
  assert.ok(herringbone.hoursTile > subway.hoursTile);
  assert.ok(herringbone.upgradeFromSubway > 0);
  assert.equal(subway.upgradeFromSubway, 0);
  assert.ok(subway.cheapest);
  assert.ok(herringbone.delta > 0);
});

test('comparePattern keeps the current scope and does not reuse a typed pattern rate', () => {
  const demoRows = comparePattern(losingJob());
  const cheapRows = comparePattern(special());
  const demoSubway = demoRows.find((row) => row.pattern === 'subway-running');
  const cheapSubway = cheapRows.find((row) => row.pattern === 'subway-running');
  assert.ok(demoSubway.price > cheapSubway.price);
  const overridden = comparePattern({
    ...special(),
    hoursTilePerSf: 9,
    wasteRate: 0.9,
    tilePerSf: 40,
  });
  const subway = overridden.find((row) => row.pattern === 'subway-running');
  const baseline = comparePattern(special()).find((row) => row.pattern === 'subway-running');
  assert.ok(Math.abs(subway.price - baseline.price) < 1e-9);
});

test('travel miles add hours and invoice without changing the wall', () => {
  const near = calculateBid({ ...special(), travelMiles: 8 });
  const far = calculateBid({ ...special(), travelMiles: 40 });
  assert.ok(far.hoursTravel > near.hoursTravel);
  assert.ok(far.travelInvoice > near.travelInvoice);
  assert.equal(far.hoursTile, near.hoursTile);
  assert.equal(far.wallSf, near.wallSf);
});

test('pattern waste buys more tile than the measured wall', () => {
  const subway = calculateBid(special());
  const herringbone = calculateBid({
    ...special(),
    pattern: 'herringbone',
    ...suggestedPatternKit('herringbone'),
  });
  assert.ok(subway.buySf > subway.wallSf);
  assert.ok(herringbone.buySf > subway.buySf);
  assert.ok(herringbone.tileMaterial > subway.tileMaterial);
  assert.ok(herringbone.hoursTile > subway.hoursTile);
});

test('unknown scope, pattern, wall, or a 100% margin is rejected', () => {
  assert.throws(() => calculateBid({ ...special(), scope: 'walk-in-shower' }), /Unknown scope/);
  assert.throws(() => calculateBid({ ...special(), pattern: 'pebble-tec' }), /Unknown pattern/);
  assert.throws(() => calculateBid({ ...special(), wall: 'slab' }), /Unknown wall/);
  assert.throws(() => calculateBid({ ...special(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => suggestedScopeKit('walk-in-shower'), /Unknown scope/);
  assert.throws(() => suggestedPatternKit('pebble-tec'), /Unknown pattern/);
  assert.throws(() => suggestedWallKit('slab'), /Unknown wall/);
});

test('every shipped job preset calculates without throwing', () => {
  for (const preset of JOB_PRESETS) {
    const kit = {
      ...suggestedScopeKit(preset.scope),
      ...suggestedPatternKit(preset.pattern),
      ...suggestedWallKit(preset.wall),
      ...suggestedExtraKit(),
    };
    const result = calculateBid({
      ...preset,
      hourlyWage: 38,
      burdenRate: 30,
      overheadRate: 15,
      targetMargin: 20,
      travelAndEquipment: 55,
      otherCost: 0,
      ...kit,
    });
    assert.ok(result.price > 0, preset.label);
    assert.ok(result.wallSf > 0, preset.label);
  }
});

test('leftoverBoxPlan rounds a 33 SF kitchen buy up to whole boxes', () => {
  const plan = leftoverBoxPlan({ ...special(), sfPerBox: 10, leftoverBoxes: 0, secondWallSf: 0 });
  assert.equal(plan.kitchenNeedSf, 33);
  assert.equal(plan.boxesToBuy, 4);
  assert.equal(plan.purchasedSf, 40);
  assert.ok(Math.abs(plan.leftoverAfterKitchen - 7) < 1e-9);
  assert.ok(Math.abs(plan.boxRoundUpSf - 7) < 1e-9);
  assert.equal(plan.leftoverCredit, 0);
  assert.ok(Math.abs(plan.tileInvoiceAfterBoxes - 40 * special().tilePerSf) < 1e-9);
});

test('leftover boxes on the van credit the kitchen buy', () => {
  const plan = leftoverBoxPlan({ ...special(), sfPerBox: 10, leftoverBoxes: 2, secondWallSf: 0 });
  assert.equal(plan.leftoverSf, 20);
  assert.equal(plan.usedFromStock, 20);
  assert.equal(plan.stillNeedSf, 13);
  assert.equal(plan.boxesToBuy, 2);
  assert.equal(plan.purchasedSf, 20);
  assert.ok(Math.abs(plan.leftoverAfterKitchen - 7) < 1e-9);
  assert.ok(Math.abs(plan.leftoverCredit - 20 * special().tilePerSf) < 1e-9);
});

test('enough leftover covers the kitchen without a buy', () => {
  const plan = leftoverBoxPlan({ ...special(), sfPerBox: 10, leftoverBoxes: 4, secondWallSf: 0 });
  assert.equal(plan.boxesToBuy, 0);
  assert.equal(plan.purchasedSf, 0);
  assert.ok(Math.abs(plan.usedFromStock - 33) < 1e-9);
  assert.ok(Math.abs(plan.leftoverAfterKitchen - 7) < 1e-9);
  assert.equal(plan.boxRoundUpSf, 0);
});

test('leftover after the kitchen may still miss a laundry return', () => {
  const plan = leftoverBoxPlan({ ...special(), sfPerBox: 10, leftoverBoxes: 0, secondWallSf: 8 });
  assert.ok(Math.abs(plan.secondNeedSf - 8.8) < 1e-9);
  assert.equal(plan.secondCoveredByLeftover, false);
  assert.ok(Math.abs(plan.secondShortfallSf - 1.8) < 1e-9);
  assert.equal(plan.secondBoxesToBuy, 1);
});

test('leftover after the kitchen can cover a smaller second wall', () => {
  const plan = leftoverBoxPlan({ ...special(), sfPerBox: 10, leftoverBoxes: 0, secondWallSf: 6 });
  assert.ok(Math.abs(plan.secondNeedSf - 6.6) < 1e-9);
  assert.equal(plan.secondCoveredByLeftover, true);
  assert.equal(plan.secondBoxesToBuy, 0);
  assert.equal(plan.secondShortfallSf, 0);
});

test('leftoverBoxNote names the laundry miss and the kitchen round-up', () => {
  const miss = leftoverBoxPlan({ ...special(), sfPerBox: 10, leftoverBoxes: 0, secondWallSf: 8 });
  assert.match(leftoverBoxNote(miss), /7\.0 SF left/);
  assert.match(leftoverBoxNote(miss), /1 box/);
  assert.match(leftoverBoxNote(miss), /does not cover/);

  const covers = leftoverBoxPlan({ ...special(), sfPerBox: 10, leftoverBoxes: 0, secondWallSf: 6 });
  assert.match(leftoverBoxNote(covers), /covers the second wall/);
  assert.match(leftoverBoxNote(covers), /6\.6 SF/);

  const roundUp = leftoverBoxPlan({ ...special(), sfPerBox: 10, leftoverBoxes: 0, secondWallSf: 0 });
  assert.match(leftoverBoxNote(roundUp), /4 boxes/);
  assert.match(leftoverBoxNote(roundUp), /7\.0 SF of round-up/);

  const stocked = leftoverBoxPlan({ ...special(), sfPerBox: 10, leftoverBoxes: 4, secondWallSf: 0 });
  assert.match(leftoverBoxNote(stocked), /covers this kitchen buy/);
  assert.throws(() => leftoverBoxNote(null), /missing/);
  assert.throws(() => leftoverBoxNote({}), /coverage figures/);
});

test('leftoverBoxPlan rejects a missing box size and does not change the headline bid', () => {
  const bid = calculateBid(special());
  const plan = leftoverBoxPlan({ ...special(), sfPerBox: 10, leftoverBoxes: 2, secondWallSf: 8 });
  const bidAgain = calculateBid({ ...special(), leftoverBoxes: 2, secondWallSf: 8 });
  assert.ok(Math.abs(bid.price - bidAgain.price) < 1e-9);
  assert.ok(plan.leftoverCredit > 0);
  assert.throws(() => leftoverBoxPlan({ ...special(), sfPerBox: 0 }), /greater than zero/);
  assert.throws(() => leftoverBoxPlan({ ...special(), sfPerBox: 10, leftoverBoxes: -1 }), /at least 0/);
});

test('the customer summary names the wall and omits wages', () => {
  const text = formatBidSummary(calculateBid(special()), 'Subway kitchen splash');
  assert.match(text, /KITCHEN TILE BACKSPLASH BID/);
  assert.match(text, /Subway kitchen splash/);
  assert.match(text, /Tile only/i);
  assert.match(text, /subway/i);
  assert.doesNotMatch(text, /wage/i);
  assert.doesNotMatch(text, /burden/i);
  assert.match(text, /not a tile specification/i);
});

test('the box-plan note names leftover without changing the customer draft', () => {
  const miss = formatBoxPlanNote(leftoverBoxPlan({ ...special(), sfPerBox: 10, leftoverBoxes: 0, secondWallSf: 8 }));
  assert.match(miss, /Buy 4 boxes \(40\.0 SF\)/);
  assert.match(miss, /Leftover after kitchen: 7\.0 SF/);
  assert.match(miss, /leftover misses it — still 1 box/);
  assert.doesNotMatch(miss, /wage/i);
  const covered = formatBoxPlanNote(leftoverBoxPlan({ ...special(), sfPerBox: 10, leftoverBoxes: 0, secondWallSf: 6 }));
  assert.match(covered, /leftover covers it/);
  const none = formatBoxPlanNote(leftoverBoxPlan({ ...special(), sfPerBox: 10, leftoverBoxes: 0, secondWallSf: 0 }));
  assert.match(none, /No second wall entered/);
  const customer = formatBidSummary(calculateBid(special()), 'Subway kitchen splash');
  assert.doesNotMatch(customer, /BOX PLAN/);
});

test('compareOwnerSupply zeros the tile invoice and keeps set hours when they bought it', () => {
  const rows = compareOwnerSupply(special());
  assert.equal(rows.length, 3);
  const you = rows.find((row) => row.supply === 'you-supply');
  const covers = rows.find((row) => row.supply === 'owner-covers');
  const short = rows.find((row) => row.supply === 'owner-short');
  assert.ok(you.tileMaterial > 0);
  assert.equal(covers.tileMaterial, 0);
  assert.equal(short.tileMaterial, 0);
  assert.ok(Math.abs(covers.totalHours - you.totalHours) < 1e-9);
  assert.ok(short.totalHours > covers.totalHours);
  assert.ok(covers.price < you.price);
  assert.ok(short.price > covers.price);
  assert.ok(short.shortfallMaterial > 0);
  assert.equal(covers.cheapest, true);
  assert.equal(covers.installOnly, null);
});

test('compareOwnerSupply does not leak a typed tile invoice into the owner-supplied rows', () => {
  const baseline = compareOwnerSupply(special());
  const overridden = compareOwnerSupply({ ...special(), tilePerSf: 40 });
  const you = overridden.find((row) => row.supply === 'you-supply');
  const covers = overridden.find((row) => row.supply === 'owner-covers');
  const baselineCovers = baseline.find((row) => row.supply === 'owner-covers');
  assert.ok(you.tileMaterial > baseline.find((row) => row.supply === 'you-supply').tileMaterial);
  assert.equal(covers.tileMaterial, 0);
  assert.ok(Math.abs(covers.price - baselineCovers.price) < 1e-9);
});

test('an install-only number can cover the set but not the you-supply tile', () => {
  const youBid = calculateBid(special());
  const mid = (youBid.totalCost + calculateBid({ ...special(), tilePerSf: 0 }).totalCost) / 2;
  const rows = compareOwnerSupply(special(), { installOnlyPrice: mid });
  const you = rows.find((row) => row.supply === 'you-supply');
  const covers = rows.find((row) => row.supply === 'owner-covers');
  assert.equal(you.installOnly.belowBreakEven, true);
  assert.equal(covers.installOnly.belowBreakEven, false);
  assert.match(ownerSupplyNote(rows), /covers the set if their boxes actually cover/i);
});

test('the $35 / SF special on a herringbone demo loses even when they bought the tile', () => {
  const rows = compareOwnerSupply(losingJob(), { installOnlyPrice: 35 * 42 });
  const you = rows.find((row) => row.supply === 'you-supply');
  const covers = rows.find((row) => row.supply === 'owner-covers');
  const short = rows.find((row) => row.supply === 'owner-short');
  assert.equal(you.installOnly.belowBreakEven, true);
  assert.equal(covers.installOnly.belowBreakEven, true);
  assert.equal(short.installOnly.belowBreakEven, true);
  assert.ok(Math.abs(covers.breakEvenPrice - 2698.8384) < 1e-4);
  assert.match(ownerSupplyNote(rows), /lose money even when they bought the tile/i);
  assert.match(ownerSupplyNote(rows), /\$1,470/);
  assert.match(ownerSupplyNote(rows), /\$2,698\.84/);
});

test('a $700 just-set special loses on a cheap subway even when they bought the tile', () => {
  const rows = compareOwnerSupply(special(), { installOnlyPrice: 700 });
  const covers = rows.find((row) => row.supply === 'owner-covers');
  assert.equal(covers.installOnly.belowBreakEven, true);
  assert.match(ownerSupplyNote(rows), /lose money even when they bought the tile/i);
  assert.match(ownerSupplyNote(rows), /\$736\.75/);
});

test('ownerSupplyNote names the bid drop when no install-only number is on the table', () => {
  const note = ownerSupplyNote(compareOwnerSupply(special()));
  assert.match(note, /Zeroing the tile invoice drops the bid/i);
  assert.match(note, /short \/ wrong-lot callback/i);
});

test('ownerSupplyNote rejects a missing comparison', () => {
  assert.throws(() => ownerSupplyNote(null), /missing rows/);
  assert.throws(() => ownerSupplyNote([{ supply: 'you-supply' }]), /missing rows/);
});

test('suggestedOwnerCallbackKit uses the extra-kit trip, not a typed set', () => {
  const kit = suggestedOwnerCallbackKit();
  assert.equal(kit.hoursCallbackTrip, suggestedExtraKit().hoursTrip);
  assert.equal(kit.rushTileMultiplier, 1.5);
});

test('compareAccess keeps weekday hours and raises after-hours wage plus a second trip', () => {
  const kit = suggestedAccessKit();
  const rows = compareAccess(special());
  assert.equal(rows.length, 3);
  const empty = rows.find((row) => row.access === 'empty-weekday');
  const occupied = rows.find((row) => row.access === 'occupied-weekday');
  const afterHours = rows.find((row) => row.access === 'after-hours');
  assert.equal(kit.occupiedPaceMultiplier, 1.25);
  assert.equal(kit.afterHoursWageMultiplier, 1.5);
  assert.equal(kit.afterHoursExtraTripHours, suggestedExtraKit().hoursTrip);
  assert.ok(Math.abs(occupied.hoursTile - empty.hoursTile * 1.25) < 1e-9);
  assert.ok(Math.abs(occupied.siteHours - empty.siteHours * 1.25) < 1e-9);
  assert.ok(Math.abs(occupied.loadedWage - empty.loadedWage) < 1e-9);
  assert.ok(occupied.totalHours > empty.totalHours);
  assert.ok(occupied.price > empty.price);
  assert.ok(Math.abs(afterHours.loadedWage - empty.loadedWage * 1.5) < 1e-9);
  assert.ok(Math.abs(afterHours.hoursTravel - empty.hoursTravel - kit.afterHoursExtraTripHours) < 1e-9);
  assert.ok(Math.abs(afterHours.hoursTile - empty.hoursTile) < 1e-9);
  assert.ok(afterHours.price > occupied.price);
  assert.equal(empty.cheapest, true);
  assert.equal(empty.installOnly, null);
  assert.ok(Math.abs(empty.price - 1134.406) < 1e-4);
  assert.ok(Math.abs(occupied.price - 1244.475375) < 1e-4);
  assert.ok(Math.abs(afterHours.price - 1602.378375) < 1e-4);
});

test('compareAccess does not leak a typed trip into the extra evening dispatch', () => {
  const baseline = compareAccess(special());
  const overridden = compareAccess({ ...special(), hoursTrip: 9 });
  const empty = overridden.find((row) => row.access === 'empty-weekday');
  const afterHours = overridden.find((row) => row.access === 'after-hours');
  const baselineAfter = baseline.find((row) => row.access === 'after-hours');
  const baselineEmpty = baseline.find((row) => row.access === 'empty-weekday');
  assert.ok(empty.hoursTravel > baselineEmpty.hoursTravel);
  assert.ok(Math.abs((afterHours.hoursTravel - empty.hoursTravel) - (baselineAfter.hoursTravel - baselineEmpty.hoursTravel)) < 1e-9);
});

test('a $1,100 Saturday special covers a weekday subway and loses after-hours', () => {
  const rows = compareAccess(special(), { installOnlyPrice: 1100 });
  const empty = rows.find((row) => row.access === 'empty-weekday');
  const occupied = rows.find((row) => row.access === 'occupied-weekday');
  const afterHours = rows.find((row) => row.access === 'after-hours');
  assert.equal(empty.installOnly.belowBreakEven, false);
  assert.equal(occupied.installOnly.belowBreakEven, false);
  assert.equal(afterHours.installOnly.belowBreakEven, true);
  assert.ok(Math.abs(afterHours.breakEvenPrice - 1281.9027) < 1e-4);
  assert.match(accessNote(rows), /empty-weekday set covers/i);
  assert.match(accessNote(rows), /\$181\.90/);
  assert.match(accessNote(rows), /\$1,281\.90/);
});

test('the $35 / SF Saturday special on a herringbone demo loses even on a weekday', () => {
  const rows = compareAccess(losingJob(), { installOnlyPrice: 35 * 42 });
  const empty = rows.find((row) => row.access === 'empty-weekday');
  const occupied = rows.find((row) => row.access === 'occupied-weekday');
  const afterHours = rows.find((row) => row.access === 'after-hours');
  assert.equal(empty.installOnly.belowBreakEven, true);
  assert.equal(occupied.installOnly.belowBreakEven, true);
  assert.equal(afterHours.installOnly.belowBreakEven, true);
  assert.ok(Math.abs(empty.price - 3857.997) < 1e-4);
  assert.ok(Math.abs(afterHours.breakEvenPrice - 4201.0098) < 1e-4);
  assert.match(accessNote(rows), /lose money even on an empty weekday/i);
  assert.match(accessNote(rows), /\$1,470/);
  assert.match(accessNote(rows), /\$4,201\.01/);
});

test('accessNote names the bid lift when no Saturday number is on the table', () => {
  const note = accessNote(compareAccess(special()));
  assert.match(note, /They-cook-around-you adds \$110\.07/i);
  assert.match(note, /After-hours \/ weekend adds \$467\.97/);
});

test('accessNote rejects a missing comparison', () => {
  assert.throws(() => accessNote(null), /missing rows/);
  assert.throws(() => accessNote([{ access: 'empty-weekday' }]), /missing rows/);
});

test('suggestedAccessKit uses the extra-kit trip, not a typed set', () => {
  const kit = suggestedAccessKit();
  assert.equal(kit.afterHoursExtraTripHours, suggestedExtraKit().hoursTrip);
  assert.equal(kit.afterHoursWageMultiplier, 1.5);
  assert.equal(kit.occupiedPaceMultiplier, 1.25);
});
