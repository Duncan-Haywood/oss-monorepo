// A venture's `<table class="stack">` gets its labels and roles at build time (stack-labels.mjs),
// and pf-chrome.css carries the card layout at zero specificity (site-nav.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { labelStackTables, labelText, STACK_LABELS_JS } from './stack-labels.mjs';
import { renderChromeModule } from './build.mjs';
import { STACK_TABLE_CSS, STACK_TABLE_CHROME_CSS } from './site-nav.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const page = (body) => `<!doctype html><html><body>${body}</body></html>`;

test('each body cell is labelled with its column header, row headers counted', () => {
  const html = page(`<table class="stack"><thead><tr><th scope="col">Country</th><th scope="col">Key <em>dates</em></th><th>Status &amp; "note"</th></tr></thead>
<tbody><tr><th scope="row"><a href="de.html">Germany</a></th><td>2027</td><td>In force</td></tr>
<tr><th scope="row">France</th><td>2026</td><td>Phased</td></tr></tbody></table>`);
  const out = labelStackTables(html);
  assert.match(out, /<table role="table" class="stack">/);
  assert.equal((out.match(/data-label="Key dates"/g) || []).length, 2);
  assert.equal((out.match(/data-label="Status &amp; &quot;note&quot;"/g) || []).length, 2);
  assert.equal((out.match(/role="rowheader"/g) || []).length, 2);
  assert.equal((out.match(/role="columnheader"/g) || []).length, 3);
  assert.equal((out.match(/role="cell"/g) || []).length, 4);
  assert.equal((out.match(/role="row"/g) || []).length, 3);
  assert.doesNotMatch(out, /<th[^>]*scope="row"[^>]*data-label/, 'a row header is the card title, not a labelled pair');
});

test('first-column cells, colspan, rows without a written tbody', () => {
  const out = labelStackTables(page(`<table class="wide stack compact"><thead><tr><th>Rule</th><th colspan="2">Text</th><th>Applies</th></tr></thead>
<tr><td>BR-1</td><td>en</td><td lang="fr">fr</td><td>All</td></tr></table>`));
  assert.deepEqual([...out.matchAll(/data-label="([^"]*)"/g)].map((m) => m[1]), ['Rule', 'Text', 'Text', 'Applies']);
});

test('hand-labelled cells, plain tables, scripts and nested tables are left alone', () => {
  const own = page('<table class="stack" role="table"><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr role="row"><td role="cell" data-label="Mine">1</td><td>2</td></tr></tbody></table>');
  const out = labelStackTables(own);
  assert.match(out, /data-label="Mine">1/);
  assert.match(out, /<td data-label="B" role="cell">2/);
  assert.equal(labelStackTables(out), out, 'a second pass changes nothing');

  const plain = page('<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>');
  assert.equal(labelStackTables(plain), plain);
  const unstacked = page('<table class="stacked"><thead><tr><th>A</th></tr></thead><tr><td>1</td></tr></table>');
  assert.equal(labelStackTables(unstacked), unstacked, '"stacked" is not the stack class');
  const script = page(`<script>const t = '<table class="stack"><thead><tr><th>A</th></tr></thead><tr><td>1</td></tr></table>';</script>`);
  assert.equal(labelStackTables(script), script);
  const nested = page('<table class="stack"><thead><tr><th>A</th></tr></thead><tr><td><table><tr><td>x</td></tr></table></td></tr></table>');
  assert.equal(labelStackTables(nested), nested);
});

test('label text drops markup and stays attribute-safe', () => {
  assert.equal(labelText('<abbr title="x">VAT</abbr>&nbsp;rate <b>"%"</b>'), 'VAT rate &quot;%&quot;');
  assert.equal(labelText('<<b>script>'), 'script>', 'no tag survives to reassemble');
  assert.equal(labelText('A & B'), 'A &amp; B');
});

test('pf-chrome.css copy: every rule scoped to table.stack, inside :where(), in the same order', () => {
  assert.match(STACK_TABLE_CHROME_CSS, /^\s*@media \(max-width:600px\)\{/);
  for (const rule of STACK_TABLE_CHROME_CSS.match(/[^{}]+\{/g).slice(1)) {
    for (const sel of rule.trim().slice(0, -1).split(',')) assert.match(sel.trim(), /^:where\(table\.stack(\.compact)?\)/, `unscoped: ${sel}`);
  }
  assert.equal(STACK_TABLE_CHROME_CSS.replace(/:where\((table\.stack(?:\.compact)?)\)/g, '$1'), STACK_TABLE_CSS);
  assert.match(STACK_TABLE_CSS, /table\.stack th\[scope=row\]\{display:block/);
});

test('the build links the chrome copy and runs the label pass on venture pages', () => {
  const build = fs.readFileSync(path.join(here, 'build.mjs'), 'utf8');
  // Only the phone font-size floor on form fields (input-zoom.mjs) may follow it:
  // it sets nothing a card layout sets.
  assert.match(build, /\$\{STACK_TABLE_CHROME_CSS\}(\$\{INPUT_ZOOM_CSS\})?`;\n\}/, 'renderChromeStyle ends with the card layout');
  assert.match(build, /const labelled = labelStackTables\(marked\);\n\s*const reflowed = injectReflow\(labelled\);/);
});

// The browser half (STACK_LABELS_JS) against a minimal DOM: just the properties it reads.
function el(tagName, attrs = {}, extra = {}) {
  const a = { ...attrs };
  return {
    tagName, colSpan: Number(a.colspan || 1), textContent: '', ...extra,
    attrs: a,
    hasAttribute: (k) => k in a,
    getAttribute: (k) => (k in a ? a[k] : null),
    setAttribute: (k, v) => { a[k] = String(v); },
  };
}
function domTable({ cls = 'stack', head = ['Job', 'Contract', 'Billed'], nested = false } = {}) {
  const t = el('TABLE');
  t.classList = { contains: (c) => cls.split(' ').includes(c) };
  const thead = el('THEAD');
  const tbody = el('TBODY');
  t.children = [thead, tbody];
  const hr = el('TR');
  hr.parentNode = thead;
  hr.cells = head.map((h) => (typeof h === 'string' ? el('TH', {}, { textContent: `  ${h}\n ` }) : el('TH', h.attrs, { textContent: h.text })));
  thead.rows = [hr];
  t.tHead = thead;
  t.body = [];
  Object.defineProperty(t, 'rows', { get: () => [hr, ...t.body] });
  t.getElementsByTagName = () => (nested ? [{}] : []);
  t.write = (rows) => { // what a calculator's `tbody.innerHTML = ...` does: new rows, new cells
    t.body = rows.map((cells) => {
      const tr = el('TR');
      tr.parentNode = tbody;
      tr.cells = cells.map(([tag, attrs, text]) => el(tag, attrs, { textContent: text }));
      return tr;
    });
  };
  return t;
}
const runLabels = (t) => new Function('t', `${STACK_LABELS_JS}\nstackLabels(t);`)(t);
const labelsOf = (t) => t.body.map((r) => r.cells.map((c) => c.attrs['data-label'] ?? '-').join('|'));

test('runtime: rows a script writes get labels and roles, a rewrite is labelled again', () => {
  const t = domTable();
  t.write([[['TD', {}, 'Oak Ave'], ['TD', {}, '$240,000'], ['TD', {}, '$150,000']]]);
  runLabels(t);
  assert.deepEqual(labelsOf(t), ['Job|Contract|Billed']);
  assert.equal(t.attrs.role, 'table');
  assert.deepEqual(t.children.map((g) => g.attrs.role), ['rowgroup', 'rowgroup']);
  assert.equal(t.tHead.rows[0].cells[1].attrs.role, 'columnheader');
  assert.equal(t.body[0].attrs.role, 'row');
  assert.ok(t.body[0].cells.every((c) => c.attrs.role === 'cell'));
  // Same row count, same text length: new cells must still be labelled.
  t.write([[['TD', {}, 'Oak Ave'], ['TD', {}, '$240,001'], ['TD', {}, '$150,001']]]);
  runLabels(t);
  assert.deepEqual(labelsOf(t), ['Job|Contract|Billed']);
});

test('runtime: colspan, row headers and hand labels as the build pass treats them', () => {
  const t = domTable({ head: ['Rule', { text: 'Text', attrs: { colspan: '2' } }, 'Applies'] });
  t.write([
    [['TH', { scope: 'row' }, 'BR-1'], ['TD', {}, 'en'], ['TD', { 'data-label': 'Mine' }, 'fr'], ['TD', {}, 'All']],
    [['TD', {}, 'BR-2'], ['TD', { colspan: '2' }, 'both'], ['TD', { role: 'gridcell' }, 'Some']],
  ]);
  runLabels(t);
  assert.deepEqual(labelsOf(t), ['-|Text|Mine|Applies', 'Rule|Text|Applies']);
  assert.equal(t.body[0].cells[0].attrs.role, 'rowheader');
  assert.equal(t.body[1].cells[2].attrs.role, 'gridcell', 'a role the venture set is kept');
});

test('runtime: plain, header-less and nested tables are left alone', () => {
  for (const t of [domTable({ cls: 'stacked' }), domTable({ nested: true })]) {
    t.write([[['TD', {}, 'a'], ['TD', {}, 'b'], ['TD', {}, 'c']]]);
    runLabels(t);
    assert.deepEqual(labelsOf(t), ['-|-|-']);
    assert.equal(t.attrs.role, undefined);
  }
  const bare = domTable();
  bare.tHead = null;
  bare.write([[['TD', {}, 'a']]]);
  runLabels(bare);
  assert.deepEqual(labelsOf(bare), ['-']);
});

test('runtime: pf-site.js runs the labeller on every table before the figure pass', () => {
  const src = renderChromeModule();
  assert.match(src, /var stackLabels=function\(t\)/);
  assert.match(src, /stackLabels\(tl\[k\]\);figs\(tl\[k\]\)/);
});
