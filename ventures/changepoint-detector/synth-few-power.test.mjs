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

test('the FEW DONORS note quotes the confirmatory run at the nearest unit count and says to leave known shocks out beforehand', async () => {
  const { fewDonorsNote, fewPowerRow, FEW_POWER } = await import('./synth-view.mjs');
  const { readFileSync } = await import('node:fs');
  const out = readFileSync(new URL('./eval/synth-few-power-confirm.out.txt', import.meta.url), 'utf8');
  const cellRank1 = (cell) => Number(out.split('\n').find((l) => l.startsWith(cell + ' ')).split('|')[1].trim().split(/\s+/)[0].replace('%', ''));
  const cellExcl = (cell) => Number(out.split('\n').find((l) => l.startsWith(cell + ' ')).split('|')[7].trim().split('%')[0]);
  for (const r of FEW_POWER) {
    assert.equal(r.clean, cellRank1(`P${r.units}`));
    assert.equal(r.oneShocked, cellRank1(`PD${r.units}`));
    assert.equal(r.twiceShocked, cellRank1(`PE${r.units}`));
    assert.equal(r.excluded, cellExcl(`PD${r.units}`));
  }
  assert.equal(fewPowerRow(17).units, 16);
  assert.equal(fewPowerRow(6).units, 11);
  assert.equal(fewPowerRow(19).units, 21);
  const t = fewDonorsNote({ donors: 16, minP: 1 / 17 });
  assert.match(t, /In simulation with 16 units .* rank 1 60% of the time; .* same size after the date, 40%; twice the size, 9%; .* left out of the pool before the fit, 56%/);
  assert.match(t, /leave out of --donors, before fitting/);
  assert.equal(fewDonorsNote({ donors: 20, minP: 1 / 21 }), null);
});
