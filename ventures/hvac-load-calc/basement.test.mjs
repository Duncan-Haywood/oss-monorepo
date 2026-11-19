import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculate, validate, belowGradeWallU, basementFloorU, basementWallOtherR, basementFloorOtherR, irradiance, sunPosition, angleModifier } from './load.mjs';
import { solve } from './eval/basement-fd.mjs';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b}`);

test('below-grade wall U: the path-length closed form worked by hand', () => {
  // Uninsulated 8 in. wall: R = 0.68 film + 8 x 0.08 concrete = 1.32; k = 0.8.
  const R = basementWallOtherR(0);
  close(R, 1.32, 1e-12);
  const a = 2 * 0.8 * 1.32 / Math.PI; // 0.6723
  const expected = (2 * 0.8 / (Math.PI * 7)) * Math.log((7 + a) / a);
  close(belowGradeWallU({ z1Ft: 0, z2Ft: 7, soilK: 0.8, otherR: R }), expected, 1e-12);
  close(expected, 0.177, 0.001);
});

test('below-grade wall U: strips add up to the whole depth, and the top foot loses most', () => {
  const R = basementWallOtherR(0);
  const strips = Array.from({ length: 7 }, (_, z) => belowGradeWallU({ z1Ft: z, z2Ft: z + 1, soilK: 0.8, otherR: R }));
  close(strips.reduce((s, u) => s + u, 0), 7 * belowGradeWallU({ z1Ft: 0, z2Ft: 7, soilK: 0.8, otherR: R }), 1e-12);
  for (let i = 1; i < 7; i++) assert.ok(strips[i] < strips[i - 1], `strip ${i} below strip ${i - 1}`);
  assert.ok(strips[0] > 2.5 * strips[3], 'the first foot loses far more than the fourth');
});

test('below-grade U tends to 1/R when the wall itself dominates, and falls with insulation', () => {
  const big = basementWallOtherR(60);
  // R-60 on the wall: the soil adds a little resistance, so U sits just under 1/R.
  const u = belowGradeWallU({ z1Ft: 0, z2Ft: 7, soilK: 0.8, otherR: big });
  assert.ok(u < 1 / big && u > 0.85 / big, `${u} vs 1/R ${1 / big}`);
  const bare = belowGradeWallU({ z1Ft: 0, z2Ft: 7, soilK: 0.8, otherR: basementWallOtherR(0) });
  const r10 = belowGradeWallU({ z1Ft: 0, z2Ft: 7, soilK: 0.8, otherR: basementWallOtherR(10) });
  assert.ok(r10 < bare / 2.5, `R-10 cuts the wall loss by more than 60%: ${r10} vs ${bare}`);
  assert.equal(belowGradeWallU({ z1Ft: 0, z2Ft: 0, soilK: 0.8, otherR: 1 }), 0);
});

test('basement floor U: closed form by hand; wider floors lose less per square foot', () => {
  const R = basementFloorOtherR(0); // 0.92 + 4 x 0.08 = 1.24
  close(R, 1.24, 1e-12);
  const a = 0.8 * 1.24 / Math.PI;
  const expected = (2 * 0.8 / (Math.PI * 24)) * Math.log((12 + 3.5 + a) / (3.5 + a));
  close(basementFloorU({ widthFt: 24, depthFt: 7, soilK: 0.8, otherR: R }), expected, 1e-12);
  assert.ok(basementFloorU({ widthFt: 32, depthFt: 7, soilK: 0.8, otherR: R }) < expected);
  assert.ok(basementFloorU({ widthFt: 24, depthFt: 4, soilK: 0.8, otherR: R }) > expected, 'shallower floors lose more');
});

test('a coarse 2-D finite-volume solve agrees with the wall closed form within 15%', () => {
  const Rw = basementWallOtherR(0), Rf = basementFloorOtherR(0);
  const fd = solve({ W: 24, D: 7, Rwall: Rw, Rfloor: Rf, h: 0.5, far: 40, deep: 40 });
  close(fd.balance, 1, 1e-6, 'heat in through wall and floor leaves through the ground surface');
  const closed = belowGradeWallU({ z1Ft: 0, z2Ft: 7, soilK: 0.8, otherR: Rw });
  assert.ok(Math.abs(closed / fd.wallU - 1) < 0.15, `${closed} vs FD ${fd.wallU}`);
});

const site = { latitude: 42, elevationFt: 0, heatingOutdoorF: 0, coolingOutdoorF: 90, dailyRangeF: 20, coolingDewPointF: 65, indoorHeatF: 70, indoorCoolF: 75, indoorRH: 50, annualMeanF: 50, groundAmplitudeF: 20 };
const basementRoom = { name: 'Basement', areaFt2: 600, ceilingFt: 8, floor: 'basement', basement: { depthFt: 6, wallLengthFt: 100, widthFt: 24 }, walls: [{ facing: 'S', lengthFt: 25, heightFt: 2, windowFt2: 4 }] };

test('a basement room loses heat below grade to the ground surface design temperature, and gains none in summer', () => {
  const r = calculate({ site, envelope: { basementWallR: 10, ach50: 3 }, rooms: [basementRoom] });
  assert.deepEqual(r.errors, []);
  const room = r.rooms[0];
  const dT = 70 - (50 - 20);
  const wallU = belowGradeWallU({ z1Ft: 0, z2Ft: 6, soilK: 0.8, otherR: basementWallOtherR(10) });
  const floorU = basementFloorU({ widthFt: 24, depthFt: 6, soilK: 0.8, otherR: basementFloorOtherR(0) });
  close(room.heating.belowGrade, wallU * 600 * dT, 1e-6);
  close(room.heating.floor, floorU * 600 * dT, 1e-6);
  close(r.assumptions.groundSurfaceF, 30, 1e-12);
  assert.equal(room.belowGrade.wallAreaFt2, 600);
  for (const h of room.cooling.byHour) assert.equal(h.ceiling, 0);
  // Above-grade wall still counted as an ordinary wall, 25 x 2 less the window.
  close(room.netWall, 46, 1e-12);
});

test('the ground surface temperature never exceeds the indoor temperature', () => {
  const warm = { ...site, annualMeanF: 85, groundAmplitudeF: 5 };
  const r = calculate({ site: warm, rooms: [basementRoom] });
  close(r.assumptions.groundSurfaceF, 70, 1e-12);
  assert.equal(r.rooms[0].heating.belowGrade, 0);
});

test('basement inputs are validated', () => {
  const bad = (b, extra = {}) => validate({ site, rooms: [{ ...basementRoom, ...extra, basement: b }] });
  assert.ok(bad({ depthFt: 6, wallLengthFt: 100 }).some(e => /shortest width/.test(e)));
  assert.ok(bad({ depthFt: 9, wallLengthFt: 100, widthFt: 24 }).some(e => /exceeds the ceiling height/.test(e)));
  assert.ok(validate({ site, rooms: [{ ...basementRoom, floor: 'cellar' }] }).some(e => /conditioned, slab, crawl or basement/.test(e)));
  assert.ok(validate({ site: { ...site, groundAmplitudeF: 'x' }, rooms: [basementRoom] }).some(e => /amplitude/.test(e)));
});

const atticRoom = { name: 'Studio', areaFt2: 200, ceilingFt: 8, ceilingToAttic: true, floor: 'conditioned', walls: [{ facing: 'N', lengthFt: 10 }] };

test('a skylight: heating at its U-factor, and its area taken out of the attic ceiling', () => {
  const plain = calculate({ site, rooms: [atticRoom] }).rooms[0];
  const lit = calculate({ site, envelope: { skylightU: 0.5, skylightSHGC: 0.25 }, rooms: [{ ...atticRoom, skylights: [{ areaFt2: 10 }] }] }).rooms[0];
  close(lit.heating.skylights, 0.5 * 10 * 70, 1e-9);
  close(lit.heating.ceiling, plain.heating.ceiling * 190 / 200, 1e-9);
  assert.equal(lit.skylightArea, 10);
});

test('a flat skylight at solar noon gains SHGC x area x (beam with the angle modifier + 0.9 x diffuse)', () => {
  const r = calculate({ site, envelope: { skylightSHGC: 0.25 }, rooms: [{ ...atticRoom, skylights: [{ areaFt2: 10, tiltDeg: 0 }] }] });
  const sun = sunPosition(42, 12);
  const i = irradiance(sun, 0, 0);
  const expected = 10 * 0.25 * (i.beam * angleModifier(i.cosIncidence) + 0.9 * (i.diffuse + i.reflected));
  close(r.rooms[0].cooling.byHour[11].skylightSolar, expected, 1e-9);
  // In July at 42°N a flat skylight sees more noon sun than the same glass in a south wall.
  const wall = irradiance(sun, 0, 90);
  assert.ok(i.beam > wall.beam * 2, `${i.beam} vs ${wall.beam}`);
});

test('a skylight tilted toward the north gains less in the afternoon than one toward the west', () => {
  const at = facing => calculate({ site, rooms: [{ ...atticRoom, skylights: [{ areaFt2: 10, tiltDeg: 30, facing }] }] }).rooms[0].cooling.byHour[15].skylightSolar;
  assert.ok(at('W') > at('N'));
});

test('skylight inputs are validated', () => {
  const v = sky => validate({ site, rooms: [{ ...atticRoom, skylights: [sky] }] });
  assert.ok(v({ areaFt2: 300 }).some(e => /exceed the floor area/.test(e)));
  assert.ok(v({ areaFt2: 10, tiltDeg: 120 }).some(e => /tilt/.test(e)));
  assert.ok(v({ areaFt2: 10, facing: 'UP' }).some(e => /facing/.test(e)));
});

// Red-team 2026-11-19: skylight conduction in cooling was untested (a * to / mutant escaped).
test('skylight cooling conduction is U x area x (outdoor - indoor) every hour', () => {
  const r = calculate({ site, envelope: { skylightU: 0.5 }, rooms: [{ ...atticRoom, skylights: [{ areaFt2: 10 }] }] });
  for (const k of [0, 14, 20]) {
    const dT = r.designDay[k].outdoorF - site.indoorCoolF;
    close(r.rooms[0].cooling.byHour[k].skylights, 0.5 * 10 * dT, 1e-9);
  }
});
