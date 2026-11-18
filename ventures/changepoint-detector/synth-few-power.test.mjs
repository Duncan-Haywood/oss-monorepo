// The few-donor size and power simulation (eval/synth-few-power-sim.mjs, README "Few donors: size and power"): the
// treated unit drops by the cell's effect from the date and donor 1 moves by the cell's shock; nothing else changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CELLS, fewPanel, scorePanel } from './eval/synth-few-power-sim.mjs';
import { panel } from './eval/synth-sim.mjs';

test('few-donor panels: units 0 and 1 shifted from the date by the effect and the signed shock, the rest untouched', () => {
  for (const name of ['N11', 'PD16', 'PE21']) {
    const cell = CELLS[name], seed = 4242;
    const plain = panel(cell, seed), { rows, sign } = fewPanel(cell, seed);
    assert.equal(rows.length, cell.units);
    for (let i = 0; i < rows.length; i++) for (let t = 0; t < rows[i].length; t++) {
      const want = t < cell.k ? 0 : i === 0 ? cell.effect0 : i === 1 ? sign * cell.shock : 0;
      assert.ok(Math.abs(rows[i][t] - plain[i][t] - want) < 1e-12, `${name} unit ${i} t ${t}`);
    }
  }
});

test('a score: p is rank / units, the excluded fit has one donor fewer', () => {
  const s = scorePanel(CELLS.PD11, 77);
  assert.ok(Math.abs(s.p - s.rank / 11) < 1e-12);
  assert.ok(s.rank >= 1 && s.rank <= 11 && s.rankExcl >= 1 && s.rankExcl <= 10);
  assert.equal(typeof s.shockedAbove, 'boolean');
  assert.ok(s.shockedWeight >= 0 && s.shockedWeight <= 1);
});
