// Structural tests for the calculator pages.
//
// These exist because a sibling calculator (cut-list optimizer) shipped with
// an unclosed <textarea> that swallowed the module script. calc.test.mjs
// stayed green because it imports calc.mjs directly. The checks below are
// dependency-free so CI stays a plain `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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

function load(name) {
  const html = readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
  return { html, ...parse(html) };
}

const page = load('index.html');
const article = load('how-to-price-a-roof-by-the-square.html');
const declaredIds = new Set([...page.markup.matchAll(/\bid="([\w-]+)"/g)].map((m) => m[1]));
const scriptSource = page.scripts.join('\n');

test('every raw-text element on the calculator is closed', () => {
  assert.equal(page.unclosed, null, `<${page.unclosed}> is never closed`);
  for (const tag of RAW_TEXT_ELEMENTS) {
    const opened = (page.html.match(new RegExp(`<${tag}[\\s>]`, 'gi')) || []).length;
    const closed = (page.html.match(new RegExp(`</${tag}\\s*>`, 'gi')) || []).length;
    assert.equal(opened, closed, `<${tag}> is opened ${opened}x but closed ${closed}x`);
  }
});

test('the module script survives parsing and would actually execute', () => {
  assert.match(page.markup, /<script type="module">/);
  assert.match(scriptSource, /calculateBid/);
});

test('every element the script reaches for exists in the markup', () => {
  const wanted = new Set([
    ...[...scriptSource.matchAll(/getElementById\(\s*'([\w-]+)'\s*\)/g)].map((m) => m[1]),
    ...[...scriptSource.matchAll(/\bel\(\s*'([\w-]+)'\s*\)/g)].map((m) => m[1]),
  ]);
  assert.ok(wanted.size > 0, 'no element lookups found; the script probably did not parse');
  const missing = [...wanted].filter((id) => !declaredIds.has(id));
  assert.deepEqual(missing, [], `script queries ids that no element declares: ${missing.join(', ')}`);
});

test('inputs and result fields for the primary journey are present', () => {
  for (const id of [
    'sections', 'addSection', 'materialPreset', 'wastePercent', 'materialPerSquare',
    'hourlyWage', 'targetMargin', 'proposedPrice', 'price', 'squares', 'breakEven',
    'copySummary', 'usageOptOut', 'split', 'verdict',
  ]) {
    assert.ok(declaredIds.has(id), `#${id} is missing from index.html`);
  }
});

test('the liability disclaimer and privacy note are real markup', () => {
  assert.match(page.markup, /<strong>No warranty\.<\/strong>/);
  assert.match(page.markup, /Nothing leaves your browser/);
});

test('search and assistant discovery basics ship with the page', () => {
  assert.match(page.html, /<title>Roofing Bid Calculator/);
  assert.match(page.html, /name="description"/);
  assert.match(page.html, /application\/ld\+json/);
  assert.match(page.html, /SoftwareApplication/);
  assert.match(page.html, /how-to-price-a-roof-by-the-square\.html/);
});

test('every module the page imports exists and exports what it names', async () => {
  const imports = [...scriptSource.matchAll(/import\s*\{([^}]+)\}\s*from\s*'([^']+)'/g)];
  assert.ok(imports.length >= 2);
  for (const [, names, specifier] of imports) {
    const module = await import(new URL(specifier, import.meta.url).href);
    for (const name of names.split(',').map((n) => n.trim()).filter(Boolean)) {
      const value = module[name];
      assert.ok(value !== undefined, `${specifier} does not export ${name}`);
    }
  }
});

test('the how-to page is closed, crawlable, and points back at the calculator', () => {
  assert.equal(article.unclosed, null);
  assert.match(article.html, /<title>How to price a roof by the square/);
  assert.match(article.html, /name="description"/);
  assert.match(article.html, /FAQPage/);
  assert.match(article.markup, /href="\.\/"/);
  assert.match(article.markup, /<strong>No warranty\.<\/strong>/);
});
