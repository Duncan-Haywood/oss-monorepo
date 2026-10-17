import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

const html = page('how-to-fix-a-publicly-listable-bucket.html');
const indexHtml = page('index.html');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not security advice/i);
});

test('carries the "only what you are authorised to change" caution', () => {
  assert.match(html, /authoris(?:ed|ation)/i);
});

test('the canonical tag names this file', () => {
  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/example\.invalid\/cloud-bucket-exposure-check\/how-to-fix-a-publicly-listable-bucket\.html">/,
  );
});

test('the HowTo schema is valid JSON with at least 3 steps', () => {
  const match = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
  assert.ok(match, 'no JSON-LD block found');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@type'], 'HowTo');
  assert.ok(schema.step.length >= 3);
  for (const step of schema.step) {
    assert.equal(typeof step.name, 'string');
    assert.equal(typeof step.text, 'string');
  }
});

test('the guide page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="how-to-fix-a-publicly-listable-bucket\.html"/);
});

test('the guide page links back to the checker', () => {
  assert.match(html, /<a href="\.\/">/);
});

test('names a real remediation command for all three providers this tool supports', () => {
  // Grounded against the same PROVIDERS list engine.mjs exports, so a
  // provider this tool drops or gains cannot leave this page silently wrong.
  assert.match(html, /put-public-access-block/); // AWS S3
  assert.match(html, /public-access-prevention/); // Google Cloud Storage
  assert.match(html, /set-permission/); // Azure Blob Storage
});

test('distinguishes listing access from object-read access, matching engine.mjs\'s own scope limit', () => {
  assert.match(html, /object-read access/i);
  assert.match(html, /never (?:designed to test|has an object key to test)/i);
});

test('the checker\'s own private/not-found verdict states are named accurately', () => {
  assert.match(html, /<code>private<\/code>/);
  assert.match(html, /<code>not-found<\/code>/);
});
