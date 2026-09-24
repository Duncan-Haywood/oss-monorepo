// The comparison page carries factual claims about a generic method (not a
// named competitor) and its own FAQPage structured data. Both are the kind
// of thing that goes quietly wrong in an edit, and neither is checked by
// calc.test.mjs or page.test.mjs.

import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const versus = readFileSync(new URL('./vs-reviewing-it-by-eye.html', import.meta.url), 'utf8');

test('the comparison page carries the no-warranty clause', () => {
  assert.match(versus, /<strong>No warranty\.<\/strong>/);
  assert.match(versus, /not a guarantee that a skill will or will not trigger correctly/i);
});

test('the comparison page carries a client-side privacy statement', () => {
  assert.match(versus, /<strong>Privacy\.<\/strong>/);
  assert.match(versus, /never leaves your device/i);
});

test('the comparison page frames the difference as a different job, never as a fault', () => {
  // "broken" is exempted: it is part of the site-wide best-effort-hosting
  // boilerplate ("may be slow, broken, moved, or taken offline"), not a
  // claim about the generic method this page compares against.
  for (const word of ['scam', 'ripoff', 'rip-off', 'overpriced', 'useless']) {
    assert.ok(!new RegExp(`\\b${word}\\b`, 'i').test(versus), `the comparison page uses "${word}"`);
  }
});

test('the comparison page links back to the checker', () => {
  assert.match(versus, /href="\.\/">/, 'vs-reviewing-it-by-eye.html has no link back to the checker');
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

test('the comparison page is listed in the venture sitemap', () => {
  const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  assert.match(sitemap, /vs-reviewing-it-by-eye\.html/);
});

test('the comparison page is linked from the venture index', () => {
  const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(index, /href="\.\/vs-reviewing-it-by-eye\.html"/);
});
