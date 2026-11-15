// The over-the-height-limit warning quotes the peak a second shed would have
// (the lowest walls, a 3/12 roof). buildAuto frames many probe sheds (each pitch
// it tries, each overhang it prices) and leaves that second framing pending on
// them; only the shed it returns gets it. These tests pin the returned warning
// to the one a plain build of the same design writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShed, normalize, defaultDesign, PRESETS } from './model.mjs';

const peakWarning = (s) => s.warnings.filter((w) => w.startsWith('The peak is'));
const plain = (s) => buildShed(normalize({ ...s.design, autoWall: false, autoPitch: false, autoOverhang: false }));

const cases = {
  'default, 6 ft limit': { ...defaultDesign(), maxPeak: 72 },
  'default, every auto on, 7 ft limit': { ...defaultDesign(), maxPeak: 84, autoWall: true, autoPitch: true, autoOverhang: true },
  '12x16, auto pitch only': { ...PRESETS['12x16'](), maxPeak: 90, autoPitch: true, autoOverhang: false, autoWall: false },
  '12x16, auto overhang only, fixed pitch': { ...PRESETS['12x16'](), maxPeak: 90, pitch: 8, autoPitch: false, autoOverhang: true, autoWall: false },
  'lean-to, every auto on': { ...PRESETS['8x12 lean-to'](), maxPeak: 70, autoWall: true, autoPitch: true, autoOverhang: true },
  'lap siding, auto pitch': { ...defaultDesign(), sidingType: 'LP SmartSide lap', maxPeak: 80, autoPitch: true, autoOverhang: true },
};

for (const [name, d] of Object.entries(cases)) {
  test(`over the limit, the auto shed's warning is the plain build's: ${name}`, () => {
    const s = buildShed(d);
    const w = peakWarning(s);
    assert.equal(w.length, 1, 'one peak warning');
    assert.match(w[0], /the peak would still be \d/);
    assert.deepEqual(w, peakWarning(plain(s)));
    assert.ok(!s.warnings.includes(''), 'no placeholder left behind');
    assert.ok(!Object.getOwnPropertyNames(s).includes('pendingPeak'), 'the pending framing is finished and removed');
  });
}

test('under the limit there is no peak warning and nothing pending', () => {
  const s = buildShed({ ...defaultDesign(), maxPeak: 200, autoPitch: true, autoOverhang: true });
  assert.equal(peakWarning(s).length, 0);
  assert.ok(!Object.getOwnPropertyNames(s).includes('pendingPeak'));
});
