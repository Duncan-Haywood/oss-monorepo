import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildReport } from './analyze.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(HERE, 'index.html'), 'utf8');
const guideHtml = readFileSync(join(HERE, 'why-s3-buckets-end-up-public.html'), 'utf8');
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

test('the "only run this against a bucket you own or are authorised" caution is present', () => {
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
  assert.match(html, /href="why-s3-buckets-end-up-public\.html"/);
  assert.match(guideHtml, /href="index\.html"/);
});

test('index links to the vs page, and the vs page links back', () => {
  assert.match(html, /href="vs-checking-by-hand\.html"/);
  assert.match(vsHtml, /href="index\.html"/);
});

test('index links to at least one sibling security-checker venture', () => {
  assert.match(html, /href="\.\.\/(supabase-rls-check|firebase-rules-check|dotenv-exposure-check|git-exposure-check)\/"/);
});

test('a worked-example button exists as an alternative to entering a real bucket name first', () => {
  assert.match(html, /id="load-example"/);
});

test('the CLI is documented as an alternative for CI use', () => {
  assert.match(html, /node check\.mjs/);
});

test('the page explains the CORS limitation on a live browser fetch', () => {
  assert.match(html, /CORS/);
});

test('the pages state that object file contents are never fetched', () => {
  assert.match(html, /file contents? (?:are|is) never fetched|never fetches an object.s (?:bytes|content)/i);
});

test('index.html never writes, uploads, or deletes -- only GET-shaped requests are documented', () => {
  assert.doesNotMatch(html, /method:\s*['"](POST|PATCH|PUT|DELETE)['"]/);
});

test('the guide page explains the AuthenticatedUsers group is not "my own users"', () => {
  assert.match(guideHtml, /any AWS account holder/i);
});

test('the bundled worked example produces at least one critical finding', () => {
  const report = buildReport('demo-shop-backups', {
    listing: { ok: true, status: 200, text: '<ListBucketResult><Contents><Key>a.csv</Key></Contents></ListBucketResult>', error: null },
    acl: { ok: false, status: 403, text: '<Error><Code>AccessDenied</Code></Error>', error: 'HTTP 403' },
  });
  assert.equal(report.ok, false);
  assert.equal(report.criticalCount, 1);
});

test('the AuthenticatedUsers-vs-AllUsers distinction is named on the index page', () => {
  assert.match(html, /AuthenticatedUsers/);
  assert.match(html, /AllUsers/);
});
