import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildReport } from './analyze.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(HERE, 'index.html'), 'utf8');
const docHtml = readFileSync(join(HERE, 'clickjacking-and-csp-frame-ancestors.html'), 'utf8');
const vsHtml = readFileSync(join(HERE, 'vs-securityheaders.html'), 'utf8');
const vsDevtoolsHtml = readFileSync(join(HERE, 'vs-checking-headers-by-eye-in-devtools.html'), 'utf8');

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
  assert.match(html, /never uploaded|Nothing leaves your browser/);
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

test('analyze.mjs and usage.mjs are imported as ES modules, not duplicated inline', () => {
  assert.match(html, /from '\.\/analyze\.mjs'/);
  assert.match(html, /from '\.\/usage\.mjs'/);
});

test('index links to the clickjacking doc page, and the doc page links back', () => {
  assert.match(html, /href="clickjacking-and-csp-frame-ancestors\.html"/);
  assert.match(docHtml, /href="index\.html"/);
});

test('index links to at least one sibling security-checker venture', () => {
  assert.match(html, /href="\.\.\/(cors-misconfig-check|sri-check)\/"/);
});

// security-txt-check links here, so this link is the return half of that pair.
// Asserted rather than left to a footer edit: platform/pages/siblings.mjs runs
// a budget of 0, so dropping it makes the new venture a crawlable orphan and
// turns a run red -- which is a worse way to find out than this test failing.
test('index links back to security-txt-check, closing the sibling pair', () => {
  assert.match(html, /href="\.\.\/security-txt-check\/"/);
});

// referrer-permissions-policy-check is new and links here as its own
// nearest sibling; this is the return half of that pair. Asserted rather
// than left to a footer edit for the same reason as security-txt-check
// above: siblings.mjs's orphan budget is 0, so dropping the link silently
// turns a run red.
test('index links to referrer-permissions-policy-check, closing the sibling pair', () => {
  assert.match(html, /href="\.\.\/referrer-permissions-policy-check\/"/);
});

test('a worked-example button exists as an alternative to running the CLI first', () => {
  assert.match(html, /id="load-example"/);
});

test('the page explains why frame-ancestors does not inherit from default-src', () => {
  assert.match(html, /does not inherit from default-src|frame-ancestors is a navigation directive/);
});

function extractConst(name) {
  const re = new RegExp(`const ${name} = (\\{[\\s\\S]*?\\n  \\});`);
  const match = html.match(re);
  assert.ok(match, `expected an inline const ${name} object literal in index.html`);
  // eslint-disable-next-line no-new-func
  return Function(`"use strict"; return (${match[1]});`)();
}

test('index links to the Security Headers comparison page, and it links back', () => {
  assert.match(html, /href="vs-securityheaders\.html"/);
  assert.match(vsHtml, /href="index\.html"/);
});

test('the comparison page carries valid FAQPage JSON-LD and the no-warranty disclaimer', () => {
  const blocks = jsonLdBlocks(vsHtml).map((b) => JSON.parse(b));
  const faq = blocks.find((b) => b['@type'] === 'FAQPage');
  assert.ok(faq, 'missing FAQPage JSON-LD on the comparison page');
  assert.ok(faq.mainEntity.length >= 3);
  assert.match(vsHtml, /No warranty/);
  assert.match(vsHtml, /provided free and as-is, without warranty/);
  assert.match(vsHtml, /not affiliated with, endorsed by, or sponsored by Scott Helme/i);
});

test('index links to the DevTools comparison page, and it links back', () => {
  assert.match(html, /href="vs-checking-headers-by-eye-in-devtools\.html"/);
  assert.match(vsDevtoolsHtml, /href="index\.html"/);
});

test('the DevTools comparison page carries valid FAQPage JSON-LD and the no-warranty disclaimer', () => {
  const blocks = jsonLdBlocks(vsDevtoolsHtml).map((b) => JSON.parse(b));
  const faq = blocks.find((b) => b['@type'] === 'FAQPage');
  assert.ok(faq, 'missing FAQPage JSON-LD on the DevTools comparison page');
  assert.ok(faq.mainEntity.length >= 3);
  assert.match(vsDevtoolsHtml, /No warranty/);
  assert.match(vsDevtoolsHtml, /provided free and as-is, without warranty/);
});

test('the bundled worked example is valid input for buildReport and produces danger findings', () => {
  const example = extractConst('EXAMPLE');
  assert.equal(typeof example.target, 'string');
  assert.equal(typeof example.probe, 'object');

  const report = buildReport(example.target, example.probe);
  assert.equal(report.ok, false, 'the worked example must demonstrate at least one danger finding');
  assert.ok(report.findings.some((f) => f.id === 'frame-options-allow-from-ignored'));
  assert.ok(report.findings.some((f) => f.id === 'csp-unsafe-inline-script'));
  assert.ok(report.findings.some((f) => f.severity === 'danger'));
});
