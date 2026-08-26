// Every `ventures/*/proposal.mjs` must be a byte-for-byte copy of the one in
// this directory.
//
// The ventures vendor their dependencies rather than importing across the tree,
// because `platform/pages/build.mjs` publishes each venture directory on its own
// and a `../../platform/...` import would 404 on the live site. That convention
// is fine until a fix lands in one copy and not the other thirty-three — at
// which point two customers get proposals that round differently, or one keeps
// the customer's address in localStorage because it missed the fix.
//
// So: fix `platform/proposal/proposal.mjs`, then copy it out. This test is what
// makes "then copy it out" non-optional.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const HERE = new URL('./', import.meta.url);
const VENTURES = new URL('../../ventures/', import.meta.url);

async function ventureCopies(filename) {
  const slugs = await readdir(VENTURES, { withFileTypes: true });
  const found = [];
  for (const entry of slugs) {
    if (!entry.isDirectory()) continue;
    try {
      found.push({
        slug: entry.name,
        source: await readFile(new URL(`${entry.name}/${filename}`, VENTURES), 'utf8'),
      });
    } catch {
      // A venture without the file simply has not adopted the feature.
    }
  }
  return found;
}

for (const filename of ['proposal.mjs', 'proposal.test.mjs']) {
  test(`every venture copy of ${filename} matches platform/proposal`, async () => {
    const canonical = await readFile(new URL(filename, HERE), 'utf8');
    const copies = await ventureCopies(filename);
    assert.ok(copies.length > 0, `no venture has adopted ${filename}; delete it here or wire it up`);
    const drifted = copies.filter((copy) => copy.source !== canonical).map((copy) => copy.slug);
    assert.deepEqual(drifted, [], `these copies have drifted from platform/proposal/${filename}: ${drifted.join(', ')}`
      + '\nFix the canonical file, then copy it into every venture that has one.');
  });
}

test('a venture that ships the module also ships its tests', async () => {
  const modules = (await ventureCopies('proposal.mjs')).map((copy) => copy.slug);
  const tests = new Set((await ventureCopies('proposal.test.mjs')).map((copy) => copy.slug));
  const untested = modules.filter((slug) => !tests.has(slug));
  assert.deepEqual(untested, [], `these ventures vendor proposal.mjs with no tests: ${untested.join(', ')}`);
});
