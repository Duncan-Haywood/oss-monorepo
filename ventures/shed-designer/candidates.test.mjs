import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShed, defaultDesign, normalize, PRESETS } from './model.mjs';
import { designDiff, generateCandidates, openingCosts } from './candidates.mjs';

test('designDiff names what changes, in plain words and in members', () => {
  const a = buildShed(normalize(defaultDesign()));
  assert.deepEqual(designDiff(a, a), []);
  const b = buildShed(normalize(PRESETS['8x12 classic']()));
  const d = designDiff(a, b).join('; ');
  assert.match(d, /roof ridge beam on posts → ridge board with rafter ties/);
  assert.match(d, /walls [^→;]+ → 8' 0"/);
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

test('an opening costs the shed with it less the shed without it, walls held', () => {
  const d = defaultDesign();
  const costs = openingCosts(d);
  assert.equal(costs.length, d.openings.length);
  const [door, win] = costs;
  // The site-built door's cost does not include lowering the walls it sets.
  assert.ok(door.total > 0 && door.total < 200, `door ${door.total}`);
  // The first window is a $51.95 unit; with its framing, casing, caulk and trim it costs more in all.
  assert.ok(win.total > 51.95 && win.total < 120, `window ${win.total}`);
  assert.ok(win.lumber > 0, 'its framing adds lumber');
  assert.ok(costs.every((c) => !c.unpriced));
  assert.ok(openingCosts(PRESETS['8x12 classic']()).every((c) => c.unpriced), 'custom sizes say their unit is not priced');
});
