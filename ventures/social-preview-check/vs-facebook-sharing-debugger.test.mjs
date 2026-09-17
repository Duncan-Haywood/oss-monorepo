import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const page = readFileSync(new URL('./vs-facebook-sharing-debugger.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('the checker links to its Facebook Sharing Debugger comparison page and is listed in the sitemap', () => {
  assert.match(index, /vs-facebook-sharing-debugger\.html/);
  assert.match(sitemap, /vs-facebook-sharing-debugger\.html/);
});

test('the vs-Facebook-Sharing-Debugger page names what each tool is for, disclaims affiliation, and carries the standard disclaimer', () => {
  assert.match(page, /<title>Social Preview Checker vs\. Facebook Sharing Debugger/);
  assert.match(page, /name="description"/);
  assert.match(page, /"@type":"FAQPage"/);
  assert.match(page, /href="\.\/"/);
  assert.match(page, /developers\.facebook\.com\/tools\/debug/);
  assert.match(page, /rel="nofollow noopener"/);
  assert.match(page, /not affiliated with, endorsed by, or sponsored by Meta Platforms, Inc\. or Facebook/i);
  assert.match(page, /Best-effort hosting, no SLA/);
  assert.match(page, /No warranty/);
  assert.match(page, /GitHub Sponsors/);
});

test('the page states only durable, non-numeric facts about the competitor -- no invented or drift-prone pricing', () => {
  // Facebook Sharing Debugger is a free Meta tool with no published price to
  // state in the first place, but this fleet's discipline (see
  // vs-booqable.html, vs-tempworks.html, vs-sitelink.html) is to never state
  // a dollar figure for a competitor on a static page with no way to refresh
  // it, so guard the pattern here too.
  assert.doesNotMatch(page, /Facebook[^.]*\$\d/);
  assert.doesNotMatch(page, /\$\d[\d,]*(\.\d+)?\s*(\/|per)\s*(year|yr|month|mo|seat)/i);
});

test('the vs-Facebook-Sharing-Debugger page never claims a network call, matching every other page on this static site', () => {
  assert.doesNotMatch(page, /fetch\(|XMLHttpRequest|<script src=/);
});

test('the vs-Facebook-Sharing-Debugger page never invokes the usage counter, matching every other comparison page in the catalogue', () => {
  assert.doesNotMatch(page, /recordUsage/);
});

test('the vs-Facebook-Sharing-Debugger page is structured for a reader and a crawler', () => {
  assert.match(page, /<html lang="en">/);
  assert.match(page, /<meta name="viewport"/);
  assert.match(page, /<link rel="canonical"/);
  assert.match(page, /<meta name="description" content="[^"]{80,}"/);
  assert.equal((page.match(/<h1[ >]/g) || []).length, 1);
});

test('the structured data on the vs-Facebook-Sharing-Debugger page is valid JSON', () => {
  const blocks = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.ok(blocks.length > 0, 'no structured data found');
  for (const [, body] of blocks) {
    assert.doesNotThrow(() => JSON.parse(body), 'malformed JSON-LD block');
  }
});

test('every FAQ answer in the JSON-LD is also visible, verbatim, as page copy', () => {
  const match = page.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, 'no FAQPage schema found');
  const schema = JSON.parse(match[1]);
  assert.ok(schema.mainEntity.length > 0);
  for (const question of schema.mainEntity) {
    assert.ok(page.includes(`<h3>${question.name}</h3>`), `FAQ schema question "${question.name}" has no matching <h3> on the page`);
    assert.ok(page.includes(question.acceptedAnswer.text), `answer not found verbatim on the page: ${question.acceptedAnswer.text.slice(0, 60)}...`);
  }
});
