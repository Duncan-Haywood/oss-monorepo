// The anticipation simulation (eval/synth-anticip-sim.mjs, README "A shock before the date"): the covariate shock or
// the true effect starts `lead` points before the stated date, and nothing else in the panel changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CELLS, anticipPanel, scorePanel } from './eval/synth-anticip-sim.mjs';
import { panel } from './eval/synth-sim.mjs';

test('anticipation panels: unchanged before k - lead, shifted by beta * Z (+ drop for the treated unit) from it', () => {
  for (const name of ['A2', 'A4', 'E2', 'E4']) {
    const cell = CELLS[name], seed = 8181;
    const plain = panel(cell, seed), { rows, z } = anticipPanel(cell, seed);
    for (let i = 0; i < rows.length; i += 4) for (let t = 0; t < rows[i].length; t++) {
      const want = t >= cell.k - cell.lead ? cell.beta * z[i] + (i === 0 ? cell.drop : 0) : 0;
      assert.ok(Math.abs(rows[i][t] - plain[i][t] - want) < 1e-12, `${name} unit ${i} t ${t}`);
    }
  }
});

test('A0 leaves the panel as generated; a score has the stated date and both backdates', () => {
  const { rows } = anticipPanel(CELLS.A0, 99), plain = panel(CELLS.A0, 99);
  assert.deepEqual(rows.map((r) => [...r]), plain.map((r) => [...r]));
  const s = scorePanel(CELLS.E2, 99);
  for (const b of ['b0', 'b2', 'b4']) {
    assert.ok(s[b].p > 0 && s[b].p <= 1);
    assert.equal(typeof s[b].zWarn, 'boolean');
    assert.ok(Number.isFinite(s[b].gapStated));
  }
  // at the stated date the gap over the stated window is the effect average itself
  assert.ok(Math.abs(s.b0.gapStated - s.b0.bias) < 1e-12);
});
