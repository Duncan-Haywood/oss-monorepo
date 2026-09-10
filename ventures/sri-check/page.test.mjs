import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { extractCrossOriginAssets, buildReport } from './sri.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(HERE, 'index.html'), 'utf8');
const docHtml = readFileSync(join(HERE, 'why-does-sri-need-the-crossorigin-attribute.html'), 'utf8');

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

// Byte-identical (modulo whitespace) match of every FAQPage question/answer
// against the page's own visible text is enforced fleet-wide by
// platform/pages/faq-visible.test.mjs, which this venture's own CI does not
// re-run -- duplicating a weaker version of that check here would only teach
// a false pass. Run `node --test platform/pages/faq-visible.test.mjs` from
// the repo root before shipping a change to this page's questions/answers.

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

test('the privacy line states nothing is uploaded / leaves the browser', () => {
  assert.match(html, /never uploaded|Nothing leaves your browser|nothing is uploaded/i);
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

test('sri.mjs and usage.mjs are imported as ES modules, not duplicated inline', () => {
  assert.match(html, /from '\.\/sri\.mjs'/);
  assert.match(html, /from '\.\/usage\.mjs'/);
});

test('index links to the crossorigin-attribute doc page, and the doc page links back', () => {
  assert.match(html, /href="why-does-sri-need-the-crossorigin-attribute\.html"/);
  assert.match(docHtml, /href="index\.html"/);
});

test('index links to at least one sibling security-checker venture', () => {
  assert.match(html, /href="\.\.\/cors-misconfig-check\/"/);
});

test('a worked-example button exists as an alternative to running the CLI first', () => {
  assert.match(html, /id="load-example"/);
});

test('the page explains why the browser cannot check a page itself', () => {
  assert.match(html, /restricted by CORS|forbidden request header/);
});

test('the standalone hash generator has its own algorithm choice and output field', () => {
  assert.match(html, /id="hashInput"/);
  assert.match(html, /id="hashAlgo"/);
  assert.match(html, /id="generate"/);
  assert.match(html, /id="hashOutput"/);
});

test('the bundled worked example is valid input for extractCrossOriginAssets + buildReport and produces a danger finding', () => {
  const match = html.match(/const EXAMPLE = (\{[\s\S]*?\n  \});/);
  assert.ok(match, 'expected an inline const EXAMPLE object literal in index.html');
  // eslint-disable-next-line no-new-func
  const example = Function(`"use strict"; return (${match[1]});`)();

  assert.equal(typeof example.page, 'string');
  assert.ok(Array.isArray(example._rawAssets));

  const fetchResults = new Map(Object.entries(example._rawFetchResults || {}));
  const report = buildReport(example.page, example._rawAssets, fetchResults);
  assert.equal(report.ok, false, 'the worked example must demonstrate at least one danger finding');
  assert.ok(report.findings.some((f) => f.id === 'missing-integrity'));
  assert.ok(report.findings.some((f) => f.id === 'integrity-hash-mismatch'));
});

test('extractCrossOriginAssets is reachable from the page module for a real fetched page (smoke test)', () => {
  const sample = '<script src="https://cdn.example.com/lib.js" integrity="sha384-AAA" crossorigin="anonymous"></script>';
  const assets = extractCrossOriginAssets(sample, 'https://mysite.example/');
  assert.equal(assets.length, 1);
});
