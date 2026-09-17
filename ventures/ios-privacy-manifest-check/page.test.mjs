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

// The reciprocal half of chrome-extension-permission-check's own link back
// to this venture -- both cross-check a platform-review-gating manifest
// against real API usage in source, for iOS and Chrome respectively.
// Without this link, this venture is a crawlable orphan (platform/pages/
// siblings.mjs --check).
test('index links one hop to the chrome-extension-permission-check sibling', () => {
  assert.match(
    html,
    /href="\.\.\/chrome-extension-permission-check\/"/,
    'index must link ../chrome-extension-permission-check/ so crawlers reach the Chrome permission checker in one hop',
  );
});

// The real file input requires files the visitor may not have on hand right
// now (or a crawler/automated check has none at all), so this is the only
// path that demonstrates the tool actually works -- see the sibling
// file-upload ventures (npm-deployment-evidence, fifo-pick-evidence,
// dns-configuration-evidence, backup-verification-evidence,
// einvoice-preflight), each of which ships the same "load an example"
// pattern. Counted rather than recalled: five of the nine file-input
// ventures carried one before this venture did.
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

// missing-privacy-manifest-itms-91061.html already links back to index.html
// three times and is listed in the sitemap, but nothing on this page pointed
// forward to it -- so a visitor who lands here first (rather than on the SEO
// satellite page) could never find it, and the one-way link made it an
// orphan in the direction that matters for search: nothing on the site's own
// pages fed it PageRank. Every sibling venture with this same satellite-page
// shape (ai-crawler-access-check, poshmark-fee-calculator) links forward
// from its index in exactly this way.
test('index links forward to its own missing-privacy-manifest-itms-91061 satellite page', () => {
  assert.match(
    html,
    /href="missing-privacy-manifest-itms-91061\.html"/,
    'index must link missing-privacy-manifest-itms-91061.html so a visitor arriving on index.html can reach the ITMS-91061 explainer, matching the forward-link pattern every sibling satellite page uses',
  );
});

// --- vs-waiting-for-app-review.html -----------------------------------------

test('index links its own vs-waiting-for-app-review comparison page', () => {
  assert.match(html, /href="vs-waiting-for-app-review\.html"/);
});

test('the comparison page is reachable from the sitemap', () => {
  const sitemap = readFileSync(join(HERE, 'sitemap.xml'), 'utf8');
  assert.match(sitemap, /vs-waiting-for-app-review\.html/);
});

test('the comparison page carries the required disclaimers and links back to the checker', () => {
  const vsHtml = readFileSync(join(HERE, 'vs-waiting-for-app-review.html'), 'utf8');
  assert.match(vsHtml, /No warranty/);
  assert.match(vsHtml, /Not affiliated with, endorsed by, or sponsored by Apple/);
  assert.match(vsHtml, /Nothing leaves your browser/);
  assert.match(vsHtml, /href="index\.html"/);
});

test("the comparison page's FAQPage JSON-LD answer text matches the visible FAQ prose exactly", () => {
  const vsHtml = readFileSync(join(HERE, 'vs-waiting-for-app-review.html'), 'utf8');
  const blocks = jsonLdBlocks(vsHtml).map((b) => JSON.parse(b));
  const faq = blocks.find((p) => p['@type'] === 'FAQPage');
  assert.ok(faq, 'missing FAQPage JSON-LD on the comparison page');
  assert.ok(faq.mainEntity.length >= 3);
  for (const q of faq.mainEntity) {
    assert.ok(
      vsHtml.includes(q.acceptedAnswer.text),
      `FAQ answer for "${q.name}" must appear verbatim in the visible page`,
    );
  }
});
