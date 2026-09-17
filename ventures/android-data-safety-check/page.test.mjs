import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { detectDataTypes, buildReport } from './scan.mjs';

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
  assert.match(html, /not a guarantee Play Console will accept/);
});

test('scan.mjs and usage.mjs are imported as ES modules, not duplicated inline', () => {
  assert.match(html, /from '\.\/scan\.mjs'/);
  assert.match(html, /from '\.\/usage\.mjs'/);
});

test('index links one hop to the ios-privacy-manifest-check sibling', () => {
  assert.match(
    html,
    /href="\.\.\/ios-privacy-manifest-check\/"/,
    'index must link ../ios-privacy-manifest-check/ so crawlers reach the iOS checker in one hop',
  );
});

test('index links one hop to the chrome-extension-permission-check sibling', () => {
  assert.match(
    html,
    /href="\.\.\/chrome-extension-permission-check\/"/,
    'index must link ../chrome-extension-permission-check/ so crawlers reach the Chrome permission checker in one hop',
  );
});

test('a worked-example button exists as an alternative to picking real files', () => {
  assert.match(html, /id="loadExample"/);
});

test('checkboxes are generated from the shared DATA_SAFETY_CATEGORIES list, not a hand-typed second copy', () => {
  assert.match(html, /DATA_SAFETY_CATEGORIES/);
  assert.match(html, /declared-checkbox/);
  assert.match(html, /id="categoryGrid"/);
});

function extractConst(name) {
  const re = new RegExp(`const ${name} = \`([\\s\\S]*?)\`;`);
  const match = html.match(re);
  assert.ok(match, `expected an inline const ${name} in index.html`);
  return match[1];
}

test('the bundled worked example actually exercises all four report states', () => {
  const manifest = extractConst('EXAMPLE_MANIFEST');
  const gradle = extractConst('EXAMPLE_GRADLE');

  const detected = detectDataTypes([
    { path: 'app/src/main/AndroidManifest.xml', content: manifest },
    { path: 'app/build.gradle', content: gradle },
  ]);
  // Matches the EXAMPLE_DECLARED set wired to the same button in index.html.
  const declared = new Set(['audio-files', 'health-fitness']);
  const report = buildReport(detected, declared);
  const byId = new Map(report.categories.map((c) => [c.id, c.status]));

  // Undeclared: detected via permission, not ticked.
  assert.equal(byId.get('location'), 'undeclared');
  // Undeclared: detected via Gradle SDK coordinate, not ticked.
  assert.equal(byId.get('app-activity'), 'undeclared');
  assert.equal(byId.get('device-ids'), 'undeclared');
  // Declared and detected.
  assert.equal(byId.get('audio-files'), 'declared');
  // Declared but never used in the example -- the fourth status the UI renders.
  assert.equal(byId.get('health-fitness'), 'declared-but-not-detected');
  assert.equal(report.ok, false, 'an example with an undeclared category must not report ok');
});

test('index links forward to its own missing-data-safety-declaration satellite page', () => {
  assert.match(
    html,
    /href="missing-data-safety-declaration\.html"/,
    'index must link missing-data-safety-declaration.html so a visitor arriving on index.html can reach the explainer',
  );
});

// --- vs-manually-reviewing-play-console-warnings.html -----------------------

test('index links its own vs-manually-reviewing-play-console-warnings comparison page', () => {
  assert.match(html, /href="vs-manually-reviewing-play-console-warnings\.html"/);
});

test('the comparison page is reachable from the sitemap', () => {
  const sitemap = readFileSync(join(HERE, 'sitemap.xml'), 'utf8');
  assert.match(sitemap, /vs-manually-reviewing-play-console-warnings\.html/);
});

test('the comparison page carries the required disclaimers and links back to the checker', () => {
  const vsHtml = readFileSync(join(HERE, 'vs-manually-reviewing-play-console-warnings.html'), 'utf8');
  assert.match(vsHtml, /No warranty/);
  assert.match(vsHtml, /Not affiliated with, endorsed by, or sponsored by Google LLC/);
  assert.match(vsHtml, /Nothing leaves your browser/);
  assert.match(vsHtml, /href="index\.html"/);
});

test("the comparison page's FAQPage JSON-LD answer text matches the visible FAQ prose exactly", () => {
  const vsHtml = readFileSync(join(HERE, 'vs-manually-reviewing-play-console-warnings.html'), 'utf8');
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

test('the missing-data-safety-declaration satellite page carries its required disclaimers', () => {
  const satHtml = readFileSync(join(HERE, 'missing-data-safety-declaration.html'), 'utf8');
  assert.match(satHtml, /No warranty/);
  assert.match(satHtml, /Not affiliated with, endorsed by, or sponsored by Google LLC/);
  assert.match(satHtml, /href="index\.html"/);
});
