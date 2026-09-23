import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildReport } from './analyze.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(HERE, 'index.html'), 'utf8');
const guideHtml = readFileSync(join(HERE, 'why-does-firebase-test-mode-expose-my-data.html'), 'utf8');

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

test('the no-warranty disclaimer is present on the index and guide pages', () => {
  for (const source of [html, guideHtml]) {
    assert.match(source, /No warranty/);
    assert.match(source, /provided free and as-is, without warranty/);
  }
});

test('the privacy line states nothing is uploaded', () => {
  assert.match(html, /never sent to us|Nothing leaves your browser/);
});

test('the "only run this against a project you own or are authorised" caution is present', () => {
  for (const source of [html, guideHtml]) {
    assert.match(source, /authoris(?:ed|ation)/i);
  }
});

test('the sponsor link points at the correct GitHub Sponsors profile', () => {
  assert.match(html, /https:\/\/github\.com\/sponsors\/Duncan-Haywood/);
});

test('the MIT license is linked on the index page', () => {
  assert.match(html, /href="LICENSE"/);
  assert.match(html, /MIT licen[cs]e/);
});

test('a usage opt-out control exists', () => {
  assert.match(html, /id="usageOptOut"/);
});

test('the evidence-not-a-determination disclaimer is present', () => {
  assert.match(html, /not a full security (assessment|audit)|not a guarantee/);
});

test('probe.mjs, analyze.mjs, and usage.mjs are imported as ES modules, not duplicated inline', () => {
  assert.match(html, /from '\.\/probe\.mjs'/);
  assert.match(html, /from '\.\/analyze\.mjs'/);
  assert.match(html, /from '\.\/usage\.mjs'/);
});

test('index links to the guide page, and the guide page links back', () => {
  assert.match(html, /href="why-does-firebase-test-mode-expose-my-data\.html"/);
  assert.match(guideHtml, /href="index\.html"/);
});

test('index links to at least one sibling checker venture', () => {
  assert.match(html, /href="\.\.\/(supabase-rls-check|cors-misconfig-check|security-headers-check)\/"/);
});

test('a worked-example button exists as an alternative to entering real credentials first', () => {
  assert.match(html, /id="load-example"/);
});

test('the CLI is documented as an alternative for CI use and when the browser blocks Firestore', () => {
  assert.match(html, /node check\.mjs/);
  assert.match(html, /CORS/);
});

test('the bundled worked example produces at least one exposed finding', () => {
  // Re-derive the same fixture the page's EXAMPLE_REPORT is built from, so
  // this test is not dependent on extracting a <script> block and instead
  // pins the module contract the page relies on.
  const report = buildReport({
    projectId: 'demo-app-a1b2c',
    databaseUrl: 'https://demo-app-a1b2c-default-rtdb.firebaseio.com',
    realtimeDatabase: { path: '/', ok: true, status: 200, keys: ['users', 'orders'], isNull: false, error: null },
    firestore: [
      { collection: 'admin_config', ok: false, status: 403, documentCount: 0, fieldNames: [], error: null },
      { collection: 'feedback', ok: true, status: 200, documentCount: 0, fieldNames: [], error: null },
    ],
  });
  assert.equal(report.ok, false);
  assert.equal(report.dangerCount, 1);
  assert.equal(report.findings[0].location, 'Realtime Database path "/"');
  assert.equal(report.blocked.length, 1);
  assert.equal(report.unconfirmed.length, 1);
});

test('index.html never writes, updates, or deletes -- only GET-shaped requests are documented', () => {
  assert.doesNotMatch(html, /method:\s*['"](POST|PATCH|PUT|DELETE)['"]/);
});

test('the Realtime Database probe is documented as shallow (never downloading real field values)', () => {
  assert.match(html, /shallow/);
});

test('index links to at least one Firebase collection input and the database URL input', () => {
  assert.match(html, /id="projectId"/);
  assert.match(html, /id="databaseUrl"/);
  assert.match(html, /id="collections"/);
});
