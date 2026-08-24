// Structural tests for index.html.
//
// These exist because the calculator shipped broken and stayed broken across
// three merged changes: index.html opened `<textarea id="cuts">` and never
// closed it. HTML treats textarea as a raw-text element, so the parser fed the
// button, the disclaimer footer, the opt-out control, `</main>`, and the entire
// `<script type="module">` into the textarea as literal text. The script never
// executed, so nothing was ever calculated. calc.test.mjs stayed green the whole
// time because it imports calc.mjs directly and never looks at the page.
//
// The checks below are deliberately dependency-free (no jsdom, no browser) so CI
// stays a plain `node --test`. They catch the class of defect that actually
// happened: markup that silently swallows the app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

// Content of these elements is not parsed as markup, so leaving one open
// discards the remainder of the document without any parse error.
const RAW_TEXT_ELEMENTS = ['textarea', 'script', 'style'];

// Walk the document the way a browser does, so an unclosed raw-text element
// really does swallow everything after it. A plain regex would happily match
// markup that the parser had already buried inside a textarea, which is exactly
// the mistake that let this page ship dead: the tags all *looked* present in the
// file. `markup` therefore holds only what the browser would still parse as
// elements, and `scriptSource` only scripts that would actually execute.
function parse(source) {
  const RAW = /<(textarea|script|style)\b[^>]*>/i;
  let rest = source;
  let markup = '';
  const scripts = [];
  for (;;) {
    const open = rest.match(RAW);
    if (!open) return { markup: markup + rest, scripts, unclosed: null };
    const tag = open[1].toLowerCase();
    const contentStart = open.index + open[0].length;
    markup += rest.slice(0, contentStart); // keep the open tag: it may carry the id
    const closer = new RegExp(`</${tag}\\s*>`, 'i').exec(rest.slice(contentStart));
    // No closing tag: the remainder of the document is this element's text
    // content and never becomes markup at all.
    if (!closer) return { markup, scripts, unclosed: tag };
    if (tag === 'script') scripts.push(rest.slice(contentStart, contentStart + closer.index));
    markup += closer[0];
    rest = rest.slice(contentStart + closer.index + closer[0].length);
  }
}

const { markup, scripts, unclosed } = parse(html);
const declaredIds = new Set([...markup.matchAll(/\bid="([\w-]+)"/g)].map((m) => m[1]));
const scriptSource = scripts.join('\n');

test('every raw-text element is closed', () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed; everything after it is swallowed as text instead of parsed as markup`);
  for (const tag of RAW_TEXT_ELEMENTS) {
    const opened = (html.match(new RegExp(`<${tag}[\\s>]`, 'gi')) || []).length;
    const closed = (html.match(new RegExp(`</${tag}\\s*>`, 'gi')) || []).length;
    assert.equal(opened, closed, `<${tag}> is opened ${opened}x but closed ${closed}x`);
  }
});

test('the module script survives parsing and would actually execute', () => {
  assert.match(markup, /<script type="module">/, 'the app script tag is missing or was swallowed by an earlier element');
  assert.match(scriptSource, /optimizeCutList/, 'the app script did not parse as a script element');
});

test('every element the script reaches for exists in the markup', () => {
  const wanted = new Set([
    ...[...scriptSource.matchAll(/\$\(\s*'([\w-]+)'\s*\)/g)].map((m) => m[1]),
    ...[...scriptSource.matchAll(/getElementById\(\s*'([\w-]+)'\s*\)/g)].map((m) => m[1]),
  ]);
  assert.ok(wanted.size > 0, 'no element lookups found; the script probably did not parse');
  const missing = [...wanted].filter((id) => !declaredIds.has(id));
  assert.deepEqual(missing, [], `script queries ids that no element declares: ${missing.join(', ')}`);
});

test('inputs and result fields for the primary journey are present', () => {
  for (const id of ['stock', 'kerf', 'unit', 'cuts', 'headline', 'message', 'bars', 'used', 'waste', 'utilization', 'plan', 'copy-plan', 'copy-status', 'optout']) {
    assert.ok(declaredIds.has(id), `#${id} is missing from index.html`);
  }
});

test('the liability disclaimer and privacy note are real markup, not swallowed text', () => {
  assert.match(markup, /<strong>No warranty\.<\/strong>/, 'liability disclaimer is missing from the rendered page');
  assert.match(markup, /never sent to an analytics vendor/, 'privacy note is missing from the rendered page');
});

// --- Added with the sheet-goods mode ---
//
// The sheet layout is the first thing on this page that renders user-supplied
// text (part labels) and the first with two panels to keep in sync, so these
// cover the two ways that can go wrong without any test noticing.

test('the sheet-goods inputs and result fields are present', () => {
  for (const id of [
    'sheet-width', 'sheet-height', 'sheet-kerf', 'sheet-trim', 'sheet-unit', 'sheet-cost',
    'sheet-rotate', 'sheet-parts', 'sheet-headline', 'sheet-message', 'sheet-count',
    'sheet-utilization', 'sheet-used', 'sheet-waste', 'sheet-total-cost', 'sheet-oversize',
    'sheet-copy', 'sheet-print', 'sheet-copy-status', 'sheet-diagrams',
  ]) {
    assert.ok(declaredIds.has(id), `#${id} is missing from index.html`);
  }
});

test('every id list the script iterates names a real element', () => {
  // e.g. ['sheet-width', 'sheet-height', ...].forEach(id => $(id)...)
  for (const block of scriptSource.matchAll(/\[\s*((?:'[\w-]+'\s*,\s*)+'[\w-]+')\s*\]/g)) {
    const names = [...block[1].matchAll(/'([\w-]+)'/g)].map((m) => m[1]);
    // A list is an id list when some of its members are declared ids; lists of
    // event names or CSS values have none and are skipped.
    if (!names.some((n) => declaredIds.has(n))) continue;
    const missing = names.filter((n) => !declaredIds.has(n));
    assert.deepEqual(missing, [], `an id list in the script names elements that do not exist: ${missing.join(', ')}`);
  }
});

test('both tabs are wired to their panels in both directions', () => {
  for (const name of ['sheet', 'linear']) {
    assert.match(markup, new RegExp(`id="tab-${name}"[^>]*aria-controls="panel-${name}"`), `tab-${name} is not wired to its panel`);
    assert.match(markup, new RegExp(`id="panel-${name}"[^>]*aria-labelledby="tab-${name}"`), `panel-${name} is not labelled by its tab`);
  }
});

test('every module the page imports exists and exports what it names', async () => {
  const imports = [...scriptSource.matchAll(/import\s*\{([^}]+)\}\s*from\s*'([^']+)'/g)];
  assert.ok(imports.length >= 3, 'expected the page to import its calculation modules');
  for (const [, names, specifier] of imports) {
    const module = await import(new URL(specifier, import.meta.url).href);
    for (const name of names.split(',').map((n) => n.trim()).filter(Boolean)) {
      assert.equal(typeof module[name], 'function', `${specifier} does not export ${name}`);
    }
  }
});

test('user-supplied part labels are escaped before they reach innerHTML', () => {
  // Cut lists get pasted and shared between shops. A part label is the only
  // field on this page that reaches innerHTML, so every interpolation of one
  // has to go through the escaper.
  assert.match(scriptSource, /const\s+escapeHtml\s*=/, 'the page defines no HTML escaper');
  const interpolations = [...scriptSource.matchAll(/\$\{[^{}]*\bp\.label\b[^{}]*\}/g)];
  assert.ok(interpolations.length > 0, 'expected part labels to be rendered');
  for (const [expression] of interpolations) {
    assert.match(expression, /escapeHtml\(/, `an unescaped label reaches the DOM: ${expression}`);
  }
});
