import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBid, claimNote, mattingNote, defaults, SIZE_TIERS, COAT_TYPES, MATTING_LEVELS, ADD_ONS } from './calc.mjs';

test('the default $75 medium/medium-coat groom stays in the black when wage is skipped', () => {
  const result = calculateBid(defaults);
  assert.equal(result.baseMinutes, 69);
  assert.equal(result.totalMinutes, 69);
  assert.equal(Number(result.totalHours.toFixed(4)), 1.15);
  assert.equal(result.laborCost, 0);
  assert.equal(result.directCosts, 11);
  assert.equal(result.paymentFee, 2.25);
  assert.equal(result.totalCost, 13.25);
  assert.ok(result.contribution > 0, 'skipping wage should not hide a loss on the worked example');
  assert.equal(Number(result.contribution.toFixed(2)), 61.75);
});

test('size and coat tiers combine into the base groom minutes', () => {
  for (const size of Object.keys(SIZE_TIERS)) {
    for (const coat of Object.keys(COAT_TYPES)) {
      const result = calculateBid({ ...defaults, size, coat });
      assert.equal(result.baseMinutes, SIZE_TIERS[size].minutes * COAT_TYPES[coat].multiplier);
    }
  }
  // A giant curly/doodle coat takes meaningfully longer than a small smooth one.
  const giantCurly = calculateBid({ ...defaults, size: 'giant', coat: 'curly' });
  const smallSmooth = calculateBid({ ...defaults, size: 'small', coat: 'smooth' });
  assert.ok(giantCurly.baseMinutes > smallSmooth.baseMinutes * 3);
});

test('rejects an unknown size, coat, or matting level', () => {
  assert.throws(() => calculateBid({ ...defaults, size: 'huge' }), /size must be one of/);
  assert.throws(() => calculateBid({ ...defaults, coat: 'wiry' }), /coat must be one of/);
  assert.throws(() => calculateBid({ ...defaults, matting: 'extreme' }), /matting must be one of/);
});

test('rejects unsafe or unusable inputs', () => {
  assert.throws(() => calculateBid({ ...defaults, paymentRate: 100 }), /below 100/);
  assert.throws(() => calculateBid({ ...defaults, targetMargin: 100 }), /below 100/);
  assert.throws(() => calculateBid({ ...defaults, supplies: -1 }), /non-negative/);
});

// The one liability-specific guard this venture needs: severe matting can
// hide skin damage under the mats, and a fearful or unsafe animal is a
// referral, not a bigger invoice. The tool refuses to price it until the
// groomer has explicitly acknowledged that, mirroring the fee+margin
// unreachable-target guard's shape (refuse silently-wrong output rather than
// print a number that reads as permission).
test('severe matting cannot be priced without the safety acknowledgment', () => {
  assert.throws(
    () => calculateBid({ ...defaults, matting: 'severe' }),
    /welfare and safety call/,
  );
  assert.throws(
    () => calculateBid({ ...defaults, matting: 'severe', severeMattingAck: false }),
    /welfare and safety call/,
  );
  const result = calculateBid({ ...defaults, matting: 'severe', severeMattingAck: true });
  assert.equal(result.mattingMinutes, MATTING_LEVELS.severe.minutes);
  assert.equal(result.mattingSurcharge, MATTING_LEVELS.severe.surcharge);
});

test('light and moderate matting price without any acknowledgment', () => {
  for (const matting of ['none', 'light', 'moderate']) {
    const result = calculateBid({ ...defaults, matting });
    assert.equal(result.mattingMinutes, MATTING_LEVELS[matting].minutes);
    assert.equal(result.mattingSurcharge, MATTING_LEVELS[matting].surcharge);
  }
});

test('add-ons stack their minutes and price, and only the checked ones count', () => {
  const result = calculateBid({ ...defaults, nailTrim: true, earCleaning: true });
  assert.deepEqual(result.addOns.sort(), ['earCleaning', 'nailTrim'].sort());
  assert.equal(result.addOnMinutes, ADD_ONS.nailTrim.minutes + ADD_ONS.earCleaning.minutes);
  assert.equal(result.addOnPrice, ADD_ONS.nailTrim.price + ADD_ONS.earCleaning.price);
  assert.equal(result.groomMinutes, result.baseMinutes + result.mattingMinutes + result.addOnMinutes);

  const none = calculateBid(defaults);
  assert.deepEqual(none.addOns, []);
  assert.equal(none.addOnMinutes, 0);
  assert.equal(none.addOnPrice, 0);
});

test('mobile adds travel time and mileage cost; a shop visit adds neither', () => {
  const shop = calculateBid({ ...defaults, mobile: false, travelMiles: 50, travelSetupMinutes: 30 });
  assert.equal(shop.travelMinutes, 0);
  assert.equal(shop.travelCost, 0);

  const mobile = calculateBid({ ...defaults, mobile: true, travelMiles: 20, vehicleRate: 0.7, travelSetupMinutes: 20 });
  assert.equal(mobile.travelMinutes, 20);
  assert.equal(Number(mobile.travelCost.toFixed(2)), 14);
  assert.equal(mobile.totalMinutes, mobile.groomMinutes + 20);
});

test('a large, curly-coated, lightly matted mobile groom with add-ons adds up end to end', () => {
  const result = calculateBid({
    targetPrice: 150,
    size: 'large',
    coat: 'curly',
    matting: 'light',
    nailTrim: true,
    earCleaning: true,
    mobile: true,
    travelMiles: 20,
    vehicleRate: 0.7,
    travelSetupMinutes: 20,
    wage: 20,
    burdenPercent: 20,
    supplies: 8,
    overhead: 6,
    paymentRate: 3,
    targetMargin: 30,
  });
  assert.equal(result.baseMinutes, 128);
  assert.equal(result.mattingMinutes, 15);
  assert.equal(result.addOnMinutes, 20);
  assert.equal(result.groomMinutes, 163);
  assert.equal(result.travelMinutes, 20);
  assert.equal(result.totalMinutes, 183);
  assert.equal(Number(result.totalHours.toFixed(4)), 3.05);
  assert.equal(result.loadedLaborRate, 24);
  assert.equal(Number(result.laborCost.toFixed(2)), 73.2);
  assert.equal(Number(result.travelCost.toFixed(2)), 14);
  assert.equal(result.addOnPrice, 27);
  assert.equal(result.mattingSurcharge, 10);
  assert.equal(Number(result.directCosts.toFixed(2)), 138.2);
  assert.equal(result.paymentFee, 4.5);
  assert.equal(Number(result.totalCost.toFixed(2)), 142.7);
  assert.equal(Number(result.contribution.toFixed(2)), 7.3);
  assert.equal(Number(result.breakEven.toFixed(2)), 142.47);
  assert.equal(Number(result.targetQuote.toFixed(2)), 206.27);
});

test('a proposed quote that hides a loss is still reported as a loss', () => {
  const result = calculateBid({
    ...defaults,
    targetPrice: 40,
    size: 'giant',
    coat: 'curly',
    matting: 'moderate',
    severeMattingAck: false,
    wage: 25,
    burdenPercent: 20,
    supplies: 10,
    overhead: 5,
    paymentRate: 3,
    targetMargin: 35,
  });
  assert.ok(result.contribution < 0, 'a $40 bid on a giant doodle with moderate matting is underwater');
  assert.ok(result.profit < 0);
  assert.ok(result.targetQuote > 40);
});

test('an unreachable target margin is reported as unreachable, not as a negative price', () => {
  const over = calculateBid({ ...defaults, paymentRate: 3, targetMargin: 98 });
  assert.equal(over.targetQuote, Infinity);

  const exact = calculateBid({ ...defaults, paymentRate: 3, targetMargin: 97 });
  assert.equal(exact.targetQuote, Infinity);

  const under = calculateBid({ ...defaults, paymentRate: 3, targetMargin: 96 });
  assert.ok(Number.isFinite(under.targetQuote));
  assert.ok(under.targetQuote > under.breakEven);
});

test('claimed share is the sum of the two final-price slices', () => {
  const ordinary = calculateBid({ ...defaults, paymentRate: 3, targetMargin: 35 });
  assert.equal(ordinary.claimedSharePct, 38);
  assert.equal(ordinary.targetReachable, true);
  assert.match(claimNote(ordinary), /38\.0% of the price, leaving 62\.0%/);

  const conflict = calculateBid({ ...defaults, paymentRate: 3, targetMargin: 98 });
  assert.equal(conflict.claimedSharePct, 101);
  assert.equal(conflict.targetReachable, false);
  assert.match(claimNote(conflict), /already claim 101\.0%/);
  assert.match(claimNote(conflict), /No quote can hit that target/);
});

test('the matting note names the welfare/safety call for moderate and severe, and is silent otherwise', () => {
  assert.equal(mattingNote('none'), '');
  assert.equal(mattingNote('light'), '');
  assert.match(mattingNote('moderate'), /check the skin underneath/);
  assert.match(mattingNote('severe'), /welfare and safety call/);
  assert.match(mattingNote('severe'), /refer out/);
});
