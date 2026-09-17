// The comparison page carries factual claims about a generic method (not a
// named competitor) and its own FAQPage structured data. Both are the kind
// of thing that goes quietly wrong in an edit, and neither is checked by
// the venture's own engine/CLI tests.

import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const versus = readFileSync(new URL('./vs-checking-it-by-hand.html', import.meta.url), 'utf8');

test('the comparison page carries the no-warranty clause', () => {
  assert.match(versus, /No warranty\.<\/strong> This tool reports whether a referenced path/);
});

test('the comparison page frames the difference as a different job, never as a fault', () => {
  for (const word of ['scam', 'ripoff', 'rip-off', 'overpriced', 'useless', 'broken']) {
    assert.ok(!new RegExp(`\\b${word}\\b`, 'i').test(versus), `the comparison page uses "${word}"`);
  }
});

test('the comparison page links back to the checker', () => {
  assert.match(versus, /href="\.\/"/, 'vs-checking-it-by-hand.html has no link back to the checker');
});

test('the comparison page is indexable and describes itself for a crawler', () => {
  assert.match(versus, /<meta name="robots" content="index,follow">/);
  assert.match(versus, /<meta name="description" content="[^"]{80,}">/);
  assert.match(versus, /<title>[^<]+<\/title>/);
});

test('the comparison page carries valid FAQPage JSON-LD matching its visible text', () => {
  const blocks = [...versus.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const parsed = blocks.map((b) => JSON.parse(b));
  const faq = parsed.find((p) => p['@type'] === 'FAQPage');
  assert.ok(faq, 'missing FAQPage JSON-LD on the comparison page');
  assert.ok(faq.mainEntity.length >= 3);
  for (const qa of faq.mainEntity) {
    assert.ok(versus.includes(qa.name), `visible question missing: ${qa.name}`);
    assert.ok(versus.includes(qa.acceptedAnswer.text), `visible answer missing for: ${qa.name}`);
  }
});

test('the comparison page carries the privacy line and is listed in the venture sitemap', () => {
  assert.match(versus, /Nothing leaves your browser/);
  const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  assert.match(sitemap, /vs-checking-it-by-hand\.html/);
});

test('the comparison page is linked from the venture index', () => {
  const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(index, /href="vs-checking-it-by-hand\.html"/);
});
