// The gap-shape word read against the panel's own trend (README "The shape word against the panel's own trend",
// pre-registered eval/synth-shape-trend-prereg-2026-11-18.md; bar 1 failed, so the default keeps the plain word and the
// panel word is opt-in, `--shape-word panel`, README "The panel word as an option"). Pins panelShapes, the CLI's
// unchanged default output, the opt-in on CLI, worker and page, and re-checks every bar against the confirmatory file.
// The re-test scored only where the rule switches on is synth-shape-switch.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { panelShapes, gapShape, synthControlTest } from './synth-control.mjs';
import { synthResult, synthText } from './synth-cli.mjs';
import { synthHtml, PANEL_SHAPE } from './synth-view.mjs';
import { analyzeJob } from './analyze-job.mjs';
import { main } from './cli.mjs';

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
  const line = (name) => { const m = txt.match(new RegExp(`  ${escapeRegExp(name)}: (\\d+) of (\\d+)`)); assert.ok(m, name); return 100 * Number(m[1]) / Number(m[2]); };
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

const wgCsv = () => readFileSync(new URL('./data/oecd-gdp-per-capita-1960-2003.csv', import.meta.url), 'utf8');
const basCsv = () => readFileSync(new URL('./data/spain-regions-gdp-per-capita.csv', import.meta.url), 'utf8');

test('--shape-word panel: West Germany is read against a centre of 21.8 (Norway grew, the Netherlands held)', () => {
  const r = synthResult({ csv: wgCsv(), column: 'WestGermany', date: 1990, donors: ['all'], window: '1960:2003', shapeWord: 'panel' });
  assert.equal(r.shapeWord, 'panel');
  assert.equal(r.shapeRelative, true);
  assert.ok(Math.abs(r.shapeCentre - 21.76) < 0.01);
  assert.deepEqual(r.placeboShapes, { faded: 4, grew: 2, held: 10 });
  assert.deepEqual(r.above.map((x) => [x.name, x.gapShape]), [['Netherlands', 'held'], ['Norway', 'grew']]);
  // the test itself is untouched by the word
  const plain = synthResult({ csv: wgCsv(), column: 'WestGermany', date: 1990, donors: ['all'], window: '1960:2003' });
  assert.equal(r.p, plain.p);
  assert.equal(r.rank, plain.rank);
  assert.equal(plain.shapeWord, undefined, 'the default JSON is unchanged');
  const t = synthText(r);
  assert.match(t, /Words read against the panel \(--shape-word panel\): the median unit's gap grew 21\.8 times/);
  assert.match(t, /4 faded, 2 grew and 10 held on this reading/);
  assert.match(t, new RegExp(`${Math.round(PANEL_SHAPE.cleanPanel)}% of listed units with no event of their own got a word, against ${Math.round(PANEL_SHAPE.cleanPlain)}%`));
  assert.match(t, new RegExp(`a big one was called held ${Math.round(PANEL_SHAPE.bigSlopeHeldPanel)}% of the time \\(plain ${Math.round(PANEL_SHAPE.bigSlopeHeldPlain)}%\\)`));
  assert.match(t, /Netherlands [^)]*its own gap held against the panel's growth, but grew towards the end on its own reading, along a straight line from the date/, 'both words where they differ (and the line, README "A curvature word")');
  assert.deepEqual(r.above.map((x) => [x.name, x.plainShape]), [['Netherlands', 'grew'], ['Norway', 'grew']]);
  assert.ok(plain.above.every((x) => !('plainShape' in x)), 'the default above entries are unchanged');
  assert.match(synthText(plain), /--shape-word panel words each unit against the panel instead/, 'the plain note points to the option when most units share a word');
});

test('--shape-word panel: below a centre of 6 (the Basque Country, 2.36) the plain words stand and the note says so', () => {
  const opts = { csv: basCsv(), column: 'BAS', date: 1970, donors: ['all'], window: '1955:1997' };
  const p = synthResult({ ...opts, shapeWord: 'panel' }), q = synthResult(opts);
  assert.equal(p.shapeRelative, false);
  assert.deepEqual(p.placeboShapes, q.placeboShapes);
  assert.deepEqual(p.above.map(({ plainShape, bend, straight, ...x }) => x), q.above);
  assert.doesNotMatch(synthText(p), /straight line/, 'the line is read only where the panel word is in force');
  assert.ok(p.above.every((x) => x.plainShape === x.gapShape), 'below 6 the two words agree');
  assert.match(synthText(p), /grew 2\.36 times .* under 6, so each word is the plain one/);
});

// PANEL_SHAPE now quotes the switched-panel re-test: synth-shape-switch.test.mjs pins it.

test('--shape-word on the CLI, the worker job and the page', async () => {
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'shape-word-')), file = join(dir, 'gdp.csv');
  writeFileSync(file, wgCsv());
  let s = '';
  await main([file, '--column', 'WestGermany', '--known-date', '1990', '--donors', 'all', '--window', '1960:2003', '--shape-word', 'panel', '--json'], { out: (x) => { s += x; } });
  assert.deepEqual(JSON.parse(s).placeboShapes, { faded: 4, grew: 2, held: 10 });
  await assert.rejects(main([file, '--column', 'WestGermany', '--known-date', '1990', '--donors', 'all', '--shape-word', 'trend'], { out: () => {} }), /give plain or panel/);
  await assert.rejects(main([file, '--column', 'WestGermany', '--known-date', '1990', '--shape-word', 'panel'], { out: () => {} }), /--shape-word also need --donors|and --shape-word also need --donors/);
  const out = analyzeJob({ kind: 'one', opts: { csv: wgCsv(), column: 'WestGermany', knownDate: '1990' }, synth: { csv: wgCsv(), column: 'WestGermany', date: '1990', donors: ['all'], shapeWord: 'panel' } });
  assert.equal(out.result.synth.shapeWord, 'panel');
  assert.match(synthHtml(out.result.synth), /Words read against the panel/);
  const page = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /<select id="shapeWord"><option value="plain" selected>/);
  assert.match(page, /shapeWord: \$\("#shapeWord"\)\.value/);
});
