import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const page = readFileSync(new URL('./vs-checking-canonical-tags-by-hand.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('the checker links to the by-hand comparison page and the sitemap lists it', () => {
  assert.match(html, /href="vs-checking-canonical-tags-by-hand\.html"/);
  assert.match(sitemap, /vs-checking-canonical-tags-by-hand\.html/);
});

test('the comparison page names what each approach can and cannot show, and links back to the checker', () => {
  assert.match(page, /<title>Canonical Tag Checker vs\. checking canonical tags by hand/);
  assert.match(page, /<h1>Canonical Tag Checker vs\. checking canonical tags by hand<\/h1>/);
  assert.match(page, /name="description"/);
  assert.match(page, /href="index\.html"/);
});

// `platform/pages/build.mjs` derives the compared product for the catalogue's
// /compare/ index from the text after the last "vs." in the <h1>, falling back
// to the <title>. A heading phrased any other way silently drops the page from
// that index -- the only cross-venture route to it -- so assert the shape the
// builder actually reads rather than trusting the filename.
test('the <h1> ends in the compared method the comparison index will print', () => {
  const h1 = page.match(/<h1>([^<]+)<\/h1>/)[1];
  const after = h1.split(/\svs\.?\s/i).pop().trim();
  assert.equal(after, 'checking canonical tags by hand');
});

test('the page names no competing tool or company -- it is a generic-method comparison', () => {
  assert.doesNotMatch(page, /not affiliated with, endorsed by, or sponsored by/i);
  assert.doesNotMatch(page, /screaming\s*frog/i);
});

test('the standard clauses and the sponsor link are present', () => {
  assert.match(page, /No warranty/);
  assert.match(page, /provided free and as-is, without warranty/);
  assert.match(page, /Best-effort hosting, no SLA/);
  assert.match(page, /href="LICENSE"/);
  assert.match(page, /MIT licen[cs]e/);
  assert.match(page, /https:\/\/github\.com\/sponsors\/Duncan-Haywood/);
});

test('the "only check what you are authorised to" caution carries onto this page too', () => {
  assert.match(page, /authoris(?:ed|ation)/i);
});

test('the page is static: no script src, no network call', () => {
  assert.doesNotMatch(page, /fetch\(|XMLHttpRequest|<script src=/);
});

test('every FAQPage schema question has a matching visible heading', () => {
  const match = page.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match, 'no JSON-LD found');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@type'], 'FAQPage');
  assert.ok(schema.mainEntity.length >= 3);
  for (const question of schema.mainEntity) {
    assert.ok(page.includes(`<h3>${question.name}</h3>`), `FAQ question "${question.name}" has no matching <h3>`);
  }
});

test('the FAQPage answers appear verbatim on the visible page, not only in the script tag', () => {
  const match = page.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  const schema = JSON.parse(match[1]);
  const visible = page.replace(/<script[\s\S]*?<\/script>/g, '');
  for (const { acceptedAnswer } of schema.mainEntity) {
    assert.ok(
      visible.includes(acceptedAnswer.text),
      `answer not found verbatim outside the JSON-LD: ${acceptedAnswer.text.slice(0, 60)}...`,
    );
  }
});
