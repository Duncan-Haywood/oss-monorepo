import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const versus = readFileSync(new URL('./vs-a-spreadsheet.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('the calculator links to its spreadsheet comparison page and is listed in the sitemap', () => {
  assert.match(index, /vs-a-spreadsheet\.html/);
  assert.match(sitemap, /vs-a-spreadsheet\.html/);
});

test('the vs-spreadsheet comparison page carries the standard disclaimer and no product affiliation claim', () => {
  assert.match(versus, /<title>This calculator vs\. a spreadsheet/);
  assert.match(versus, /name="description"/);
  assert.match(versus, /"@type":"FAQPage"/);
  assert.match(versus, /href="\.\/"/);
  assert.match(versus, /Best-effort hosting, no SLA/);
  assert.match(versus, /No warranty/);
  assert.match(versus, /GitHub Sponsors/);
});

test('the comparison page frames the difference as a different job, never as a fault', () => {
  assert.match(versus, /Nothing here says a spreadsheet is the wrong way/);
  for (const word of ['scam', 'ripoff', 'rip-off', 'overpriced', 'useless']) {
    assert.ok(!new RegExp(`\\b${word}\\b`, 'i').test(versus), `the comparison page uses "${word}"`);
  }
});

test('the comparison page never claims a network call or invokes the usage counter', () => {
  assert.doesNotMatch(versus, /fetch\(|XMLHttpRequest|<script src=/);
  assert.doesNotMatch(versus, /recordUsage/);
});

test('the comparison page is structured for a reader and a crawler', () => {
  assert.match(versus, /<html lang="en">/);
  assert.match(versus, /<meta name="viewport"/);
  assert.match(versus, /<meta name="robots" content="index, follow">/);
  assert.match(versus, /<link rel="canonical"/);
  assert.match(versus, /<meta name="description" content="[^"]{80,}"/);
  assert.equal((versus.match(/<h1[ >]/g) || []).length, 1);
});

test('the comparison page carries valid FAQPage JSON-LD matching its visible text', () => {
  const blocks = [...versus.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(blocks.length > 0, 'no structured data found');
  const parsed = blocks.map((b) => JSON.parse(b));
  const faq = parsed.find((p) => p['@type'] === 'FAQPage');
  assert.ok(faq, 'missing FAQPage JSON-LD on the comparison page');
  assert.ok(faq.mainEntity.length >= 3);
  for (const qa of faq.mainEntity) {
    assert.ok(versus.includes(qa.name), `visible question missing: ${qa.name}`);
    assert.ok(versus.includes(qa.acceptedAnswer.text), `visible answer missing for: ${qa.name}`);
  }
});

test('the comparison page states the referral-floor mechanism it corrects', () => {
  assert.match(versus, /max\(price/);
  assert.match(versus, /referral floor/);
});
