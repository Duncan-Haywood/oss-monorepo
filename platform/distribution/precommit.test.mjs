import test from 'node:test';
import assert from 'node:assert/strict';
import { hookYaml, build, stale } from './precommit.mjs';

test('hookYaml runs the venture script over the tree and takes no filenames', () => {
  const y = hookYaml({ slug: 'a-b-check', description: "It's a thing." });
  assert.match(y, /^- id: a-b-check$/m);
  assert.match(y, /entry: ventures\/a-b-check\/check\.py/);
  assert.match(y, /language: script/);
  assert.match(y, /pass_filenames: false/);
  assert.match(y, /description: 'It''s a thing\.'/);
});

test('every qualifying linter has a current hook and an executable script', async () => {
  const { slugs } = await build();
  assert.ok(slugs.length >= 15);
  assert.deepEqual(await stale(), []);
});

test('hookYaml keeps a 200-character description whole and cuts a 201-character one', () => {
  const field = (n) => hookYaml({ slug: 'x', description: 'a'.repeat(n) }).match(/description: '(.*)'/)[1];
  assert.equal(field(200), 'a'.repeat(200));
  assert.equal(field(201), 'a'.repeat(199) + '…');
});

test('the CLI dry run lists hooks without writing, and --check passes on the committed file', async () => {
  const { execFileSync } = await import('node:child_process');
  const { readFile } = await import('node:fs/promises');
  const script = new URL('./precommit.mjs', import.meta.url).pathname;
  const hooks = new URL('../../.pre-commit-hooks.yaml', import.meta.url).pathname;
  const before = await readFile(hooks, 'utf8');
  const dry = execFileSync('node', [script], { encoding: 'utf8' });
  assert.match(dry, /venture linters qualify as pre-commit hooks/);
  assert.equal(await readFile(hooks, 'utf8'), before);
  assert.match(execFileSync('node', [script, '--check'], { encoding: 'utf8' }), /pre-commit hooks are current/);
});
