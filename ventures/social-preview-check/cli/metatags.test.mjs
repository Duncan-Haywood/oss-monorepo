import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMetaTags, resolveUrl, isAbsoluteHttpUrl } from './metatags.mjs';

test('parses title, og:*, and twitter:* tags regardless of attribute order', () => {
  const html = `
    <html><head>
      <title>Example Page</title>
      <meta content="Example OG title" property="og:title">
      <meta property="og:description" content="A description">
      <meta property='og:image' content='https://example.com/img.png'>
      <meta name="twitter:card" content="summary_large_image">
      <meta name="twitter:site" content="@example">
    </head></html>`;
  const tags = parseMetaTags(html);
  assert.equal(tags.title, 'Example Page');
  assert.equal(tags.og.title, 'Example OG title');
  assert.equal(tags.og.description, 'A description');
  assert.equal(tags.og.image, 'https://example.com/img.png');
  assert.equal(tags.twitter.card, 'summary_large_image');
  assert.equal(tags.twitter.site, '@example');
});

test('decodes HTML entities in attribute values, amp decoded last', () => {
  const html = `<meta property="og:description" content="Fish &amp; Chips &lt;great&gt; &quot;quoted&quot; &#39;single&#39;">`;
  const tags = parseMetaTags(html);
  assert.equal(tags.og.description, `Fish & Chips <great> "quoted" 'single'`);
});

test('first occurrence wins, and repeats are recorded in duplicates', () => {
  const html = `
    <meta property="og:title" content="First">
    <meta property="og:title" content="Second">
    <meta property="og:image" content="https://example.com/one.png">
  `;
  const tags = parseMetaTags(html);
  assert.equal(tags.og.title, 'First');
  assert.deepEqual(tags.duplicates, { 'og:title': 2 });
});

test('parses the canonical link tag, first one wins', () => {
  const html = `
    <link rel="canonical" href="https://example.com/canonical">
    <link rel="canonical" href="https://example.com/second">
  `;
  const tags = parseMetaTags(html);
  assert.equal(tags.canonical, 'https://example.com/canonical');
});

test('ignores meta tags with no property/name or no content', () => {
  const html = `
    <meta charset="utf-8">
    <meta property="og:title">
    <meta name="description" content="not an og or twitter tag">
  `;
  const tags = parseMetaTags(html);
  assert.deepEqual(tags.og, {});
  assert.deepEqual(tags.twitter, {});
});

test('returns an empty-but-well-shaped result for empty or non-string input', () => {
  for (const input of ['', null, undefined]) {
    const tags = parseMetaTags(input);
    assert.equal(tags.title, null);
    assert.deepEqual(tags.og, {});
    assert.deepEqual(tags.twitter, {});
    assert.deepEqual(tags.duplicates, {});
  }
});

// --- resolveUrl / isAbsoluteHttpUrl ---------------------------------------

test('resolveUrl resolves a relative path against a base URL', () => {
  assert.equal(resolveUrl('/img.png', 'https://example.com/blog/post'), 'https://example.com/img.png');
});

test('resolveUrl returns the value unchanged (as absolute) when already absolute', () => {
  assert.equal(resolveUrl('https://cdn.example.com/img.png', 'https://example.com/'), 'https://cdn.example.com/img.png');
});

test('resolveUrl returns null for empty or unresolvable input', () => {
  assert.equal(resolveUrl(null, 'https://example.com/'), null);
  assert.equal(resolveUrl('', 'https://example.com/'), null);
});

test('isAbsoluteHttpUrl accepts http/https and rejects everything else', () => {
  assert.equal(isAbsoluteHttpUrl('https://example.com/img.png'), true);
  assert.equal(isAbsoluteHttpUrl('http://example.com/img.png'), true);
  assert.equal(isAbsoluteHttpUrl('/img.png'), false);
  assert.equal(isAbsoluteHttpUrl('img.png'), false);
  assert.equal(isAbsoluteHttpUrl('ftp://example.com/img.png'), false);
  assert.equal(isAbsoluteHttpUrl(''), false);
  assert.equal(isAbsoluteHttpUrl(null), false);
});
