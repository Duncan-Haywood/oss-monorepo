import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  requiredBreakerAmps,
  recommendWire,
  voltageDropPercent,
  nextStandardBreaker,
  defaultInputs,
  CHARGER_PRESETS,
  WIRE_TABLE,
  CONTINUOUS_LOAD_FACTOR,
  VOLTAGE_DROP_LIMIT,
} from './calc.mjs';

const garage = () => ({
  ...defaultInputs(),
  proposedPrice: '',
});

test('the 125% continuous-load rule lands on a real breaker', () => {
  assert.equal(requiredBreakerAmps(32), 40);
  assert.equal(requiredBreakerAmps(40), 50);
  assert.equal(requiredBreakerAmps(48), 60);
  assert.equal(requiredBreakerAmps(80), 100);
  assert.equal(CONTINUOUS_LOAD_FACTOR, 1.25);
  assert.equal(nextStandardBreaker(51), 60);
});

test('a typical indoor 48 A hang prices from labor, wire, permit, and margin', () => {
  const result = calculateBid(garage());
  assert.equal(result.breakerAmps, 60);
  assert.equal(result.wire.awg, 6);
  assert.ok(result.laborHours > 4 && result.laborHours < 8);
  assert.ok(result.price > 800 && result.price < 2500);
  assert.ok(Math.abs(result.profit / result.price * 100 - 25) < 1e-9);
  assert.equal(result.breakEvenPrice, result.totalCost);
  assert.equal(result.serviceUpgradeSuggested, false);
});

test('margin is a share of price, not a markup on cost', () => {
  const result = calculateBid(garage());
  const direct = result.laborCost + result.materialsCost;
  assert.ok(Math.abs(result.overhead - direct * 0.18) < 1e-9);
  assert.ok(Math.abs(result.totalCost - direct * 1.18) < 1e-9);
  assert.ok(Math.abs(result.price - result.totalCost / 0.75) < 1e-6);
});

test('a zero-margin bid prices at cost', () => {
  const result = calculateBid({ ...garage(), targetMargin: 0 });
  assert.ok(Math.abs(result.price - result.totalCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
});

test('a detached trench plus a service upgrade is a different job than the garage hang', () => {
  const easy = calculateBid(garage());
  const hard = calculateBid({
    ...garage(),
    location: 'detached_garage',
    runFeet: 70,
    trenchFeet: 60,
    panelWork: 'service_upgrade',
  });
  assert.ok(hard.laborHours > easy.laborHours * 2, `hard job is only ${hard.laborHours} h vs ${easy.laborHours} h`);
  assert.ok(hard.price > easy.price * 2.2, `hard job is only ${hard.price} vs ${easy.price}`);
  assert.ok(hard.vsBaseline > 2, `vs baseline is only ${hard.vsBaseline}`);
  assert.ok(easy.vsBaseline > 0.9 && easy.vsBaseline < 1.4);
  assert.ok(hard.materials.trenchRestoration > 0);
  assert.ok(hard.hours.trench > 5);
  assert.ok(hard.hours.panel > easy.hours.panel);
});

test('long copper runs upsize the wire to hold a 3% voltage drop', () => {
  const short = recommendWire({ breakerAmps: 60, chargerAmps: 48, runFeet: 25 });
  const long = recommendWire({ breakerAmps: 60, chargerAmps: 48, runFeet: 180 });
  assert.equal(short.awg, 6);
  assert.equal(short.upsizedFromAmpacity, false);
  assert.ok(short.voltageDropOk);
  assert.ok(long.awg < short.awg, `long run stayed at #${long.awg}`);
  assert.equal(long.upsizedFromAmpacity, true);
  assert.ok(long.voltageDropOk);
  assert.ok(long.voltageDropPercent <= VOLTAGE_DROP_LIMIT * 100 + 1e-9);
});

test('voltage drop is zero on a zero-length run and grows with length', () => {
  const wire = WIRE_TABLE.find(row => row.awg === 6);
  assert.equal(voltageDropPercent({ amps: 48, runFeet: 0, circularMils: wire.circularMils }), 0);
  const twenty = voltageDropPercent({ amps: 48, runFeet: 20, circularMils: wire.circularMils });
  const forty = voltageDropPercent({ amps: 48, runFeet: 40, circularMils: wire.circularMils });
  assert.ok(Math.abs(forty - twenty * 2) < 1e-9);
});

test('a panel with no headroom is flagged unless the bid already includes an upgrade', () => {
  const tight = calculateBid({
    ...garage(),
    existingServiceAmps: 100,
    estimatedExistingLoad: 90,
    panelWork: 'spare_slot',
  });
  assert.equal(tight.serviceUpgradeSuggested, true);
  assert.match(tight.serviceUpgradeReason, /60 A breaker/);

  const already = calculateBid({
    ...garage(),
    existingServiceAmps: 100,
    estimatedExistingLoad: 90,
    panelWork: 'service_upgrade',
  });
  assert.equal(already.serviceUpgradeSuggested, false);
});

test('a proposed price is scored against the same cost base', () => {
  const bid = calculateBid(garage());
  const scored = calculateBid({ ...garage(), proposedPrice: bid.price });
  assert.ok(Math.abs(scored.proposed.margin - 25) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);

  const loser = calculateBid({ ...garage(), proposedPrice: bid.totalCost - 50 });
  assert.equal(loser.proposed.belowBreakEven, true);
  assert.ok(loser.proposed.profit < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(garage()).proposed, null);
  assert.equal(calculateBid({ ...garage(), proposedPrice: '' }).proposed, null);
  assert.equal(calculateBid({ ...garage(), proposedPrice: null }).proposed, null);
  assert.equal(calculateBid({ ...garage(), proposedPrice: 0 }).proposed.price, 0);
});

test('outdoor and pedestal jobs add a disconnect and the extra hardware', () => {
  const indoor = calculateBid(garage());
  const outdoor = calculateBid({ ...garage(), location: 'outdoor_wall' });
  const pedestal = calculateBid({ ...garage(), location: 'pedestal' });
  assert.equal(indoor.materials.disconnect, 0);
  assert.ok(outdoor.materials.disconnect > 0);
  assert.ok(outdoor.hours.disconnect > 0);
  assert.ok(pedestal.materials.pedestal > 0);
  assert.ok(pedestal.hours.pedestal > 0);
  assert.ok(pedestal.price > outdoor.price);
});

test('a NEMA 14-50 receptacle is a slightly different takeoff, not a different circuit rule', () => {
  const hardwired = calculateBid(garage());
  const receptacle = calculateBid({ ...garage(), installType: 'nema_14_50' });
  assert.equal(receptacle.breakerAmps, hardwired.breakerAmps);
  assert.ok(receptacle.materials.receptacle > 0);
  assert.ok(receptacle.laborHours > hardwired.laborHours);
});

test('including the charger hardware raises the bid by more than the hardware cost', () => {
  const without = calculateBid(garage());
  const withHw = calculateBid({ ...garage(), chargerHardware: 599 });
  // Overhead and margin apply to the hardware, so the customer price
  // moves by more than $599 — that is the point of putting it on the bid.
  assert.ok(withHw.price - without.price > 599);
  assert.ok(Math.abs(withHw.materials.chargerHardware - 599) < 1e-9);
});

test('payroll burden is the part of the wage that never shows on the paycheck', () => {
  const result = calculateBid(garage());
  assert.equal(result.loadedWage, 48 * 1.32);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...garage(), chargerAmps: 0 }), /greater than zero/);
  assert.throws(() => calculateBid({ ...garage(), chargerAmps: 'abc' }), /Charger amps must be a number/);
  assert.throws(() => calculateBid({ ...garage(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...garage(), runFeet: -1 }), /Run length must be at least 0/);
  assert.throws(() => calculateBid({ ...garage(), location: 'attic' }), /Location must be/);
  assert.throws(() => calculateBid({ ...garage(), installType: 'wireless' }), /Install type must be/);
  assert.throws(() => calculateBid({ ...garage(), panelWork: 'hope' }), /Panel work must be/);
  assert.throws(() => requiredBreakerAmps(400), /larger than 200 A/);
});

test('charger presets are the four Level 2 sizes a residential electrician quotes', () => {
  assert.equal(CHARGER_PRESETS.length, 4);
  for (const preset of CHARGER_PRESETS) {
    assert.ok(preset.chargerAmps > 0);
    assert.ok(requiredBreakerAmps(preset.chargerAmps) >= preset.chargerAmps * 1.25 - 1e-9);
  }
});

test('a nameless-ratio job with no run still has a price from the call-out', () => {
  const result = calculateBid({ ...garage(), runFeet: 0, trenchFeet: 0 });
  assert.equal(result.pricePerRunFoot, null);
  assert.ok(result.price > result.materials.permit);
  assert.ok(result.wire.voltageDropPercent === 0);
});
