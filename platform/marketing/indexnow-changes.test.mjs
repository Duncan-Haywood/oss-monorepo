import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildManifest,
  candidateFiles,
  diffManifests,
  MANIFEST_VERSION,
  pageHash,
  parseManifest,
} from './indexnow.mjs';

const BASE = 'https://example.test/';

test('pageHash is short, stable and content-sensitive', () => {
  assert.equal(pageHash('a').length, 16);
  assert.equal(pageHash('a'), pageHash('a'));
  assert.notEqual(pageHash('a'), pageHash('b'));
});

test('candidateFiles maps URLs to the files that serve them', () => {
  assert.deepEqual(candidateFiles(BASE, BASE), ['index.html']);
  assert.deepEqual(candidateFiles(`${BASE}tool/`, BASE), ['tool/index.html']);
  assert.deepEqual(candidateFiles(`${BASE}tool/guide.html`, BASE), ['tool/guide.html']);
  assert.deepEqual(candidateFiles(`${BASE}tool/guide`, BASE), ['tool/guide.html', 'tool/guide/index.html', 'tool/guide']);
  assert.deepEqual(candidateFiles(`${BASE}a%20b/`, BASE), ['a b/index.html']);
  assert.equal(candidateFiles('https://other.test/x/', BASE), null);
  assert.equal(candidateFiles(`${BASE}%2e%2e/secret`, BASE), null);
  assert.equal(candidateFiles(`${BASE}%E0%A4%A`, BASE), null);
});

test('buildManifest hashes the first file that exists and leaves unreadable URLs out', async () => {
  const files = { 'index.html': 'home', 'tool/guide/index.html': 'guide' };
  const read = async (p) => {
    if (Object.hasOwn(files, p)) return files[p];
    throw new Error('ENOENT');
  };
  const m = await buildManifest(read, [BASE, `${BASE}tool/guide`, `${BASE}gone/`, 'https://other.test/'], BASE);
  assert.equal(m.version, MANIFEST_VERSION);
  assert.deepEqual(m.pages, { [BASE]: pageHash('home'), [`${BASE}tool/guide`]: pageHash('guide') });
});

test('parseManifest accepts only a manifest of this version and shape', () => {
  const good = JSON.stringify({ version: MANIFEST_VERSION, pages: { [BASE]: 'abc' } });
  assert.deepEqual(parseManifest(good).pages, { [BASE]: 'abc' });
  for (const bad of [
    null,
    '',
    'not json',
    '[]',
    'null',
    JSON.stringify({ version: 99, pages: {} }),
    JSON.stringify({ version: MANIFEST_VERSION, pages: [] }),
    JSON.stringify({ version: MANIFEST_VERSION, pages: { [BASE]: 1 } }),
    JSON.stringify({ version: MANIFEST_VERSION }),
  ]) {
    assert.equal(parseManifest(bad), null, String(bad));
  }
});

test('diffManifests finds added, changed and removed URLs and counts the rest', () => {
  const previous = { version: 1, pages: { [`${BASE}a/`]: '1', [`${BASE}b/`]: '2', [`${BASE}c/`]: '3' } };
  const current = { version: 1, pages: { [`${BASE}a/`]: '1', [`${BASE}b/`]: 'x', [`${BASE}d/`]: '4' } };
  const d = diffManifests(previous, current);
  assert.deepEqual(d.added, [`${BASE}d/`]);
  assert.deepEqual(d.changed, [`${BASE}b/`]);
  assert.deepEqual(d.removed, [`${BASE}c/`]);
  assert.equal(d.unchanged, 1);
  assert.deepEqual(d.urls, [`${BASE}b/`, `${BASE}c/`, `${BASE}d/`]);
});

test('diffManifests is not fooled by URLs named like Object.prototype keys', () => {
  const previous = { version: 1, pages: {} };
  const current = { version: 1, pages: { constructor: 'h', toString: 'h' } };
  assert.deepEqual(diffManifests(previous, current).added, ['constructor', 'toString']);
});
