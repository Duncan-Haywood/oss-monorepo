// The overlong meta-description ratchet (description-length.mjs): no new
// venture page with a description over 160 characters, and the baseline
// shrinks as descriptions are fixed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { descriptionLength, scan, compare, readBaseline, MAX } from './description-length.mjs';

const meta = (c, extra = '') => `<html><head>${extra}<meta name="description" content="${c}"></head></html>`;

test('length counts decoded characters, collapses whitespace', () => {
  assert.equal(descriptionLength(meta('P&amp;L')), 3);
  assert.equal(descriptionLength(meta('a\n   b')), 3);
  assert.equal(descriptionLength(`<meta name='description' content='it"s'>`), 4);
  assert.equal(descriptionLength(meta('  ')), null);
  assert.equal(descriptionLength('<p>none</p>'), null);
});

test('noindex pages are skipped', () => {
  assert.equal(descriptionLength(meta('x'.repeat(200), '<meta name="robots" content="noindex">')), null);
});

test('scan finds long descriptions and skips node_modules and fragments', () => {
  const root = mkdtempSync(join(tmpdir(), 'dl-'));
  const long = 'x'.repeat(MAX + 1);
  mkdirSync(join(root, 'v', 'node_modules'), { recursive: true });
  writeFileSync(join(root, 'v', 'long.html'), meta(long));
  writeFileSync(join(root, 'v', 'ok.html'), meta('short'));
  writeFileSync(join(root, 'v', 'frag.html'), `<meta name="description" content="${long}">`);
  writeFileSync(join(root, 'v', 'node_modules', 'dep.html'), meta(long));
  const found = Object.keys(scan(root));
  assert.equal(found.length, 1);
  assert.match(found[0], /v\/long\.html$/);
});

test('compare names new offenders and fixed entries', () => {
  assert.deepEqual(compare({ a: 200, c: 170 }, ['a', 'b']), { added: ['c'], fixed: ['b'] });
});

test('no venture page outside the baseline has a description over 160 characters', () => {
  const { added, fixed } = compare(scan(), readBaseline());
  assert.deepEqual(added, [], 'shorten these meta descriptions to 160 characters or fewer');
  assert.deepEqual(fixed, [], 'these now fit: run node platform/pages/description-length.mjs --write');
});
