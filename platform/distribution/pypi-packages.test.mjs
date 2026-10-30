import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readProject, patchPyproject, withVersion, discover, stage, main, MAX_PER_RUN } from './pypi-packages.mjs';
import { parseAllowlist } from './versions.mjs';

/** An allow-list and a versions manifest naming `slugs` for pypi-packages at `version`. */
const listed = (slugs, version = '0.1.0') => ({
  allow: parseAllowlist({ tools: slugs.map((slug) => ({ slug, channels: ['pypi-packages'], why: 'test' })) }),
  versions: Object.fromEntries(slugs.map((slug) => [slug, { version, hash: 'sha256-x' }])),
});
const OURS = { info: { project_urls: { Source: 'https://github.com/duncan-haywood/oss-monorepo' } } };

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
  const r = await main({ env: {}, root, fetchImpl: () => { throw new Error('network'); }, exec: () => { throw new Error('exec'); }, log: (s) => lines.push(s), ...listed(['good']) });
  assert.deepEqual(r, { published: 0, planned: 1 });
  assert.match(lines.join('\n'), /DRY RUN/);
});

test('a venture that is not allow-listed is never planned', async () => {
  const root = await tree({ good: { py: toml() } });
  const r = await main({ env: {}, root, fetchImpl: () => { throw new Error('network'); }, log() {}, ...listed([]) });
  assert.deepEqual(r, { published: 0, planned: 0 });
});

test('withVersion replaces only the [project] version', () => {
  const out = withVersion(`${toml()}[tool.x]\nversion = "9"\n`, '0.3.1');
  assert.match(out, /^\[project\]\nname = "demo-tool"\nversion = "0\.3\.1"$/m);
  assert.match(out, /^version = "9"$/m);
});

test('live: skips names already on PyPI, caps the run, uploads with a token', async () => {
  const v = {};
  for (const n of ['a', 'b', 'c', 'd', 'e']) v[n] = { py: toml().replace('demo-tool', `pkg-${n}`) };
  const root = await tree(v);
  const execs = [];
  const fetchImpl = async (url) => {
    if (url.endsWith('pkg-a/json')) return { ok: false, status: 404 };
    if (url.endsWith('pkg-b/json')) return { ok: true, status: 200, json: async () => ({ info: { project_urls: { Source: 'https://example.com/x' } }, releases: {} }) };
    return { ok: true, status: 200, json: async () => ({ ...OURS, releases: { '0.1.0': [] } }) };
  };
  // pkg-a is NOT on PyPI (404); pkg-b's name is someone else's; the rest already have 0.1.0.
  const r = await main({
    env: { DISTRIBUTE_PYPI: 'true', TWINE_PASSWORD: 'pypi-secret' }, root, fetchImpl, log() {}, ...listed(['a', 'b', 'c', 'd', 'e']),
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
