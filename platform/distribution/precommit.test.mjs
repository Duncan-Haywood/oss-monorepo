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
