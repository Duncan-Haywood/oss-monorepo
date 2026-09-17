import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const printavoSeo = readFileSync(new URL('./vs-printavo.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('the calculator links to its Printavo comparison page and is listed in the sitemap', () => {
  assert.match(html, /vs-printavo\.html/);
  assert.match(sitemap, /vs-printavo\.html/);
});

test('the vs-Printavo comparison page names what each tool is for, disclaims affiliation, and carries the standard disclaimer', () => {
  assert.match(printavoSeo, /<title>This calculator vs\. Printavo/);
  assert.match(printavoSeo, /name="description"/);
  assert.match(printavoSeo, /"@type":"FAQPage"/);
  assert.match(printavoSeo, /href="\.\/"/);
  assert.match(printavoSeo, /printavo\.com/);
  assert.match(printavoSeo, /rel="nofollow noopener"/);
  assert.match(printavoSeo, /not affiliated with, endorsed by, or sponsored by Printavo/i);
  // No dollar figure for Printavo's own pricing is asserted anywhere: that
  // number could not be verified against a primary source reachable from this
  // environment (Printavo's pricing is not published without contacting
  // sales), so the comparison stays functional (what job each tool does)
  // rather than citing a price this repo cannot confirm -- same discipline as
  // the sibling childcare-tuition-calculator/vs-procare.html page.
  assert.doesNotMatch(printavoSeo, /Printavo[^.]*\$\d/);
  assert.doesNotMatch(printavoSeo, /\$\d[\d,]*(\.\d+)?\s*(\/|per)\s*(year|yr|month|mo)/i);
  assert.match(printavoSeo, /Best-effort hosting, no SLA/);
  assert.match(printavoSeo, /No warranty/);
  assert.match(printavoSeo, /GitHub Sponsors/);
});

test('the vs-Printavo page never claims a network call, matching every other page on this static site', () => {
  assert.doesNotMatch(printavoSeo, /fetch\(|XMLHttpRequest|<script src=/);
});

test('every FAQPage schema question on the vs-Printavo page has a matching visible heading', () => {
  const match = printavoSeo.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, 'no FAQPage schema found');
  const schema = JSON.parse(match[1]);
  for (const question of schema.mainEntity) {
    assert.ok(printavoSeo.includes(`<h3>${question.name}</h3>`), `FAQ schema question "${question.name}" has no matching <h3> on the page`);
  }
});

test('the FAQPage JSON-LD answers are verbatim on the visible page, not only inside the script tag', () => {
  const match = printavoSeo.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  const visible = printavoSeo.replace(/<script[\s\S]*?<\/script>/g, '');
  for (const { acceptedAnswer } of schema.mainEntity) {
    assert.ok(visible.includes(acceptedAnswer.text), `answer not found verbatim outside the JSON-LD script tag: ${acceptedAnswer.text.slice(0, 60)}...`);
  }
});
