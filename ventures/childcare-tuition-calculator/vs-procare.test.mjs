import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const procareSeo = readFileSync(new URL('./vs-procare.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('the calculator links to its Procare comparison page and is listed in the sitemap', () => {
  assert.match(html, /vs-procare\.html/);
  assert.match(sitemap, /vs-procare\.html/);
});

test('the vs-Procare comparison page names what each tool is for, disclaims affiliation, and carries the standard disclaimer', () => {
  assert.match(procareSeo, /<title>This calculator vs\. Procare/);
  assert.match(procareSeo, /name="description"/);
  assert.match(procareSeo, /"@type":"FAQPage"/);
  assert.match(procareSeo, /href="\.\/"/);
  assert.match(procareSeo, /procaresoftware\.com/);
  assert.match(procareSeo, /rel="nofollow noopener"/);
  assert.match(procareSeo, /not affiliated with, endorsed by, or sponsored by Procare Solutions/i);
  // No dollar figure for Procare's own pricing is asserted anywhere on this
  // page: that number could not be verified against a primary source reachable
  // from this environment (Procare's pricing is quote-based and not published),
  // so the comparison stays functional (what job each tool does) rather than
  // citing a price this repo cannot confirm -- same discipline as the sibling
  // grant-reporting-tracker/vs-granthub.html page.
  assert.doesNotMatch(procareSeo, /Procare[^.]*\$\d/);
  assert.doesNotMatch(procareSeo, /\$\d[\d,]*(\.\d+)?\s*(\/|per)\s*(year|yr|month|mo)/i);
  assert.match(procareSeo, /Best-effort hosting, no SLA/);
  assert.match(procareSeo, /No warranty/);
  assert.match(procareSeo, /GitHub Sponsors/);
});

test('the vs-Procare page never claims a network call, matching every other page on this static site', () => {
  assert.doesNotMatch(procareSeo, /fetch\(|XMLHttpRequest|<script src=/);
});

test('every FAQPage schema question on the vs-Procare page has a matching visible heading', () => {
  const match = procareSeo.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, 'no FAQPage schema found');
  const schema = JSON.parse(match[1]);
  for (const question of schema.mainEntity) {
    assert.ok(procareSeo.includes(`<h3>${question.name}</h3>`), `FAQ schema question "${question.name}" has no matching <h3> on the page`);
  }
});

test('the FAQPage JSON-LD answers are verbatim on the visible page, not only inside the script tag', () => {
  const match = procareSeo.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  const visible = procareSeo.replace(/<script[\s\S]*?<\/script>/g, '');
  for (const { acceptedAnswer } of schema.mainEntity) {
    assert.ok(visible.includes(acceptedAnswer.text), `answer not found verbatim outside the JSON-LD script tag: ${acceptedAnswer.text.slice(0, 60)}...`);
  }
});
