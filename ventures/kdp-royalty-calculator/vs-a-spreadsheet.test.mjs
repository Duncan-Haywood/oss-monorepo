import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

import { compareExclusiveVsWide, DEFAULTS, ebookNet, paperbackNet, printCost } from './calc.mjs';

const html = fs.readFileSync(new URL('./vs-a-spreadsheet.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or publishing advice/i);
});

test('makes no dollar-figure claim about Amazon (a generic-method page cross-linking a named-product one)', () => {
  assert.doesNotMatch(html, /Amazon[^<]*\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/kdp-royalty-calculator\/vs-a-spreadsheet\.html">/);
});

test('the FAQPage schema is valid JSON and matches the visible FAQ headings', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, 'no FAQPage schema found');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@type'], 'FAQPage');
  assert.ok(schema.mainEntity.length > 0);
  for (const question of schema.mainEntity) {
    assert.ok(html.includes(`<h3>${question.name}</h3>`), `FAQ schema question "${question.name}" has no matching <h3> on the page`);
  }
});

test('the FAQPage JSON-LD answers are verbatim on the page (word for word)', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  for (const { acceptedAnswer } of schema.mainEntity) {
    assert.ok(html.includes(acceptedAnswer.text), `answer not found verbatim on the page: ${acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test('every visible FAQ question also appears in the FAQPage block, and vice versa', () => {
  const visible = [...html.matchAll(/<h3>([^<]+)<\/h3>/g)].map((m) => m[1]);
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  const schemaNames = schema.mainEntity.map((q) => q.name);
  assert.deepEqual([...visible].sort(), [...schemaNames].sort());
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-a-spreadsheet\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-spreadsheet\.html/);
});

test('the comparison page links back to the calculator, the KU guide, and the Amazon comparison', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="should-i-enroll-this-book-in-kindle-unlimited\.html"/);
  assert.match(html, /href="vs-amazon-kdp-royalty-calculator\.html"/);
});

test('the ebook delivery-fee worked example matches calc.mjs for the default inputs', () => {
  const flatSeventy = DEFAULTS.ebookList * 0.7;
  const actual = ebookNet({
    list: DEFAULTS.ebookList,
    plan: '70',
    fileSizeMb: DEFAULTS.fileSizeMb,
    deliveryPerMb: DEFAULTS.deliveryPerMb,
  });

  assert.equal(Math.round(flatSeventy * 10000) / 10000, 3.493);
  assert.equal(Math.round(actual * 10000) / 10000, 3.193);

  const flatTotal = flatSeventy * DEFAULTS.ebookPaidSales;
  const actualTotal = actual * DEFAULTS.ebookPaidSales;
  assert.equal(Math.round((flatTotal - actualTotal) * 100) / 100, 24.00);

  assert.match(html, /\$3\.4930/);
  assert.match(html, /\$3\.1930/);
  assert.match(html, /\$279\.44/);
  assert.match(html, /\$255\.44/);
  assert.match(html, /Overstated by<\/th><td>\$24\.00/);
});

test('the paperback print-cost worked example matches calc.mjs for the default inputs', () => {
  const actualPrint = printCost({
    pages: DEFAULTS.paperbackPages,
    color: DEFAULTS.paperbackColor,
    override: '',
    bwFixed: DEFAULTS.bwFixed,
    bwPerPage: DEFAULTS.bwPerPage,
    colorFixed: DEFAULTS.colorFixed,
    colorPerPage: DEFAULTS.colorPerPage,
  });
  assert.equal(Math.round(actualPrint * 100) / 100, 4.21);

  const actualUnit = paperbackNet({ list: DEFAULTS.paperbackList, royaltyRate: DEFAULTS.paperbackRoyaltyRate, print: actualPrint });
  const naiveUnit = paperbackNet({ list: DEFAULTS.paperbackList, royaltyRate: DEFAULTS.paperbackRoyaltyRate, print: 2.00 });

  assert.equal(Math.round(actualUnit * 10000) / 10000, 4.784);
  assert.equal(Math.round(naiveUnit * 10000) / 10000, 6.994);

  const actualTotal = actualUnit * DEFAULTS.paperbackSales;
  const naiveTotal = naiveUnit * DEFAULTS.paperbackSales;
  assert.equal(Math.round((naiveTotal - actualTotal) * 100) / 100, 44.20);

  assert.match(html, /\$6\.9940/);
  assert.match(html, /\$4\.7840/);
  assert.match(html, /\$139\.88/);
  assert.match(html, /\$95\.68/);
  assert.match(html, /Overstated by<\/th><td>\$44\.20/);
});

test('the combined exclusive-vs-wide gap matches calc.mjs for the default inputs', () => {
  const base = compareExclusiveVsWide(DEFAULTS);
  assert.equal(Math.round(base.exclusive * 100) / 100, 405.12);
  assert.equal(Math.round(base.wide * 100) / 100, 491.06);
  assert.equal(Math.round(-base.gap * 100) / 100, 85.94);

  const naiveEbookPaid = (DEFAULTS.ebookList * 0.7) * DEFAULTS.ebookPaidSales;
  const naivePaperback = paperbackNet({ list: DEFAULTS.paperbackList, royaltyRate: DEFAULTS.paperbackRoyaltyRate, print: 2.00 }) * DEFAULTS.paperbackSales;
  const naiveExclusive = naiveEbookPaid + base.ku + naivePaperback;
  assert.equal(Math.round(naiveExclusive * 100) / 100, 473.32);

  const naiveGap = base.wide - naiveExclusive;
  assert.equal(Math.round(naiveGap * 100) / 100, 17.74);

  assert.match(html, /\$405\.12/);
  assert.match(html, /\$491\.06/);
  assert.match(html, /wins by \$85\.94/);
  assert.match(html, /\$473\.32/);
  assert.match(html, /wide wins by only \$17\.74/);
  assert.match(html, /\$68\.20/);
});
