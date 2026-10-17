import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const seo = readFileSync(new URL('./vs-tracking-grants-in-a-spreadsheet.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('the tracker links to its spreadsheet comparison page and is listed in the sitemap', () => {
  assert.match(html, /vs-tracking-grants-in-a-spreadsheet\.html/);
  assert.match(sitemap, /vs-tracking-grants-in-a-spreadsheet\.html/);
});

test('the comparison page names what each approach does, and carries the standard disclaimer', () => {
  assert.match(seo, /<title>This tracker vs\. tracking grants in a spreadsheet/);
  assert.match(seo, /name="description"/);
  assert.match(seo, /"@type":"FAQPage"/);
  assert.match(seo, /href="\.\/"/);
  assert.match(seo, /Best-effort hosting, no SLA/);
  assert.match(seo, /No warranty/);
  assert.match(seo, /GitHub Sponsors/);
});

test('does not name any specific competing product', () => {
  assert.doesNotMatch(seo, /GrantHub|Foundant/);
});

test('the FAQPage schema is valid JSON and matches the visible FAQ headings', () => {
  const match = seo.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, 'no FAQPage schema found');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@type'], 'FAQPage');
  assert.ok(schema.mainEntity.length > 0);
  for (const question of schema.mainEntity) {
    assert.ok(seo.includes(`<h3>${question.name}</h3>`), `FAQ schema question "${question.name}" has no matching <h3> on the page`);
  }
});

test('the comparison page never claims a network call, matching every other page on this static site', () => {
  assert.doesNotMatch(seo, /fetch\(|XMLHttpRequest|<script src=/);
});
