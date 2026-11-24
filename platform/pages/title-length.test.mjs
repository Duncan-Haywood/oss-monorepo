// The overlong-title ratchet (title-length.mjs): no new venture page with a
// <title> over 70 characters, and the baseline shrinks as titles are fixed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { titleLength, scan, compare, readBaseline, MAX } from './title-length.mjs';

test('length counts decoded characters, collapses whitespace', () => {
  assert.equal(titleLength('<title>A &amp; B</title>'), 5);
  assert.equal(titleLength('<title>\n  A\n  B </title>'), 3);
  assert.equal(titleLength('<title>Caf&#233; &#x2014; x</title>'), 8);
  assert.equal(titleLength('<title>&#x110000;</title>'), 10);
  assert.equal(titleLength('<title>  </title>'), null);
  assert.equal(titleLength('<p>no title</p>'), null);
});

test('scan finds long titles and skips node_modules and fragments', () => {
  const root = mkdtempSync(join(tmpdir(), 'tl-'));
  const long = 'x'.repeat(MAX + 1);
  mkdirSync(join(root, 'v', 'node_modules'), { recursive: true });
  writeFileSync(join(root, 'v', 'long.html'), `<html><title>${long}</title></html>`);
  writeFileSync(join(root, 'v', 'ok.html'), `<html><title>short</title></html>`);
  writeFileSync(join(root, 'v', 'frag.html'), `<title>${long}</title>`);
  writeFileSync(join(root, 'v', 'node_modules', 'dep.html'), `<html><title>${long}</title></html>`);
  const found = Object.keys(scan(root));
  assert.equal(found.length, 1);
  assert.match(found[0], /v\/long\.html$/);
});

test('compare names new offenders and fixed entries', () => {
  assert.deepEqual(compare({ a: 80, c: 90 }, ['a', 'b']), { added: ['c'], fixed: ['b'] });
});

test('no venture page outside the baseline has a title over 70 characters', () => {
  const { added, fixed } = compare(scan(), readBaseline());
  assert.deepEqual(added, [], 'shorten these titles to 70 characters or fewer (search words first)');
  assert.deepEqual(fixed, [], 'these now fit: run node platform/pages/title-length.mjs --write');
});
