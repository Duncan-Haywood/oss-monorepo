// Columns of figures in Markdown tables set right-aligned with tabular digits (`.num`).
// Why: docs/reports/polish-2026-11-20-number-columns.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, numericColumns, columnAlign, NUMERIC_CELL } from '../devlog/markdown.mjs';
import { NUM_TABLE_CSS, renderSiteStyle } from './site-nav.mjs';

const md = (head, rows, sep) => [`| ${head.join(' | ')} |`, sep ?? `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
const classes = (html, tag) => [...html.matchAll(new RegExp(`<${tag}(?=[ >])( class="num")?[^>]*>`, 'g'))].map((m) => Boolean(m[1]));

test('figures read as figures; words, ranges and intervals do not', () => {
  for (const v of ['31', '1,417', '$2,853.20', '-0.12', '−3.4', '+274', '~40%', '3.1x', '250 ms', '<5', '≈ 0.83', '12 pp']) assert.match(v, NUMERIC_CELL, v);
  for (const v of ['4 to 22', '0.83 ± 0.02', '2026-11-03', 'yes', '/ask/', 'v2', '10/20']) assert.doesNotMatch(v, NUMERIC_CELL, v);
});

test('a column of figures is marked on the header and every body cell; the row-name column is not', () => {
  const html = renderMarkdown(md(['Page', 'Loads', 'Note'], [['`/c/`', '31', 'hub'], ['`/ask/`', '**20**', 'ask'], ['total', '—', '']]));
  assert.deepEqual(classes(html, 'th'), [false, true, false]);
  assert.deepEqual(classes(html, 'td'), [false, true, false, false, true, false, false, true, false]);
});

test('a first column of years stays a row name; a mixed column stays text', () => {
  assert.deepEqual(numericColumns([['2024', '5', '5'], ['2025', '6', 'n/a'], ['2026', '7', 'about 8']], 3), [false, true, false]);
  assert.deepEqual(numericColumns([['a', '—'], ['b', '']], 2), [false, false], 'an all-blank column is not figures');
});

test("an author's GFM alignment wins over the guess", () => {
  assert.deepEqual(columnAlign('|---|:---:|---:|:---|'), ['', 'center', 'right', 'left']);
  const html = renderMarkdown(md(['Run', 'Score', 'Seed'], [['a', 'high', '1'], ['b', 'low', '2']], '|---|---:|:---|'));
  assert.deepEqual(classes(html, 'th'), [false, true, false]);
});

test('stacked phone tables carry the mark too, and pf-site.css styles it', () => {
  const html = renderMarkdown(md(['Page', 'Before', 'After', 'Change', 'Note'], [['/ask/', '54', '328', '+274', 'cards']]));
  assert.match(html, /<td role="cell" class="num" data-label="Before">54<\/td>/);
  assert.ok(renderSiteStyle().includes(NUM_TABLE_CSS.trim()));
  assert.match(NUM_TABLE_CSS, /th\.num,td\.num\{text-align:right;font-variant-numeric:tabular-nums\}/);
});
