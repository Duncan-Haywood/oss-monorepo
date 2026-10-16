import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readProject, patchPyproject, discover, stage, main, MAX_PER_RUN } from './pypi.mjs';

const toml = (extra = '') => `[build-system]\nrequires = ["setuptools"]\n\n[project]\nname = "demo-tool"\nversion = "0.1.0"\n${extra}\n[tool.setuptools.packages.find]\nwhere = ["src"]\n`;

async function tree(ventures) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pypitest-'));
  for (const [slug, { py, files = ['LICENSE', 'README.md', 'src/demo/__init__.py'] }] of Object.entries(ventures)) {
    const d = path.join(root, 'ventures', slug);
    await fs.mkdir(d, { recursive: true });
    if (py) await fs.writeFile(path.join(d, 'pyproject.toml'), py);
    for (const f of files) { await fs.mkdir(path.dirname(path.join(d, f)), { recursive: true }); await fs.writeFile(path.join(d, f), 'x'); }
  }
  return root;
}

test('readProject reads name, version and dependency presence', () => {
  assert.deepEqual(readProject(toml()), { name: 'demo-tool', version: '0.1.0', hasDeps: false, hasReadme: false, hasLicense: false });
  assert.equal(readProject(toml('dependencies = ["requests"]\n')).hasDeps, true);
  assert.equal(readProject(toml('dependencies = []\n')).hasDeps, false);
  assert.equal(readProject('[tool.x]\na=1\n'), null);
});

test('patchPyproject adds readme/license only when missing', () => {
  const out = patchPyproject(toml());
  assert.match(out, /readme = "README\.md"/);
  assert.match(out, /license = \{file = "LICENSE"\}/);
  const full = toml('readme = "R.md"\nlicense = {text = "MIT"}\n');
  assert.equal(patchPyproject(full), full);
});

test('discover qualifies clean ventures and names why others are skipped', async () => {
  const root = await tree({
    good: { py: toml() },
    deps: { py: toml('dependencies = ["x"]\n') },
    nolic: { py: toml(), files: ['README.md', 'src/a.py'] },
    nosrc: { py: toml(), files: ['LICENSE', 'README.md'] },
    nopy: { files: ['index.html'] },
  });
  const { ok, skipped } = await discover(root);
  assert.deepEqual(ok.map((p) => p.slug), ['good']);
  assert.deepEqual(Object.fromEntries(skipped.map((s) => [s.slug, s.why])), {
    deps: 'declares runtime dependencies', nolic: 'no LICENSE', nosrc: 'no src/ tree',
  });
});

test('stage ships only pyproject, LICENSE, README and src, without caches', async () => {
  const root = await tree({ good: { py: toml(), files: ['LICENSE', 'README.md', 'index.html', 'src/demo/a.py', 'src/demo/__pycache__/a.pyc'] } });
  const [pkg] = (await discover(root)).ok;
  const out = path.join(root, 'out');
  await stage(pkg, out);
  assert.deepEqual((await fs.readdir(out)).sort(), ['LICENSE', 'README.md', 'pyproject.toml', 'src']);
  assert.deepEqual(await fs.readdir(path.join(out, 'src/demo')), ['a.py']);
});

test('without the enabling variables nothing is fetched or executed', async () => {
  const root = await tree({ good: { py: toml() } });
  const lines = [];
  const r = await main({ env: {}, root, fetchImpl: () => { throw new Error('network'); }, exec: () => { throw new Error('exec'); }, log: (s) => lines.push(s) });
  assert.deepEqual(r, { published: 0, planned: 1 });
  assert.match(lines.join('\n'), /DRY RUN/);
});

test('live: skips names already on PyPI, caps the run, uploads with a token', async () => {
  const v = {};
  for (const n of ['a', 'b', 'c', 'd', 'e']) v[n] = { py: toml().replace('demo-tool', `pkg-${n}`) };
  const root = await tree(v);
  const execs = [];
  const fetchImpl = async (url) => ({ ok: !url.endsWith('pkg-a/json'), status: url.endsWith('pkg-a/json') ? 404 : 200 });
  // pkg-a is NOT on PyPI (404); the rest exist, so only a is published.
  const r = await main({
    env: { DISTRIBUTE_PYPI: 'true', PYPI_TOKEN: 'pypi-secret' }, root, fetchImpl, log() {},
    exec: async (cmd, args, opts) => {
      execs.push([cmd, args, opts]);
      if (args.includes('build')) await fs.mkdir(path.join(opts.cwd, 'dist')).then(() => fs.writeFile(path.join(opts.cwd, 'dist', 'x.whl'), ''));
    },
  });
  assert.equal(r.published, 1);
  const upload = execs.find((e) => e[1].includes('twine'));
  assert.deepEqual(upload[1].slice(-1), [path.join('dist', 'x.whl')]);
  assert.equal(upload[2].env.TWINE_USERNAME, '__token__');
  assert.equal(upload[2].env.TWINE_PASSWORD, 'pypi-secret');
  assert.ok(MAX_PER_RUN <= 3);
});
