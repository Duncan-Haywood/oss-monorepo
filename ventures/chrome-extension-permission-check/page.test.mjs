import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { detectApiUsage, parseManifest, buildReport } from './scan.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(HERE, 'index.html'), 'utf8');
const docHtml = readFileSync(join(HERE, 'purple-potassium-unused-permissions.html'), 'utf8');

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

test('the not-affiliated-with-Google line is present on both pages', () => {
  for (const source of [html, docHtml]) {
    assert.match(source, /Not affiliated with, endorsed by, or sponsored by Google/);
  }
});

test('the sponsor link points at the correct GitHub Sponsors profile', () => {
  assert.match(html, /https:\/\/github\.com\/sponsors\/Duncan-Haywood/);
});

test('the MIT license is linked on both pages', () => {
  for (const source of [html, docHtml]) {
    assert.match(source, /href="LICENSE"/);
    assert.match(source, /MIT licence/);
  }
});

test('a usage opt-out control exists', () => {
  assert.match(html, /id="usageOptOut"/);
});

test('the evidence-not-a-determination disclaimer is present', () => {
  assert.match(html, /not a guarantee Chrome Web Store review will pass|is not a determination/);
});

test('scan.mjs and usage.mjs are imported as ES modules, not duplicated inline', () => {
  assert.match(html, /from '\.\/scan\.mjs'/);
  assert.match(html, /from '\.\/usage\.mjs'/);
});

// The two pages must be reachable from each other in one hop, or a crawler
// entering on either one never reaches the other.
test('index links to the purple-potassium doc page, and the doc page links back', () => {
  assert.match(html, /href="purple-potassium-unused-permissions\.html"/);
  assert.match(docHtml, /href="index\.html"/);
});

// Closest sibling: both cross-check a platform-review-gating manifest file
// against actual API usage in source, for a different platform (iOS vs
// Chrome). Without a crawlable link here, a crawler entering on this tool
// never reaches the sibling in one hop.
test('index links one hop to the ios-privacy-manifest-check sibling', () => {
  assert.match(
    html,
    /href="\.\.\/ios-privacy-manifest-check\/"/,
    'index must link ../ios-privacy-manifest-check/ so crawlers reach it in one hop',
  );
});

// The real file input requires files the visitor may not have on hand right
// now (or a crawler/automated check has none at all), so this is the only
// path that demonstrates the tool actually works.
test('a worked-example button exists as an alternative to picking real files', () => {
  assert.match(html, /id="loadExample"/);
});

function extractConst(name) {
  const re = new RegExp(`const ${name} = \`([\\s\\S]*?)\`;`);
  const match = html.match(re);
  assert.ok(match, `expected an inline const ${name} in index.html`);
  return match[1];
}

test('the bundled worked example exercises every report status this tool can show', () => {
  const manifestJson = extractConst('EXAMPLE_MANIFEST');
  const source = extractConst('EXAMPLE_SOURCE');

  const manifest = parseManifest(manifestJson);
  assert.equal(manifest.parseNote, null, 'the bundled example manifest must parse cleanly');

  const detected = detectApiUsage([{ path: 'background.js', content: source }]);
  const report = buildReport(detected, manifest);
  const byId = new Map(report.permissions.map((p) => [p.id, p.status]));

  // storage: declared and used.
  assert.equal(byId.get('storage'), 'declared-and-detected');
  // notifications: declared but never called -- the Purple Potassium case.
  assert.equal(byId.get('notifications'), 'declared-unused');
  // tabs: called but never declared -- the runtime-failure case.
  assert.equal(byId.get('tabs'), 'detected-undeclared');
  // activeTab: declared, but has no code signature -- must not appear in
  // the main permissions table at all, only in `uncheckable`.
  assert.ok(!byId.has('activeTab'));
  assert.ok(report.uncheckable.some((u) => u.id === 'activeTab'));
  // <all_urls> host permission must be flagged broad.
  assert.ok(report.hostPermissions.some((h) => h.pattern === '<all_urls>' && h.broad));

  assert.equal(report.ok, false, 'an example with real issues must not report ok');
  assert.equal(report.declaredUnusedCount, 1);
  assert.equal(report.detectedUndeclaredCount, 1);
  assert.equal(report.broadHostCount, 1);
});
