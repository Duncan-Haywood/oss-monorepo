import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  parseManifest,
  parseVersions,
  detectSamplePluginDefaults,
  checkVersionsEntry,
  detectUnsafeDom,
  detectGlobalListeners,
  detectConsoleLog,
  buildReport,
} from './scan.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(HERE, 'index.html'), 'utf8');
const docHtml = readFileSync(join(HERE, 'versions-json-missing-entry.html'), 'utf8');

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

test('the not-affiliated-with-Obsidian line is present on both pages', () => {
  for (const source of [html, docHtml]) {
    assert.match(source, /Not affiliated with, endorsed by, or sponsored by Obsidian/);
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
  assert.match(html, /Evidence, not a determination/);
});

test('scan.mjs and usage.mjs are imported as ES modules, not duplicated inline', () => {
  assert.match(html, /from '\.\/scan\.mjs'/);
  assert.match(html, /from '\.\/usage\.mjs'/);
});

// The two pages must be reachable from each other in one hop, or a crawler
// entering on either one never reaches the other.
test('index links to the versions-json-missing-entry doc page, and the doc page links back', () => {
  assert.match(html, /href="versions-json-missing-entry\.html"/);
  assert.match(docHtml, /href="index\.html"/);
});

// The real folder picker requires a project the visitor may not have on hand
// right now (or a crawler/automated check has none at all), so this is the
// only path that demonstrates the tool actually works.
test('a worked-example button exists as an alternative to picking a real folder', () => {
  assert.match(html, /id="loadExample"/);
});

// Closest siblings: both cross-check a platform-review-gating manifest
// against actual source usage, for a different platform. Without a
// crawlable link here, a crawler entering on this tool never reaches either
// sibling in one hop.
test('index links one hop to the wordpress-plugin-review-check and chrome-extension-permission-check siblings', () => {
  assert.match(
    html,
    /href="\.\.\/wordpress-plugin-review-check\/"/,
    'index must link ../wordpress-plugin-review-check/ so crawlers reach it in one hop',
  );
  assert.match(
    html,
    /href="\.\.\/chrome-extension-permission-check\/"/,
    'index must link ../chrome-extension-permission-check/ so crawlers reach it in one hop',
  );
});

function extractConst(name) {
  const re = new RegExp(`const ${name} = (?:JSON\\.stringify\\([\\s\\S]*?\\)|\`[\\s\\S]*?\`);`);
  const match = html.match(re);
  assert.ok(match, `expected an inline const ${name} in index.html`);
  return match[0];
}

test('the bundled worked example exercises every report status this tool can show', () => {
  // Evaluate the three EXAMPLE_* consts the page defines, in the sandboxed
  // way every other file-upload checker's page test in this portfolio does:
  // extract the literal source and hand it to Function() rather than
  // reimplementing the parsing here, which would drift from the page.
  const manifestSrc = extractConst('EXAMPLE_MANIFEST');
  const versionsSrc = extractConst('EXAMPLE_VERSIONS');
  const sourceSrc = extractConst('EXAMPLE_SOURCE');
  // eslint-disable-next-line no-new-func
  const manifestText = new Function(`${manifestSrc}\nreturn EXAMPLE_MANIFEST;`)();
  // eslint-disable-next-line no-new-func
  const versionsText = new Function(`${versionsSrc}\nreturn EXAMPLE_VERSIONS;`)();
  // eslint-disable-next-line no-new-func
  const sourceText = new Function(`${sourceSrc}\nreturn EXAMPLE_SOURCE;`)();

  const manifest = parseManifest(manifestText);
  assert.equal(manifest.found, true);
  assert.equal(manifest.parseError, false);
  assert.deepEqual(manifest.missingRequired, [], 'the bundled example manifest must carry every required field');

  const versions = parseVersions(versionsText);
  const samplePluginDefaults = detectSamplePluginDefaults(manifest.data);
  const versionsEntry = checkVersionsEntry(manifest.data, versions.data);
  const files = [{ path: 'main.js', content: sourceText }];
  const unsafeDom = detectUnsafeDom(files);
  const globalListeners = detectGlobalListeners(files);
  const consoleLog = detectConsoleLog(files);
  const report = buildReport({ manifest, versions, samplePluginDefaults, versionsEntry, unsafeDom, globalListeners, consoleLog });

  // The example is deliberately built to show every sample-plugin
  // placeholder, a missing versions.json entry, an unsafe DOM assignment, a
  // direct global listener, and a leftover console.log all at once.
  assert.equal(samplePluginDefaults.length, 3);
  assert.equal(versionsEntry.status, 'missing');
  assert.equal(unsafeDom.length, 1);
  assert.equal(globalListeners.length, 1);
  assert.equal(consoleLog.length, 1);
  assert.equal(report.ok, false, 'an example with real issues must not report ok');
});

// --- vs-eslint-plugin-obsidianmd.html ---------------------------------
//
// The comparison page is an organic entry point: it answers the question a
// developer already using ESLint types before finding this tool ("obsidian
// eslint plugin vs manifest checker"). It carries the same obligations the
// entry page does, and one it does not -- every factual claim it makes about
// a named competitor is a claim this repository is answerable for.

const comparisonHtml = readFileSync(
  join(HERE, 'vs-eslint-plugin-obsidianmd.html'),
  'utf8',
);

test('the comparison page carries the disclaimer, the non-affiliation clause, and the sponsor link', () => {
  assert.match(comparisonHtml, /No warranty/);
  assert.match(comparisonHtml, /provided free and as-is, without warranty/);
  assert.match(comparisonHtml, /Not affiliated with, endorsed by, or sponsored by Obsidian/);
  assert.match(comparisonHtml, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('the comparison page links back to the checker and is linked from it', () => {
  assert.match(comparisonHtml, /href="index\.html"/);
  assert.match(html, /href="vs-eslint-plugin-obsidianmd\.html"/);
});

test('the comparison page is listed in the venture sitemap', () => {
  const sitemap = readFileSync(join(HERE, 'sitemap.xml'), 'utf8');
  assert.match(sitemap, /vs-eslint-plugin-obsidianmd\.html/);
});

// The failure this pins is the one CLAUDE.md records costing live product: a
// FAQPage block whose answer text has drifted from the prose a reader sees.
test("the comparison page's FAQPage answers appear verbatim in its visible prose", () => {
  const blocks = jsonLdBlocks(comparisonHtml).map((b) => JSON.parse(b));
  const faq = blocks.find((p) => p['@type'] === 'FAQPage');
  assert.ok(faq, 'expected a FAQPage block');
  assert.ok(faq.mainEntity.length >= 4);
  for (const q of faq.mainEntity) {
    assert.ok(
      comparisonHtml.includes(q.acceptedAnswer.text),
      `FAQ answer for "${q.name}" must appear verbatim in the visible page`,
    );
  }
});

test('the comparison page states the CLI command this checker actually exposes', () => {
  const checkCli = readFileSync(join(HERE, 'check.mjs'), 'utf8');
  assert.match(comparisonHtml, /node check\.mjs \./);
  assert.match(checkCli, /process\.exitCode|process\.exit\(/);
});
