import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const index = await readFile(new URL('./index.html', import.meta.url), 'utf8');

test('the entry page is a working tool, not a landing page', () => {
  assert.match(index, /<textarea/);
  assert.match(index, /id="check"/);
  assert.match(index, /id="load-example"/);
  assert.match(index, /classify\.mjs/);
});

test('disclaimers, usage opt-out, sponsor link, and local-only claims are present', () => {
  assert.match(index, /No warranty/);
  assert.match(index, /Best-effort hosting, no SLA/);
  assert.match(index, /never leaves your device/i);
  assert.match(index, /no network calls/i);
  assert.match(index, /SoftwareApplication/);
  assert.match(index, /Turn usage counting off/);
  assert.match(index, /sponsors\/Duncan-Haywood/);
  assert.match(index, /not a security audit/);
});

test('page carries no leftover text from the timeout checker it was modelled on', () => {
  assert.doesNotMatch(index, /timeout-minutes|360|actions-timeout-check-usage/);
});

test('JSON-LD FAQPage questions match the visible FAQ headings', () => {
  const ld = index.match(/"@type":"FAQPage"[\s\S]*?<\/script>/)[0];
  const headings = [...index.matchAll(/<h3>(.*?)<\/h3>/g)].map((m) => m[1].trim());
  assert.ok(headings.length >= 5);
  for (const h of headings) assert.ok(ld.includes(h), `missing from JSON-LD: ${h}`);
});

test('title and description carry the search phrase', () => {
  assert.match(index, /<title>[^<]*Runtime Deprecation[^<]*<\/title>/);
  assert.match(index, /name="description" content="[^"]*Node[^"]*"/);
});

test('sibling checkers are one crawlable hop away', () => {
  for (const s of ['actions-timeout-check', 'actions-permissions-check', 'actions-transitive-pin-check']) {
    assert.match(index, new RegExp(`href="\\.\\./${s}/"`));
  }
});
