import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-socket.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const whatIsHtml = fs.readFileSync(new URL('./what-is-dependency-confusion.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not a security audit/i);
});

test('carries the support paragraph', () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('states it is not affiliated with Socket', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Socket, Inc\./);
});

test('no unverifiable price is claimed for Socket', () => {
  // Socket's own current pricing and contract terms are not reachable from
  // this session to confirm today's figures, so no dollar amount is
  // invented here -- only its well-documented product shape (free for
  // open source, paid tiers for private/org use) is described.
  const socketSection = html.split('Common questions')[0];
  assert.doesNotMatch(socketSection, /\$\d/);
});

test('does not claim this tool detects anything beyond the two documented configuration shapes', () => {
  assert.match(html, /it never queries a registry at all/);
  assert.match(html, /cannot tell you whether a name is\s+actually published anywhere/);
});

test('does not claim Socket detection accuracy either way', () => {
  assert.match(html, /does not evaluate Socket's detection accuracy/);
});

test('names the two documented configuration shapes, the same ones the tool and CLI check', () => {
  assert.match(html, /--extra-index-url/);
  assert.match(html, /unscoped npm dependency name/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-socket\.html">/);
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

test('the comparison page is linked from the tool page', () => {
  assert.match(indexHtml, /href="\.\/vs-socket\.html"|href="vs-socket\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-socket\.html/);
});

test('the comparison page links back to the tool and the docs page', () => {
  assert.match(html, /href="\.\/"/);
  assert.match(html, /href="\.\/what-is-dependency-confusion\.html"/);
});

test('the docs page links to the comparison page too', () => {
  assert.match(whatIsHtml, /href="\.\/vs-socket\.html"|href="vs-socket\.html"/);
});
