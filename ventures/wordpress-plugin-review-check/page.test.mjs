import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseReadme, findPluginHeaderFile, parsePluginHeader, detectUnescapedOutput, detectMissingNonceChecks, buildReport } from './scan.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(HERE, 'index.html'), 'utf8');
const docHtml = readFileSync(join(HERE, 'stable-tag-mismatch.html'), 'utf8');

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

test('the not-affiliated-with-WordPress line is present on both pages', () => {
  for (const source of [html, docHtml]) {
    assert.match(source, /Not affiliated with, endorsed by, or sponsored by the WordPress Foundation/);
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
  assert.match(html, /not a guarantee[\s\S]*?wordpress\.org Plugin Review[\s\S]*?will pass|is not a determination/);
});

test('scan.mjs and usage.mjs are imported as ES modules, not duplicated inline', () => {
  assert.match(html, /from '\.\/scan\.mjs'/);
  assert.match(html, /from '\.\/usage\.mjs'/);
});

// The two pages must be reachable from each other in one hop, or a crawler
// entering on either one never reaches the other.
test('index links to the stable-tag-mismatch doc page, and the doc page links back', () => {
  assert.match(html, /href="stable-tag-mismatch\.html"/);
  assert.match(docHtml, /href="index\.html"/);
});

// Closest siblings: both cross-check a platform-review-gating manifest/header
// against actual API/output usage in source, for a different platform.
// Without a crawlable link here, a crawler entering on this tool never
// reaches either sibling in one hop.
test('index links one hop to the chrome-extension-permission-check and ios-privacy-manifest-check siblings', () => {
  assert.match(
    html,
    /href="\.\.\/chrome-extension-permission-check\/"/,
    'index must link ../chrome-extension-permission-check/ so crawlers reach it in one hop',
  );
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
  const readmeText = extractConst('EXAMPLE_README');
  const pluginFileText = extractConst('EXAMPLE_PLUGIN_FILE');

  const readme = parseReadme(readmeText);
  assert.equal(readme.found, true);
  assert.deepEqual(readme.missingRequired, [], 'the bundled example readme must carry every required field');

  const files = [{ path: 'example-plugin.php', content: pluginFileText }];
  const headerFile = findPluginHeaderFile(files);
  assert.ok(headerFile, 'the bundled example plugin file must carry a Plugin Name header');
  const pluginHeader = parsePluginHeader(headerFile);
  assert.deepEqual(pluginHeader.missingRequired, []);

  const unescapedOutput = detectUnescapedOutput(files);
  const missingNonceChecks = detectMissingNonceChecks(files);
  const report = buildReport({ readme, pluginHeader, unescapedOutput, missingNonceChecks });

  // The example is deliberately built to show a Stable tag mismatch, an
  // unescaped $_GET echo, and a $_POST handler with no nonce check, all at
  // once -- exercising every failure mode this tool reports.
  assert.equal(report.stableTagStatus, 'mismatch');
  assert.equal(report.unescapedOutput.length, 1);
  assert.equal(report.missingNonceChecks.length, 1);
  assert.equal(report.ok, false, 'an example with real issues must not report ok');
});
