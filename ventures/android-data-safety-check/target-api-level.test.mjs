import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { detectTargetSdk, buildTargetSdkReport } from './target-sdk-scan.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(HERE, 'target-api-level.html'), 'utf8');

function jsonLdBlocks(source) {
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  const blocks = [];
  let m;
  while ((m = re.exec(source)) !== null) blocks.push(m[1]);
  return blocks;
}

test('every JSON-LD block is valid JSON', () => {
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

test("FAQPage JSON-LD answer text matches the visible FAQ prose exactly", () => {
  const blocks = jsonLdBlocks(html).map((b) => JSON.parse(b));
  const faq = blocks.find((p) => p['@type'] === 'FAQPage');
  for (const q of faq.mainEntity) {
    assert.ok(html.includes(q.acceptedAnswer.text), `FAQ answer for "${q.name}" must appear verbatim in the visible page`);
  }
});

test('the no-warranty disclaimer is present', () => {
  assert.match(html, /No warranty/);
  assert.match(html, /provided free and as-is, without warranty/);
});

test('the privacy line states nothing is uploaded', () => {
  assert.match(html, /never uploaded|Nothing leaves your browser/);
});

test('the not-affiliated-with-Google line is present', () => {
  assert.match(html, /Not affiliated with, endorsed by, or sponsored by Google LLC/);
});

test('the sponsor link points at the correct GitHub Sponsors profile', () => {
  assert.match(html, /https:\/\/github\.com\/sponsors\/Duncan-Haywood/);
});

test('the MIT license is linked', () => {
  assert.match(html, /href="LICENSE"/);
  assert.match(html, /MIT licence/);
});

test('a usage opt-out control exists', () => {
  assert.match(html, /id="usageOptOut"/);
});

test('the evidence-not-a-determination disclaimer is present', () => {
  assert.match(html, /not a guarantee Google Play will treat your/);
});

test('target-sdk-scan.mjs and usage.mjs are imported as ES modules, not duplicated inline', () => {
  assert.match(html, /from '\.\/target-sdk-scan\.mjs'/);
  assert.match(html, /from '\.\/usage\.mjs'/);
});

test('the page links back to the sibling Data safety checker', () => {
  assert.match(html, /href="index\.html"/);
});

test('a worked-example button exists as an alternative to picking real files', () => {
  assert.match(html, /id="loadExample"/);
});

test('a form-factor selector is generated from the shared FORM_FACTORS list, not a hand-typed second copy', () => {
  assert.match(html, /FORM_FACTORS/);
  assert.match(html, /id="formFactor"/);
});

test('the page is reachable from the sitemap', () => {
  const sitemap = readFileSync(join(HERE, 'sitemap.xml'), 'utf8');
  assert.match(sitemap, /target-api-level\.html/);
});

function extractConst(name) {
  const re = new RegExp(`const ${name} = \`([\\s\\S]*?)\`;`);
  const match = html.match(re);
  assert.ok(match, `expected an inline const ${name} in target-api-level.html`);
  return match[1];
}

test('the bundled worked example is below the phone/tablet existing-app floor, matching its own comment', () => {
  const gradle = extractConst('EXAMPLE_GRADLE');
  const detected = detectTargetSdk([{ path: 'app/build.gradle', content: gradle }]);
  const report = buildTargetSdkReport(detected, 'phone-tablet', new Date('2026-09-23T00:00:00Z'));
  assert.equal(report.highest, 33);
  assert.equal(report.meetsExisting, false);
});
