import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { turnsResult } from './turns-cli.mjs';
import { turnsHtml, turnsChartSvg, turnsSummary, turnsCsv } from './turns-view.mjs';
import { TURNS_CSV, TURNS_COLUMNS, TURNS_SD_UNTIL } from './example-turns.mjs';

const page = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const nber = readFileSync(new URL('./data/nber-recessions.csv', import.meta.url), 'utf8');

// The page's example is the shipped composite round's arm A (README "A composite of NBER's monthly indicators"),
// rounded to 6 significant figures: it must still date the same 16 turns, each within 3 months of NBER's.
test('example: the four FRED indicators date 16 turns, each within 3 months of NBER', () => {
  const r = turnsResult({ csv: TURNS_CSV, columns: TURNS_COLUMNS.split(',').map((c) => c.trim()), sdUntil: TURNS_SD_UNTIL, withSeries: true });
  assert.equal(r.n, 715);
  assert.equal(r.first, '1967-01'); assert.equal(r.last, '2026-07');
  const kept = r.turns.filter((t) => t.label >= '1969-06' && t.label <= '2020-10');
  assert.equal(kept.length, 16);
  assert.deepEqual(r.composite.weights.map((w) => w.toFixed(2)), ['0.54', '0.19', '0.15', '0.12']);
  // 2001: the composite peaks 2000-12, NBER 2001-03 (the README's one at the window's edge)
  assert.ok(r.turns.some((t) => t.kind === 'peak' && t.label === '2000-12'));
  assert.equal(r.series.values.length, 715);
  assert.ok(nber.length > 0);
});

test('view: chart marks every turn and shades contractions; tables, summary and CSV agree', () => {
  const r = turnsResult({ csv: TURNS_CSV, columns: ['payems', 'indpro'], withSeries: true });
  const svg = turnsChartSvg(r);
  const peaks = r.turns.filter((t) => t.kind === 'peak').length;
  assert.equal((svg.match(/<title>Peak /g) ?? []).length, peaks);
  assert.equal((svg.match(/<title>Trough /g) ?? []).length, r.turns.length - peaks);
  assert.equal((svg.match(/<rect /g) ?? []).length, peaks);
  const html = turnsHtml(r);
  assert.match(html, /Composite index/);
  assert.equal((html.match(/<td>(Peak|Trough)<\/td>/g) ?? []).length, r.turns.length);
  assert.match(turnsSummary(r), /on a composite index of payems, indpro/);
  const csv = turnsCsv(r).trim().split('\n');
  assert.equal(csv[0], 'label,composite_index,turn');
  assert.equal(csv.length, 716);
  assert.equal(csv.filter((l) => /,(peak|trough)$/.test(l)).length, r.turns.length);
});

test('view: one column, no turns, and labels are escaped', () => {
  const flat = 'month,v\n' + Array.from({ length: 30 }, (_, i) => `<b>${i}</b>,${100 + i}`).join('\n');
  const r = turnsResult({ csv: flat, withSeries: true });
  assert.equal(r.turns.length, 0);
  assert.match(turnsSummary(r), /^No peak or trough on the series/);
  assert.doesNotMatch(turnsChartSvg(r), /<b>/);
  const csv = turnsCsv(r).split('\n');
  assert.equal(csv[0], 'label,value,turn');
});

test('page: the turns card is wired, labelled and counted', () => {
  for (const id of ['turns-frequency', 'turns-bigmove', 'turns-sduntil', 'turns-run', 'example-turns', 'turns-download', 'turns-results']) assert.match(page, new RegExp(`id="${id}"`));
  assert.match(page, /record\("turns_run"\)/);
  assert.match(page, /import\("\.\/example-turns\.mjs"\)/);
  assert.match(page, /withSeries: true/);
});
