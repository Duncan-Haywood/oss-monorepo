import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { importsOf, disqualifying, moduleName, pyproject, buildPackage, writePackage, discover, plan, run, isOurs, MAX_PER_RUN } from './pypi.mjs';
import { parseAllowlist } from './versions.mjs';

/** An allow-list and a versions manifest naming `slugs` for PyPI at `version`. */
const listed = (slugs, version = '0.1.0') => ({
  allow: parseAllowlist({ tools: slugs.map((slug) => ({ slug, channels: ['pypi'], why: 'test' })) }),
  versions: Object.fromEntries(slugs.map((slug) => [slug, { version, hash: 'sha256-x' }])),
});
const OURS = { project_urls: { Source: 'https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/x' } };

async function fixture(files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pypitest-'));
  for (const [rel, text] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await fs.writeFile(path.join(root, rel), text);
  }
  return root;
}
const MIT = 'MIT License\n\nCopyright (c) x';
const SRC = '#!/usr/bin/env python3\nimport argparse, sys\nfrom pathlib import Path\n\ndef main(argv=None):\n    return 0\n\nif __name__ == "__main__":\n    sys.exit(main())\n';
const venture = (name, over = {}) => ({
  [`ventures/${name}/check.py`]: SRC,
  [`ventures/${name}/LICENSE`]: MIT,
  [`ventures/${name}/VENTURE.yaml`]: 'name: x\ndescription: Checks a "thing". Second sentence.\n',
  ...over,
});

test('importsOf reads import and from-import forms, top-level names only', () => {
  const src = 'import os, sys\nimport xml.etree.ElementTree as ET\nfrom pathlib import Path\nfrom . import sibling\n    import json\nx = "import evil"\n';
  assert.deepEqual(importsOf(src), ['.', 'json', 'os', 'pathlib', 'sys', 'xml']);
});

test('disqualifying flags network, process and third-party imports, not stdlib', () => {
  assert.equal(disqualifying(SRC), null);
  assert.equal(disqualifying('import urllib.request\n'), 'urllib');
  assert.equal(disqualifying('import subprocess\n'), 'subprocess');
  assert.equal(disqualifying('import yaml\n'), 'yaml');
  assert.equal(disqualifying('from . import x\n'), '.');
  assert.equal(disqualifying('def f():\n    import socket\n'), 'socket');
});

test('moduleName and pyproject carry the entry point and escape the description', () => {
  assert.equal(moduleName('a-b-check'), 'a_b_check');
  const t = pyproject({ name: 'a-b', slug: 'a-b', description: 'say "hi"', version: '0.1.0' });
  assert.match(t, /description = "say \\"hi\\""/);
  assert.match(t, /^a-b = "a_b\.cli:main"$/m);
  assert.match(t, /dependencies = \[\]/);
});

test('buildPackage ships the source unchanged under <module>/cli.py', async () => {
  const root = await fixture(venture('a-check'));
  const pkg = await buildPackage({ slug: 'a-check', dir: path.join(root, 'ventures/a-check') });
  assert.equal(pkg.name, 'a-check');
  assert.equal(pkg.files['a_check/cli.py'], SRC);
  assert.match(pkg.files['a_check/__main__.py'], /main\(\)/);
  assert.match(pkg.files['README.md'], /Not legal, tax or professional advice/);
  assert.deepEqual(Object.keys(pkg.files).sort(), ['LICENSE', 'README.md', 'a_check/__init__.py', 'a_check/__main__.py', 'a_check/cli.py', 'pyproject.toml']);
});

test('buildPackage skips with a reason instead of guessing', async () => {
  const skip = async (over) => {
    const root = await fixture(venture('x', over));
    return (await buildPackage({ slug: 'x', dir: path.join(root, 'ventures/x') })).skip;
  };
  assert.match(await skip({ 'ventures/x/check.py': 'import requests\ndef main():\n    pass\n' }), /requests/);
  assert.match(await skip({ 'ventures/x/check.py': 'import sys\n' }), /no main/);
  assert.match(await skip({ 'ventures/x/LICENSE': 'Proprietary' }), /MIT/);
  assert.match(await skip({ 'ventures/x/VENTURE.yaml': 'name: x\n' }), /description/);
  assert.match((await buildPackage({ slug: 'Bad_Name', dir: '/nonexistent' })).skip, /invalid/);
});

test('discover and plan split qualifying from skipped', async () => {
  const root = await fixture({ ...venture('good-check'), ...venture('bad-check', { 'ventures/bad-check/check.py': 'import socket\ndef main():\n    pass\n' }) });
  assert.deepEqual(await discover(root), ['bad-check', 'good-check']);
  const { ok, skipped } = await plan({ root });
  assert.deepEqual(ok.map((p) => p.slug), ['good-check']);
  assert.deepEqual(skipped.map((s) => s.slug), ['bad-check']);
});

test('writePackage writes every file', async () => {
  const root = await fixture(venture('w-check'));
  const pkg = await buildPackage({ slug: 'w-check', dir: path.join(root, 'ventures/w-check') });
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'pypiout-'));
  await writePackage(pkg, out);
  assert.equal(await fs.readFile(path.join(out, 'w_check/cli.py'), 'utf8'), SRC);
});

function many(n) {
  const files = {};
  const slugs = [];
  for (let i = 0; i < n; i++) { slugs.push(`t${String(i).padStart(2, '0')}-check`); Object.assign(files, venture(slugs.at(-1))); }
  return { files, slugs };
}

test('dry run publishes nothing, skips versions PyPI already has, caps at MAX_PER_RUN', async () => {
  const { files, slugs } = many(8);
  const root = await fixture(files);
  const logs = [];
  const fetchImpl = async (url) => (url.includes('/t00-check/')
    ? { status: 200, json: async () => ({ info: OURS, releases: { '0.1.0': [] } }) }
    : { status: 404 });
  const publish = async () => assert.fail('must not publish on a dry run');
  const r = await run({ env: {}, root, fetchImpl, log: (l) => logs.push(l), publish, ...listed(slugs) });
  assert.deepEqual(r, { published: 0, planned: MAX_PER_RUN });
  assert.ok(logs.some((l) => /DRY RUN/.test(l)));
  assert.ok(!logs.some((l) => /t00-check/.test(l) && /==/.test(l)));
});

test('only allow-listed tools are published; a name someone else owns is skipped', async () => {
  const { files, slugs } = many(3);
  const root = await fixture(files);
  const logs = [];
  const fetchImpl = async (url) => (url.includes('/t01-check/')
    ? { status: 200, json: async () => ({ info: { project_urls: { Source: 'https://example.com/other' } }, releases: {} }) }
    : { status: 404 });
  const done = [];
  const publish = async (dir) => { done.push(await fs.readFile(path.join(dir, 'pyproject.toml'), 'utf8')); };
  const r = await run({ env: { DISTRIBUTE_PYPI: 'true', TWINE_PASSWORD: 'x' }, root, fetchImpl, log: (l) => logs.push(l), publish, ...listed(slugs.slice(1), '2.0.1') });
  assert.equal(r.published, 1);
  assert.match(done[0], /name = "t02-check"/);
  assert.match(done[0], /version = "2\.0\.1"/);
  assert.ok(logs.some((l) => /skip t01-check: the name belongs to another project/.test(l)));
  assert.equal(isOurs({ info: OURS }), true);
});

test('live run needs both the variable and the token, then publishes the fresh ones', async () => {
  const { files, slugs } = many(2);
  const root = await fixture(files);
  const fetchImpl = async () => ({ status: 404 });
  const done = [];
  const publish = async (dir) => { done.push(await fs.readdir(dir)); };
  const half = await run({ env: { DISTRIBUTE_PYPI: 'true' }, root, fetchImpl, log() {}, publish, ...listed(slugs) });
  assert.equal(half.published, 0);
  const live = await run({ env: { DISTRIBUTE_PYPI: 'true', TWINE_PASSWORD: 'pypi-x' }, root, fetchImpl, log() {}, publish, ...listed(slugs) });
  assert.equal(live.published, 2);
  assert.equal(done.length, 2);
});

test('an unexpected registry status stops the run rather than guessing', async () => {
  const { files, slugs } = many(1);
  const root = await fixture(files);
  await assert.rejects(run({ env: {}, root, fetchImpl: async () => ({ status: 503 }), log() {}, ...listed(slugs) }), /HTTP 503/);
});
