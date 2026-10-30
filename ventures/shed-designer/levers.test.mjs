import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultDesign, normalize } from './model.mjs';
import { budget, simplify } from './simplify.mjs';
import { LOCKABLE, fixedKeys, searchKeep, LEVER_KNOBS } from './levers.mjs';

test('locked choices are kept by normalize, junk is dropped', () => {
  assert.deepEqual(normalize({ ...defaultDesign(), locked: ['siding', 'siding', 'nonsense', 3] }).locked, ['siding']);
  assert.deepEqual(normalize({ ...defaultDesign(), locked: 'siding' }).locked, []);
  assert.deepEqual(defaultDesign().locked, []);
});

test('fixed keys: design keys for a whole-openings search; doors and windows apart for the budget search', () => {
  const d = { locked: ['roofing', 'doors'] };
  assert.ok(fixedKeys(d).includes('roofCover') && fixedKeys(d).includes('openings'));
  assert.ok(searchKeep(d).includes('roofCover') && searchKeep(d).includes('doors') && !searchKeep(d).includes('openings'));
  for (const k of Object.keys(LEVER_KNOBS)) assert.ok(k in defaultDesign(), k);
  for (const v of Object.values(LOCKABLE)) for (const k of v.keys) assert.ok(k in defaultDesign(), k);
});

test('the budget search never changes a fixed siding, roofing, floor or window choice', () => {
  const free = budget(defaultDesign());
  const labels = free.best.steps.map((s) => s.label).join('|');
  assert.match(labels, /siding|subfloor|floor joists/, 'unfixed, it changes some of these');
  const d = { ...defaultDesign(), locked: ['siding', 'roofing', 'floor', 'windows'] };
  const r = budget(d);
  const b = r.best.design;
  for (const k of ['sidingType', 'roofCover', 'joistSize', 'joistSpacing', 'floorPanel']) assert.equal(b[k], d[k], k);
  assert.deepEqual(b.openings.filter((o) => o.kind === 'window'), d.openings.filter((o) => o.kind === 'window'));
  for (const a of r.also) assert.doesNotMatch(a.label, /siding|roof$|subfloor|joists/);
  const s = simplify(d, undefined, { rounds: 3, goals: ['cheapest'] });
  for (const k of ['joistSize', 'joistSpacing']) assert.equal(s.winners.cheapest.design[k], d[k], k);
});
