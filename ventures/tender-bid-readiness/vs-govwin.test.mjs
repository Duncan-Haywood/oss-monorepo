import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const docsPage = (name) => fs.readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const html = docsPage('vs-govwin.html');
const index = docsPage('index.html');

test('index links to the GovWin IQ comparison page', () => {
  assert.match(index, /vs-govwin\.html/);
});

test('carries the no-warranty and best-effort hosting disclaimers', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /<strong>Best-effort hosting, no SLA\.<\/strong>/);
});

test('states it is not affiliated with GovWin IQ or Deltek', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Deltek, Inc\.\s*or GovWin IQ/);
});

test('no unverifiable price is claimed for GovWin IQ', () => {
  // GovWin IQ's pricing page is not reachable from this session (proxied
  // egress does not permit fetching arbitrary vendor sites), so no plan
  // name or dollar figure could be confirmed against a primary source --
  // same discipline the other vs-* pages in this repo use.
  assert.doesNotMatch(html, /\$\d/);
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

test('the comparison page links back to the checker', () => {
  assert.match(html, /<a href="\.\/">/);
});

test('the page is clear this checker does not find or forecast opportunities', () => {
  assert.match(html, /does not find opportunities, forecast agency spending, or track competitors/);
});

test('robots and sitemap let crawlers find the new page', () => {
  const robots = docsPage('robots.txt');
  const sitemap = docsPage('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(sitemap, /vs-govwin\.html/);
});
