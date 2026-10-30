import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShed, defaultDesign, normalize, PRESETS } from './model.mjs';
import { designDiff, generateCandidates } from './candidates.mjs';

test('designDiff names what changes, in plain words and in members', () => {
  const a = buildShed(normalize(defaultDesign()));
  assert.deepEqual(designDiff(a, a), []);
  const b = buildShed(normalize(PRESETS['8x12 classic']()));
  const d = designDiff(a, b).join('; ');
  assert.match(d, /roof ridge beam on posts → ridge board with rafter ties/);
  assert.match(d, /walls 7' 2-1\/2" → 8' 0"/);
  assert.match(d, /members: .*rafter tie/);
});

test('every option says what it changes and its price against your design', () => {
  const opts = generateCandidates(normalize(defaultDesign()));
  const yours = opts.find((o) => o.label === 'Your design as set');
  assert.deepEqual(yours.changes, []);
  assert.equal(yours.delta, 0);
  for (const o of opts.filter((x) => x !== yours)) assert.ok(o.changes.length > 0, o.label);
  // A lower roof drops the gable vents, which its label alone does not say.
  assert.match(opts.find((o) => /Lower roof/.test(o.label)).changes.join(' '), /-\d+ vent header/);
});
