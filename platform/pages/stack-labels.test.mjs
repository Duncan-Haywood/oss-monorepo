// A venture's `<table class="stack">` gets its labels and roles at build time (stack-labels.mjs),
// and pf-chrome.css carries the card layout at zero specificity (site-nav.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { labelStackTables, labelText } from './stack-labels.mjs';
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
