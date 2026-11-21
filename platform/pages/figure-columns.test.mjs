// figure-columns.mjs: which table columns pf-site.js marks as figures.
// Run: node --test platform/pages/figure-columns.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FIGURE_ATTR, FIGURE_COLUMNS_CSS, FIGURE_COLUMNS_JS } from './figure-columns.mjs';
import { renderChromeModule, renderChromeStyle } from './build.mjs';
import { renderSiteStyle } from './site-nav.mjs';

/** A minimal table: rows of cell texts; '<input>' makes a cell hold a control. */
function table(spec, { display = 'table', rowDisplay = 'table-row', head = null } = {}) {
  const mk = (text, tag, parentTag, extra = {}) => {
    const attrs = {};
    return {
      tagName: tag, colSpan: 1, rowSpan: 1, textContent: text === '<input>' ? '' : text, attrs, ...extra,
      hasControl: text === '<input>',
      querySelector(sel) { return this.hasControl && /input/.test(sel) ? {} : null; },
      setAttribute(k, v) { attrs[k] = v; },
      removeAttribute(k) { delete attrs[k]; },
    };
  };
  const rows = [];
  if (head) rows.push({ parentNode: { tagName: 'THEAD' }, cells: head.map((t) => mk(t, 'TH')) });
  for (const r of spec) rows.push({ parentNode: { tagName: 'TBODY' }, cells: r.map((t) => mk(t, 'TD')) });
  const cells = () => rows.flatMap((r) => r.cells);
  return {
    rows, display, rowDisplay,
    get textContent() { return cells().map((c) => c.textContent).join(''); },
    querySelectorAll: () => cells().filter((c) => FIGURE_ATTR in c.attrs),
    marks: () => rows.map((r) => r.cells.map((c) => (FIGURE_ATTR in c.attrs ? 1 : 0)).join('')),
  };
}

function run(t) {
  const getComputedStyle = (el) => ({ display: el.tagName ? (t.rowDisplay === 'table-row' ? 'table-cell' : 'block') : t.rowDisplay });
  new Function('getComputedStyle', 't', `${FIGURE_COLUMNS_JS}\nfigs(t);`)(getComputedStyle, t);
  return t.marks();
}

test('marks a column of figures and its header, never the row names', () => {
  const t = table([['Labor', '9.6 h', '$1,240.00', 'tile and grout'], ['Materials', '—', '$95.00', 'thinset']],
    { head: ['Line', 'Hours', 'Price', 'Notes'] });
  assert.deepEqual(run(t), ['0110', '0110', '0110']);
});

test('a column with one word, or with an input, is left alone', () => {
  const t = table([['A', '12', '<input>'], ['B', 'about 3', '4'], ['C', '7', '5']]);
  assert.deepEqual(run(t), ['000', '000', '000']);
});

test('a table a venture lays out as cards gets no marks, and loses old ones', () => {
  const t = table([['A', '12'], ['B', '13']]);
  assert.deepEqual(run(t), ['01', '01']);
  t.rowDisplay = 'block';
  assert.deepEqual(run(t), ['00', '00'], 'a resize to the card layout clears them');
});

test('a table set to display:block for scrolling still has columns', () => {
  assert.deepEqual(run(table([['A', '12'], ['B', '13']], { display: 'block' })), ['01', '01']);
});

test('a single body row, or a cell spanning rows, is not read', () => {
  assert.deepEqual(run(table([['A', '12']])), ['00']);
  const t = table([['A', '12'], ['B', '13']]);
  t.rows[1].cells[0].rowSpan = 2;
  assert.deepEqual(run(t), ['00', '00']);
});

test('the rule ships in both stylesheets and the pass in pf-site.js', () => {
  assert.match(FIGURE_COLUMNS_CSS, /td\[data-pf-num\],th\[data-pf-num\]\{text-align:right;font-variant-numeric:tabular-nums\}/);
  assert.ok(renderChromeStyle().includes(FIGURE_COLUMNS_CSS.trim()));
  assert.ok(renderSiteStyle().includes(FIGURE_COLUMNS_CSS.trim()));
  assert.match(renderChromeModule(), /figs\(tl\[k\]\)/);
});
