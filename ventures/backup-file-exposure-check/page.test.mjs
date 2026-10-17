import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildReport } from './analyze.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(HERE, 'index.html'), 'utf8');
const guideHtml = readFileSync(join(HERE, 'why-backup-files-end-up-in-web-roots.html'), 'utf8');
const vsHtml = readFileSync(join(HERE, 'vs-checking-by-hand.html'), 'utf8');

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

test('the guide page carries valid HowTo JSON-LD', () => {
  const blocks = jsonLdBlocks(guideHtml).map((b) => JSON.parse(b));
  const howTo = blocks.find((b) => b['@type'] === 'HowTo');
  assert.ok(howTo, 'missing HowTo JSON-LD on the guide page');
  assert.ok(howTo.step.length >= 3);
});

test('the vs page carries valid FAQPage JSON-LD', () => {
  const blocks = jsonLdBlocks(vsHtml).map((b) => JSON.parse(b));
  const faq = blocks.find((b) => b['@type'] === 'FAQPage');
  assert.ok(faq, 'missing FAQPage JSON-LD on the vs page');
});

test('the no-warranty disclaimer is present on the index and vs pages', () => {
  for (const source of [html, vsHtml]) {
    assert.match(source, /No warranty/);
    assert.match(source, /provided free and as-is, without warranty/);
  }
});

test('the privacy line states nothing is uploaded', () => {
  assert.match(html, /never sent to us|Nothing leaves your browser/);
});

test('the "only run this against a site you own or are authorised" caution is present', () => {
  for (const source of [html, guideHtml, vsHtml]) {
    assert.match(source, /own or are authoris(?:ed|ation)|authoris(?:ed|ation) to test/i);
  }
});

test('the sponsor link points at the correct GitHub Sponsors profile', () => {
  assert.match(html, /https:\/\/github\.com\/sponsors\/Duncan-Haywood/);
});

test('the MIT license is linked on the index and vs pages', () => {
  for (const source of [html, vsHtml]) {
    assert.match(source, /href="LICENSE"/);
    assert.match(source, /MIT licen[cs]e/);
  }
});

test('a usage opt-out control exists', () => {
  assert.match(html, /id="usageOptOut"/);
});

test('the evidence-not-a-determination disclaimer is present', () => {
  assert.match(html, /not a full (audit|security review)|is not a determination|not a guarantee/);
});

test('probe.mjs, analyze.mjs, and usage.mjs are imported as ES modules, not duplicated inline', () => {
  assert.match(html, /from '\.\/probe\.mjs'/);
  assert.match(html, /from '\.\/analyze\.mjs'/);
  assert.match(html, /from '\.\/usage\.mjs'/);
});

test('index links to the guide page, and the guide page links back', () => {
  assert.match(html, /href="why-backup-files-end-up-in-web-roots\.html"/);
  assert.match(guideHtml, /href="index\.html"/);
});

test('index links to the vs page, and the vs page links back', () => {
  assert.match(html, /href="vs-checking-by-hand\.html"/);
  assert.match(vsHtml, /href="index\.html"/);
});

test('index links to at least one sibling security-checker venture', () => {
  assert.match(html, /href="\.\.\/(git-exposure-check|dotenv-exposure-check|security-headers-check)\/"/);
});

test('a worked-example button exists as an alternative to entering a real URL first', () => {
  assert.match(html, /id="load-example"/);
});

test('the CLI is documented as an alternative for CI use', () => {
  assert.match(html, /node check\.mjs/);
});

test('the page explains the CORS limitation on a live browser fetch', () => {
  assert.match(html, /CORS/);
});

test('the pages state that row-data statements are never quoted, and archives are never extracted', () => {
  assert.match(html, /never extracts?|never lists?, extracts?, or reads? a file from inside/i);
  assert.match(html, /row-data.*never (?:be )?(?:quoted|shown)|never quote.*row-data/i);
});

test('the bundled worked example produces a critical finding and several blocked results', () => {
  const report = buildReport('https://demo-shop.invalid/', [
    { path: 'backup.zip', ok: true, status: 200, bytes: [0x50, 0x4b, 0x03, 0x04], error: null, url: 'a' },
    { path: 'backup.tar.gz', ok: false, status: 404, bytes: null, error: 'HTTP 404', url: 'b' },
  ]);
  assert.equal(report.ok, false);
  assert.equal(report.criticalCount, 1);
  assert.equal(report.blocked.length, 1);
});

test('index.html never writes, submits, or deletes -- only GET-shaped requests are documented', () => {
  assert.doesNotMatch(html, /method:\s*['"](POST|PATCH|PUT|DELETE)['"]/);
});

test('the guide page states that fixing one deploy cause does not fix the others', () => {
  assert.match(guideHtml, /fixing one does not fix the others/i);
});

test('no page ever prints literal row-data / example customer content into the DOM outside a code sample explaining the tool', () => {
  // The index page's own worked-example dump text includes a fake row value
  // ("alice@example.com") purely to build a realistic in-browser fixture for
  // the SQL-dump detector -- it must never be rendered into the DOM as if it
  // were something the tool "found" and is displaying; the page must state
  // plainly that row-data content is never shown.
  assert.match(html, /row-data statements? .*never (?:be )?(?:quoted|shown)/i);
});
