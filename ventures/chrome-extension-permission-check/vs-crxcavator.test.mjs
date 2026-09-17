import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const page = readFileSync(new URL('./vs-crxcavator.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('the checker links to its CRXcavator comparison page and the sitemap lists it', () => {
  assert.match(html, /href="vs-crxcavator\.html"/);
  assert.match(sitemap, /vs-crxcavator\.html/);
});

test('the comparison page names what each tool is for and links back to the checker', () => {
  assert.match(page, /<title>This checker vs\. CRXcavator/);
  assert.match(page, /<h1>This checker vs\. CRXcavator<\/h1>/);
  assert.match(page, /name="description"/);
  assert.match(page, /href="index\.html"/);
  assert.match(page, /crxcavator\.io/);
  assert.match(page, /rel="nofollow noopener"/);
});

// `platform/pages/build.mjs` derives the compared product for the catalogue's
// /compare/ index from the text after the last "vs." in the <h1>, falling back
// to the <title>. A heading phrased any other way silently drops the page from
// that index -- the only cross-venture route to it -- so assert the shape the
// builder actually reads rather than trusting the filename.
test('the <h1> ends in the product name the comparison index will print', () => {
  const h1 = page.match(/<h1>([^<]+)<\/h1>/)[1];
  const after = h1.split(/\svs\.?\s/i).pop().trim();
  assert.equal(after, 'CRXcavator');
});

test('the trademark and affiliation disclaimer PRODUCT_PLAYBOOK 5f requires is present', () => {
  assert.match(page, /not affiliated with, endorsed by, or sponsored by Cisco Systems or Duo Security/i);
  assert.match(page, /named here only to describe/i);
});

test('the standard clauses and the sponsor link are present', () => {
  assert.match(page, /No warranty/);
  assert.match(page, /provided free and as-is, without warranty/);
  assert.match(page, /Best-effort hosting, no SLA/);
  assert.match(page, /href="LICENSE"/);
  assert.match(page, /MIT licen[cs]e/);
  assert.match(page, /https:\/\/github\.com\/sponsors\/Duncan-Haywood/);
});

// PRODUCT_PLAYBOOK 5f, second rule: facts only, sourced, never a price or a
// figure this repo cannot verify against the competitor's own public site.
// No session here can fetch crxcavator.io (the agent egress proxy refuses
// arbitrary hosts), so the page compares what each tool *does* and cites
// CRXcavator's own site for anything that could change, rather than printing
// a number, a tier price, or a user count nobody checked.
test('no unverifiable price, subscription figure, or traction claim about CRXcavator', () => {
  assert.doesNotMatch(page, /\$\d/);
  assert.doesNotMatch(page, /\d+\s*(users|customers|companies|downloads)/i);
  assert.doesNotMatch(page, /per\s+(user|seat)\s+per\s+(year|month)/i);
});

// Comparative, not derogatory: the page must never assert the competitor is
// bad, broken, or poor value. That framing is the defamation and
// false-advertising exposure PRODUCT_PLAYBOOK 5f exists to keep off a page
// that costs nothing to write safely.
test('the page never disparages the competitor', () => {
  assert.doesNotMatch(page, /CRXcavator[^.]*\b(bad|broken|useless|overpriced|rip-off|scam|bloated)\b/i);
  assert.doesNotMatch(page, /\b(worse|inferior) than\b/i);
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
