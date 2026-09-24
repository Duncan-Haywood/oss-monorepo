import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildReport } from './engine.mjs';

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

const html = page('public-listing-vs-public-read.html');
const indexHtml = page('index.html');

function jsonLdBlocks(source) {
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  const blocks = [];
  let m;
  while ((m = re.exec(source)) !== null) blocks.push(m[1]);
  return blocks;
}

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not security advice/i);
});

test('the canonical tag names this file', () => {
  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/example\.invalid\/cloud-bucket-exposure-check\/public-listing-vs-public-read\.html">/,
  );
});

test('the HowTo schema is valid JSON with at least 4 steps', () => {
  const blocks = jsonLdBlocks(html);
  assert.ok(blocks.length >= 1, 'expected a HowTo JSON-LD block');
  const schema = blocks.map((b) => JSON.parse(b)).find((s) => s['@type'] === 'HowTo');
  assert.ok(schema, 'no HowTo schema found');
  assert.ok(schema.step.length >= 4);
});

test('the guide page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="public-listing-vs-public-read\.html"/);
});

test('the guide page links back to the checker', () => {
  assert.match(html, /href="index\.html"/);
});

// The three error codes named in the guide's prose are the exact codes
// engine.mjs treats as a "private" (denied) verdict -- pinned against the
// real classifier rather than typed by eye, so the two cannot drift apart
// silently if DENIED_CODES ever changes.
test('every DENIED_CODES entry quoted in the guide is actually classified as private by engine.mjs', () => {
  for (const code of ['AccessDenied', 'PublicAccessNotPermitted', 'AuthorizationPermissionMismatch']) {
    assert.match(html, new RegExp(code), `guide does not mention ${code}`);
    const r = buildReport('https://example.com/probed', {
      ok: true,
      status: 403,
      provider: 's3',
      bodySample: `<Error><Code>${code}</Code></Error>`,
      error: null,
    });
    assert.equal(r.state, 'private', `${code} should classify as private`);
  }
});

// The guide's central claim is that a real public-listing document and a
// real denial document are read differently by the same classifier --
// checked here against the actual engine, not asserted by eye.
test('the worked contrast (public-listing vs. denied) matches engine.mjs on both providers', () => {
  const s3Listing = buildReport('https://s3.amazonaws.com/example', {
    ok: true,
    status: 200,
    provider: 's3',
    bodySample: '<ListBucketResult><Contents><Key>a</Key></Contents></ListBucketResult>',
    error: null,
  });
  assert.equal(s3Listing.state, 'public-listing');
  assert.equal(s3Listing.ok, false);

  const azureDenied = buildReport('https://acct.blob.core.windows.net/container', {
    ok: true,
    status: 403,
    provider: 'azure',
    bodySample: '<Error><Code>AuthorizationPermissionMismatch</Code></Error>',
    error: null,
  });
  assert.equal(azureDenied.state, 'private');
  assert.equal(azureDenied.ok, true);

  const azureListing = buildReport('https://acct.blob.core.windows.net/container', {
    ok: true,
    status: 200,
    provider: 'azure',
    bodySample: '<EnumerationResults><Blobs><Blob><Name>a</Name></Blob></Blobs></EnumerationResults>',
    error: null,
  });
  assert.equal(azureListing.state, 'public-listing');
  assert.equal(azureListing.ok, false);
});
