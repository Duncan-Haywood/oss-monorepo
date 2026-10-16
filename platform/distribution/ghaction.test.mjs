import test from 'node:test';
import assert from 'node:assert/strict';
import { hasContract, actionYaml, plan, stale, USES_PREFIX } from './ghaction.mjs';

const SRC = 'p.add_argument("path", nargs="?")\np.add_argument("--format")\np.add_argument(\n    "--fail-on-risk",\n)\n';

test('hasContract needs --format, --fail-on-risk and a path positional', () => {
  assert.equal(hasContract(SRC), true);
  assert.equal(hasContract(SRC.replace('"path"', '"other"')), false);
  assert.equal(hasContract(SRC.replace('--fail-on-risk', '--x')), false);
});

test('actionYaml passes inputs through env, never inline in the script', () => {
  const y = actionYaml({ slug: 'a-b-check', description: "It's a \"thing\"." });
  assert.match(y, /ventures\/a-b-check\/check\.py/);
  assert.match(y, /SCAN_PATH: \$\{\{ inputs\.path \}\}/);
  assert.doesNotMatch(y.split('run: |')[1], /\$\{\{/);
  assert.match(y, /description: 'It''s a "thing"\.'/);
});

test('every qualifying venture has a current committed action', async () => {
  const { ok } = await plan();
  assert.ok(ok.length >= 15);
  assert.deepEqual(await stale(), []);
  assert.ok(USES_PREFIX.endsWith('platform/distribution/actions'));
});
