// Two shocked donors and a shocked best match (eval/synth-two-shock-sim.mjs, README "Two shocked donors, and a shocked
// best match"): the panels move only the units the cell names, and the notes quote the confirmatory file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CELLS, twoShockPanel, scorePanel } from './eval/synth-two-shock-sim.mjs';
import { panel } from './eval/synth-sim.mjs';
import { synthFit } from './synth-control.mjs';
import { TWO_SHOCK, twoShockRow, fewDonorsNote, aboveNote, HEAVY_WEIGHT } from './synth-view.mjs';

test('two-shock panels: the treated unit and the named donors move from the date, nothing else', () => {
  for (const name of ['NDD11', 'PEE16', 'PB11', 'P16']) {
    const cell = CELLS[name], seed = 5151;
    const plain = panel(cell, seed), { rows, shocked, signs, bestRow } = twoShockPanel(cell, seed);
    assert.equal(shocked.length, cell.shocks);
    if (cell.best) {
      const w = synthFit(plain[0], plain.slice(1), cell.k).weights;
      assert.equal(Math.max(...w), w[bestRow - 1]);
      assert.deepEqual(shocked, [bestRow]);
    }
    for (let i = 0; i < rows.length; i++) for (let t = 0; t < rows[i].length; t++) {
      const q = shocked.indexOf(i);
      const want = t < cell.k ? 0 : i === 0 ? cell.effect0 : q >= 0 ? signs[q] * cell.shock : 0;
      assert.ok(Math.abs(rows[i][t] - plain[i][t] - want) < 1e-12, `${name} unit ${i} t ${t}`);
    }
  }
});

test('a score: ranks in range, leaving both out drops two donors', () => {
  const s = scorePanel(CELLS.PDD11, 91);
  assert.ok(s.rank >= 1 && s.rank <= 11 && s.rankExcl1 <= 10 && s.rankExclAll <= 9);
  assert.ok(s.shockedAbove >= 0 && s.shockedAbove <= 2);
});

const out = readFileSync(new URL('./eval/synth-two-shock-confirm.out.txt', import.meta.url), 'utf8');
const cols = (cell) => out.split('\n').find((l) => l.startsWith(cell + ' ')).split('|').map((c) => c.trim());
const num = (s, i = 0) => Number(s.split(/[\s,%]+/).filter(Boolean)[i]);

test('TWO_SHOCK matches the confirmatory run, and every pre-registered bar holds in it', () => {
  for (const r of TWO_SHOCK) {
    const pdd = cols(`PDD${r.units}`), pb = cols(`PB${r.units}`), p = cols(`P${r.units}`);
    assert.equal(r.twoShocked, num(pdd[1]));
    assert.equal(r.oneLeftOut, num(pdd[5]));
    assert.equal(r.bothLeftOut, num(pdd[6]));
    assert.equal(r.cleanErr, num(p[3], 1));
    assert.equal(r.bestMatchErr, num(pb[3], 1));
    assert.equal(r.bestLeftOutErr, num(pb[5], 1));
    const u = r.units, pd = cols(`PD${u}`), ndd = cols(`NDD${u}`), pee = cols(`PEE${u}`);
    assert.ok(num(ndd[1]) <= 100 / u + 4, 'bar 1');
    assert.ok(num(pdd[1]) <= num(pd[1]) - 5, 'bar 2');
    assert.ok(num(pee[1]) <= 10, 'bar 3');
    for (const c of [pdd, pee]) assert.ok(num(c[6]) >= num(p[1]) - 8, 'bar 4');
    assert.ok(num(pee[5]) <= 15, 'bar 5');
    assert.ok(num(pb[3], 1) >= 1.3 * num(p[3], 1), 'bar 6');
    assert.ok(num(pb[5], 1) >= 1.15 * num(p[3], 1), 'bar 7');
  }
  assert.equal(twoShockRow(21).units, 16);
  assert.equal(twoShockRow(12).units, 11);
});

test('the notes: FEW DONORS quotes two shocked donors; a heavy donor above the treated unit is named with its weight', () => {
  const t = fewDonorsNote({ donors: 10, minP: 1 / 11 });
  assert.match(t, /With two donors shocked .*11 units\), 28%; leaving out only one of the two, 35%; both, 53%/);
  const h = { donors: 16, treated: 'T', statistic: 'floored', tests: { floored: { value: 3 } }, preRmspe: 1, postRmspe: 3,
    above: [{ name: 'A', statistic: 4, preRmspe: 1, postRmspe: 4, weight: 0.31 }, { name: 'B', statistic: 3.5, preRmspe: 1, postRmspe: 3, weight: HEAVY_WEIGHT / 2 }] };
  const a = aboveNote(h);
  assert.match(a, /A \(weight 0\.31\) is also part of T's synthetic control, so an event of its own after the date moves the estimated gap too/);
  assert.match(a, /raised the gap's error to 1\.6x .* left it at 1\.4x/);
  assert.doesNotMatch(a, /B \(weight/);
  assert.doesNotMatch(aboveNote({ ...h, above: [h.above[1]] }), /weight/);
});
