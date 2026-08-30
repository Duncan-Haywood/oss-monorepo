import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ATS_COST,
  GENERATOR_PRESETS,
  MAX_KW,
  VOLTAGE_DROP_LIMIT,
  WIRE_TABLE,
  calculateBid,
  defaultInputs,
  feederBreakerAmps,
  nameplateAmps,
  recommendedKw,
  recommendWire,
  voltageDropPercent,
} from './calc.mjs';

function typical() {
  return defaultInputs();
}

test('a typical 22 kW natural-gas hang has a price, a walk-away, and a loaded wage', () => {
  const result = calculateBid(typical());
  const direct = result.laborCost + result.materialsCost;
  assert.ok(result.price > 0);
  assert.ok(Math.abs(result.overhead - direct * 0.18) < 1e-9);
  assert.ok(Math.abs(result.totalCost - direct * 1.18) < 1e-9);
  assert.ok(Math.abs(result.price - result.totalCost / 0.75) < 1e-6);
  assert.equal(result.loadedWage, 52 * 1.32);
  assert.equal(result.breakEvenPrice, result.totalCost);
  assert.ok(result.vsBaseline > 0.9 && result.vsBaseline < 1.1);
});

test('a zero-margin bid prices at cost', () => {
  const result = calculateBid({ ...typical(), targetMargin: 0 });
  assert.ok(Math.abs(result.price - result.totalCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
});

test('nameplate current is kW times 1000 over 240 V, and the feeder breaker is the next standard size', () => {
  assert.ok(Math.abs(nameplateAmps(22) - 91.6666666667) < 1e-9);
  assert.equal(feederBreakerAmps(22), 100);
  assert.equal(feederBreakerAmps(10), 45);
  assert.equal(feederBreakerAmps(48), 200);
});

test('a far-yard propane 400 A job is a different bid than the typical NG hang', () => {
  const easy = calculateBid(typical());
  const hard = calculateBid({
    ...typical(),
    generatorKw: 26,
    fuel: 'propane',
    location: 'far_yard',
    transferSwitch: 'automatic',
    serviceAmps: 400,
    atsAmps: 400,
    padType: 'poured',
    feederFeet: 70,
    gasLineFeet: 50,
    trenchFeet: 60,
    gasMeter: 'upgrade',
  });
  assert.ok(hard.laborHours > easy.laborHours * 1.8, `hard job is only ${hard.laborHours} h vs ${easy.laborHours} h`);
  assert.ok(hard.price > easy.price * 1.8, `hard job is only ${hard.price} vs ${easy.price}`);
  assert.ok(hard.vsBaseline > 1.8, `vs baseline is only ${hard.vsBaseline}`);
  assert.ok(hard.materials.gas > easy.materials.gas);
  assert.ok(hard.materials.ats > easy.materials.ats);
  assert.ok(hard.hours.trench > 5);
  assert.ok(hard.hours.location > 0);
  assert.ok(hard.materials.trenchRestoration > 0);
});

test('propane adds the regulator kit and tank hookup that natural gas does not', () => {
  const ng = calculateBid(typical());
  const lp = calculateBid({ ...typical(), fuel: 'propane' });
  assert.equal(ng.materials.gas, 15 * 6.5);
  assert.ok(lp.materials.gas - ng.materials.gas > 400);
  assert.ok(lp.hours.gas > ng.hours.gas);
  assert.ok(lp.price > ng.price);
});

test('an automatic 400 A ATS is a different takeoff than a manual 200 A switch', () => {
  const manual = calculateBid({ ...typical(), transferSwitch: 'manual', atsAmps: 200 });
  const auto400 = calculateBid({
    ...typical(),
    transferSwitch: 'automatic',
    serviceAmps: 400,
    atsAmps: 400,
  });
  assert.equal(manual.materials.ats, ATS_COST.manual[200]);
  assert.equal(auto400.materials.ats, ATS_COST.automatic[400]);
  assert.ok(auto400.hours.transfer > manual.hours.transfer);
  assert.ok(auto400.price > manual.price);
});

test('a poured pad grows with the machine; a precast pad is a flat starting kit', () => {
  const precastSmall = calculateBid(typical());
  const precastLarge = calculateBid({ ...typical(), generatorKw: 48 });
  const pouredSmall = calculateBid({ ...typical(), padType: 'poured' });
  const pouredLarge = calculateBid({ ...typical(), generatorKw: 48, padType: 'poured' });
  assert.equal(precastSmall.materials.pad, 380);
  assert.equal(precastLarge.materials.pad, 380);
  assert.ok(pouredLarge.materials.pad > pouredSmall.materials.pad);
  assert.ok(pouredLarge.padSquareFeet > pouredSmall.padSquareFeet);
  assert.ok(pouredSmall.hours.pad > precastSmall.hours.pad);
  assert.ok(pouredSmall.padSquareFeet >= 16);
});

test('long feeders upsize the copper to hold a 3% voltage drop', () => {
  const short = recommendWire({ breakerAmps: 100, nameplateAmps: 91.7, feederFeet: 20 });
  const long = recommendWire({ breakerAmps: 100, nameplateAmps: 91.7, feederFeet: 180 });
  assert.equal(short.awg, 3);
  assert.equal(short.upsizedFromAmpacity, false);
  assert.ok(short.voltageDropOk);
  assert.notEqual(long.awg, short.awg);
  assert.equal(long.upsizedFromAmpacity, true);
  assert.ok(long.voltageDropOk);
  assert.ok(long.voltageDropPercent <= VOLTAGE_DROP_LIMIT * 100 + 1e-9);
});

test('voltage drop is zero on a zero-length run and grows with length', () => {
  const wire = WIRE_TABLE.find((row) => row.awg === 3);
  assert.equal(voltageDropPercent({ amps: 91.7, runFeet: 0, circularMils: wire.circularMils }), 0);
  const twenty = voltageDropPercent({ amps: 91.7, runFeet: 20, circularMils: wire.circularMils });
  const forty = voltageDropPercent({ amps: 91.7, runFeet: 40, circularMils: wire.circularMils });
  assert.ok(Math.abs(forty - twenty * 2) < 1e-9);
});

test('an undersized ATS and a long NG run without a meter look are flagged', () => {
  const tight = calculateBid({
    ...typical(),
    serviceAmps: 200,
    atsAmps: 100,
    gasLineFeet: 55,
    gasMeter: 'adequate',
  });
  assert.ok(tight.warnings.some((line) => /100 A transfer switch/.test(line)));
  assert.ok(tight.warnings.some((line) => /natural-gas run/.test(line)));

  const already = calculateBid({
    ...typical(),
    serviceAmps: 200,
    atsAmps: 200,
    gasLineFeet: 55,
    gasMeter: 'upgrade',
  });
  assert.equal(
    already.warnings.some((line) => /natural-gas run/.test(line)),
    false,
  );
});

test('a machine smaller than the load-mode hint is flagged, not resized', () => {
  const result = calculateBid({
    ...typical(),
    loadMode: 'whole_house',
    serviceAmps: 400,
    atsAmps: 400,
    generatorKw: 14,
  });
  assert.equal(result.suggestedKw, 32);
  assert.equal(result.generatorKw, 14);
  assert.ok(result.warnings.some((line) => /often starts at 32 kW/.test(line)));
});

test('recommended kW follows the service and whether this is essential or whole-house', () => {
  assert.equal(recommendedKw('essential', 200), 14);
  assert.equal(recommendedKw('whole_house', 200), 22);
  assert.equal(recommendedKw('whole_house', 400), 32);
  assert.equal(recommendedKw('essential', 100), 10);
});

test('a proposed price is scored against the same cost base', () => {
  const bid = calculateBid(typical());
  const scored = calculateBid({ ...typical(), proposedPrice: bid.price });
  assert.ok(Math.abs(scored.proposed.margin - 25) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);

  const loser = calculateBid({ ...typical(), proposedPrice: bid.totalCost - 50 });
  assert.equal(loser.proposed.belowBreakEven, true);
  assert.ok(loser.proposed.profit < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(typical()).proposed, null);
  assert.equal(calculateBid({ ...typical(), proposedPrice: '' }).proposed, null);
  assert.equal(calculateBid({ ...typical(), proposedPrice: null }).proposed, null);
  assert.equal(calculateBid({ ...typical(), proposedPrice: 0 }).proposed.price, 0);
});

test('including the generator hardware raises the bid by more than the hardware cost', () => {
  const without = calculateBid(typical());
  const withHw = calculateBid({ ...typical(), generatorHardware: 4200 });
  assert.ok(withHw.price - without.price > 4200);
  assert.ok(Math.abs(withHw.materials.generatorHardware - 4200) < 1e-9);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...typical(), generatorKw: 0 }), /greater than zero/);
  assert.throws(() => calculateBid({ ...typical(), generatorKw: 'abc' }), /Generator kW must be a number/);
  assert.throws(() => calculateBid({ ...typical(), generatorKw: 60 }), /larger than 48 kW/);
  assert.throws(() => calculateBid({ ...typical(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...typical(), feederFeet: -1 }), /Feeder length must be at least 0/);
  assert.throws(() => calculateBid({ ...typical(), location: 'attic' }), /Location must be/);
  assert.throws(() => calculateBid({ ...typical(), fuel: 'diesel' }), /Fuel must be/);
  assert.throws(() => calculateBid({ ...typical(), transferSwitch: 'wifi' }), /Transfer switch must be/);
  assert.throws(() => calculateBid({ ...typical(), padType: 'dirt' }), /Pad type must be/);
  assert.throws(() => calculateBid({ ...typical(), serviceAmps: 175 }), /Service amps must be/);
  assert.throws(() => nameplateAmps(MAX_KW + 1), /larger than 48 kW/);
});

test('presets stay inside the residential envelope and produce a breaker', () => {
  assert.equal(GENERATOR_PRESETS.length, 8);
  for (const preset of GENERATOR_PRESETS) {
    assert.ok(preset.generatorKw > 0);
    assert.ok(preset.generatorKw <= MAX_KW);
    assert.ok(feederBreakerAmps(preset.generatorKw) >= nameplateAmps(preset.generatorKw) - 1e-9);
  }
});

test('a nameless-ratio job with no feeder still has a price from the call-out', () => {
  const result = calculateBid({ ...typical(), feederFeet: 0, gasLineFeet: 0, trenchFeet: 0 });
  assert.equal(result.pricePerFeederFoot, null);
  assert.ok(result.price > result.materials.permit);
  assert.ok(result.wire.voltageDropPercent === 0);
});

test('the propane-vs-natural-gas FAQ\'s worked numbers stay locked to the arithmetic they describe', () => {
  // index.html's FAQ (and its FAQPage JSON-LD) quotes an exact dollar and
  // hour delta between fuels on the default 15-foot gas run. If calc.mjs's
  // rates ever change, this test breaks before the page quietly starts
  // lying to a reader.
  const ng = calculateBid({ ...typical(), fuel: 'natural_gas' });
  const lp = calculateBid({ ...typical(), fuel: 'propane' });
  assert.equal(ng.price.toFixed(2), '6106.00');
  assert.equal(lp.price.toFixed(2), '7080.12');
  assert.ok(Math.abs(lp.laborHours - ng.laborHours - 2.1) < 1e-9);
  assert.equal((lp.materialsCost - ng.materialsCost).toFixed(2), '475.00');
  assert.equal(Math.round(lp.price - ng.price), 974);
});
