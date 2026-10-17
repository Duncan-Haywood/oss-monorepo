// The guide and comparison pages carry tax figures and FAQPage data that go
// quietly wrong in an edit. The worked example is checked against calc.mjs so
// the page can never disagree with the tool it points at.

import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildingBasis, depreciation, formatMoney } from './calc.mjs';

const read = (f) => readFileSync(new URL(`./${f}`, import.meta.url), 'utf8');
const pages = ['how-to-depreciate-a-rental-property.html', 'vs-spreadsheet.html'];

for (const f of pages) {
  const html = read(f);
  test(`${f}: clauses, indexability, backlink`, () => {
    assert.match(html, /No warranty\./);
    assert.match(html, /Nothing leaves your browser/);
    assert.match(html, /<meta name="robots" content="index,follow">/);
    assert.match(html, /<meta name="description" content="[^"]{80,}">/);
    assert.match(html, /href="\.\/"/);
    assert.match(read('sitemap.xml'), new RegExp(f.replace('.', '\\.')));
    assert.match(read('index.html'), new RegExp(`href="${f.replace('.', '\\.')}"`));
  });
  test(`${f}: FAQPage JSON-LD matches visible text`, () => {
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    const faq = blocks.find((b) => b['@type'] === 'FAQPage');
    assert.ok(faq && faq.mainEntity.length >= 3);
    for (const qa of faq.mainEntity) {
      assert.ok(html.includes(qa.name));
      assert.ok(html.includes(qa.acceptedAnswer.text));
    }
  });
}

test('the comparison page never disparages the spreadsheet', () => {
  const html = read('vs-spreadsheet.html');
  assert.match(html, /different job/i);
  for (const w of ['scam', 'ripoff', 'useless', 'broken']) assert.ok(!new RegExp(`\\b${w}\\b`, 'i').test(html));
});

test('the worked example matches calc.mjs', () => {
  const html = read('how-to-depreciate-a-rental-property.html');
  const basis = buildingBasis({ priceCents: 25000000, closingCents: 500000, landCents: 5000000 });
  assert.equal(basis, 20500000);
  const d = (y) => formatMoney(depreciation(basis, '2025-06-15', y)).replace(/^\$?/, '$');
  assert.ok(html.includes(d(2025)), `first-year figure ${d(2025)} missing`);
  assert.ok(html.includes(d(2026)), `full-year figure ${d(2026)} missing`);
});
