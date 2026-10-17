import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildReport } from './analyze.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(HERE, 'index.html'), 'utf8');
const docHtml = readFileSync(join(HERE, 'why-disable-graphql-introspection-in-production.html'), 'utf8');

function jsonLdBlocks(source) {
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  const blocks = [];
  let m;
  while ((m = re.exec(source)) !== null) blocks.push(m[1]);
  return blocks;
}

test('every JSON-LD block on the index page is valid JSON', () => {
  const blocks = jsonLdBlocks(html);
  assert.ok(blocks.length >= 2, 'expected at least a SoftwareApplication and a FAQPage block');
  for (const block of blocks) {
    assert.doesNotThrow(() => JSON.parse(block), `invalid JSON in block: ${block.slice(0, 80)}...`);
  }
});

test('JSON-LD includes SoftwareApplication with a free price and FAQPage', () => {
  const parsed = jsonLdBlocks(html).map((b) => JSON.parse(b));
  const app = parsed.find((p) => p['@type'] === 'SoftwareApplication');
  const faq = parsed.find((p) => p['@type'] === 'FAQPage');
  assert.ok(app, 'missing SoftwareApplication JSON-LD');
  assert.equal(app.offers.price, '0');
  assert.ok(faq, 'missing FAQPage JSON-LD');
  assert.ok(faq.mainEntity.length >= 3);
});

test('the doc page carries valid HowTo JSON-LD', () => {
  const blocks = jsonLdBlocks(docHtml).map((b) => JSON.parse(b));
  const howTo = blocks.find((b) => b['@type'] === 'HowTo');
  assert.ok(howTo, 'missing HowTo JSON-LD on the doc page');
  assert.ok(howTo.step.length >= 3);
});

test('the no-warranty disclaimer is present on both pages', () => {
  for (const source of [html, docHtml]) {
    assert.match(source, /No warranty/);
    assert.match(source, /provided free and as-is, without warranty/);
  }
});

test('the privacy line states nothing is uploaded', () => {
  assert.match(html, /Nothing is uploaded|never uploaded/);
});

test('the "only test systems you are authorised to" caution is present', () => {
  assert.match(html, /authoris(?:ed|ation)/i);
});

test('the sponsor link points at the correct GitHub Sponsors profile', () => {
  assert.match(html, /https:\/\/github\.com\/sponsors\/Duncan-Haywood/);
});

test('the MIT license is linked on both pages', () => {
  for (const source of [html, docHtml]) {
    assert.match(source, /href="LICENSE"/);
    assert.match(source, /MIT licen[cs]e/);
  }
});

test('a usage opt-out control exists', () => {
  assert.match(html, /id="usageOptOut"/);
});

test('the evidence-not-a-determination disclaimer is present', () => {
  assert.match(html, /not a full security assessment|is not a determination|not a guarantee/);
});

test('probe.mjs, analyze.mjs, and usage.mjs are imported as ES modules, not duplicated inline', () => {
  assert.match(html, /from '\.\/probe\.mjs'/);
  assert.match(html, /from '\.\/analyze\.mjs'/);
  assert.match(html, /from '\.\/usage\.mjs'/);
});

test('index links to the introspection doc page, and the doc page links back', () => {
  assert.match(html, /href="why-disable-graphql-introspection-in-production\.html"/);
  assert.match(docHtml, /href="index\.html"/);
});

test('index links to at least one sibling security-checker venture', () => {
  assert.match(html, /href="\.\.\/cors-misconfig-check\/"/);
  assert.match(html, /href="\.\.\/supabase-rls-check\/"/);
});

test('a worked-example button exists as an alternative to running the CLI first', () => {
  assert.match(html, /id="load-example"/);
});

test('the page explains that browser success depends on the target CORS policy', () => {
  assert.match(html, /CORS policy/);
});

test('every text input and textarea has an associated label for its id', () => {
  const ids = ['endpoint', 'headers', 'payload'];
  for (const id of ids) {
    assert.match(html, new RegExp(`<label for="${id}">`), `missing <label for="${id}">`);
    assert.match(html, new RegExp(`id="${id}"`), `missing element with id="${id}"`);
  }
});

test('the CLI fallback section exists for when the browser check cannot read a response', () => {
  assert.match(html, /id="fallback"/);
  assert.match(html, /id="check-pasted"/);
  assert.match(html, /node check\.mjs/);
});

function extractConst(name, source) {
  const re = new RegExp(`const ${name} = (\\{[\\s\\S]*?\\n  \\});`);
  const match = source.match(re);
  assert.ok(match, `expected an inline const ${name} object literal`);
  // eslint-disable-next-line no-new-func
  return Function(`"use strict"; return (${match[1]});`)();
}

test('the bundled worked example is valid input for buildReport and produces a mutation-surface danger finding', () => {
  const example = extractConst('EXAMPLE', html);
  assert.equal(typeof example.target, 'string');
  assert.ok(example.probe && typeof example.probe === 'object');

  const report = buildReport(example.target, example.probe);
  assert.equal(report.introspectionEnabled, true);
  assert.equal(report.ok, false, 'the worked example must demonstrate at least one danger finding');
  assert.ok(report.findings.some((f) => f.id === 'introspection-enabled' && f.severity === 'danger'));
  assert.ok(report.findings.some((f) => f.id === 'sensitive-mutation-names'));
});
