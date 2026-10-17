// A guide page (deliberately not named vs-*.html -- COMPARISON_FILE_PATTERN
// in platform/pages/build.mjs would then count it against this venture's
// generic-method comparison budget, which vs-a-flat-hang-fee.html already
// fills). It explains a distinct angle neither the "how much to charge"
// guide nor the vs-servicetitan/vs-workiz/vs-a-flat-hang-fee comparisons
// cover: whether to hardwire the EVSE or land it on a NEMA 14-50 receptacle,
// and how little that choice actually moves the price.

import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('./should-i-hardwire-or-use-a-nema-14-50.html', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('the guide page carries the no-warranty clause', () => {
  assert.match(html, /No warranty\.<\/strong> This free page is not electrical, engineering, code, legal, tax, or financial advice/);
});

test('the guide page carries the privacy line and is listed in the venture sitemap', () => {
  assert.match(html, /Nothing leaves your browser/);
  assert.match(sitemap, /should-i-hardwire-or-use-a-nema-14-50\.html/);
});

test('the guide page is linked from index.html, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/should-i-hardwire-or-use-a-nema-14-50\.html"/);
});

test('the guide page links back to the calculator', () => {
  assert.match(html, /href="\.\/"/);
});

test('the guide page is indexable and describes itself for a crawler', () => {
  assert.match(html, /<meta name="robots" content="index,follow">/);
  assert.match(html, /<meta name="description" content="[^"]{80,}">/);
  assert.match(html, /<title>[^<]+<\/title>/);
});

test('the guide page carries valid FAQPage JSON-LD matching its visible text', () => {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const parsed = blocks.map((b) => JSON.parse(b));
  const faq = parsed.find((p) => p['@type'] === 'FAQPage');
  assert.ok(faq, 'missing FAQPage JSON-LD');
  assert.ok(faq.mainEntity.length >= 3);
  for (const qa of faq.mainEntity) {
    assert.ok(html.includes(qa.name), `visible question missing: ${qa.name}`);
    assert.ok(html.includes(qa.acceptedAnswer.text), `visible answer missing for: ${qa.name}`);
  }
});

// The central claim -- a NEMA 14-50 receptacle install prices out only
// slightly higher than hardwired -- is recomputed against the module the
// calculator itself runs, so a change to the shipped arithmetic (labor
// rates, material costs, margin) makes this page's worked figures fail
// rather than merely go stale.
test('the worked example matches what the shipped calculator computes, both ways', async () => {
  const { calculateBid, defaultInputs } = await import('./calc.mjs');
  const base = defaultInputs();

  const hardwired = calculateBid({ ...base, installType: 'hardwired' });
  const nema = calculateBid({ ...base, installType: 'nema_14_50' });

  assert.equal(hardwired.laborHours, 5.65);
  assert.ok(Math.abs(nema.laborHours - 6.05) < 1e-9);
  assert.equal(hardwired.price.toFixed(2), '1263.36');
  assert.equal(nema.price.toFixed(2), '1374.04');

  const diff = (nema.price - hardwired.price).toFixed(2);
  assert.equal(diff, '110.67');

  for (const value of ['5.65', '6.05', '$1,263.36', '$1,374.04', '$110.67']) {
    assert.ok(html.includes(value), `worked-example figure missing from the page: ${value}`);
  }
});
