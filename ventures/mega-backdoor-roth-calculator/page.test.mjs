import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const guide = readFileSync(new URL('./which-conversion-cadence-should-i-use.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
const calcSource = readFileSync(new URL('./calc.mjs', import.meta.url), 'utf8');

test('the entry page carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, or financial advice/i);
});

test('the entry page states plainly that most plans do not offer this', () => {
  assert.match(html, /most plans do not/i);
});

test('the entry page carries a privacy statement and an opt-in, off-by-default usage checkbox', () => {
  assert.match(html, /id="usage"/);
  assert.doesNotMatch(html, /checked[^>]*id="usage"/);
  assert.match(html, /Nothing is uploaded/);
});

test('the entry page carries SoftwareApplication and FAQPage JSON-LD that parses as valid JSON', () => {
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  const types = scripts.map((s) => s['@type']);
  assert.ok(types.includes('SoftwareApplication'));
  const faq = scripts.find((s) => s['@type'] === 'FAQPage');
  assert.ok(faq);
  assert.ok(faq.mainEntity.length >= 5);
  for (const question of faq.mainEntity) {
    assert.ok(html.includes(`<h3>${question.name}</h3>`), `FAQ schema question "${question.name}" has no matching <h3> on the page`);
  }
});

test('no module in this venture can reach the network', () => {
  assert.doesNotMatch(calcSource, /\bfetch\(/);
  assert.doesNotMatch(calcSource, /XMLHttpRequest/);
  assert.doesNotMatch(html, /\bfetch\(/);
  assert.doesNotMatch(html, /XMLHttpRequest/);
});

test('the guide page stays crawlable, is listed in the sitemap, and links back to the tool', () => {
  assert.match(guide, /<title>Which Roth conversion cadence should I use/);
  assert.match(guide, /name="robots" content="index,follow"/);
  assert.match(guide, /<a href="\.\/">/);
  assert.match(sitemap, /which-conversion-cadence-should-i-use\.html/);
});

test('both pages carry FAQPage JSON-LD that parses as valid JSON and matches visible headings', () => {
  const match = guide.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, 'no FAQPage schema found on the guide page');
  const schema = JSON.parse(match[1]);
  assert.ok(schema.mainEntity.length >= 4);
  for (const question of schema.mainEntity) {
    assert.ok(guide.includes(`<h3>${question.name}</h3>`), `guide FAQ schema question "${question.name}" has no matching <h3>`);
  }
});

test('the entry page links to the guide page', () => {
  assert.match(html, /href="which-conversion-cadence-should-i-use\.html"/);
});

test('the guide page names no vendor or competing product', () => {
  assert.doesNotMatch(guide, /Fidelity|Vanguard|Schwab|Empower|Voya|Principal/i);
});

test('the entry page distinguishes this from a regular backdoor Roth IRA', () => {
  assert.match(html, /backdoor Roth IRA/i);
  assert.match(html, /pro-rata/i);
});

// This venture must ship with an inbound sibling link (platform/pages/siblings.mjs
// --check, orphan budget committed at 0). Paired with senior-deduction-calculator:
// both are federal filing-season decisions for an individual, one on the
// contribution side (this tool) and one on the deduction side.
test('the entry page links one hop to the senior deduction calculator sibling', () => {
  assert.match(
    html,
    /href="\.\.\/senior-deduction-calculator\/"/,
    'index must link ../senior-deduction-calculator/ so crawlers reach the sibling tool in one hop',
  );
});

test('every input has an associated label', () => {
  const inputNames = [...html.matchAll(/<input name="(\w+)"/g)].map((m) => m[1]);
  assert.ok(inputNames.length > 5);
  for (const name of inputNames) {
    assert.match(html, new RegExp(`<label>[^<]*<input name="${name}"`), `input "${name}" is not inside a <label> with visible text`);
  }
});
