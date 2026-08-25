// Dependency-free structural checks for the static browser page. Raw-text
// elements can swallow the rest of an HTML document without a browser error.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const RAW_TEXT_ELEMENTS = ['textarea', 'script', 'style'];

function parse(source) {
  const rawOpen = /<(textarea|script|style)\b[^>]*>/i;
  let rest = source;
  let markup = '';
  const scripts = [];
  for (;;) {
    const open = rest.match(rawOpen);
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
const declaredIds = new Set([...markup.matchAll(/\bid="([\w-]+)"/g)].map((match) => match[1]));
const scriptSource = scripts.join('\n');

test('every raw-text element is closed', () => {
  assert.equal(unclosed, null, `<${unclosed}> swallows the remainder of the page`);
  for (const tag of RAW_TEXT_ELEMENTS) {
    const opened = (html.match(new RegExp(`<${tag}[\\s>]`, 'gi')) || []).length;
    const closed = (html.match(new RegExp(`</${tag}\\s*>`, 'gi')) || []).length;
    assert.equal(opened, closed, `<${tag}> is opened ${opened}x but closed ${closed}x`);
  }
});

test('the module script survives parsing and would execute', () => {
  assert.match(markup, /<script type="module">/);
  assert.match(scriptSource, /import \{parseInputs, computeAll, followUpDraft\}/);
});

test('every element the script queries exists in parsed markup', () => {
  const queried = new Set([
    ...scriptSource.matchAll(/\$\(\s*'([\w-]+)'\s*\)/g),
    ...scriptSource.matchAll(/getElementById\(\s*'([\w-]+)'\s*\)/g),
  ].map((match) => match[1]));
  assert.ok(queried.size > 0);
  assert.deepEqual([...queried].filter((id) => !declaredIds.has(id)), []);
});

test('the primary journey, disclaimer, and privacy note are rendered markup', () => {
  for (const id of ['form', 'contractValue', 'retainagePct', 'paidToDate', 'daysOutstanding', 'annualCarryingRatePct', 'output', 'retainage', 'unpaid', 'carrying', 'total', 'draftSection', 'draft', 'copy', 'usage', 'errors']) {
    assert.ok(declaredIds.has(id), `#${id} is missing`);
  }
  assert.match(markup, /<strong>No warranty\.<\/strong>/);
  assert.match(markup, /project data is never uploaded/);
});
