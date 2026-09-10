import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildReport } from './analyze.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(HERE, 'index.html'), 'utf8');

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

test('the FAQPage JSON-LD text matches the visible FAQ prose verbatim', () => {
  const faq = jsonLdBlocks(html).map((b) => JSON.parse(b)).find((p) => p['@type'] === 'FAQPage');
  for (const qa of faq.mainEntity) {
    assert.ok(html.includes(qa.acceptedAnswer.text), `visible copy missing for: ${qa.name}`);
  }
});

test('the no-warranty disclaimer is present', () => {
  assert.match(html, /No warranty/);
  assert.match(html, /provided free and as-is, without warranty/);
});

test('the privacy line states nothing is uploaded', () => {
  assert.match(html, /Nothing leaves your browser/);
});

test('the "only test systems you are authorised to" caution is present', () => {
  assert.match(html, /authoris(?:ed|ation)/i);
});

test('the sponsor link points at the correct GitHub Sponsors profile', () => {
  assert.match(html, /https:\/\/github\.com\/sponsors\/Duncan-Haywood/);
});

test('the MIT license is linked', () => {
  assert.match(html, /href="LICENSE"/);
  assert.match(html, /MIT licen[cs]e/);
});

test('a usage opt-out control exists', () => {
  assert.match(html, /id="usageOptOut"/);
});

test('the evidence-not-a-determination disclaimer is present', () => {
  assert.match(html, /not a full caching or performance audit|is not a determination|not a guarantee/);
});

test('analyze.mjs and usage.mjs are imported as ES modules, not duplicated inline', () => {
  assert.match(html, /from '\.\/analyze\.mjs'/);
  assert.match(html, /from '\.\/usage\.mjs'/);
});

test('index links to at least one sibling checker venture', () => {
  assert.match(html, /href="\.\.\/(security-headers-check|cookie-security-check)\/"/);
});

test('a worked-example button exists as an alternative to running the CLI first', () => {
  assert.match(html, /id="load-example"/);
});

test('the page explains the Vary: * rule, not just a vague caching warning', () => {
  assert.match(html, /never (?:cacheable|reuse)|uncacheable/);
});

test('the page explains the public + Set-Cookie leak pattern', () => {
  assert.match(html, /shared cache/);
  assert.match(html, /Set-Cookie/);
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
  assert.ok(report.findings.some((f) => f.id === 'vary-star'));
  assert.ok(report.findings.some((f) => f.id === 'public-with-set-cookie'));
  assert.ok(report.findings.some((f) => f.severity === 'danger'));
});
