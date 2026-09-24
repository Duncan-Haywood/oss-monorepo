import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildReport } from './engine.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(HERE, 'index.html'), 'utf8');
const vsHtml = readFileSync(join(HERE, 'vs-manually-checking-in-the-cloud-console.html'), 'utf8');

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

test('every FAQPage question and answer is also visible as rendered copy', () => {
  const faq = jsonLdBlocks(html).map((b) => JSON.parse(b)).find((p) => p['@type'] === 'FAQPage');
  for (const qa of faq.mainEntity) {
    assert.ok(html.includes(qa.name), `question not visible on the page: ${qa.name}`);
    assert.ok(html.includes(qa.acceptedAnswer.text), `answer not visible on the page for: ${qa.name}`);
  }
});

test('the no-warranty disclaimer is present', () => {
  assert.match(html, /No warranty/);
  assert.match(html, /provided free and as-is, without warranty/);
});

test('the privacy line states nothing is uploaded', () => {
  assert.match(html, /never uploaded|Nothing leaves your browser/);
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
  assert.match(html, /not a full (cloud )?security assessment|is not a determination|not a guarantee/);
});

test('engine.mjs and usage.mjs are imported as ES modules, not duplicated inline', () => {
  assert.match(html, /from '\.\/engine\.mjs'/);
  assert.match(html, /from '\.\/usage\.mjs'/);
});

test('index links to at least one sibling checker venture', () => {
  assert.match(html, /href="\.\.\/(git-exposure-check|dotenv-exposure-check|supabase-rls-check|firebase-rules-check)\/"/);
});

// firebase-rules-check links here (added in the same commit), so this link
// is the return half of that pair -- platform/pages/siblings.mjs runs a
// budget of 0 crawlable orphans, and dropping this makes the new venture one.
test('index links back to firebase-rules-check, closing the sibling pair', () => {
  assert.match(html, /href="\.\.\/firebase-rules-check\/"/);
});

test('a worked-example button exists as an alternative to running the CLI first', () => {
  assert.match(html, /id="load-example"/);
});

test('the page explains this checks listing, not object content', () => {
  assert.match(html, /listing/i);
  assert.match(html, /never fetch(?:es)? any individual object|only the listing/i);
});

function extractConst(name) {
  const re = new RegExp(`const ${name} = (\\{[\\s\\S]*?\\n  \\});`);
  const match = html.match(re);
  assert.ok(match, `expected an inline const ${name} object literal in index.html`);
  // eslint-disable-next-line no-new-func
  return Function(`"use strict"; return (${match[1]});`)();
}

test('the bundled worked example is valid input for buildReport and produces a danger finding', () => {
  const example = extractConst('EXAMPLE');
  assert.equal(typeof example.target, 'string');
  assert.equal(typeof example.provider, 'string');

  const report = buildReport(example.target, example);
  assert.equal(report.ok, false, 'the worked example must demonstrate the danger finding');
  assert.ok(report.findings.some((f) => f.id === 'bucket-publicly-listable'));
});

test('the vs page carries valid FAQPage JSON-LD', () => {
  const blocks = jsonLdBlocks(vsHtml);
  assert.ok(blocks.length >= 1);
  const faq = blocks.map((b) => JSON.parse(b)).find((p) => p['@type'] === 'FAQPage');
  assert.ok(faq, 'missing FAQPage JSON-LD on the vs page');
  assert.ok(faq.mainEntity.length >= 3);
});

test('every FAQPage question and answer on the vs page is also visible as rendered copy', () => {
  const faq = jsonLdBlocks(vsHtml).map((b) => JSON.parse(b)).find((p) => p['@type'] === 'FAQPage');
  for (const qa of faq.mainEntity) {
    assert.ok(vsHtml.includes(qa.name), `question not visible on the vs page: ${qa.name}`);
  }
});

test('the no-warranty and authorisation disclaimers are present on the vs page too', () => {
  assert.match(vsHtml, /No warranty/);
  assert.match(vsHtml, /provided free and as-is, without warranty/);
  assert.match(vsHtml, /authoris(?:ed|ation)/i);
});

test('the vs page links back to the index page, and index links to the vs page', () => {
  assert.match(vsHtml, /href="index\.html"/);
  assert.match(html, /href="vs-manually-checking-in-the-cloud-console\.html"/);
});

test('the vs page names no competing product or company, only a generic manual habit', () => {
  assert.match(vsHtml, /names no specific company or product/i);
  assert.doesNotMatch(vsHtml, /\bAWS Trusted Advisor\b|\bS3 Inspector\b|\bScoutSuite\b|\bProwler\b/i);
});
