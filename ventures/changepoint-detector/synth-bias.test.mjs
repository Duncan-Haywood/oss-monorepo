// The covariate-bias simulation (eval/synth-bias-sim.mjs, README "Which imbalance biases the gap"): the shock moves
// every unit by beta * Z from the date on, so the part of the gap Z explains is beta * sd(Z) * stdGap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CELLS, biasPanel, scorePanel } from './eval/synth-bias-sim.mjs';
import { panel } from './eval/synth-sim.mjs';

test('bias panels: before the date unchanged, after it shifted by beta * Z', () => {
  const cell = CELLS.B3, seed = 4242;
  const plain = panel(cell, seed), { rows, z } = biasPanel(cell, seed);
  assert.equal(z[0], 1.8);
  for (let i = 0; i < rows.length; i += 7) for (let t = 0; t < rows[i].length; t++) {
    assert.ok(Math.abs(rows[i][t] - plain[i][t] - (t >= cell.k ? 0.5 * z[i] : 0)) < 1e-12);
  }
});

test('the Z part of the gap is beta * sd * stdGap; beta 0 leaves no Z part', () => {
  const s = scorePanel(CELLS.B1, 977);
  const { z } = biasPanel(CELLS.B1, 977);
  const mu = z.reduce((a, b) => a + b, 0) / z.length, sd = Math.sqrt(z.reduce((a, b) => a + (b - mu) ** 2, 0) / (z.length - 1));
  assert.ok(Math.abs(s.zPart - 0.5 * sd * s.stdGap) < 1e-9);
  assert.equal(scorePanel(CELLS.B0, 977).zPart, 0);
  assert.equal(typeof s.placeboShare, 'number');
});
