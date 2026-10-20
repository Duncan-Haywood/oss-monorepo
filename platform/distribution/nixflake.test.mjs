import test from 'node:test';
import assert from 'node:assert/strict';
import { entry, render, build, stale } from './nixflake.mjs';

test('entry escapes Nix string syntax and YAML apostrophes', () => {
  const e = entry({ slug: 'a-check', description: 'GitHub\'\'s "x" ${{ y }} \\ z' });
  assert.equal(e, '      "a-check" = tool "a-check" "GitHub\'s \\"x\\" \\${{ y }} \\\\ z";\n');
});

test('render lists every tool once and exposes packages and apps', () => {
  const t = render([{ slug: 'a-check', description: 'd' }, { slug: 'b-check', description: 'e' }]);
  assert.equal((t.match(/= tool "/g) || []).length, 2);
  assert.match(t, /packages = forAll toolsFor;/);
  assert.match(t, /apps = forAll/);
});

test('the committed flake.nix lists exactly the linters the Actions channel qualifies', async () => {
  const { slugs } = await build();
  assert.ok(slugs.length >= 15);
  assert.deepEqual(await stale(), []);
});
