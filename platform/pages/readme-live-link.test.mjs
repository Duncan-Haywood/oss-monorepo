import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addLiveLink, run, BASE } from './readme-live-link.mjs';

test('inserts after the first paragraph', () => {
  const out = addLiveLink('# T\n\nFirst para\nline two.\n\n## Next\n', 'foo');
  assert.equal(out, `# T\n\nFirst para\nline two.\n\n**Live tool:** ${BASE}foo/\n\n## Next\n`);
});
test('idempotent', () => {
  const once = addLiveLink('# T\n\nBody.\n', 'foo');
  assert.equal(addLiveLink(once, 'foo'), once);
});
test('leaves a README that already links alone', () => {
  const s = `# T\n\nSee ${BASE}foo/ now\n`;
  assert.equal(addLiveLink(s, 'foo'), s);
});
test('heading-only README', () => {
  assert.match(addLiveLink('# T\n', 'foo'), /\*\*Live tool:\*\* /);
});
test('a link to a longer slug is not a link to this one', () => {
  const s = `# T\n\nSee ${BASE}foo-bar/ now\n`;
  assert.match(addLiveLink(s, 'foo'), new RegExp(`\\*\\*Live tool:\\*\\* ${BASE}foo/`));
});
test('a link without a trailing slash counts', () => {
  const s = `# T\n\nSee ${BASE}foo now\n`;
  assert.equal(addLiveLink(s, 'foo'), s);
});
test('run() rewrites missing READMEs, --check only reports', () => {
  const root = mkdtempSync(join(tmpdir(), 'rll-'));
  const mk = (slug, files) => {
    mkdirSync(join(root, 'ventures', slug), { recursive: true });
    for (const [f, c] of Object.entries(files)) writeFileSync(join(root, 'ventures', slug, f), c);
  };
  mk('a', { 'README.md': '# A\n\nBody.\n', 'index.html': '' });
  mk('b', { 'README.md': `# B\n\n${BASE}b/\n`, 'index.html': '' });
  mk('c', { 'README.md': '# C\n\nBody.\n' });
  const rd = join(root, 'ventures', 'a', 'README.md');
  assert.deepEqual(run(root, true), ['a']);
  assert.equal(readFileSync(rd, 'utf8'), '# A\n\nBody.\n');
  assert.deepEqual(run(root, false), ['a']);
  assert.match(readFileSync(rd, 'utf8'), /Live tool/);
  assert.deepEqual(run(root, false), []);
});
test('CLI: --check exits 1 on a missing link, plain run exits 0 and fixes it', () => {
  const root = mkdtempSync(join(tmpdir(), 'rll-cli-'));
  mkdirSync(join(root, 'ventures', 'a'), { recursive: true });
  writeFileSync(join(root, 'ventures', 'a', 'README.md'), '# A\n\nBody.\n');
  writeFileSync(join(root, 'ventures', 'a', 'index.html'), '');
  const script = new URL('./readme-live-link.mjs', import.meta.url).pathname;
  assert.equal(spawnSync('node', [script, '--root', root, '--check']).status, 1);
  assert.equal(spawnSync('node', [script, '--root', root]).status, 0);
  assert.equal(spawnSync('node', [script, '--root', root, '--check']).status, 0);
});
