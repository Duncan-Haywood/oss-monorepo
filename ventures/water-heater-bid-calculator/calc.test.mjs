import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HEATER_TYPES,
  MATERIAL_RATES,
  MAX_GALLONS,
  MAX_GPM,
  calculateBid,
  defaultInputs,
  recommendedCapacity,
} from './calc.mjs';

function typical() {
  return defaultInputs();
}

test('a typical 50-gallon electric garage swap has a price, a walk-away, and a loaded wage', () => {
  const result = calculateBid(typical());
  const direct = result.laborCost + result.materialsCost;
  assert.ok(result.price > 0);
  assert.ok(Math.abs(result.overhead - direct * 0.16) < 1e-9);
  assert.ok(Math.abs(result.totalCost - direct * 1.16) < 1e-9);
  assert.ok(Math.abs(result.price - result.totalCost / 0.75) < 1e-6);
  assert.equal(result.loadedWage, 48 * 1.3);
  assert.equal(result.breakEvenPrice, result.totalCost);
  assert.ok(result.vsBaseline > 0.9 && result.vsBaseline < 1.1);
  assert.ok(result.pricePerGallon > 0);
  assert.equal(result.pricePerGpm, null);
});

test('a zero-margin bid prices at cost', () => {
  const result = calculateBid({ ...typical(), targetMargin: 0 });
  assert.ok(Math.abs(result.price - result.totalCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
});

test('an attic condensing tankless with a 3/4 in upsize is a different bid than the garage electric swap', () => {
  const easy = calculateBid(typical());
  const hard = calculateBid({
    ...typical(),
    heaterType: 'tankless_gas',
    tanklessGpm: 9,
    location: 'attic',
    venting: 'concentric_condensing',
    ventFeet: 25,
    gasLine: 'upsize_3_4',
    gasLineFeet: 35,
    electrical: 'new_120v',
    expansionTank: 0,
    dripPan: 1,
    condensate: 1,
    recirc: 1,
    haulAway: 1,
    isolationValves: 1,
    mixingValve: 1,
  });
  assert.ok(hard.laborHours > easy.laborHours * 1.8, `hard job is only ${hard.laborHours} h vs ${easy.laborHours} h`);
  assert.ok(hard.price > easy.price * 1.8, `hard job is only ${hard.price} vs ${easy.price}`);
  assert.ok(hard.vsBaseline > 1.8, `vs baseline is only ${hard.vsBaseline}`);
  assert.ok(hard.materials.gas > easy.materials.gas);
  assert.ok(hard.materials.vent > 0);
  assert.ok(hard.hours.location > 0);
  assert.ok(hard.hours.gas > 3);
  assert.equal(hard.pricePerGallon, null);
  assert.ok(hard.pricePerGpm > 0);
});

test('propane is not modelled; a gas tankless still adds the upsize kit that a “line looks fine” bid misses', () => {
  const existing = calculateBid({
    ...typical(),
    heaterType: 'tankless_gas',
    venting: 'concentric_condensing',
    ventFeet: 8,
    gasLine: 'existing_ok',
    isolationValves: 1,
  });
  const upsize = calculateBid({
    ...typical(),
    heaterType: 'tankless_gas',
    venting: 'concentric_condensing',
    ventFeet: 8,
    gasLine: 'upsize_3_4',
    gasLineFeet: 20,
    isolationValves: 1,
  });
  assert.equal(existing.materials.gas, MATERIAL_RATES.gasExisting);
  assert.ok(upsize.materials.gas > existing.materials.gas + 200);
  assert.ok(upsize.hours.gas > existing.hours.gas);
  assert.ok(upsize.price > existing.price);
  assert.ok(existing.warnings.some((line) => /3\/4 in/.test(line)));
});

test('the gas-upsize FAQ\'s worked numbers stay locked to the arithmetic they describe', () => {
  // index.html's FAQ (and its FAQPage JSON-LD) quotes an exact dollar and hour
  // delta for a 10-foot gas-tankless run. If calc.mjs's rates ever change,
  // this test breaks before the page quietly starts lying to a reader.
  const base = { ...typical(), heaterType: 'tankless_gas', tanklessGpm: 7, gasLineFeet: 10 };
  const existing = calculateBid({ ...base, gasLine: 'existing_ok' });
  const upsize = calculateBid({ ...base, gasLine: 'upsize_3_4' });
  assert.equal(existing.price.toFixed(2), '1525.94');
  assert.equal(upsize.price.toFixed(2), '2329.59');
  assert.ok(Math.abs(upsize.laborHours - existing.laborHours - 4) < 1e-9);
  assert.equal((upsize.materialsCost - existing.materialsCost).toFixed(2), '270.00');
  assert.equal(Math.round(upsize.price - existing.price), 804);
});

test('power-vent and concentric vents are a different takeoff than reusing the B-vent', () => {
  const reuse = calculateBid({
    ...typical(),
    heaterType: 'tank_gas_atmo',
    electrical: 'none',
    gasLine: 'existing_ok',
    venting: 'reuse_existing',
    ventFeet: 0,
  });
  const concentric = calculateBid({
    ...typical(),
    heaterType: 'tankless_gas',
    electrical: 'new_120v',
    gasLine: 'upsize_3_4',
    gasLineFeet: 12,
    venting: 'concentric_condensing',
    ventFeet: 20,
    isolationValves: 1,
  });
  assert.equal(reuse.materials.vent, MATERIAL_RATES.ventReuse);
  assert.ok(concentric.materials.vent > reuse.materials.vent);
  assert.ok(concentric.hours.vent > reuse.hours.vent);
});

test('attic access and a drip pan move hours that a garage swap never sees', () => {
  const garage = calculateBid(typical());
  const attic = calculateBid({ ...typical(), location: 'attic', dripPan: 1 });
  assert.ok(attic.hours.location > garage.hours.location);
  assert.ok(attic.hours.pan > 0);
  assert.ok(attic.materials.pan > 0);
  assert.ok(attic.price > garage.price);
});

test('an electric tankless without panel work is flagged, not resized', () => {
  const result = calculateBid({
    ...typical(),
    heaterType: 'tankless_electric',
    tanklessGpm: 7,
    electrical: 'existing_ok',
    isolationValves: 1,
  });
  assert.equal(result.heaterType, 'tankless_electric');
  assert.ok(result.warnings.some((line) => /40 A/.test(line)));
});

test('heat-pump closet and missing condensate are flagged', () => {
  const result = calculateBid({
    ...typical(),
    heaterType: 'heat_pump',
    location: 'closet',
    condensate: 0,
    electrical: 'existing_ok',
  });
  assert.ok(result.warnings.some((line) => /room volume/.test(line)));
  assert.ok(result.warnings.some((line) => /condensate/.test(line)));
});

test('recommended capacity is a hint that follows the heater type', () => {
  assert.equal(recommendedCapacity('tank_electric').gallons, 50);
  assert.equal(recommendedCapacity('tankless_gas').gpm, 7);
  assert.equal(recommendedCapacity('tankless_gas').btu, 180000);
  assert.equal(recommendedCapacity('heat_pump').kw, 4.5);
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

test('including the heater hardware raises the bid by more than the hardware cost', () => {
  const without = calculateBid(typical());
  const withHw = calculateBid({ ...typical(), heaterHardware: 980 });
  assert.ok(withHw.price - without.price > 980);
  assert.ok(Math.abs(withHw.materials.heaterHardware - 980) < 1e-9);
});

test('yes/no add-on flags accept 1, 0, true, and "yes"', () => {
  const on = calculateBid({ ...typical(), expansionTank: 'yes', haulAway: true });
  const off = calculateBid({ ...typical(), expansionTank: 'no', haulAway: 0 });
  assert.ok(on.materials.expansion > 0);
  assert.equal(off.materials.expansion, 0);
  assert.ok(on.materials.haul > 0);
  assert.equal(off.materials.haul, 0);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...typical(), capacityGallons: 0 }), /greater than zero/);
  assert.throws(() => calculateBid({ ...typical(), capacityGallons: 'abc' }), /Capacity gallons must be a number/);
  assert.throws(() => calculateBid({ ...typical(), capacityGallons: 200 }), /larger than 120 gallons/);
  assert.throws(() => calculateBid({ ...typical(), heaterType: 'tankless_gas', tanklessGpm: 20 }), /larger than 15 GPM/);
  assert.throws(() => calculateBid({ ...typical(), heaterType: 'tankless_gas', tanklessGpm: 0 }), /greater than zero/);
  assert.throws(() => calculateBid({ ...typical(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...typical(), ventFeet: -1 }), /Vent length must be at least 0/);
  assert.throws(() => calculateBid({ ...typical(), location: 'roof' }), /Location must be/);
  assert.throws(() => calculateBid({ ...typical(), heaterType: 'boiler' }), /Heater type must be/);
  assert.throws(() => calculateBid({ ...typical(), venting: 'chimney' }), /Venting must be/);
  assert.throws(() => calculateBid({ ...typical(), gasLine: 'flex' }), /Gas line must be/);
  assert.throws(() => recommendedCapacity('steam'), /Heater type must be/);
});

test('every heater type produces a finite residential bid', () => {
  assert.equal(HEATER_TYPES.length, 6);
  for (const row of HEATER_TYPES) {
    const result = calculateBid({
      ...typical(),
      heaterType: row.id,
      capacityGallons: 50,
      tanklessGpm: 7,
      venting: row.fuel === 'gas' ? (row.id.includes('tankless') ? 'concentric_condensing' : 'reuse_existing') : 'none',
      ventFeet: row.fuel === 'gas' ? 8 : 0,
      gasLine: row.fuel === 'gas' ? 'existing_ok' : 'none',
      electrical: row.fuel === 'electric' ? 'existing_ok' : 'none',
      isolationValves: row.family === 'tankless' ? 1 : 0,
    });
    assert.ok(Number.isFinite(result.price));
    assert.ok(result.price > result.materials.permit);
    assert.ok(result.laborHours > 3);
  }
});

test('MAX bounds stay at the residential envelope', () => {
  assert.equal(MAX_GALLONS, 120);
  assert.equal(MAX_GPM, 15);
});
