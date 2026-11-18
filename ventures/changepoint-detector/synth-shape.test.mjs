// The non-step covariate shock simulation (eval/synth-shape-sim.mjs, README "Shocks that are not steps"): each shape
// averages 1 over the 12 points after the date, the panel is unchanged before the date, and W moves nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CELLS, SHAPES, shapePanel, scorePanel } from './eval/synth-shape-sim.mjs';
import { panel } from './eval/synth-sim.mjs';

test('each shape averages 1 over the 12 points after the date', () => {
  for (const f of Object.values(SHAPES)) {
    const s = Array.from({ length: 12 }, (_, h) => f(h)).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(s / 12 - 1) < 1e-12);
  }
});

test('shape panels: unchanged before the date, shifted by beta * Z * shape after it', () => {
  for (const name of ['S2', 'P1']) {
    const cell = CELLS[name], seed = 7171;
    const plain = panel(cell, seed), { rows, z } = shapePanel(cell, seed);
    for (let i = 0; i < rows.length; i += 5) for (let t = 0; t < rows[i].length; t++) {
      const want = t >= cell.k ? cell.beta * z[i] * SHAPES[cell.shape](t - cell.k) : 0;
      assert.ok(Math.abs(rows[i][t] - plain[i][t] - want) < 1e-12);
    }
  }
});

test('beta 0 leaves the panel as generated; a score carries both warnings', () => {
  const { rows } = shapePanel(CELLS.S0, 99), plain = panel(CELLS.S0, 99);
  assert.deepEqual(rows.map((r) => [...r]), plain.map((r) => [...r]));
  const s = scorePanel(CELLS.S1, 99);
  assert.equal(typeof s.zWarn, 'boolean');
  assert.equal(typeof s.wWarn, 'boolean');
  assert.ok(Number.isFinite(s.bias) && Number.isFinite(s.biasEnd) && s.p > 0 && s.p <= 1);
});
