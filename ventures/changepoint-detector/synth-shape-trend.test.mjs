// The gap-shape word read against the panel's own trend (README "The shape word against the panel's own trend",
// pre-registered eval/synth-shape-trend-prereg-2026-11-18.md; bar 1 failed, so the word stays in the module and the
// notes keep the plain word). Pins panelShapes, the CLI's unchanged output, and re-checks every bar against the
// confirmatory file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { panelShapes, gapShape, synthControlTest } from './synth-control.mjs';
import { synthResult } from './synth-cli.mjs';

const q = (early, late) => ({ shape: gapShape([early, early, early, early, 1, 1, 1, 1, late, late, late, late]).shape, early, late });

test('panelShapes: below a centre of 6 the plain word stands; at or above it, words read against the median', () => {
  const flat = [q(1, 1), q(1, 1), q(1, 1.2), q(3, 1), q(1, 3)];
  const r = panelShapes(flat);
  assert.equal(r.relative, false);
  assert.deepEqual(r.shapes, flat.map((x) => x.shape));
  // every gap grows 9x in mean square (3x in RMS); one grows 9 * 9 = 81x, one stays flat
  const grow = [q(1, 3), q(1, 3), q(1, 3), q(1, 9), q(1, 1)];
  const g = panelShapes(grow);
  assert.equal(g.relative, true);
  assert.ok(Math.abs(g.centre - 9) < 1e-9);
  assert.deepEqual(g.shapes, ['held', 'held', 'held', 'grew', 'faded']);
  assert.deepEqual(panelShapes([null, q(1, 1)]).shapes, [null, 'held']);
});

test('synthControlTest carries both words; West Germany 1990 switches (centre 21.8), the Basque Country does not', () => {
  const read = (f) => readFileSync(new URL(`./data/${f}`, import.meta.url), 'utf8');
  const fit = (csv, column, date, window) => {
    const [head, ...lines] = csv.trim().split('\n').map((l) => l.split(','));
    const [lo, hi] = window.split(':').map(Number), body = lines.filter((l) => +l[0] >= lo && +l[0] <= hi);
    const col = (name) => body.map((l) => +l[head.indexOf(name)]);
    return synthControlTest(col(column), Object.fromEntries(head.slice(1).filter((c) => c !== column).map((c) => [c, col(c)])), body.findIndex((l) => +l[0] === date));
  };
  const wg = fit(read('oecd-gdp-per-capita-1960-2003.csv'), 'WestGermany', 1990, '1960:2003');
  assert.equal(wg.shapeRelative, true);
  assert.ok(Math.abs(wg.shapeCentre - 21.76) < 0.01);
  const count = (t, k) => t.placebos.reduce((c, p) => { c[p.gapShape[k]] += 1; return c; }, { held: 0, grew: 0, faded: 0 });
  assert.deepEqual(count(wg, 'shape'), { held: 4, grew: 12, faded: 0 });
  assert.deepEqual(count(wg, 'relShape'), { held: 10, grew: 2, faded: 4 });
  assert.deepEqual(wg.placebos.filter((p) => p.gapShape.relShape === 'grew').map((p) => p.name), ['Norway', 'Spain']);
  const bas = fit(read('spain-regions-gdp-per-capita.csv'), 'BAS', 1970, '1955:1997');
  assert.equal(bas.shapeRelative, false);
  assert.ok(bas.placebos.every((p) => p.gapShape.relShape === p.gapShape.shape));
});

test('bar 1 failed, so the CLI keeps the plain word (West Germany: 12 of 16 grew)', () => {
  const csv = readFileSync(new URL('./data/oecd-gdp-per-capita-1960-2003.csv', import.meta.url), 'utf8');
  const r = synthResult({ csv, column: 'WestGermany', date: 1990, donors: ['all'], window: '1960:2003' });
  assert.deepEqual(r.placeboShapes, { faded: 0, grew: 12, held: 4 });
  assert.deepEqual(r.above.map((x) => [x.name, x.gapShape]), [['Netherlands', 'grew'], ['Norway', 'grew']]);
});

test('the confirmatory file: bars 2 to 6 hold, bar 1 fails on one line (wandering big slope, 1.9 points)', () => {
  const txt = readFileSync(new URL('./eval/synth-shape-trend-confirm.out.txt', import.meta.url), 'utf8');
  const line = (name) => { const m = txt.match(new RegExp(`  ${name.replace(/[()]/g, '\\$&')}: (\\d+) of (\\d+)`)); assert.ok(m, name); return 100 * Number(m[1]) / Number(m[2]); };
  const kinds = ['pulse faded', 'step held', 'big slope grew', 'slope 1.0 grew', 'clean above shaped', 'all placebos grew', 'all placebos faded'];
  const diffs = [];
  for (const fam of ['trendless', 'wander']) for (const k of kinds) diffs.push([`${fam} ${k}`, Math.abs(line(`${fam} ${k} hybrid`) - line(`${fam} ${k} plain`))]);
  const over = diffs.filter(([, d]) => d > 1.5);
  assert.deepEqual(over.map(([n]) => n), ['wander big slope grew']);
  assert.ok(over[0][1] > 1.8 && over[0][1] < 2.0);
  assert.ok(line('trendless pulse faded hybrid') >= 85);
  assert.ok(line('trendless step held hybrid') >= 85);
  assert.ok(line('trendless big slope grew hybrid') >= 65);
  assert.ok(line('trendless clean above shaped hybrid') <= 25);
  assert.ok(line('growing clean above shaped plain') - line('growing clean above shaped hybrid') >= 20);
  assert.ok(line('growing, relative panels: clean above shaped hybrid') <= 30);
  assert.ok(line('growing pulse faded hybrid') >= line('growing pulse faded plain') - 2);
  assert.ok(line('growing all placebos grew hybrid') <= 0.6 * line('growing all placebos grew plain'));
});
