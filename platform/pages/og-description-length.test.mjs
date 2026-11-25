// The overlong og:description ratchet (og-description-length.mjs): no new
// venture page with share-card text over 200 characters, and the baseline
// shrinks as pages are fixed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ogDescriptionLength, scan, compare, readBaseline, MAX } from './og-description-length.mjs';

const og = (c, extra = '') => `<html><head>${extra}<meta property="og:description" content="${c}" /></head></html>`;

test('length counts decoded characters and ignores the name="description" tag', () => {
  assert.equal(ogDescriptionLength(og('P&amp;L')), 3);
  assert.equal(ogDescriptionLength(og('a\n   b')), 3);
  assert.equal(ogDescriptionLength('<meta name="description" content="x">'), null);
  assert.equal(ogDescriptionLength(og('  ')), null);
});

test('noindex pages are skipped', () => {
  assert.equal(ogDescriptionLength(og('x'.repeat(300), '<meta name="robots" content="noindex">')), null);
});

test('scan finds long og:descriptions only', () => {
  const root = mkdtempSync(join(tmpdir(), 'ogdl-'));
  mkdirSync(join(root, 'v'), { recursive: true });
  writeFileSync(join(root, 'v', 'long.html'), og('x'.repeat(MAX + 1)));
  writeFileSync(join(root, 'v', 'ok.html'), og('x'.repeat(MAX)));
  writeFileSync(join(root, 'v', 'meta-only.html'), `<html><meta name="description" content="${'x'.repeat(MAX + 50)}"></html>`);
  const found = Object.keys(scan(root));
  assert.equal(found.length, 1);
  assert.match(found[0], /v\/long\.html$/);
});

test('no venture page outside the baseline has an og:description over 200 characters', () => {
  const { added, fixed } = compare(scan(), readBaseline());
  assert.deepEqual(added, [], 'shorten these og:description values to 200 characters or fewer');
  assert.deepEqual(fixed, [], 'these now fit: run node platform/pages/og-description-length.mjs --write');
});
