import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildReport } from './analyze.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(HERE, 'index.html'), 'utf8');
const docHtml = readFileSync(join(HERE, 'social-preview-fallback-rules.html'), 'utf8');

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

test('JSON-LD includes SoftwareApplication with a free price and FAQPage with 3+ questions', () => {
  const parsed = jsonLdBlocks(html).map((b) => JSON.parse(b));
  const app = parsed.find((p) => p['@type'] === 'SoftwareApplication');
  const faq = parsed.find((p) => p['@type'] === 'FAQPage');
  assert.ok(app, 'missing SoftwareApplication JSON-LD');
  assert.equal(app.offers.price, '0');
  assert.ok(faq, 'missing FAQPage JSON-LD');
  assert.ok(faq.mainEntity.length >= 3);
});

test('the doc page carries valid HowTo JSON-LD with 3+ steps', () => {
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
  assert.match(html, /Nothing leaves your browser|nothing is uploaded/i);
});

test('the sponsor link points at the correct GitHub Sponsors profile', () => {
  for (const source of [html, docHtml]) {
    assert.match(source, /https:\/\/github\.com\/sponsors\/Duncan-Haywood/);
  }
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
  assert.match(html, /not a guarantee of how any individual platform|Evidence, not a determination/);
});

test('analyze.mjs and usage.mjs are imported as ES modules, not duplicated inline', () => {
  assert.match(html, /from '\.\/analyze\.mjs'/);
  assert.match(html, /from '\.\/usage\.mjs'/);
});

test('index links to the fallback-rules doc page, and the doc page links back', () => {
  assert.match(html, /href="social-preview-fallback-rules\.html"/);
  assert.match(docHtml, /href="index\.html"/);
});

test('index links to at least one sibling checker venture', () => {
  assert.match(html, /href="\.\.\/structured-data-drift-check\/"/);
});

test('a worked-example button exists as an alternative to running the CLI first', () => {
  assert.match(html, /id="load-example"/);
});

test('the bonus standalone image-size tool exists and explains why it needs no CORS', () => {
  assert.match(html, /id="check-image"/);
  assert.match(html, /id="image-url"/);
  assert.match(html, /not subject to CORS/);
});

test('the page explains the twitter:image -> og:image fallback chain', () => {
  assert.match(html, /falls back to og:image|fallback chain/);
});

function extractConst(name) {
  const re = new RegExp(`const ${name} = (\\{[\\s\\S]*?\\n  \\});`);
  const match = html.match(re);
  assert.ok(match, `expected an inline const ${name} object literal in index.html`);
  // eslint-disable-next-line no-new-func
  return Function(`"use strict"; return (${match[1]});`)();
}

test('the bundled worked example is valid input for buildReport and produces danger findings', () => {
  const example = extractConst('EXAMPLE');
  assert.equal(typeof example.target, 'string');
  assert.equal(typeof example.probe, 'object');

  const report = buildReport(example.target, example.probe);
  assert.equal(report.ok, false, 'the worked example must demonstrate at least one danger finding');
  assert.ok(report.findings.some((f) => f.id === 'missing-preview-image'));
  assert.ok(report.findings.some((f) => f.id === 'twitter-large-image-card-missing-image'));
  assert.ok(report.findings.some((f) => f.severity === 'danger'));
});
