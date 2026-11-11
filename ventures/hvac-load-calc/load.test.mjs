import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculate, validate, wallU, ceilingU, floorU, sunPosition, irradiance, saturationKPa, humidityRatio, pressureKPa, grains, densityRatio, EXAMPLE, DAILY_RANGE_FRACTION } from './load.mjs';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b}`);

test('2x4 R-13 wall U by the parallel-path method matches a hand calculation', () => {
  // Cavity path R = 0.68 + 0.45 + 13 + 0.62 + 0.62 + 0.17 = 15.54; stud path swaps 13 for 3.5 x 1.25.
  const expected = 0.75 / 15.54 + 0.25 / (15.54 - 13 + 4.375);
  close(wallU({ wallCavityR: 13, studDepthIn: 3.5, framingFraction: 0.25, wallContinuousR: 0 }), expected, 1e-9);
  close(expected, 0.0844, 0.001, 'published 2x4 R-13 walls run about 0.08-0.09');
  assert.ok(wallU({ wallCavityR: 13, studDepthIn: 3.5, framingFraction: 0.25, wallContinuousR: 5 }) < expected, 'continuous insulation lowers U');
  close(ceilingU({ ceilingR: 38 }), 1 / (38 + 0.45 + 1.22), 1e-12);
});

test('sun position: solstice noon at 40°N is 73.45° high, due south', () => {
  const s = sunPosition(40, 12, 172);
  close(s.altitude, 90 - 40 + 23.45, 0.01);
  close(s.azimuth, 0, 1e-9);
  const am = sunPosition(40, 9, 172), pm = sunPosition(40, 15, 172);
  close(am.altitude, pm.altitude, 1e-9, 'symmetric about noon');
  assert.ok(am.azimuth < 0 && pm.azimuth > 0, 'east in the morning, west in the afternoon');
  assert.ok(sunPosition(40, 2, 172).altitude < 0, 'below the horizon at night');
});

test('irradiance: west glass gets beam in the afternoon only, north gets little', () => {
  const pm = sunPosition(35, 16), am = sunPosition(35, 8);
  assert.equal(irradiance(am, 90).beam, 0);
  assert.ok(irradiance(pm, 90).beam > 100, 'strong low-angle sun on a west wall');
  assert.ok(irradiance(pm, 180).beam < 25);
  const noonHoriz = irradiance(sunPosition(35, 12), 0, 0);
  assert.ok(noonHoriz.beam > 250 && noonHoriz.beam < 320, `clear July noon on a roof ~ 280-300 Btu/h·ft², got ${noonHoriz.beam}`);
});

test('psychrometrics: 75 °F at 50% RH is about 65 grains; daily range profile is 0 at 3 pm and 1 at 5 am', () => {
  const w = humidityRatio(saturationKPa(75) * 0.5, pressureKPa(0));
  close(grains(w), 65.2, 1.0);
  close(saturationKPa(32), 0.611, 0.001, 'triple point'); close(saturationKPa(95), 5.63, 0.03, '35 °C');
  assert.equal(DAILY_RANGE_FRACTION[14], 0);
  assert.equal(DAILY_RANGE_FRACTION[4], 1);
  close(densityRatio(5000), 0.832, 0.005, 'Denver-ish air is about 83% as dense');
});

const box = (over = {}) => ({
  site: { latitude: 35, heatingOutdoorF: 20, indoorHeatF: 70, coolingOutdoorF: 95, dailyRangeF: 20, coolingDewPointF: 60, ...over.site },
  envelope: { ach50: 6, nFactor: 20, ductHeatPct: 0, ductCoolPct: 0, ventCFM: 0, ...over.envelope },
  rooms: over.rooms ?? [{ name: 'Box', areaFt2: 100, ceilingFt: 8, floor: 'conditioned', walls: [{ facing: 'S', lengthFt: 10, windowFt2: 20 }] }],
});

test('heating load of a one-wall room matches the hand sum of UAΔT and infiltration', () => {
  const r = calculate(box());
  assert.deepEqual(r.errors, []);
  const Uw = wallU({ wallCavityR: 13, studDepthIn: 3.5, framingFraction: 0.25, wallContinuousR: 0 });
  const infil = 1.08 * (6 / 20) * 800 / 60 * 50;
  const expected = Uw * 60 * 50 + 0.32 * 20 * 50 + infil;
  close(r.rooms[0].heating.total, expected, 1e-6);
  close(r.house.heating.total, expected, 1e-6);
});

test('cooling: west glass peaks later than east glass, and the house peak never exceeds the sum of room peaks', () => {
  const r = calculate(box({ rooms: [
    { name: 'East', areaFt2: 100, walls: [{ facing: 'E', lengthFt: 10, windowFt2: 30 }] },
    { name: 'West', areaFt2: 100, walls: [{ facing: 'W', lengthFt: 10, windowFt2: 30 }] },
  ] }));
  const [e, w] = r.rooms;
  assert.ok(e.cooling.peakHour <= 11, `east peaks in the morning, got ${e.cooling.peakHour}`);
  assert.ok(w.cooling.peakHour >= 15, `west peaks in the afternoon, got ${w.cooling.peakHour}`);
  assert.ok(r.house.cooling.sensible <= r.house.cooling.sumOfRoomPeaks + 1e-9);
  assert.ok(r.house.cooling.sensible < 0.9 * r.house.cooling.sumOfRoomPeaks, 'diversity is real for opposite faces');
});

test('dry climates carry no latent infiltration load, humid ones do', () => {
  const dry = calculate(box({ site: { coolingDewPointF: 45 } }));
  const humid = calculate(box({ site: { coolingDewPointF: 74 } }));
  assert.equal(dry.house.cooling.latent, 0);
  assert.ok(humid.house.cooling.latent > 100);
});

test('ventilation with heat recovery and duct losses add to the whole-house load only', () => {
  const base = calculate(box());
  const vent = calculate(box({ envelope: { ventCFM: 60, ventSensibleRecovery: 0.5 } }));
  close(vent.house.heating.total - base.house.heating.total, 1.08 * 60 * 0.5 * 50, 1e-6);
  close(vent.rooms[0].heating.total, base.rooms[0].heating.total, 1e-9);
  const ducts = calculate(box({ envelope: { ductHeatPct: 20 } }));
  close(ducts.house.heating.total, base.house.heating.total * 1.2, 1e-6);
});

test('altitude lowers infiltration loads through air density', () => {
  const sea = calculate(box()), high = calculate(box({ site: { elevationFt: 6000 } }));
  assert.ok(high.rooms[0].heating.infiltration < 0.82 * sea.rooms[0].heating.infiltration);
});

test('the example house gives a plausible answer and beats the rule of thumb', () => {
  const r = calculate(EXAMPLE);
  assert.deepEqual(r.errors, []);
  const h = r.house;
  assert.ok(h.coolingTons > 1.5 && h.coolingTons < 3.5, `tons ${h.coolingTons}`);
  assert.ok(h.ruleOfThumbTons > h.coolingTons);
  assert.ok(h.cooling.sensibleHeatRatio > 0.6 && h.cooling.sensibleHeatRatio < 0.95);
  close(r.rooms.reduce((a, x) => a + x.airflow.cooling, 0), h.designCFM, 1e-6, 'room cooling airflows add up to the design airflow');
  assert.ok(h.cooling.peakHour >= 13 && h.cooling.peakHour <= 18);
});

test('validation names the problem', () => {
  assert.match(validate({ rooms: [] }).join(), /at least one room/);
  assert.match(validate(box({ rooms: [{ name: 'A', areaFt2: 100, walls: [{ facing: 'S', lengthFt: 2, windowFt2: 30 }] }] })).join(), /exceed the wall's 16 ft²/);
  assert.match(validate(box({ rooms: [{ areaFt2: 100, walls: [{ facing: 'X', lengthFt: 2 }] }] })).join(), /facing must be one of/);
  assert.match(validate(box({ site: { heatingOutdoorF: 75 } })).join(), /must be below the indoor/);
  assert.match(validate(box({ envelope: { windowSHGC: 'high' } })).join(), /Window SHGC must be a number/);
  assert.ok(calculate({ rooms: [] }).errors.length > 0);
});

test('the whole-house cooling components add up to the peak sensible load', () => {
  const r = calculate(EXAMPLE);
  const sum = Object.values(r.house.cooling.components).reduce((a, b) => a + b, 0);
  close(sum, r.house.cooling.sensible, 1e-6);
  assert.ok(r.house.cooling.components.windowSolar > 0);
});

test('framed floor U over a crawlspace: 90% cavity path, 10% through 9.25 in. joists', () => {
  // Cavity path R = 19 + 0.94 subfloor + 2 x 0.92 films = 21.78; joist path 9.25 x 1.25 + 2.78 = 14.3425.
  close(floorU({ floorR: 19 }), 0.9 / 21.78 + 0.1 / 14.3425, 1e-12);
  close(floorU({ floorR: 0 }), 0.9 / 2.78 + 0.1 / 14.3425, 1e-12);
});

test('slab perimeter accepts up to 2,000 ft and refuses more', () => {
  const slab = p => box({ rooms: [{ name: 'S', areaFt2: 100, floor: 'slab', slabPerimeterFt: p, walls: [{ facing: 'S', lengthFt: 10 }] }] });
  assert.deepEqual(validate(slab(2000)), []);
  assert.match(validate(slab(2000.5)).join(), /slab perimeter must be between 0 and 2000/);
  assert.match(validate(slab(-1)).join(), /slab perimeter/);
});
