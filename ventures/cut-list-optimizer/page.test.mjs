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
  for (const id of ['stock', 'kerf', 'unit', 'cuts', 'onhand', 'stock-cost', 'currency', 'headline', 'message', 'saved', 'bars', 'purchased', 'linear-total-cost', 'used', 'waste', 'utilization', 'plan', 'copy-plan', 'linear-print', 'copy-status', 'optout', 'linear-compare-block', 'linear-compare', 'linear-compare-copy', 'linear-compare-status']) {
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
    'sheet-rotate', 'sheet-parts', 'sheet-onhand', 'sheet-headline', 'sheet-message', 'sheet-count',
    'sheet-utilization', 'sheet-used', 'sheet-waste', 'sheet-total-cost', 'sheet-oversize',
    'sheet-compare', 'sheet-alt1-width', 'sheet-alt1-height', 'sheet-alt1-cost',
    'sheet-alt2-width', 'sheet-alt2-height', 'sheet-alt2-cost',
    'preset-5x5', 'preset-4x4', 'preset-5x10',
    'sheet-copy', 'sheet-print', 'sheet-copy-status', 'sheet-diagrams',
  ]) {
    assert.ok(declaredIds.has(id), `#${id} is missing from index.html`);
  }
});

test('the sheet-goods on-hand offcut field is parsed, drafted, and wired to a render', () => {
  assert.match(scriptSource, /onHand:\s*parseOnHandSheets\(\$\('sheet-onhand'\)\.value\)/, 'renderSheet does not pass the on-hand offcut field into optimizeSheets');
  assert.match(scriptSource, /DRAFT_FIELDS\s*=\s*\[[^\]]*'sheet-onhand'[^\]]*\]/s, 'sheet-onhand is missing from DRAFT_FIELDS, so a saved draft loses it');
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

test('the landing page points at the 4×8 vs 5×5 comparison', () => {
  assert.match(markup, /href="compare-4x8-vs-5x5.html"/);
  assert.match(markup, /compare other sheet sizes/i);
});

test('both the sheet and linear plans can be printed', () => {
  // The linear-stock cutting plan is a job ticket read at the saw just like
  // the sheet layout is -- the page's own schema.org featureList advertises
  // a "printable job ticket" for both, so both need a Print button wired to
  // window.print(), not only the sheet-goods panel.
  for (const id of ['sheet-print', 'linear-print']) {
    assert.match(markup, new RegExp(`id="${id}"[^>]*>Print<`), `#${id} button is missing from index.html`);
    assert.match(scriptSource, new RegExp(`\\$\\('${id}'\\)\\.addEventListener\\('click', \\(\\) => window\\.print\\(\\)\\)`), `#${id} is not wired to window.print()`);
  }
});

test('the linear stock-length comparison is present and apply actions escape labels', () => {
  assert.match(markup, /Which board length should you buy\?/, 'stock length comparison heading is missing');
  assert.match(scriptSource, /escapeHtml\(row\.label\)/, 'comparison row labels must be escaped');
  assert.match(scriptSource, /data-apply-stock/, 'linear comparison has no apply action');
  assert.match(scriptSource, /closestFromEvent/, 'comparison apply does not handle clicks on row text');
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

// Draft recovery lives in draft.mjs and is covered by draft.test.mjs, but that
// suite imports the module directly and so stays green even if the page stops
// calling it -- the same blind spot that let the unclosed <textarea> above ship
// three times. This checks the page is actually wired to it.
test('draft recovery is visible and wired to the local-only module', () => {
  assert.match(scriptSource, /saveDraft\(localStorage/, 'the page never saves a draft');
  assert.match(scriptSource, /loadDraft\(localStorage/, 'the page never restores a draft');
  assert.match(scriptSource, /clearDraft\(localStorage/, 'the page never clears a draft');
  assert.match(html, /id="draft-status"[^>]*>Drafts are saved only on this device/);
  assert.match(html, /id="draft-status"[^>]*role="status"[^>]*aria-live="polite"/);
});

test('draft usage events are declared before the page records them', () => {
  // recordUsage silently drops an event that EVENTS does not list, so a typo
  // here is invisible at runtime -- it just never counts.
  const declared = readFileSync(new URL('./usage.mjs', import.meta.url), 'utf8');
  for (const [, event] of scriptSource.matchAll(/recordUsage\([^)]*?'([\w-]+)'\s*\)/g)) {
    assert.match(declared, new RegExp(`'${event}'`), `usage.mjs does not declare '${event}'`);
  }
});
