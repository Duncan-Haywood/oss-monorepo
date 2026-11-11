import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frictionFactor, roundFriction, rectEquivalentIn, rectangleFor, pickRound, sizeDucts, validateDucts, designFromLoad, ductReport, airDensity, EXAMPLE_DUCTS, ROUND_SIZES_IN } from './duct.mjs';
import { calculate, EXAMPLE } from './load.mjs';
import { parseArgs, run } from './cli.mjs';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b}`);

test('Colebrook: laminar is 64/Re, smooth pipe matches Blasius, rough pipe tends to von Karman', () => {
  close(frictionFactor(1000, 0), 0.064, 1e-12);
  // Blasius 0.316 Re^-0.25 is good to about 1% near Re 1e4 to 1e5 in smooth pipe.
  close(frictionFactor(5e4, 0), 0.316 * 5e4 ** -0.25, 0.0004);
  // Fully rough: 1/sqrt(f) = -2 log10(e/3.7D).
  close(frictionFactor(1e9, 0.01), 1 / (2 * Math.log10(3.7 / 0.01)) ** 2, 1e-5);
  // The solution satisfies Colebrook itself.
  const re = 4e4, e = 0.00045, f = frictionFactor(re, e);
  close(1 / Math.sqrt(f), -2 * Math.log10(e / 3.7 + 2.51 / (re * Math.sqrt(f))), 1e-9);
});

test('round-duct friction agrees with an independent power-law fit for galvanized duct', () => {
  // dp/100 ft = 0.109136 q^1.9 / D^5.02 (q cfm, D in), a widely quoted fit to a
  // standard-air friction chart; an independent check on the units, not our method.
  // Measured here: at roughness 0.0005 ft the engine is within 5% of the fit at
  // every point; at the default 0.0003 ft it is 3-9% lower (smoother duct).
  for (const [q, d] of [[50, 4], [100, 6], [200, 8], [400, 10], [1000, 16], [2000, 20]]) {
    const fit = 0.109136 * q ** 1.9 / d ** 5.02;
    const r = roundFriction(q, d);
    assert.ok(r.inWCPer100 < fit && r.inWCPer100 > 0.91 * fit, `${q} cfm in ${d} in.: ${r.inWCPer100} vs ${fit}`);
    const older = roundFriction(q, d, { roughnessFt: 0.0005 });
    assert.ok(Math.abs(older.inWCPer100 / fit - 1) < 0.05, `${q} cfm in ${d} in. at 0.0005 ft: ${older.inWCPer100} vs ${fit}`);
    close(r.fpm, q / (Math.PI * (d / 12) ** 2 / 4), 1e-9, 'velocity');
  }
});

test('thin air at altitude loses less per foot; rougher duct loses more', () => {
  const sea = roundFriction(200, 8), high = roundFriction(200, 8, { elevationFt: 5000 });
  assert.ok(high.inWCPer100 < sea.inWCPer100 && high.inWCPer100 > 0.8 * sea.inWCPer100);
  close(airDensity(0), 0.075, 1e-12);
  assert.ok(roundFriction(200, 8, { roughnessFt: 0.003 }).inWCPer100 > 1.3 * sea.inWCPer100);
});

test('Huebscher equivalent: a square is about 1.09 times its side; rectangleFor is the narrowest width', () => {
  close(rectEquivalentIn(10, 10), 10.93, 0.01);
  const r = rectangleFor(12, 8, 2);
  assert.equal(r.widthIn, 16);
  assert.ok(rectEquivalentIn(14, 8) < 12);
});

test('pickRound takes the smallest size meeting both limits and says which one bound', () => {
  const o = { sizesIn: ROUND_SIZES_IN, roughnessFt: 0.0003, elevationFt: 0 };
  const p = pickRound(200, 0.08, 900, o);
  assert.equal(p.diameterIn, 8);
  assert.equal(p.limit, 'friction');
  assert.ok(roundFriction(200, 7).inWCPer100 > 0.08);
  // A generous friction rate leaves velocity to set the size.
  const v = pickRound(400, 0.5, 700, o);
  assert.equal(v.limit, 'velocity');
  assert.ok(v.fpm <= 700 && roundFriction(400, ROUND_SIZES_IN[ROUND_SIZES_IN.indexOf(v.diameterIn) - 1]).fpm > 700);
  assert.equal(pickRound(20000, 0.08, 900, o), null);
});

test('the design friction rate is available static over the longest supply plus longest return', () => {
  const s = sizeDucts({ runs: [{ room: 'A', cfm: 200, effectiveLengthFt: 150 }, { room: 'B', cfm: 100, effectiveLengthFt: 90 }], returnEffectiveLengthFt: 50 });
  assert.deepEqual(s.errors, []);
  close(s.pressure.availableInWC, 0.5 - 0.36, 1e-12);
  close(s.pressure.frictionRate, 0.14 * 100 / 200, 1e-12);
  for (const r of s.supply) {
    assert.ok(r.inWCPer100 <= s.pressure.frictionRate + 1e-9);
    close(r.dropInWC, r.inWCPer100 * r.effectiveLengthFt / 100, 1e-12);
    // The path never exceeds what the blower has; the rest is the damper's.
    assert.ok(r.pathInWC <= s.pressure.availableInWC + 1e-9);
    close(r.damperInWC + r.pathInWC, s.pressure.availableInWC, 1e-12);
  }
  // The short run has more to throttle.
  assert.ok(s.supply[1].damperInWC > s.supply[0].damperInWC);
  assert.equal(s.trunks[0].cfm, 300);
  assert.equal(s.returns[0].cfm, 300);
});

test('refusals: components eating all the static, bad trunks, missing lengths', () => {
  assert.match(sizeDucts({ blowerStaticInWC: 0.3, runs: [{ room: 'A', cfm: 100, effectiveLengthFt: 50 }], returnEffectiveLengthFt: 20 }).errors[0], /nothing is left for the ducts/);
  assert.match(validateDucts({ runs: [{ room: 'A', cfm: 100, effectiveLengthFt: 50 }], returnEffectiveLengthFt: 20, trunks: [{ name: 'T', rooms: ['Z'] }] }).join(), /"Z", which has no supply run/);
  assert.match(validateDucts({ runs: [{ room: 'A', cfm: 100 }], returnEffectiveLengthFt: 20 }).join(), /total effective length must be a number/);
  assert.match(validateDucts({ runs: [] }).join(), /at least one supply run/);
  assert.match(validateDucts({ runs: [{ room: 'A', cfm: 100, effectiveLengthFt: 50 }], returnEffectiveLengthFt: 20, material: 'cardboard' }).join(), /metal or flex/);
});

test('the example ranch: every room sized, trunks carry their rooms, return carries the total', () => {
  const house = { ...EXAMPLE, ducts: EXAMPLE_DUCTS };
  const load = calculate(house);
  const s = sizeDucts(designFromLoad(load, house));
  assert.deepEqual(s.errors, []);
  assert.equal(s.supply.length, load.rooms.length);
  for (const r of s.supply) assert.ok(r.diameterIn >= 4);
  close(s.trunks.reduce((a, t) => a + t.cfm, 0), s.totalSupplyCFM, 1e-9);
  close(s.returns[0].cfm, s.totalSupplyCFM, 1e-9);
  assert.equal(s.pressure.longestSupplyFt, 185);
  assert.ok(s.warnings.some(w => /Hall bath/.test(w)));
  const text = ductReport(s);
  assert.match(text, /Design friction rate/);
  assert.match(text, /not an ACCA Manual D/);
});

test('CLI --ducts runs on the example and refuses a house with no ducts block', () => {
  const r = run(parseArgs(['--example', '--ducts']));
  assert.equal(r.error, undefined);
  assert.ok(r.ducts.supply.length > 0);
  const house = JSON.stringify({ rooms: [{ name: 'A', areaFt2: 200, ceilingToAttic: true, walls: [{ facing: 'W', lengthFt: 14, windowFt2: 20 }] }] });
  assert.match(run(parseArgs(['h.json', '--ducts']), () => house).error, /no "ducts" block/);
  const withDucts = JSON.stringify({ ...JSON.parse(house), ducts: { defaultEffectiveLengthFt: 80, returnEffectiveLengthFt: 30 } });
  assert.equal(run(parseArgs(['h.json', '--ducts']), () => withDucts).ducts.supply[0].room, 'A');
});
