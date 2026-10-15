import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { composeRepo, withDeployFooter, DONATE_URL, PROVIDERS } from './compose.mjs';
import { zip, crc32 } from './zip.mjs';

const templates = {
  'github-pages': { 'deploy.yml': 'name: Deploy\n' },
  aws: { 'deploy.yml': 'a', 'destroy.yml': 'b', 'tofu/main.tf': 'c', 'tofu/encryption.hcl.tmpl': 'd' },
  _license: 'MIT',
};
const appFiles = {
  'index.html': { text: '<html><body><h1>x</h1></body></html>' },
  'logo.bin': { b64: Buffer.from([1, 2, 3]).toString('base64') },
};

test('footer carries the donate link once and the operator notice', () => {
  const once = withDeployFooter('<body>hi</body>');
  assert.match(once, new RegExp(DONATE_URL));
  assert.match(once, /run by whoever deployed it/);
  assert.equal(withDeployFooter(once), once);
  assert.match(withDeployFooter('no body tag'), /buymeacoffee/);
});

test('the donate URL is exactly the owner-given one', () => {
  assert.equal(DONATE_URL, 'https://buymeacoffee.com/duncanhaywood');
});

test('github-pages repo: app + workflow + readme + license, binary kept binary', () => {
  const r = composeRepo({ slug: 's', title: 'T', provider: 'github-pages', appFiles, templates });
  assert.deepEqual(Object.keys(r).sort(), ['.github/workflows/deploy.yml', 'LICENSE', 'README.md', 'app/index.html', 'app/logo.bin']);
  assert.ok(r['app/logo.bin'] instanceof Uint8Array);
  assert.match(r['app/index.html'], /buymeacoffee/);
  assert.match(r['README.md'], /You are the operator/);
});

test('aws repo carries tofu/ and both workflows', () => {
  const r = composeRepo({ slug: 's', title: 'T', provider: 'aws', appFiles, templates });
  assert.ok(r['.github/workflows/deploy.yml'] && r['.github/workflows/destroy.yml']);
  assert.ok(r['tofu/main.tf'] && r['tofu/encryption.hcl.tmpl']);
  assert.match(r['README.md'], /TOFU_STATE_PASSPHRASE/);
});

test('refuses path traversal, missing index, unknown provider', () => {
  assert.throws(() => composeRepo({ slug: 's', title: 'T', provider: 'aws', appFiles: { 'index.html': { text: 'x' }, '../x': { text: 'y' } }, templates }), /unsafe/);
  assert.throws(() => composeRepo({ slug: 's', title: 'T', provider: 'aws', appFiles: {}, templates }), /index/);
  assert.throws(() => composeRepo({ slug: 's', title: 'T', provider: 'gcp', appFiles, templates }), /unknown provider/);
});

test('every provider has a label, a blurb and a privacy flag', () => {
  for (const p of Object.values(PROVIDERS)) assert.ok(p.label && p.blurb && typeof p.repoPrivate === 'boolean');
});

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('zip() output is a valid archive (read back with python zipfile)', () => {
  const bytes = zip({ 'a.txt': 'hello', 'dir/b.bin': new Uint8Array([0, 255, 7]), 'ü.txt': 'utf8' });
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'zip-')), 't.zip');
  fs.writeFileSync(f, bytes);
  const out = execFileSync('python3', ['-c', `
import zipfile,sys
z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None
print(sorted(z.namelist())); print(z.read('a.txt').decode()); print(list(z.read('dir/b.bin')))
`, f]).toString();
  assert.match(out, /'a.txt'/);
  assert.match(out, /hello/);
  assert.match(out, /\[0, 255, 7\]/);
  assert.match(out, /ü\.txt/);
});
