import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overhangShadedFraction, calculate, sunPosition, validate, EXAMPLE } from './load.mjs';

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('hand-worked shadow on a south window', () => {
  // Sun straight south at 45° altitude: the shadow drops exactly the depth.
  // 2 ft overhang, 1 ft gap, 4 ft window: (2 - 1) / 4 = 0.25 shaded.
  close(overhangShadedFraction({ altitude: 45, azimuth: 0 }, 0, { depthFt: 2, gapFt: 1, windowHeightFt: 4 }), 0.25);
  // Sun 60° round to the west: tan Ω = 1 / cos 60° = 2, drop 4 ft: (4 - 1) / 4.
  close(overhangShadedFraction({ altitude: 45, azimuth: 60 }, 0, { depthFt: 2, gapFt: 1, windowHeightFt: 4 }), 0.75);
  // Shadow ends above the window head: nothing shaded.
  close(overhangShadedFraction({ altitude: 20, azimuth: 0 }, 0, { depthFt: 2, gapFt: 1, windowHeightFt: 4 }), 0);
  // Shadow longer than gap + window: fully shaded, capped at 1.
  close(overhangShadedFraction({ altitude: 80, azimuth: 0 }, 0, { depthFt: 3, gapFt: 0.5, windowHeightFt: 4 }), 1);
});

test('sun behind the wall or below the horizon returns 0', () => {
  assert.equal(overhangShadedFraction({ altitude: 30, azimuth: 120 }, 0, { depthFt: 2, gapFt: 0, windowHeightFt: 4 }), 0);
  assert.equal(overhangShadedFraction({ altitude: -5, azimuth: 0 }, 0, { depthFt: 2, gapFt: 0, windowHeightFt: 4 }), 0);
  assert.equal(overhangShadedFraction({ altitude: 30, azimuth: 0 }, 0, { depthFt: 0, gapFt: 0, windowHeightFt: 4 }), 0);
});

test('profile angle uses the wall azimuth (west wall, sun due west)', () => {
  const s = { altitude: 30, azimuth: 90 };
  const drop = 2 * Math.tan(30 * Math.PI / 180);
  close(overhangShadedFraction(s, 90, { depthFt: 2, gapFt: 0, windowHeightFt: 5 }), drop / 5);
});

test('a south overhang shades most noon sun at 36° N in July', () => {
  const noon = sunPosition(36, 12);
  // Noon altitude 90 − 36 + declination (about 20.4°) ≈ 74.4°.
  close(noon.altitude, 90 - 36 + noon.declination, 1e-6);
  const f = overhangShadedFraction(noon, 0, { depthFt: 2, gapFt: 1, windowHeightFt: 5 });
  close(f, Math.min(1, (2 * Math.tan(noon.altitude * Math.PI / 180) - 1) / 5), 1e-12);
  assert.ok(f > 0.9);
});

const oneRoom = wall => ({
  site: { latitude: 36, coolingOutdoorF: 95, dailyRangeF: 20, coolingDewPointF: 70 },
  rooms: [{ name: 'R', areaFt2: 200, ceilingFt: 8, floor: 'slab', slabPerimeterFt: 20, walls: [{ facing: 'S', lengthFt: 15, windowFt2: 40, ...wall }] }],
});

test('no overhang, or a zero-depth one, leaves the load exactly as before', () => {
  const a = calculate(oneRoom({}));
  const b = calculate(oneRoom({ overhangFt: 0, overhangGapFt: 1, windowHeightFt: 5 }));
  assert.deepEqual(b.rooms[0].cooling.hourly, a.rooms[0].cooling.hourly);
  assert.equal(a.rooms[0].cooling.overhangSavedBtuDay, 0);
});

test('an overhang lowers window sun hour by hour, never below the diffuse part', () => {
  const bare = calculate(oneRoom({}));
  const eave = calculate(oneRoom({ overhangFt: 2, overhangGapFt: 1, windowHeightFt: 5 }));
  const deep = calculate(oneRoom({ overhangFt: 30, overhangGapFt: 0, windowHeightFt: 5 }));
  for (let k = 0; k < 24; k++) {
    const b = bare.rooms[0].cooling.byHour[k].windowSolar;
    const e = eave.rooms[0].cooling.byHour[k].windowSolar;
    const d = deep.rooms[0].cooling.byHour[k].windowSolar;
    assert.ok(e <= b + 1e-9 && d <= e + 1e-9, `hour ${k + 1}`);
    assert.ok(d >= 0);
  }
  assert.ok(eave.rooms[0].cooling.sensible < bare.rooms[0].cooling.sensible);
  assert.ok(eave.rooms[0].cooling.overhangSavedBtuDay > 0);
  // Heating is untouched: overhangs only change sun gain.
  assert.equal(eave.rooms[0].heating.total, bare.rooms[0].heating.total);
});

test('validation catches bad overhang inputs', () => {
  assert.ok(validate(oneRoom({ overhangFt: -1 })).some(e => /overhang depth/.test(e)));
  assert.ok(validate(oneRoom({ overhangFt: 2, windowHeightFt: 12 })).some(e => /window height exceeds/.test(e)));
  assert.deepEqual(validate(oneRoom({ overhangFt: 2, overhangGapFt: 1, windowHeightFt: 5 })), []);
});

test('example house is unchanged by the new fields (no overhangs given)', () => {
  const r = calculate(EXAMPLE);
  assert.equal(r.errors.length, 0);
  assert.ok(r.rooms.every(x => x.cooling.overhangSavedBtuDay === 0));
});

// Red-team 2026-11-19: guards for mutants that escaped the suite.
test('overhang savings equal the drop in window sun, interior shade included', () => {
  const shaded = w => ({ ...oneRoom(w), envelope: { interiorShade: 0.5 } });
  const bare = calculate(shaded({}));
  const eave = calculate(shaded({ overhangFt: 2, overhangGapFt: 1, windowHeightFt: 5 }));
  let drop = 0;
  for (let k = 0; k < 24; k++) drop += bare.rooms[0].cooling.byHour[k].windowSolar - eave.rooms[0].cooling.byHour[k].windowSolar;
  assert.ok(drop > 0);
  assert.ok(Math.abs(eave.rooms[0].cooling.overhangSavedBtuDay - drop) < 1e-6, `${eave.rooms[0].cooling.overhangSavedBtuDay} vs ${drop}`);
});
