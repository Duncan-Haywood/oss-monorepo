import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(
  new URL('./vs-tracking-it-in-a-spreadsheet.html', import.meta.url),
  'utf8',
);
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the full liability disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not tax, financial, or legal advice/i);
  assert.match(html, /Nothing leaves your browser/);
});

test('states it is not affiliated with Upwork or Fiverr', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Upwork/);
  assert.match(html, /Fiverr International Ltd/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-tracking-it-in-a-spreadsheet\.html">/);
});

test('the FAQPage schema is valid JSON and matches the visible FAQ headings', () => {
  const match = html.match(
    /<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s,
  );
  assert.ok(match, 'no FAQPage schema found');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@type'], 'FAQPage');
  for (const question of schema.mainEntity) {
    assert.ok(
      html.includes(`<h3>${question.name}</h3>`),
      `FAQ schema question "${question.name}" has no matching <h3> on the page`,
    );
  }
});

test('names no specific competing product -- this is the generic-method comparison', () => {
  assert.match(html, /names no specific product/);
});

test('the worked-example figures match calc.mjs', async () => {
  const { comparePlatforms } = await import('./calc.mjs');
  const example = comparePlatforms({
    jobPrice: 1200,
    upworkFeePercent: 8,
    fiverrFeePercent: 20,
    upworkWithdrawalFee: 0,
    fiverrWithdrawalFee: 3,
    taxReservePercent: 25,
  });
  assert.equal(example.upwork.takeHome, 828);
  assert.equal(example.fiverr.takeHome, 717.75);
  assert.equal(Math.round((example.upwork.takeHome - example.fiverr.takeHome) * 100) / 100, 110.25);

  const target = comparePlatforms({
    jobPrice: 500,
    upworkFeePercent: 15,
    fiverrFeePercent: 20,
    upworkWithdrawalFee: 0,
    fiverrWithdrawalFee: 3,
    taxReservePercent: 25,
    targetPlatform: 'upwork',
    targetTakeHome: 400,
  });
  assert.equal(Math.round(target.target.priceNeeded * 100) / 100, 627.45);
});

test('every internal link on the page resolves to a file in this venture', () => {
  const internalHrefs = [...html.matchAll(/href="(\.\/|(?!https?:)[a-z0-9#-]+\.html)([^"]*)"/gi)]
    .map((m) => (m[1] === './' ? './' : m[1] + m[2]))
    .filter((href) => href !== './' && !href.startsWith('../'));
  for (const href of internalHrefs) {
    const target = new URL(href, import.meta.url);
    assert.ok(fs.existsSync(target), `broken internal link: ${href}`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="(\.\/)?vs-tracking-it-in-a-spreadsheet\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-tracking-it-in-a-spreadsheet\.html/);
});
