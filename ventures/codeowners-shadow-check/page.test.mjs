import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildReport } from './codeowners.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(HERE, 'index.html'), 'utf8');
const docHtml = readFileSync(join(HERE, 'why-codeowners-review-stops-being-required.html'), 'utf8');

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

test('every FAQ answer in the schema also appears as visible copy', () => {
  const parsed = jsonLdBlocks(html).map((b) => JSON.parse(b));
  const faq = parsed.find((p) => p['@type'] === 'FAQPage');
  for (const qa of faq.mainEntity) {
    assert.ok(html.includes(qa.name), `question not visible on page: ${qa.name}`);
    // The visible paragraph is written by hand to match the JSON-LD text
    // exactly, so a substring check against the raw markup is sufficient
    // here (the markup contains no inline tags inside these paragraphs).
    assert.ok(html.includes(qa.acceptedAnswer.text), `answer not visible on page for: ${qa.name}`);
  }
});

test('the no-warranty disclaimer is present', () => {
  assert.match(html, /No warranty/);
  assert.match(html, /provided free and as-is, without warranty/);
});

test('the doc page carries valid FAQPage JSON-LD, matching the guide-coverage convention', () => {
  const blocks = jsonLdBlocks(docHtml).map((b) => JSON.parse(b));
  const faq = blocks.find((b) => b['@type'] === 'FAQPage');
  assert.ok(faq, 'missing FAQPage JSON-LD on the doc page');
  assert.ok(faq.mainEntity.length >= 3);
});

test('every FAQ answer in the doc page schema also appears as visible copy', () => {
  const blocks = jsonLdBlocks(docHtml).map((b) => JSON.parse(b));
  const faq = blocks.find((b) => b['@type'] === 'FAQPage');
  for (const qa of faq.mainEntity) {
    assert.ok(docHtml.includes(qa.name), `question not visible on doc page: ${qa.name}`);
    assert.ok(docHtml.includes(qa.acceptedAnswer.text), `answer not visible on doc page for: ${qa.name}`);
  }
});

test('the no-warranty disclaimer is present on the doc page too', () => {
  assert.match(docHtml, /No warranty/);
  assert.match(docHtml, /provided free and as-is, without warranty/);
});

test('the MIT license is linked on the doc page', () => {
  assert.match(docHtml, /href="LICENSE"/);
  assert.match(docHtml, /MIT licen[cs]e/);
});

test('index links to the doc page, and the doc page links back', () => {
  assert.match(html, /href="why-codeowners-review-stops-being-required\.html"/);
  assert.match(docHtml, /href="index\.html"/);
});

test('the doc page shows a worked before/after CODEOWNERS example matching the tool\'s own semantics', () => {
  assert.match(docHtml, /@payments-team/);
  assert.match(docHtml, /@generalists/);
  assert.match(docHtml, /last-match-wins|last matching pattern wins/);
});

test('the doc page names the exported function it tells readers to call for a CI gate', () => {
  assert.match(docHtml, /buildReport/);
  assert.match(docHtml, /from '\.\/codeowners\.mjs'/);
});

test('the privacy line states nothing is uploaded', () => {
  assert.match(html, /never uploaded|Nothing leaves your browser/);
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
  assert.match(html, /Evidence, not a determination/);
});

test('codeowners.mjs and usage.mjs are imported as ES modules, not duplicated inline', () => {
  assert.match(html, /from '\.\/codeowners\.mjs'/);
  assert.match(html, /from '\.\/usage\.mjs'/);
});

test('index links to at least one sibling checker venture', () => {
  assert.match(html, /href="\.\.\/(actions-permissions-check|repository-branch-hygiene)\/"/);
});

test('a worked-example button exists as an alternative to running the CLI first', () => {
  assert.match(html, /id="load-example"/);
});

test('the CLI command is shown and matches the shipped check.mjs entry point', () => {
  assert.match(html, /node check\.mjs/);
});

function extractConst(name) {
  const re = new RegExp(`const ${name} = (\\{[\\s\\S]*?\\n  \\});`);
  const match = html.match(re);
  assert.ok(match, `expected an inline const ${name} object literal in index.html`);
  // eslint-disable-next-line no-new-func
  return Function(`"use strict"; return (${match[1]});`)();
}

test('the bundled worked example demonstrates a shadowed rule, matching codeowners.test.mjs', () => {
  const example = extractConst('EXAMPLE');
  assert.equal(typeof example.codeowners, 'string');
  assert.ok(Array.isArray(example.paths) && example.paths.length > 0);

  const report = buildReport(example.codeowners, example.paths.join('\n'));
  assert.equal(report.ok, false, 'the worked example must demonstrate at least one shadowed rule');
  assert.equal(report.shadowed.length, 1);
  assert.equal(report.shadowed[0].rule.pattern, '/src/payments/*.js');
});
