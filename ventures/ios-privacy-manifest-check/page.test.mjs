import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { detectApiUsage, parseManifest, buildReport } from './scan.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(HERE, 'index.html'), 'utf8');

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

test('the no-warranty disclaimer is present', () => {
  assert.match(html, /No warranty/);
  assert.match(html, /provided free and as-is, without warranty/);
});

test('the privacy line states nothing is uploaded', () => {
  assert.match(html, /never uploaded|Nothing leaves your browser/);
});

test('the not-affiliated-with-Apple line is present', () => {
  assert.match(html, /Not affiliated with, endorsed by, or sponsored by Apple/);
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
  assert.match(html, /not a guarantee App Review will pass/);
});

test('scan.mjs and usage.mjs are imported as ES modules, not duplicated inline', () => {
  assert.match(html, /from '\.\/scan\.mjs'/);
  assert.match(html, /from '\.\/usage\.mjs'/);
});

// Closest sibling: both are free, browser-local supply-chain/CI checkers that
// read a manifest the developer already has. Without a crawlable link here, a
// crawler entering on this tool never reaches the sibling in one hop.
test('index links one hop to the dependency-confusion-check sibling', () => {
  assert.match(
    html,
    /href="\.\.\/dependency-confusion-check\/"/,
    'index must link ../dependency-confusion-check/ so crawlers reach the dependency-confusion checker in one hop',
  );
});

// The real file input requires files the visitor may not have on hand right
// now (or a crawler/automated check has none at all), so this is the only
// path that demonstrates the tool actually works -- see the sibling
// file-upload ventures (npm-deployment-evidence, duplicate-payment-audit,
// etc.), every one of which ships the same "Load a worked example" pattern.
test('a worked-example button exists as an alternative to picking real files', () => {
  assert.match(html, /id="loadExample"/);
});

function extractConst(name) {
  const re = new RegExp(`const ${name} = \`([\\s\\S]*?)\`;`);
  const match = html.match(re);
  assert.ok(match, `expected an inline const ${name} in index.html`);
  return match[1];
}

test('the bundled worked example actually exercises all three report states', () => {
  const source = extractConst('EXAMPLE_SOURCE');
  const manifestXml = extractConst('EXAMPLE_MANIFEST');

  const detected = detectApiUsage([{ path: 'DiskSpaceChecker.swift', content: source }]);
  const manifest = parseManifest(manifestXml);
  assert.equal(manifest.parseNote, null, 'the bundled example manifest must parse cleanly');

  const report = buildReport(detected, manifest);
  const byId = new Map(report.categories.map((c) => [c.id, c.status]));

  // Undeclared: exactly the ITMS-91061 case this tool exists to catch --
  // the example must not accidentally be a page where everything is fine.
  assert.equal(byId.get('NSPrivacyAccessedAPICategoryDiskSpace'), 'undeclared');
  // Declared and detected, with a code Apple actually publishes.
  assert.equal(byId.get('NSPrivacyAccessedAPICategoryUserDefaults'), 'declared');
  // Declared in the manifest but never used in the source -- the fourth
  // status the UI renders, otherwise never demonstrated by this example.
  assert.equal(byId.get('NSPrivacyAccessedAPICategoryFileTimestamp'), 'declared-but-not-detected');
  assert.equal(report.ok, false, 'an example with an undeclared category must not report ok');
});
