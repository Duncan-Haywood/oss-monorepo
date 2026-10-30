import { test } from 'node:test';
import assert from 'node:assert/strict';

import { collectPages } from './clauses.mjs';
import { decodeEntities, unknownNamedEntities, NAMED_ENTITIES } from './entities.mjs';

test('numeric character references decode', () => {
  assert.equal(decodeEntities('caf&#233;'), 'café');
  assert.equal(decodeEntities('caf&#xe9;'), 'café');
  assert.equal(decodeEntities('caf&#xE9;'), 'café');
  assert.equal(decodeEntities('&#128512;'), '\u{1f600}');
});

test('named character references decode, including the ones a short table misses', () => {
  assert.equal(decodeEntities('&tau; = rc'), 'τ = rc');
  assert.equal(decodeEntities('999.7 &micro;s'), '999.7 µs');
  assert.equal(decodeEntities('&ldquo;quoted&rdquo;'), '“quoted”');
  assert.equal(decodeEntities('4&times;8 &mdash; wide'), '4×8 — wide');
});

test('numeric references at the edges of the valid range', () => {
  assert.equal(decodeEntities('caf&#x0e9;'), 'café'); // a hex digit of 0 is still a hex digit
  assert.equal(decodeEntities('&#0;'), '\u0000');
  assert.equal(decodeEntities('&#xD7FF;'), '\ud7ff');
  assert.equal(decodeEntities('&#xDFFF;'), '&#xDFFF;'); // last lone surrogate stays literal
  assert.equal(decodeEntities('&#xD800;'), '&#xD800;');
  assert.equal(decodeEntities('&#xE000;'), '\ue000');
});

test('decoding is a single pass, so a decoded value is never re-scanned', () => {
  // The bug in every chained-`.replace()` decoder: `&amp;` becomes `&`, and
  // the next `.replace()` then eats the `lt;` that followed it.
  assert.equal(decodeEntities('&amp;lt;'), '&lt;');
  assert.equal(decodeEntities('&amp;amp;'), '&amp;');
});

test('an unknown named reference is left visible rather than dropped', () => {
  assert.equal(decodeEntities('&notarealentity;'), '&notarealentity;');
  assert.deepEqual(unknownNamedEntities('a &notarealentity; b &amp; c'), ['&notarealentity;']);
});

test('malformed numeric references are left alone rather than throwing', () => {
  assert.equal(decodeEntities('&#1114112;'), '&#1114112;'); // past the last code point
  assert.equal(decodeEntities('&#xD800;'), '&#xD800;'); // lone surrogate
  assert.equal(decodeEntities('&#x10FFFF;'), '\u{10ffff}'); // last code point decodes
  assert.equal(decodeEntities('&#x110000;'), '&#x110000;');
});

// The guard that keeps `NAMED_ENTITIES` from going stale. A partial table
// fails silently -- the page renders `&tau;`, the check reads it as the
// six literal characters, and the mismatch surfaces somewhere else as
// "your visible copy is missing". Naming the entity here instead means the
// next page to reach for `&frac34;` gets a one-line fix pointed at the table.
test('every named entity in the portfolio HTML is in the shared table', async () => {
  const { pages } = await collectPages();
  const missing = new Map();

  for (const [displayPath, html] of pages) {
    for (const entity of unknownNamedEntities(html)) {
      if (!missing.has(entity)) missing.set(entity, []);
      missing.get(entity).push(displayPath);
    }
  }

  assert.equal(
    missing.size,
    0,
    missing.size === 0
      ? ''
      : `Add these to NAMED_ENTITIES in platform/pages/entities.mjs, mapping each to the ` +
        `character it renders as:\n` +
        [...missing]
          .map(([entity, files]) => `  ${entity} — ${files.length} page(s), e.g. ${files[0]}`)
          .join('\n'),
  );
});

test('the table maps every name to a single rendered character', () => {
  for (const [name, value] of Object.entries(NAMED_ENTITIES)) {
    assert.equal(typeof value, 'string', `${name} must map to a string`);
    assert.equal([...value].length, 1, `${name} must map to exactly one character`);
  }
});
