import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { titleOf, bibEntry, citationCff, run, REPO_URL } from './citation.mjs';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'citetest-'));
  await fs.mkdir(path.join(root, 'research', 'alpha'), { recursive: true });
  await fs.mkdir(path.join(root, 'research', 'beta'), { recursive: true });
  await fs.mkdir(path.join(root, 'research', '_homepage'), { recursive: true });
  await fs.mkdir(path.join(root, 'research', 'noreadme'), { recursive: true });
  await fs.writeFile(path.join(root, 'research', 'alpha', 'README.md'), '# alpha: does `x` cost 50% & more?\n\ntext');
  await fs.writeFile(path.join(root, 'research', 'beta', 'README.md'), 'no heading here');
  await fs.writeFile(path.join(root, 'research', '_homepage', 'README.md'), '# skip me');
  return root;
}

test('titleOf takes the first H1, strips markup, falls back to the slug', () => {
  assert.equal(titleOf('a', '# A `b` *c*\n'), 'A b c');
  assert.equal(titleOf('slug', 'nothing'), 'slug');
});

test('bibEntry escapes BibTeX specials and links the project directory', () => {
  const e = bibEntry('alpha', 'cost 50% & more_');
  assert.match(e, /cost 50\\% \\& more\\_/);
  assert.ok(e.includes(`${REPO_URL}/tree/main/research/alpha`));
});

test('citation file names no person and is valid-looking CFF 1.2', () => {
  const c = citationCff();
  assert.match(c, /^cff-version: 1\.2\.0$/m);
  assert.match(c, /name: "oss-monorepo contributors"/);
});

test('run: skips underscore dirs and dirs without README; write then check is clean', async () => {
  const root = await fixture();
  const logs = [];
  let r = await run({ root, check: true, log: (m) => logs.push(m) });
  assert.equal(r.stale.length, 2);
  await run({ root, write: true, log: () => {} });
  const bib = await fs.readFile(path.join(root, 'research', 'CITATIONS.bib'), 'utf8');
  assert.match(bib, /oss-research-alpha/);
  assert.match(bib, /oss-research-beta/);
  assert.doesNotMatch(bib, /homepage|noreadme/);
  r = await run({ root, check: true, log: () => {} });
  assert.deepEqual(r.stale, []);
});
