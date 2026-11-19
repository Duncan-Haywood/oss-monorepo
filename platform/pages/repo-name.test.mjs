// The repository was renamed from `monorepo-projects` to `oss-monorepo`.
// GitHub redirects the old name, but 42 published pages still linked it by
// hand on 2026-11-19 (docs/reports/polish-2026-11-19-ask-examples-check.md):
// every "source" link paid a redirect and named a repository that is gone,
// and a redirect lasts only until someone creates a repo under the old name.
import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_WEB_URL, SOURCE_URL_PREFIX } from './build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OLD = /github\.com\/duncan-haywood\/monorepo-projects\b/i;

async function* pages(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* pages(p);
    else if (entry.name.endsWith('.html')) yield p;
  }
}

test('the build names the repository by its current name', () => {
  assert.ok(SOURCE_URL_PREFIX.startsWith(`${REPO_WEB_URL}/`));
  assert.doesNotMatch(SOURCE_URL_PREFIX, OLD);
});

test('no venture page links the repository by its old name', async () => {
  const offenders = [];
  for await (const file of pages(path.join(ROOT, 'ventures'))) {
    if (OLD.test(await fs.readFile(file, 'utf8'))) offenders.push(path.relative(ROOT, file));
  }
  assert.deepEqual(offenders, [], `use ${REPO_WEB_URL} in: ${offenders.slice(0, 10).join(', ')}`);
});
