// The guide page carries factual claims about calc.mjs's own arithmetic and
// its own FAQPage structured data. Neither is checked by the calculator's
// own tests, and both are the kind of thing that goes quietly wrong in an
// edit.

import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { comparePricing } from './calc.mjs';

const guide = readFileSync(new URL('./how-to-price-a-personal-training-package.html', import.meta.url), 'utf8');
const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('the guide page carries the no-warranty clause', () => {
  assert.match(guide, /No warranty\.<\/strong> This tool is provided free and as-is/);
});

test('the guide page links back to the calculator', () => {
  assert.match(guide, /href="\.\/"/, 'the guide page has no link back to the calculator');
});

test('the guide page is indexable and describes itself for a crawler', () => {
  assert.match(guide, /<meta name="robots" content="index,follow">/);
  assert.match(guide, /<meta name="description" content="[^"]{80,}">/);
  assert.match(guide, /<title>[^<]+<\/title>/);
  assert.match(guide, /<link rel="canonical" href="\.\/how-to-price-a-personal-training-package\.html">/);
});

test('the guide page carries valid FAQPage JSON-LD matching its visible text', () => {
  const blocks = [...guide.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const parsed = blocks.map((b) => JSON.parse(b));
  const faq = parsed.find((p) => p['@type'] === 'FAQPage');
  assert.ok(faq, 'missing FAQPage JSON-LD on the guide page');
  assert.ok(faq.mainEntity.length >= 3);
  for (const qa of faq.mainEntity) {
    assert.ok(guide.includes(qa.name), `visible question missing: ${qa.name}`);
    assert.ok(guide.includes(qa.acceptedAnswer.text), `visible answer missing for: ${qa.name}`);
  }
});

test('the guide page carries the privacy line and is listed in the venture sitemap', () => {
  assert.match(guide, /Nothing leaves your browser|runs in your browser/);
  const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  assert.match(sitemap, /how-to-price-a-personal-training-package\.html/);
});

test('the guide page is linked from the calculator itself', () => {
  assert.match(index, /href="\.\/how-to-price-a-personal-training-package\.html"/);
});

test('the worked example the guide page quotes matches what the calculator produces', () => {
  const withMakeup = comparePricing({
    ratePerSession: 75, packageSessions: 10, packagePrice: 580,
    noShowRate: 10, makeupOwed: true, sessionMinutes: 60,
    venueModel: 'flat', venueFlatFee: 12, targetTakeHomeHourly: 45,
  });
  assert.equal(withMakeup.single.gross, 675);
  assert.equal(withMakeup.single.net, 567);
  assert.equal(withMakeup.single.hours, 9);
  assert.equal(withMakeup.single.effectiveHourly, 63);
  assert.equal(withMakeup.package.gross, 580);
  assert.equal(withMakeup.package.net, 460);
  assert.equal(withMakeup.package.hours, 10);
  assert.equal(withMakeup.package.effectiveHourly, 46);
  assert.equal(withMakeup.discountPercent, 22.67);
  assert.equal(withMakeup.minPackagePriceForTarget, 570);
  const feeFinding = withMakeup.findings.find((f) => f.id === 'flat-fee-erodes-package-more');
  assert.ok(feeFinding, 'expected the flat-fee finding on this worked example');
  assert.match(feeFinding.title, /20\.69%/);
  assert.match(feeFinding.title, /16%/);

  const noMakeup = comparePricing({
    ratePerSession: 75, packageSessions: 10, packagePrice: 580,
    noShowRate: 10, makeupOwed: false, sessionMinutes: 60,
    venueModel: 'flat', venueFlatFee: 12, targetTakeHomeHourly: 45,
  });
  assert.equal(noMakeup.package.hours, 9);
  assert.equal(noMakeup.package.effectiveHourly, 52.44);

  assert.match(guide, /\$46\.00\/hr/);
  assert.match(guide, /\$63\.00\/hr/);
  assert.match(guide, /\$52\.44\/hr/);
  assert.match(guide, /\$570/);
  assert.match(guide, /20\.69%/);
  assert.match(guide, /22\.67%/);
});
