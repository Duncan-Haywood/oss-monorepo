// The comparison page carries factual claims about a generic pricing
// method (not a named competitor) and its own FAQPage structured data. Both
// are the kind of thing that goes quietly wrong in an edit, and neither is
// checked by the calculator's own tests.

import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateProposal, DEFAULTS } from './calc.mjs';

const versus = readFileSync(new URL('./vs-a-recipe-markup-spreadsheet.html', import.meta.url), 'utf8');

test('the comparison page carries the no-warranty clause', () => {
  assert.match(versus, /No warranty\.<\/strong> This page and the linked calculator produce planning estimates/);
});

test('the comparison page frames the difference as a different job, never as a fault', () => {
  assert.match(versus, /different job/i);
  assert.match(versus, /Nothing here says or implies that a recipe markup spreadsheet is a bad way/);
  for (const word of ['scam', 'ripoff', 'rip-off', 'overpriced', 'useless', 'broken']) {
    assert.ok(!new RegExp(`\\b${word}\\b`, 'i').test(versus), `the comparison page uses "${word}"`);
  }
});

test('the comparison page links back to the calculator', () => {
  assert.match(versus, /href="\.\/"/, 'the comparison page has no link back to the calculator');
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
  assert.match(sitemap, /vs-a-recipe-markup-spreadsheet\.html/);
});

test('the worked figures the comparison page quotes are the ones the calculator produces', () => {
  // This page states a $57 line gap, a $135 recipe gap and a $472.50 quoted
  // difference. Those are claims about arithmetic, so they are checked
  // against the arithmetic rather than left to go stale in prose.
  const r = calculateProposal(DEFAULTS);
  assert.equal(Math.round(r.lines[0].lineRoundingGap), 57, 'the line-1 gap the page quotes has moved');
  assert.equal(r.bunchRoundingGap, 135, 'the recipe-wide gap the page quotes has moved');
  assert.equal(r.flowerRevenueGap, 472.5, 'the quoted-price difference the page states has moved');
  assert.match(versus, /\$57 difference/);
  assert.match(versus, /\$135 on the worked example/);
  assert.match(versus, /<strong>\$472\.50<\/strong>/);
  assert.match(versus, /3\.5&times; markup/);
  assert.equal(DEFAULTS.flowerMarkupMultiple, 3.5, 'the markup the page names has moved');
  assert.equal(DEFAULTS.shrinkPercent, 8, 'the 8% shrink allowance the page names has moved');
});
