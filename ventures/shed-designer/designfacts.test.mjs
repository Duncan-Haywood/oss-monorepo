import test from 'node:test';
import assert from 'node:assert/strict';
import { designFacts, compareRows, tradeOff, BREAKDOWN_TOP } from './designfacts.mjs';
import { PRESETS, defaultDesign, buildShed, normalize } from './model.mjs';
import { estimate } from './estimate.mjs';

test('the cost breakdown adds up to the materials total', () => {
  for (const make of Object.values(PRESETS)) {
    const f = designFacts(make());
    const sum = f.breakdown.reduce((t, b) => t + b.total, 0);
    assert.ok(Math.abs(sum - f.total) < 0.05, `${f.name}: ${sum} vs ${f.total}`);
    assert.ok(f.breakdown.length <= BREAKDOWN_TOP + 1);
    assert.equal(f.total, estimate(buildShed(make())).total, 'the same total the editor shows');
    assert.ok(f.breakdown.every((b) => b.name === 'Everything else' || ['Foundation and site', 'Floor', 'Wall framing', 'Roof framing and deck', 'Roofing', 'Siding', 'Trim', 'Doors, windows and vents', 'Fasteners and hardware', 'Paint and finish', 'Inside finish'].includes(b.name)), `${f.name}: grouped by assembly, as the editor's cost tab is`);
  }
});

test('storage is measured inside the studs', () => {
  const f = designFacts(defaultDesign());
  // 8x12 with 2x4 walls: (144 - 7) x (96 - 7) inches.
  assert.ok(Math.abs(f.storage.floorSqFt - (137 * 89) / 144) < 1e-9);
  assert.ok(f.storage.floorSqFt < f.footprintSqFt);
  assert.ok(f.storage.volumeCuFt > f.storage.floorSqFt * f.wallHeight / 12, 'the gable adds volume above the walls');
  // The default is a ridge-beam roof: headroom runs to the beam, above the walls.
  assert.equal(f.storage.open, true);
  assert.ok(f.storage.headroom > f.wallHeight && f.storage.headroom < f.peak);
  // A ridge-board roof's ties cross at the plates.
  const c = designFacts(PRESETS['8x12 classic']());
  assert.equal(c.storage.open, false);
  assert.equal(c.storage.headroom, c.wallHeight);
  // Shelf wall: the inside perimeter less the door and both windows.
  assert.ok(Math.abs(f.storage.shelfFt - (2 * 137 + 2 * 89 - 38.5 - 2 * 14.25) / 12) < 1e-9);
});

test('compare marks rows that differ and the best on each, with ties shared', () => {
  const a = designFacts(PRESETS['8x10']());
  const b = designFacts(PRESETS['10x12']());
  const rows = compareRows([a, b]);
  const row = (k) => /** @type {any} */ (rows.find((r) => r.key === k));
  assert.deepEqual(row('total').best, [a.total < b.total ? 0 : 1]);
  assert.deepEqual(row('floor').best, [1]);
  assert.equal(row('siding').differs, false, 'both T1-11 stained');
  assert.deepEqual(row('siding').best, []);
  // The same design twice: nothing differs, nothing wins.
  const same = compareRows([a, a]);
  assert.ok(same.every((r) => !r.differs && r.best.length === 0));
});

test('the reason on the list comes from the numbers when none is given', () => {
  const all = Object.entries(PRESETS).map(([id, make]) => designFacts(make(), { id }));
  const cheapest = all.reduce((m, f) => (f.total < m.total ? f : m));
  assert.match(tradeOff(cheapest, all), /lowest materials cost/);
  const given = designFacts(defaultDesign(), { reason: 'Fits under the 8 ft height limit.' });
  assert.equal(tradeOff(given, all), 'Fits under the 8 ft height limit.');
  for (const f of all) assert.match(tradeOff(f, all), /^[A-Z0-9].*\.$/);
});

test('the facts carry the looks score term by term and the full cost breakdown, for the gallery card and detail', async () => {
  const { looksOf } = await import('./designsearch.mjs');
  const { costDelta, deltaPhrase } = await import('./costs.mjs');
  const a = designFacts(PRESETS['8x12']());
  const b = designFacts(PRESETS['8x12 classic']());
  assert.deepEqual(a.looks, looksOf(buildShed(normalize(PRESETS['8x12']()))));
  assert.ok(a.looks.terms.length >= 6 && a.looks.terms.every((t) => t.points <= t.max && t.why));
  assert.ok(Math.abs(a.costs.total - a.total) < 0.01, 'the breakdown sums to the price');
  // The cost change against another design adds up to the difference in price.
  const d = costDelta(a.costs, b.costs);
  assert.ok(Math.abs(d.reduce((t, x) => t + x.delta, 0) - (b.total - a.total)) < 0.5 * (d.length + 1));
  assert.ok(deltaPhrase(d).length > 0);
});
