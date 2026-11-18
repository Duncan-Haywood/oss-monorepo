// The panel shape word scored only on the panels where it switches on (README "The panel word scored where it switches
// on", pre-registered eval/synth-shape-switch-prereg-2026-11-18.md; bars 1, 2 and 5 hold, 3 and 4 fail, so the plain
// word stays the default). Re-checks every bar against the confirmatory file, that PANEL_SHAPE quotes it, and that the
// simulation's generators and scoring still give the recorded panels.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PANEL_SHAPE } from './synth-view.mjs';
import { CELLS, scorePanel, family } from './eval/synth-shape-switch-sim.mjs';
import { seedOf } from './eval/synth-floor-sim.mjs';

const txt = readFileSync(new URL('./eval/synth-shape-switch-confirm.out.txt', import.meta.url), 'utf8');
const block = (key) => { const i = txt.indexOf(`\n${key}: `); assert.ok(i >= 0, key); const j = txt.indexOf('\n\n', i + 1); return txt.slice(i, j < 0 ? undefined : j); };
const rate = (key, line) => {
  const m = block(key).match(new RegExp(`\\n  ${line}\\s+plain\\s+(-?[\\d.]+)(?:%| pts)\\s+panel\\s+(-?[\\d.]+)(?:%| pts)`));
  assert.ok(m, `${key}: ${line}`);
  return { plain: Number(m[1]), panel: Number(m[2]) };
};
const SW = 'growing-all | switched';

test('bar 1 holds: clean units worded at least 25 points less where the rule is on', () => {
  const r = rate(SW, 'clean worded');
  assert.ok(r.plain - r.panel >= 25, `${r.plain} - ${r.panel}`);
  assert.deepEqual(r, { plain: 67.5, panel: 28.9 });
});
test('bar 2 holds: pulse lift at least plain', () => {
  const r = rate(SW, 'pulse lift');
  assert.ok(r.panel >= r.plain);
  assert.deepEqual(r, { plain: 68.7, panel: 77.1 });
});
test('bar 3 fails: slope lift far below plain minus 5', () => {
  const r = rate(SW, 'slope lift');
  assert.ok(r.panel < r.plain - 5);
  assert.deepEqual(r, { plain: 21.9, panel: -4.9 });
});
test('bar 4 fails: a slope donor is worded less often than a clean unit', () => {
  const r = rate(SW, 'slope flag lift');
  assert.ok(r.panel < 0);
  assert.deepEqual(r, { plain: 20.3, panel: -14.7 });
});
test('bar 5 holds: bar 1 in each growing generator', () => {
  for (const fam of ['growing', 'growing-ar0.7', 'growing-ar0.97']) {
    const r = rate(`${fam} | switched`, 'clean worded');
    assert.ok(r.plain - r.panel >= 25, fam);
  }
});
test('where the rule stays off the two words agree (trendless: 1 of 8000 panels switched)', () => {
  assert.match(block('trendless | all panels'), /8000 panels, 1 switched/);
  const r = rate('trendless | all panels', 'pulse faded');
  assert.equal(r.plain, r.panel);
});
test('PANEL_SHAPE quotes the confirmatory switched-panel block', () => {
  assert.equal(PANEL_SHAPE.cleanPanel, rate(SW, 'clean above worded').panel);
  assert.equal(PANEL_SHAPE.cleanPlain, rate(SW, 'clean above worded').plain);
  assert.equal(PANEL_SHAPE.pulsePanel, rate(SW, 'pulse faded').panel);
  assert.equal(PANEL_SHAPE.pulsePlain, rate(SW, 'pulse faded').plain);
  assert.equal(PANEL_SHAPE.bigSlopeHeldPanel, rate(SW, 'big slope held').panel);
  assert.equal(PANEL_SHAPE.bigSlopeHeldPlain, rate(SW, 'big slope held').plain);
  assert.equal(PANEL_SHAPE.slopeWordedPanel, rate(SW, 'slope worded').panel);
  assert.equal(PANEL_SHAPE.cleanAllPanel, rate(SW, 'clean worded').panel);
});
test('the simulation: 80 cells in five families, and a fixed seed gives a fixed panel', () => {
  const names = Object.keys(CELLS);
  assert.equal(names.length, 80);
  const fams = names.reduce((c, n) => { c[family(n)] = (c[family(n)] ?? 0) + 1; return c; }, {});
  assert.deepEqual(fams, { trendless: 20, wander: 24, growing: 12, 'growing-ar0.7': 12, 'growing-ar0.97': 12 });
  const ci = names.indexOf('KSE16'), a = scorePanel(CELLS.KSE16, seedOf(93000, ci, 0)), b = scorePanel(CELLS.KSE16, seedOf(93000, ci, 0));
  assert.deepEqual(a, b);
  assert.equal(a.shape, 'slope');
  assert.equal(a.units, 16);
});
