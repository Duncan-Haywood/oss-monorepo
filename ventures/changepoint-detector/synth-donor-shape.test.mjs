// A donor whose own event is a slope or a pulse (eval/synth-donor-shape-sim.mjs, README "A donor's own event that is
// not a step"): the panels move only the units the cell names, gapShape reads the shapes, and the notes quote the
// confirmatory file, every pre-registered bar re-checked in it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CELLS, SHAPES, shapeDonorPanel, scorePanel } from './eval/synth-donor-shape-sim.mjs';
import { panel } from './eval/synth-sim.mjs';
import { synthFit, gapShape, GAP_SHAPE_RATIO } from './synth-control.mjs';
import { DONOR_SHAPE, SHAPE_RATES, donorShapeRow, fewDonorsNote, aboveNote } from './synth-view.mjs';
import { synthResult } from './synth-cli.mjs';

test('shapes average 1 over the 12 points after the date, as a step does', () => {
  for (const [name, f] of Object.entries(SHAPES)) {
    const a = Array.from({ length: 12 }, (_, h) => f(h));
    assert.ok(Math.abs(a.reduce((s, v) => s + v, 0) / 12 - 1) < 1e-12, name);
  }
});

test('shape panels: the treated unit and the one named donor move from the date by the shape, nothing else', () => {
  for (const name of ['PS11', 'PPE16', 'PBP11', 'NS16', 'P11']) {
    const cell = CELLS[name], seed = 7171;
    const plain = panel(cell, seed), { rows, row, sign } = shapeDonorPanel(cell, seed);
    if (cell.best) {
      const w = synthFit(plain[0], plain.slice(1), cell.k).weights;
      assert.equal(Math.max(...w), w[row - 1]);
    } else assert.equal(row, 1);
    for (let i = 0; i < rows.length; i++) for (let t = 0; t < rows[i].length; t++) {
      const want = t < cell.k ? 0 : i === 0 ? cell.effect0 : i === row ? sign * cell.shock * SHAPES[cell.shape](t - cell.k) : 0;
      assert.ok(Math.abs(rows[i][t] - plain[i][t] - want) < 1e-12, `${name} unit ${i} t ${t}`);
    }
  }
  const s = scorePanel(CELLS.PP11, 91);
  assert.ok(s.rank >= 1 && s.rank <= 11 && s.rankExcl <= 10);
  assert.ok(['held', 'grew', 'faded'].includes(s.shockedShape));
});

test('gapShape: a pulse fades, a slope grows, a step holds; none under 6 points', () => {
  const pulse = [3, 3, 3, 3, 0, 0, 0, 0, 0.1, -0.1, 0.1, -0.1];
  assert.equal(gapShape(pulse).shape, 'faded');
  assert.equal(gapShape(Array.from({ length: 12 }, (_, h) => (h + 1) / 6.5)).shape, 'grew');
  assert.equal(gapShape(Array(12).fill(1)).shape, 'held');
  assert.equal(gapShape([1, 2, 3, 4, 5]), null);
  assert.equal(GAP_SHAPE_RATIO, 6);
  // either side of the ratio: a first third 6.25x the last in mean square is 'faded', 5.76x is 'held'
  assert.equal(gapShape([2.5, 2.5, 1, 1, 1, 1]).shape, 'faded');
  assert.equal(gapShape([2.4, 2.4, 1, 1, 1, 1]).shape, 'held');
});

const out = readFileSync(new URL('./eval/synth-donor-shape-confirm.out.txt', import.meta.url), 'utf8');
const cols = (cell) => out.split('\n').find((l) => l.startsWith(cell + ' ')).split('|').map((c) => c.trim());
const num = (s, i = 0) => Number(s.split(/[\s,%]+/).filter(Boolean)[i]);
const pooled = out.split('\n').find((l) => l.startsWith('pooled:'));
const poolPct = (label) => Number(pooled.match(new RegExp(`${label} \\d+ of \\d+, ([\\d.]+)%`))[1]);

test('DONOR_SHAPE and SHAPE_RATES match the confirmatory run, and every pre-registered bar holds in it', () => {
  for (const r of DONOR_SHAPE) {
    const u = r.units, p = cols(`P${u}`), pd = cols(`PD${u}`), ps = cols(`PS${u}`), pp = cols(`PP${u}`);
    assert.equal(r.step, num(pd[1]));
    assert.equal(r.slope, num(ps[1]));
    assert.equal(r.pulse, num(pp[1]));
    assert.equal(r.slopeLeftOut, num(ps[6]));
    assert.equal(r.pulseLeftOut, num(pp[6]));
    for (const c of ['NS', 'NP']) assert.ok(num(cols(`${c}${u}`)[1]) <= 100 / u + 4, `bar 1 ${c}${u}`);
    assert.ok(num(pp[1]) <= num(pd[1]) - 8, 'bar 2');
    assert.ok(num(ps[1]) <= num(pd[1]), 'bar 3');
    assert.ok(num(cols(`PSE${u}`)[1]) <= 20 && num(cols(`PPE${u}`)[1]) <= 10, 'bar 4');
    for (const c of ['PS', 'PP', 'PSE', 'PPE']) assert.ok(num(cols(`${c}${u}`)[6]) >= num(p[1]) - 8, `bar 5 ${c}${u}`);
  }
  assert.equal(SHAPE_RATES.pulseFaded, poolPct('faded'));
  assert.equal(SHAPE_RATES.stepHeld, poolPct('held'));
  assert.equal(SHAPE_RATES.bigSlopeGrew, poolPct('PSE grew'));
  assert.equal(SHAPE_RATES.slopeGrew, poolPct('\\(PS, NS, PBS\\) grew'));
  assert.equal(SHAPE_RATES.cleanShaped, poolPct('shaped'));
  assert.ok(SHAPE_RATES.pulseFaded >= 85 && SHAPE_RATES.stepHeld >= 85 && SHAPE_RATES.bigSlopeGrew >= 65 && SHAPE_RATES.cleanShaped <= 25, 'bar 6');
  assert.equal(donorShapeRow(21).units, 16);
  assert.equal(donorShapeRow(12).units, 11);
});

test('the notes: FEW DONORS quotes slope and pulse donors; the above list names a gap that faded or grew, with its caveat', () => {
  const t = fewDonorsNote({ donors: 15, minP: 1 / 16 });
  assert.match(t, /a slope from the date left 29% and a pulse that wore off after four points 14% \(a step, 37%\); with that donor left out beforehand, 56% and 55%/);
  const h = { donors: 10, treated: 'T', statistic: 'floored', tests: { floored: { value: 3 } }, preRmspe: 1, postRmspe: 3,
    above: [{ name: 'A', statistic: 4, preRmspe: 1, postRmspe: 4, weight: 0, gapShape: 'faded' }, { name: 'B', statistic: 3.5, preRmspe: 1, postRmspe: 3, weight: 0, gapShape: 'held' }] };
  const a = aboveNote(h);
  assert.match(a, /A 4\.0 \(before-gap 1\.00, after 4\.00; its own gap faded after the first points\)/);
  assert.match(a, /B 3\.5 \(before-gap 1\.00, after 3\.00\)/);
  assert.match(a, /called faded 90% .* 20% of listed units with no event of their own got a word anyway/);
  assert.doesNotMatch(aboveNote({ ...h, above: [h.above[1]] }), /Faded/);
});

test('synthResult carries each listed unit\'s gapShape into --json and the note', () => {
  // a 12-unit panel where one donor has a pulse after the date and the treated unit nothing: the pulse donor ranks above
  const cell = CELLS.NP11, { rows, row } = shapeDonorPanel({ ...cell, shock: 4 }, 4242);
  const names = rows.map((_, i) => (i ? `d${i}` : 'T'));
  const csv = ['t,' + names.join(','), ...rows[0].map((_, t) => `${t},${rows.map((r) => r[t]).join(',')}`)].join('\n');
  const r = synthResult({ csv, column: 'T', labelColumn: 't', date: String(cell.k - 1), donors: names.slice(1) });
  const q = r.above.find((x) => x.name === `d${row}`);
  assert.ok(q, 'the pulse donor is listed above');
  assert.equal(q.gapShape, 'faded');
  assert.ok(r.above.every((x) => x.gapShape === null || ['held', 'grew', 'faded'].includes(x.gapShape)));
});

test('placeboShapes counts every donor; the note says when most share the word (West Germany 1990: 12 of 16 grew)', () => {
  const csv = readFileSync(new URL('./data/oecd-gdp-per-capita-1960-2003.csv', import.meta.url), 'utf8');
  const r = synthResult({ csv, column: 'WestGermany', date: 1990, donors: ['all'], window: '1960:2003' });
  const c = r.placeboShapes;
  assert.equal(c.faded + c.grew + c.held, r.donors);
  assert.deepEqual(c, { faded: 0, grew: 12, held: 4 });
  assert.deepEqual(r.above.map((q) => [q.name, q.gapShape]), [['Netherlands', 'grew'], ['Norway', 'grew']]);
  assert.match(aboveNote(r), /Of all 16 donors' own gaps, 0 faded, 12 grew and 4 held: most share the word, so it singles out no one here/);
  const few = { ...r, placeboShapes: { faded: 1, grew: 5, held: 10 } };
  assert.match(aboveNote(few), /1 faded, 5 grew and 10 held\. "Faded"/);
});
