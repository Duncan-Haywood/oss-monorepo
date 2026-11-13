import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sizeSystem, sizesFor, frictionPsiPer100, velocityFps, EXAMPLE_SYSTEM, PSI_PER_FT } from './pipe.mjs';

const clone = x => JSON.parse(JSON.stringify(x));

test('inside diameters: ASTM B88 OD minus two walls, in size order', () => {
  const l = sizesFor('copper-l');
  assert.deepEqual(l.map(s => s.nominal), ['1/2', '3/4', '1', '1-1/4', '1-1/2', '2']);
  assert.deepEqual(l.map(s => s.id), [0.545, 0.785, 1.025, 1.265, 1.505, 1.985]);
  assert.deepEqual(sizesFor('copper-k').slice(0, 3).map(s => s.id), [0.527, 0.745, 0.995]);
  assert.deepEqual(sizesFor('copper-m').slice(0, 3).map(s => s.id), [0.569, 0.811, 1.055]);
  // SDR 9: 1/2 in hits the 0.070 in minimum wall.
  assert.deepEqual(sizesFor('pex-sdr9').slice(0, 3).map(s => s.id), [0.485, 0.681, 0.875]);
  assert.throws(() => sizesFor('lead'));
});

test('Hazen-Williams scales as Q^1.852 and d^-4.8655; velocity as Q/d^2', () => {
  const a = frictionPsiPer100(5, 0.785, 140), b = frictionPsiPer100(10, 0.785, 140);
  assert.ok(Math.abs(b / a - 2 ** 1.852) < 1e-9);
  assert.ok(Math.abs(frictionPsiPer100(5, 0.5, 140) / frictionPsiPer100(5, 1, 140) - 2 ** 4.8655) < 1e-6);
  // Hand check: 10 gpm, 1 in bore, C 100: 0.2083 ft per 100 ft x 10^1.852.
  assert.ok(Math.abs(frictionPsiPer100(10, 1, 100) - 0.2083 * 10 ** 1.852 * 0.433) < 1e-9);
  assert.equal(frictionPsiPer100(0, 1, 140), 0);
  assert.ok(Math.abs(velocityFps(10, 1) - 4.085) < 1e-9);
});

test('example house: tightest path sets the friction rate and every end holds the minimum', () => {
  const r = sizeSystem(EXAMPLE_SYSTEM);
  assert.deepEqual(r.errors, []);
  assert.equal(r.criticalEnd, 'Hall bath');
  // (60 - 6 - 20 - 0.433 x 10) / (130 ft x 1.5) x 100
  assert.ok(Math.abs(r.allowablePsiPer100 - (60 - 6 - 20 - PSI_PER_FT * 10) / 195 * 100) < 1e-9);
  for (const e of r.ends) assert.ok(e.pressurePsi >= 20, `${e.end} ${e.pressurePsi}`);
  for (const s of r.segments) {
    assert.ok(s.psiPer100 <= r.allowablePsiPer100 + 1e-9, s.name);
    assert.ok(s.velocityFps <= 8 + 1e-9, s.name);
  }
  // Flow only falls going downstream.
  const by = Object.fromEntries(r.segments.map(s => [s.name, s]));
  for (const s of r.segments) if (s.from) assert.ok(s.gpm <= by[s.from].gpm, s.name);
  // The service carries every fixture.
  assert.equal(by['Service to house'].served.Lavatory, 4);
  assert.equal(by['Service to house'].served.Shower, 2);
});

test('each size is the smallest that meets friction and velocity', () => {
  const r = sizeSystem(EXAMPLE_SYSTEM);
  const sizes = sizesFor('copper-l');
  for (const s of r.segments) {
    const i = sizes.findIndex(z => z.nominal === s.nominal);
    if (i === 0 || s.gpm === 0) continue;
    const smaller = sizes[i - 1];
    assert.ok(frictionPsiPer100(s.gpm, smaller.id, 140) > r.allowablePsiPer100 || velocityFps(s.gpm, smaller.id) > 8, s.name);
  }
});

test('a tight velocity limit upsizes; low pressure is refused with the reason', () => {
  const slow = clone(EXAMPLE_SYSTEM); slow.maxVelocityFps = 4;
  const r = sizeSystem(slow);
  // 10.8 gpm is 4.2 ft/s in 1 in (bore 1.025), so 1-1/4 in.
  assert.equal(r.segments.find(s => s.name === 'Service to house').nominal, '1-1/4');
  const low = clone(EXAMPLE_SYSTEM); low.staticPsi = 28;
  assert.match(sizeSystem(low).errors[0], /no pressure left for friction.*booster/);
});

test('trim spends spare pressure on smaller pipe and keeps every end at the minimum', () => {
  const plain = sizeSystem(EXAMPLE_SYSTEM);
  const r = sizeSystem({ ...EXAMPLE_SYSTEM, trim: true });
  assert.deepEqual(r.errors, []);
  assert.ok(r.trimmed > 0);
  const step = s => sizesFor('copper-l').findIndex(z => z.nominal === s.nominal);
  for (const [i, s] of r.segments.entries()) {
    assert.ok(step(s) <= step(plain.segments[i]), s.name);
    assert.ok(s.velocityFps <= 8 + 1e-9, s.name);
  }
  for (const e of r.ends) assert.ok(e.pressurePsi >= 20 - 1e-9, `${e.end} ${e.pressurePsi}`);
  assert.equal(plain.trimmed, 0);
});

test('bad systems are reported', () => {
  const e = x => sizeSystem(x).errors.join('\n');
  const base = clone(EXAMPLE_SYSTEM);
  const two = clone(base); two.segments[1].parent = undefined;
  assert.match(e(two), /Exactly one segment/);
  const orphan = clone(base); orphan.segments[2].parent = 'Nowhere';
  assert.match(e(orphan), /not a segment/);
  const loop = clone(base); loop.segments[0].parent = 'Powder room';
  assert.match(e(loop), /Exactly one segment|loop/);
  const dup = clone(base); dup.segments[5].name = 'Hall bath';
  assert.match(e(dup), /Two segments/);
  const unknown = clone(base); unknown.segments[5].fixtures = { Bidet: 1 };
  assert.match(e(unknown), /"Bidet" is not defined/);
  const mat = clone(base); mat.material = 'lead';
  assert.match(e(mat), /Unknown material/);
  assert.match(e({ ...base, segments: [] }), /at least one pipe segment/);
});
