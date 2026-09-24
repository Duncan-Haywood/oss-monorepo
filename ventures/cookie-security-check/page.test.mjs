import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildReport } from './analyze.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(HERE, 'index.html'), 'utf8');
const docHtml = readFileSync(join(HERE, 'samesite-none-cookie-rejected.html'), 'utf8');
const vsHtml = readFileSync(join(HERE, 'vs-cookiebot.html'), 'utf8');
const vsCurlHtml = readFileSync(join(HERE, 'vs-curl-and-reading-headers-yourself.html'), 'utf8');

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

test('index links to the SameSite doc page, and the doc page links back', () => {
  assert.match(html, /href="samesite-none-cookie-rejected\.html"/);
  assert.match(docHtml, /href="index\.html"/);
});

test('index links to at least one sibling security-checker venture', () => {
  assert.match(html, /href="\.\.\/(security-headers-check|cors-misconfig-check)\/"/);
});

test('a worked-example button exists as an alternative to running the CLI first', () => {
  assert.match(html, /id="load-example"/);
});

test('the page explains the SameSite=None rejection rule, not just a weaker-protection claim', () => {
  assert.match(html, /reject(?:s|ed|ing)? the Set-Cookie header outright|rejects a SameSite=None cookie outright/);
});

test('the page explains the __Host-/__Secure- prefix contract', () => {
  assert.match(html, /__Host-/);
  assert.match(html, /__Secure-/);
});

test('index links to the Cookiebot comparison page, and it links back', () => {
  assert.match(html, /href="vs-cookiebot\.html"/);
  assert.match(vsHtml, /href="index\.html"/);
});

test('the comparison page carries valid FAQPage JSON-LD and the no-warranty disclaimer', () => {
  const blocks = jsonLdBlocks(vsHtml).map((b) => JSON.parse(b));
  const faq = blocks.find((b) => b['@type'] === 'FAQPage');
  assert.ok(faq, 'missing FAQPage JSON-LD on the comparison page');
  assert.ok(faq.mainEntity.length >= 3);
  assert.match(vsHtml, /No warranty/);
  assert.match(vsHtml, /provided free and as-is, without warranty/);
  assert.match(vsHtml, /not affiliated with, endorsed by, or sponsored by Cookiebot/i);
});

test('index links to the curl comparison page, and it links back', () => {
  assert.match(html, /href="vs-curl-and-reading-headers-yourself\.html"/);
  assert.match(vsCurlHtml, /href="index\.html"/);
});

test('the curl comparison page carries valid FAQPage JSON-LD, the no-warranty disclaimer, and the curl affiliation disclaimer', () => {
  const blocks = jsonLdBlocks(vsCurlHtml).map((b) => JSON.parse(b));
  const faq = blocks.find((b) => b['@type'] === 'FAQPage');
  assert.ok(faq, 'missing FAQPage JSON-LD on the curl comparison page');
  assert.ok(faq.mainEntity.length >= 3);
  assert.match(vsCurlHtml, /No warranty/);
  assert.match(vsCurlHtml, /provided free and as-is, without warranty/);
  assert.match(vsCurlHtml, /not affiliated with, endorsed by, or sponsored by the curl project/i);
});

test('the curl comparison page explains why joining Set-Cookie headers and splitting on commas corrupts an Expires date', () => {
  assert.match(vsCurlHtml, /Expires=Wed, 21 Oct 2026 07:28:00 GMT/);
  assert.match(vsCurlHtml, /join(?:ed|ing|s)?[\s\S]{0,40}split/i);
});

test("the curl comparison page's worked example of header-splitting corruption is arithmetically real", () => {
  const setCookie = [
    'session=abc123; Path=/; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Secure; HttpOnly',
    'csrf=xyz789; SameSite=None',
  ];
  assert.equal(setCookie.length, 2, 'two real Set-Cookie headers');
  const naiveFragments = setCookie.join(', ').split(',').map((s) => s.trim());
  assert.equal(naiveFragments.length, 3, 'the Expires comma splits the join into three fragments, not two');
  assert.ok(
    !naiveFragments[1].includes('='),
    'the middle fragment carries no cookie name at all once the Expires comma has split it off',
  );
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
  assert.ok(report.findings.some((f) => f.id === 'samesite-none-without-secure'));
  assert.ok(report.findings.some((f) => f.id === 'host-prefix-violated'));
  assert.ok(report.findings.some((f) => f.severity === 'danger'));
});
