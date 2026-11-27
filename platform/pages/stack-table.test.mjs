// Wide Markdown tables become labelled cards on a phone (`.stack`), styled once in pf-site.css.
// Why the thresholds: docs/reports/polish-2026-11-19-stacked-tables.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, stackTable, STACK_MAX_ROWS } from '../devlog/markdown.mjs';
import { STACK_TABLE_CSS, STACK_TABLE_CHROME_CSS, renderSiteStyle } from './site-nav.mjs';

const md = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');

test('five columns stack, and every cell is labelled with its own header in order', () => {
  const head = ['Page', 'Before', 'After', '**Change**', 'Note & "why"'];
  const html = renderMarkdown(md(head, [['/ask/', '54', '328', '+274', 'cards'], ['/c/', '1', '2', '+1', '`x`']]));
  assert.match(html, /<table class="stack compact" role="table">/, "short score cells set two pairs to a line");
  for (const row of html.match(/<tr role="row"><td[\s\S]*?<\/tr>/g)) {
    assert.deepEqual([...row.matchAll(/data-label="([^"]*)"/g)].map((m) => m[1]), ['Page', 'Before', 'After', 'Change', 'Note &amp; &quot;why&quot;']);
  }
  assert.equal((html.match(/role="cell"/g) || []).length, 10);
});

test('narrow, short and very long tables stay plain tables', () => {
  assert.doesNotMatch(renderMarkdown(md(['a', 'b', 'c'], [['1', '2', '3']])), /stack/);
  assert.doesNotMatch(renderMarkdown(md(['a', 'b', 'c', 'd'], [['1', '2', '3', '4']])), /stack/, 'four short columns fit at 390 px');
  const many = Array.from({ length: STACK_MAX_ROWS + 1 }, (_, i) => [String(i), '1', '2', '3', '4']);
  assert.doesNotMatch(renderMarkdown(md(['a', 'b', 'c', 'd', 'e'], many)), /stack/, 'a long data table keeps its sideways scroll');
});

test('four wordy columns stack', () => {
  const wordy = 'a sentence long enough to squeeze';
  assert.equal(stackTable(4, [[wordy, wordy, wordy, wordy]]), true);
  assert.equal(stackTable(4, [['1', '2', '3', '4']]), false);
});

test('pf-site.css carries the card layout, scoped to phones and to table.stack', () => {
  assert.ok(renderSiteStyle().includes(STACK_TABLE_CSS));
  assert.match(STACK_TABLE_CSS, /^\s*@media \(max-width:600px\)\{/);
  for (const rule of STACK_TABLE_CSS.match(/[^{}]+\{/g).slice(1)) {
    assert.match(rule.trim(), /^table\.stack/, `unscoped rule: ${rule}`);
  }
});

test('wordy stacked tables keep one pair per line', () => {
  const w = 'a sentence long enough to wrap';
  const html = renderMarkdown(md(['a', 'b', 'c', 'd', 'e'], [[w, w, w, w, w]]));
  assert.match(html, /<table class="stack" role="table">/);
});

test('a stacked cell keeps mixed inline content together (no grid or flex on the cell)', () => {
  // Grid and flex make each inline child (<code>, <a>, <strong>) its own item, so
  // "`CLAUDE.md`, `prompt.md`" split across rows; 161 of the blog's 500 stacked tables
  // had such a cell (polish, 2026-11-25). A table cell wraps them in one anonymous cell.
  const cellRules = STACK_TABLE_CSS.match(/table\.stack(?:\.compact)? td\{[^}]*\}/g);
  assert.ok(cellRules.length >= 2);
  for (const rule of cellRules) assert.doesNotMatch(rule, /display:(grid|flex)/, rule);
  assert.match(STACK_TABLE_CSS, /table\.stack td\{[^}]*display:table[;}]/);
  assert.match(STACK_TABLE_CSS, /table\.stack td::before\{[^}]*display:table-cell/);
});

// Polish, 2026-11-27: a calculator's editable rows (`table.stack.fields`) become a card of
// labelled inputs, three short fields to a line, instead of a 500 to 1,600 px sideways scroller.
test('editable rows (stack fields) get a labelled field grid, phones only, and ventures still win', () => {
  const phone = STACK_TABLE_CSS.slice(STACK_TABLE_CSS.indexOf('@media (max-width:600px)'));
  assert.match(phone, /table\.stack\.fields tr\{display:grid;grid-template-columns:repeat\(auto-fill,minmax\(5em,1fr\)\)/);
  assert.match(phone, /table\.stack\.fields td::before,table\.stack\.fields td:first-child::before\{content:attr\(data-label\)/, 'the first field keeps its label too');
  assert.match(phone, /table\.stack\.fields td :is\(input[^{]*,select,textarea\)\{max-width:100%/, 'no field pushes past its card');
  assert.match(phone, /td button\{overflow-wrap:normal;white-space:nowrap\}/, 'a Remove button does not break mid-word');
  assert.doesNotMatch(STACK_TABLE_CHROME_CSS, /(^|[^(])table\.stack/, 'every chrome selector, fields included, sits in :where()');
  assert.match(STACK_TABLE_CHROME_CSS, /:where\(table\.stack\.fields\) tr\{display:grid/);
});

// Polish, 2026-11-27: cells of sentences (`table.stack.prose`, the e-invoicing error-code
// pages) put the label above the text at full card width, not in a 34% column beside it.
test('prose stack tables put the label above the value, phones only, inside :where() for ventures', () => {
  const phone = STACK_TABLE_CSS.slice(STACK_TABLE_CSS.indexOf('@media (max-width:600px)'));
  assert.match(phone, /table\.stack\.prose td,table\.stack td\.prose\{display:block\}/);
  assert.match(phone, /table\.stack\.prose td::before,table\.stack td\.prose::before\{display:block;width:auto/);
  assert.ok(phone.indexOf('table.stack.prose td,') > phone.indexOf('table.stack td{'), 'prose comes after the base rule, so it wins at equal specificity');
  assert.match(STACK_TABLE_CHROME_CSS, /:where\(table\.stack\.prose\) td,:where\(table\.stack\) td\.prose\{display:block\}/);
});
