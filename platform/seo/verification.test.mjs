import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { verificationTags, loadVerificationTags, verificationHead, VERIFICATION_FILE } from './verification.mjs';

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
