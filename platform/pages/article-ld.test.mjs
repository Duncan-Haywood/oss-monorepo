import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completeArticleJsonLd, completeArticleNode } from './article-ld.mjs';

const BASE = 'https://example.test/site/';
const opts = { canonical: `${BASE}tool/guide`, baseUrl: BASE, siteName: 'Example Labs', image: `${BASE}tool/share-card.png` };
const blocks = (html) =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const page = (...docs) =>
  `<html><head>${docs.map((d) => `<script type="application/ld+json">${typeof d === 'string' ? d : JSON.stringify(d).replace(/</g, '\\u003c')}</script>`).join('')}</head></html>`;

test('an Article missing everything gets url, mainEntityOfPage, image, author and publisher', () => {
  const [ld] = blocks(completeArticleJsonLd(page({ '@context': 'https://schema.org', '@type': 'Article', headline: 'H', datePublished: '2026-11-24' }), opts));
  assert.equal(ld.url, `${BASE}tool/guide`);
  assert.deepEqual(ld.mainEntityOfPage, { '@type': 'WebPage', '@id': `${BASE}tool/guide` });
  assert.equal(ld.image, `${BASE}tool/share-card.png`);
  const org = { '@type': 'Organization', '@id': `${BASE}#organization`, name: 'Example Labs', url: BASE };
  assert.deepEqual(ld.publisher, org);
  assert.deepEqual(ld.author, org);
  assert.equal(ld.headline, 'H');
  assert.equal(ld.datePublished, '2026-11-24');
});

test("the page's own values always win", () => {
  const own = { '@type': 'TechArticle', url: 'https://other.test/x', image: 'https://other.test/i.png', author: { '@type': 'Person', name: 'A. Writer' } };
  const [ld] = blocks(completeArticleJsonLd(page(own), opts));
  assert.equal(ld.url, 'https://other.test/x');
  assert.equal(ld.image, 'https://other.test/i.png');
  assert.deepEqual(ld.author, { '@type': 'Person', name: 'A. Writer' });
  assert.equal(ld.publisher.name, 'Example Labs');
});

test('non-Article blocks and unparseable blocks come back byte for byte', () => {
  const html = page({ '@type': 'FAQPage', mainEntity: [] }, '{not json', { '@type': 'HowTo', name: 'x' });
  assert.equal(completeArticleJsonLd(html, opts), html);
});

test('nodes inside @graph and arrays are completed; others in the graph untouched', () => {
  const [graph, list] = blocks(completeArticleJsonLd(page(
    { '@context': 'https://schema.org', '@graph': [{ '@type': 'WebPage', name: 'p' }, { '@type': ['Article', 'Thing'], headline: 'g' }] },
    [{ '@type': 'BlogPosting', headline: 'b' }],
  ), opts));
  assert.equal(graph['@graph'][0].url, undefined);
  assert.equal(graph['@graph'][1].url, `${BASE}tool/guide`);
  assert.equal(list[0].publisher['@id'], `${BASE}#organization`);
});

test('without an absolute base nothing changes (fixture builds)', () => {
  const html = page({ '@type': 'Article' });
  assert.equal(completeArticleJsonLd(html, { ...opts, baseUrl: '' }), html);
  assert.equal(completeArticleJsonLd(html, { ...opts, canonical: '' }), html);
});

test('a value cannot close the script element', () => {
  const out = completeArticleJsonLd(page({ '@type': 'Article', headline: 'a </script><b>' }), opts);
  assert.equal(out.match(/<\/script>/g).length, 1);
  assert.equal(blocks(out)[0].headline, 'a </script><b>');
});

test('an empty image is not written', () => {
  const node = { '@type': 'Article' };
  assert.equal(completeArticleNode(node, { ...opts, image: '' }), true);
  assert.equal('image' in node, false);
});
