// Structural tests for quote.html.
// A missing close on textarea/script/style swallows the app, so these walk
// the document the way a browser does. No jsdom — plain `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./quote.html', import.meta.url), 'utf8');
const RAW_TEXT_ELEMENTS = ['textarea', 'script', 'style'];

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
    markup += rest.slice(0, contentStart);
    const closer = new RegExp(`</${tag}\\s*>`, 'i').exec(rest.slice(contentStart));
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
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
  for (const tag of RAW_TEXT_ELEMENTS) {
    const opened = (html.match(new RegExp(`<${tag}[\\s>]`, 'gi')) || []).length;
    const closed = (html.match(new RegExp(`</${tag}\\s*>`, 'gi')) || []).length;
    assert.equal(opened, closed, `<${tag}> is opened ${opened}x but closed ${closed}x`);
  }
});

test('the module script survives parsing and would actually execute', () => {
  assert.match(markup, /<script type="module">/);
  assert.match(scriptSource, /quoteRemediation/);
});

test('every element the script reaches for exists in the markup', () => {
  const wanted = new Set([...scriptSource.matchAll(/getElementById\(\s*'([\w-]+)'\s*\)/g)].map((m) => m[1]));
  assert.ok(wanted.size > 0, 'no element lookups found');
  const missing = [...wanted].filter((id) => !declaredIds.has(id));
  assert.deepEqual(missing, []);
});

test('primary journey controls are present', () => {
  for (const id of ['input', 'rate', 'buffer', 'theme', 'generate', 'copy', 'download', 'optout', 'error', 'copy-status', 'stats', 'headline', 'rows', 'report']) {
    assert.ok(declaredIds.has(id), `#${id} is missing from quote.html`);
  }
});

test('the liability disclaimer and privacy note are real markup', () => {
  assert.match(markup, /<strong>No warranty\.<\/strong>/);
  assert.match(markup, /never uploaded/);
  assert.match(markup, /analytics vendor/);
  assert.match(markup, /Best-effort hosting, no SLA/);
  assert.match(markup, /not a compliance determination/);
});

test('sample JSON is a usable first-value scan, not an empty box', () => {
  assert.match(html, /"color-contrast"/);
  assert.match(html, /"image-alt"/);
});

test('user-facing rule text is escaped before it reaches innerHTML', () => {
  assert.match(scriptSource, /function\s+escapeHtml/);
  const interpolations = [...scriptSource.matchAll(/\$\{[^}]*item\.(id|help|impact)[^}]*\}/g)];
  assert.ok(interpolations.length >= 2, 'expected rule fields to be rendered');
  for (const [expression] of interpolations) {
    assert.match(expression, /escapeHtml\(/, `unescaped field reaches the DOM: ${expression}`);
  }
});

test('every module the page imports exists and exports what it names', async () => {
  const imports = [...scriptSource.matchAll(/import\s*\{([^}]+)\}\s*from\s*'([^']+)'/g)];
  assert.ok(imports.length >= 1);
  for (const [, names, specifier] of imports) {
    const module = await import(new URL(specifier, import.meta.url).href);
    for (const name of names.split(',').map((n) => n.trim()).filter(Boolean)) {
      assert.equal(typeof module[name], 'function', `${specifier} does not export ${name}`);
    }
  }
});
