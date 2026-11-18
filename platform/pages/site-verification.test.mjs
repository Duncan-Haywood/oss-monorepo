import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { verificationTags, loadVerificationTags, verificationHead, VERIFICATION_FILE } from './site-verification.mjs';

test('the committed config parses and yields valid tags', () => {
  const tags = loadVerificationTags(VERIFICATION_FILE);
  for (const t of tags) assert.match(t, /^<meta name="[a-z0-9.-]+" content="[A-Za-z0-9_-]+">$/);
});

test('each engine gets its own meta name', () => {
  assert.deepEqual(
    verificationTags({ google: ['abcDEF123_-xyz'], bing: ['0123456789ABCDEF0123456789ABCDEF'], yandex: [] }),
    [
      '<meta name="google-site-verification" content="abcDEF123_-xyz">',
      '<meta name="msvalidate.01" content="0123456789ABCDEF0123456789ABCDEF">',
    ],
  );
});

test('a pasted whole tag or quoted value is refused', () => {
  assert.throws(() => verificationTags({ google: ['<meta name="google-site-verification" content="x">'] }), /bare token/);
  assert.throws(() => verificationTags({ bing: ['"abc12345"'] }), /bare token/);
  assert.throws(() => verificationTags({ google: 'abc12345' }), /must be a list/);
});

test('empty or missing config adds nothing to the head', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verif-'));
  assert.equal(verificationHead(path.join(dir, 'missing.json')), '');
  const f = path.join(dir, 'v.json');
  fs.writeFileSync(f, JSON.stringify({ google: [], bing: [] }));
  assert.equal(verificationHead(f), '');
});

test('token length bounds: 8 and 128 characters pass, 7 and 129 are refused', () => {
  assert.equal(verificationTags({ google: ['a'.repeat(8)] }).length, 1);
  assert.equal(verificationTags({ google: ['a'.repeat(128)] }).length, 1);
  assert.throws(() => verificationTags({ google: ['a'.repeat(7)] }), /bare token/);
  assert.throws(() => verificationTags({ google: ['a'.repeat(129)] }), /bare token/);
});

test('a misnamed engine key is refused, not silently dropped', () => {
  // A token under "Google" or under the meta name "msvalidate.01" would
  // otherwise publish nothing while the owner believes the site is verified.
  assert.throws(() => verificationTags({ Google: ['abcDEF123_-xyz'] }), /unknown key "Google"/);
  assert.throws(() => verificationTags({ toString: ['abcDEF123_-xyz'] }), /unknown key/);
  assert.throws(() => verificationTags({ 'msvalidate.01': ['0123456789ABCDEF'] }), /unknown key/);
  // Keys starting with "_" are comments and stay allowed.
  assert.deepEqual(verificationTags({ _comment: 'notes', google: [] }), []);
});
