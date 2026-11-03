import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { className, tarballUrl, formula, sha256Of, run, MAX_PER_RUN } from './homebrew.mjs';
import { parseAllowlist } from './versions.mjs';

/** An allow-list and a versions manifest naming `slugs` for npm at 0.1.0. */
const listed = (slugs) => ({
  allow: parseAllowlist({ tools: slugs.map((slug) => ({ slug, channels: ['npm'], why: 'test' })) }),
  versions: Object.fromEntries(slugs.map((slug) => [slug, { version: '0.1.0', hash: 'sha256-x' }])),
});

const SHA = 'a'.repeat(64);
const MIT = 'MIT License\n\nCopyright (c) x';

async function fixture(slugs) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'brewtest-'));
  for (const s of slugs) {
    const d = path.join(root, 'ventures', s);
    await fs.mkdir(d, { recursive: true });
    await fs.writeFile(path.join(d, 'cli.mjs'), '#!/usr/bin/env node\nconsole.log(1);\n');
    await fs.writeFile(path.join(d, 'LICENSE'), MIT);
    await fs.writeFile(path.join(d, 'VENTURE.yaml'), 'name: x\ndescription: Checks a thing. More.\n');
  }
  return root;
}
const registry = (have) => async (url) => {
  const hit = have.some((s) => url.includes(`/${s}/-/`));
  return { status: hit ? 200 : 404, arrayBuffer: async () => new TextEncoder().encode(url).buffer };
};

test('className camel-cases hyphenated names and rejects ones Ruby cannot use', () => {
  assert.equal(className('deal-keeper'), 'DealKeeper');
  assert.equal(className('x2-tool'), 'X2Tool');
  assert.equal(className('1099-helper'), null);
  assert.equal(className('Bad_Name'), null);
});

test('tarballUrl handles scoped names', () => {
  assert.equal(tarballUrl('a-b'), 'https://registry.npmjs.org/a-b/-/a-b-0.1.0.tgz');
  assert.equal(tarballUrl('@me/a-b'), 'https://registry.npmjs.org/@me/a-b/-/a-b-0.1.0.tgz');
});

test('formula embeds the real hash and escapes the description; refuses a bad hash', () => {
  const rb = formula({ slug: 'deal-keeper', description: 'Tracks "deals" #{x}.', sha256: SHA });
  assert.match(rb, /^class DealKeeper < Formula/);
  assert.match(rb, new RegExp(`sha256 "${SHA}"`));
  assert.match(rb, /desc "Tracks \\"deals\\" \\#\{x\}"/);
  assert.match(rb, /depends_on "node"/);
  assert.equal(formula({ slug: 'deal-keeper', description: 'x', sha256: 'nope' }), null);
});

test('dry run writes nothing; live run writes only packages already on npm and never overwrites', async () => {
  const root = await fixture(['aa-tool', 'bb-tool', 'cc-tool']);
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'tap-'));
  const lines = [];
  const dry = await run({ env: {}, root, fetchImpl: registry(['aa-tool', 'bb-tool']), log: (l) => lines.push(l), outDir: out, ...listed(['aa-tool', 'bb-tool', 'cc-tool']) });
  assert.deepEqual(dry, { written: 0, planned: 2 });
  assert.deepEqual(await fs.readdir(out), []);
  await fs.mkdir(path.join(out, 'Formula'));
  await fs.writeFile(path.join(out, 'Formula', 'aa-tool.rb'), 'keep');
  const live = await run({ env: { DISTRIBUTE_HOMEBREW: 'true' }, root, fetchImpl: registry(['aa-tool', 'bb-tool']), log: () => {}, outDir: out, ...listed(['aa-tool', 'bb-tool', 'cc-tool']) });
  assert.deepEqual(live, { written: 1, planned: 1 });
  assert.equal(await fs.readFile(path.join(out, 'Formula', 'aa-tool.rb'), 'utf8'), 'keep');
  const bb = await fs.readFile(path.join(out, 'Formula', 'bb-tool.rb'), 'utf8');
  assert.ok(bb.includes(sha256Of(Buffer.from('https://registry.npmjs.org/bb-tool/-/bb-tool-0.1.0.tgz'))));
  await assert.rejects(fs.stat(path.join(out, 'Formula', 'cc-tool.rb')));
});

test('caps new formulas per run', async () => {
  const slugs = Array.from({ length: MAX_PER_RUN + 3 }, (_, i) => `t${String.fromCharCode(97 + i)}-tool`);
  const root = await fixture(slugs);
  const r = await run({ env: {}, root, fetchImpl: registry(slugs), log: () => {}, ...listed(slugs) });
  assert.equal(r.planned, MAX_PER_RUN);
});

test('NPM_SCOPE puts the scoped package name in the tarball url and the formula', async () => {
  const root = await fixture(['aa-tool']);
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'tap-'));
  const urls = [];
  const fetchImpl = async (url) => { urls.push(url); return registry(['aa-tool'])(url); };
  await run({ env: { DISTRIBUTE_HOMEBREW: 'true', NPM_SCOPE: '@me' }, root, fetchImpl, log: () => {}, outDir: out, ...listed(['aa-tool']) });
  assert.deepEqual(urls, ['https://registry.npmjs.org/@me/aa-tool/-/aa-tool-0.1.0.tgz']);
  assert.match(await fs.readFile(path.join(out, 'Formula', 'aa-tool.rb'), 'utf8'), /url "https:\/\/registry\.npmjs\.org\/@me\/aa-tool\//);
});

test('formula desc is the package description, not the raw VENTURE.yaml', async () => {
  const root = await fixture(['aa-tool']);
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'tap-'));
  await run({ env: { DISTRIBUTE_HOMEBREW: 'true' }, root, fetchImpl: registry(['aa-tool']), log: () => {}, outDir: out, ...listed(['aa-tool']) });
  assert.match(await fs.readFile(path.join(out, 'Formula', 'aa-tool.rb'), 'utf8'), /desc "Checks a thing"\n/);
});

test('command line: runs when invoked directly and prints the dry-run summary', async () => {
  const { execFileSync } = await import('node:child_process');
  const script = fileURLToPath(new URL('./homebrew.mjs', import.meta.url));
  const out = execFileSync(process.execPath, [script], { encoding: 'utf8', env: { ...process.env, DISTRIBUTE_HOMEBREW: '' } });
  assert.match(out, /npm-allow-listed CLIs qualify/);
  assert.match(out, /DRY RUN/);
});
