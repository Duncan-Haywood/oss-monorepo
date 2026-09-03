import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./compare-4x8-vs-5x5.html', import.meta.url), 'utf8');

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

test('the 4×8 vs 5×5 page does not swallow itself in an unclosed raw-text element', () => {
  assert.equal(unclosed, null);
});

test('the comparison script would execute and reaches real elements', () => {
  assert.match(scriptSource, /compareSheetSizes/);
  for (const id of ['cost-4x8', 'cost-5x5', 'cost-4x4', 'parts', 'message', 'result']) {
    assert.ok(declaredIds.has(id), `#${id} is missing`);
  }
});

test('the page states the liability disclaimer the user can actually read', () => {
  assert.match(markup, /<strong>No warranty\.<\/strong>/);
  assert.match(markup, /never sent to an analytics vendor/);
});

test('the page answers the search question in the title and the worked example', () => {
  assert.match(html, /4×8 vs 5×5/);
  assert.match(markup, /\$84/);
  assert.match(markup, /\$90/);
});

test('every module import resolves to a real export', async () => {
  for (const [, names, specifier] of scriptSource.matchAll(/import\s*\{([^}]+)\}\s*from\s*'([^']+)'/g)) {
    const module = await import(new URL(specifier, import.meta.url).href);
    for (const name of names.split(',').map((n) => n.trim()).filter(Boolean)) {
      assert.equal(typeof module[name], 'function', `${specifier} does not export ${name}`);
    }
  }
});
