/**
 * PyPI publisher: turns each stdlib-only Python venture CLI (`ventures/<slug>/check.py`
 * with a `main()`) into a PyPI package so `pipx run <name>` / `pip install <name>` works.
 * Off by default. See portfolio/distribution/README.md.
 *
 *   node platform/distribution/pypi.mjs                          # dry run: prints the packages it would publish
 *   node platform/distribution/pypi.mjs --pack <slug> <outDir>   # write one project to disk (to inspect or `python3 -m build`)
 *   DISTRIBUTE_PYPI=true TWINE_PASSWORD=pypi-... node platform/distribution/pypi.mjs
 *
 * Only tools on the pypi allow-list (portfolio/distribution/allowlist.json) are
 * published, at the version versions.json gives them (versions.mjs). Stateless
 * de-duplication: a version PyPI already has is left alone, and at most
 * MAX_PER_RUN projects go out per run. Only tools whose
 * every import is on the stdlib allowlist below and none on the network list
 * qualify: anything else is skipped, not guessed at. The tool's source is
 * shipped unchanged as `<module>/cli.py`; only packaging files are generated.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { toolUrl } from './bluesky.mjs';
import { tagUrl } from './attribution.mjs';
import { descriptionOf } from './npm.mjs';
import { allowed, loadAllowlist, loadVersions } from './versions.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
export const MAX_PER_RUN = 5;
export const VERSION = '0.1.0';
const REPO_URL = 'https://github.com/duncan-haywood/oss-monorepo';
const NAME_RE = /^[a-z0-9][a-z0-9-]{0,99}$/;

/** Stdlib modules a qualifying tool may import (no network, no process spawning). */
export const STDLIB_OK = new Set([
  '__future__', 'argparse', 'base64', 'collections', 'copy', 'csv', 'dataclasses', 'datetime', 'difflib',
  'enum', 'fnmatch', 'functools', 'glob', 'hashlib', 'html', 'io', 'ipaddress', 'itertools', 'json',
  'logging', 'math', 'operator', 'os', 'pathlib', 're', 'shlex', 'shutil', 'stat', 'statistics', 'string',
  'sys', 'tempfile', 'textwrap', 'time', 'tomllib', 'typing', 'xml', 'zipfile',
]);
const IMPORT_RE = /^[ \t]*(?:import[ \t]+([A-Za-z_][\w.]*(?:[ \t]*,[ \t]*[A-Za-z_][\w.]*)*)|from[ \t]+([A-Za-z_.][\w.]*)[ \t]+import\b)/gm;

/** Top-level module names imported by Python source `src` (relative imports appear as '.'). */
export function importsOf(src) {
  const out = new Set();
  for (const m of src.matchAll(IMPORT_RE)) {
    if (m[1]) for (const part of m[1].split(',')) out.add(part.trim().split('.')[0]);
    else out.add(m[2].startsWith('.') ? '.' : m[2].split('.')[0]);
  }
  return [...out].sort();
}

/** First import that disqualifies the tool, or null. Imports inside functions count too. */
export function disqualifying(src) {
  return importsOf(src).find((m) => !STDLIB_OK.has(m)) ?? null;
}

export const moduleName = (slug) => slug.replace(/-/g, '_');

const hasMain = (src) => /^def main\(/m.test(src);

export function pyproject({ name, slug, description, version }) {
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const mod = moduleName(slug);
  return `[build-system]
requires = ["setuptools>=61"]
build-backend = "setuptools.build_meta"

[project]
name = "${name}"
version = "${version}"
description = "${esc(description)}"
readme = "README.md"
license = { text = "MIT" }
requires-python = ">=3.9"
dependencies = []
keywords = ["cli", "free", "open-source"]
classifiers = ["License :: OSI Approved :: MIT License", "Programming Language :: Python :: 3", "Environment :: Console"]

[project.urls]
Homepage = "${tagUrl(toolUrl(slug), 'pypi')}"
Source = "${REPO_URL}/tree/main/ventures/${slug}"
Issues = "${REPO_URL}/issues"

[project.scripts]
${slug} = "${mod}.cli:main"

[tool.setuptools]
packages = ["${mod}"]
`;
}

/** The project for one venture: { name, version, files: { relPath: text } } or { skip }. */
export async function buildPackage({ slug, dir, version = VERSION }) {
  if (!NAME_RE.test(slug)) return { skip: `invalid project name ${slug}` };
  const src = await fs.readFile(path.join(dir, 'check.py'), 'utf8').catch(() => null);
  if (src === null) return { skip: 'no check.py' };
  if (!hasMain(src)) return { skip: 'check.py has no main()' };
  const bad = disqualifying(src);
  if (bad) return { skip: `imports "${bad}"` };
  const license = await fs.readFile(path.join(dir, 'LICENSE'), 'utf8').catch(() => null);
  if (license === null || !/MIT License/i.test(license)) return { skip: 'no MIT LICENSE' };
  const yaml = await fs.readFile(path.join(dir, 'VENTURE.yaml'), 'utf8').catch(() => '');
  const description = descriptionOf(yaml);
  if (!description) return { skip: 'no description in VENTURE.yaml' };
  const mod = moduleName(slug);
  const readme = await fs.readFile(path.join(dir, 'README.md'), 'utf8').catch(() => `# ${slug}\n\n${description}\n`);
  const files = {
    [`${mod}/__init__.py`]: '',
    [`${mod}/__main__.py`]: `from .cli import main\nraise SystemExit(main())\n`,
    [`${mod}/cli.py`]: src,
    LICENSE: license,
    'README.md': `${readme.trimEnd()}\n\n---\n\nFree and open source (MIT), from [Maris Stella Labs](${tagUrl(toolUrl(slug), 'pypi')}). Install: \`pipx run ${slug}\`. Not legal, tax or professional advice.\nSource: ${REPO_URL}/tree/main/ventures/${slug}\n`,
    'pyproject.toml': pyproject({ name: slug, slug, description, version }),
  };
  return { name: slug, version, files };
}

/** Every venture directory with a check.py, as slugs. */
export async function discover(root = REPO_ROOT) {
  const dir = path.join(root, 'ventures');
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory() && await fs.stat(path.join(dir, e.name, 'check.py')).then(() => true, () => false)) out.push(e.name);
  }
  return out.sort();
}

export async function writePackage(pkg, outDir) {
  for (const [rel, text] of Object.entries(pkg.files)) {
    const target = path.join(outDir, rel);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, text);
  }
}

/** Projects that qualify, with skip reasons for the rest. `versions` maps slug -> { version }. */
export async function plan({ root = REPO_ROOT, slugs, versions = {} } = {}) {
  const ok = [];
  const skipped = [];
  for (const slug of slugs ?? await discover(root)) {
    const version = versions[slug]?.version ?? VERSION;
    const pkg = await buildPackage({ slug, dir: path.join(root, 'ventures', slug), version });
    if (pkg.skip) skipped.push({ slug, reason: pkg.skip });
    else ok.push({ slug, ...pkg });
  }
  return { ok, skipped };
}

const exec = promisify(execFile);

/** Whether PyPI's JSON for a project is one this repository published (a project URL names this repo). */
export const isOurs = (doc) => Object.values(doc?.info?.project_urls ?? {}).some((u) => String(u).toLowerCase().includes('duncan-haywood/oss-monorepo'));

export async function run({ env = process.env, fetchImpl = fetch, log = console.log, publish, root = REPO_ROOT, allow, versions } = {}) {
  const live = env.DISTRIBUTE_PYPI === 'true' && !!env.TWINE_PASSWORD;
  allow ??= await loadAllowlist(root);
  versions ??= await loadVersions(root);
  const slugs = [...allowed(allow, 'pypi')].sort();
  const { ok, skipped } = await plan({ root, slugs, versions });
  log(`${ok.length} of ${slugs.length} allow-listed CLIs qualify`);
  for (const s of skipped) log(`  skip ${s.slug}: ${s.reason}`);
  const fresh = [];
  for (const p of ok) {
    if (fresh.length >= MAX_PER_RUN) break;
    if (!versions[p.slug]) { log(`  skip ${p.slug}: no version in versions.json (run versions.mjs --write)`); continue; }
    const res = await fetchImpl(`https://pypi.org/pypi/${p.name}/json`);
    if (res.status === 200) {
      const doc = await res.json();
      if (!isOurs(doc)) { log(`  skip ${p.name}: the name belongs to another project`); continue; }
      if (doc.releases?.[p.version]) continue;
    } else if (res.status !== 404) throw new Error(`PyPI: HTTP ${res.status} for ${p.name}`);
    fresh.push(p);
  }
  if (!live) {
    log(`DRY RUN (set DISTRIBUTE_PYPI=true and TWINE_PASSWORD to publish). Would publish up to ${MAX_PER_RUN} new versions:`);
    for (const p of fresh) log(`  ${p.name}==${p.version}  ${Object.keys(p.files).length} files`);
    return { published: 0, planned: fresh.length };
  }
  const doPublish = publish ?? (async (dir) => {
    await exec('python3', ['-m', 'build', '--outdir', 'dist', dir], { cwd: dir, env });
    await exec('python3', ['-m', 'twine', 'upload', '--non-interactive', 'dist/*'], { cwd: dir, env: { ...env, TWINE_USERNAME: '__token__' }, shell: false });
  });
  let published = 0;
  for (const p of fresh) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pypipkg-'));
    try {
      await writePackage(p, dir);
      await doPublish(dir);
      published += 1;
      log(`published ${p.name}==${p.version}`);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
  return { published, planned: fresh.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [flag, slug, outDir] = process.argv.slice(2);
  if (flag === '--pack') {
    const version = (await loadVersions())[slug]?.version ?? VERSION;
    const pkg = await buildPackage({ slug, dir: path.join(REPO_ROOT, 'ventures', slug), version });
    if (pkg.skip) { console.error(`${slug}: ${pkg.skip}`); process.exit(1); }
    await writePackage(pkg, outDir);
    console.log(`wrote ${pkg.name}==${pkg.version} to ${outDir}`);
  } else {
    run().catch((e) => { console.error(e.message); process.exit(1); });
  }
}
