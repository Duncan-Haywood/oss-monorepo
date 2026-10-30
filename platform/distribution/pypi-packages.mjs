/**
 * PyPI publisher: turns each dependency-free Python venture (`ventures/<slug>/pyproject.toml`
 * with a `src/` package) into a PyPI package so `pipx install <name>` works.
 * Off by default. See portfolio/distribution/README.md.
 *
 *   node platform/distribution/pypi-packages.mjs                      # dry run: prints the packages it would publish
 *   DISTRIBUTE_PYPI=true TWINE_PASSWORD=pypi-... node platform/distribution/pypi-packages.mjs
 *
 * Only ventures on the pypi-packages allow-list (portfolio/distribution/allowlist.json)
 * are published, at the version versions.json gives them (versions.mjs), which
 * replaces the pyproject's own version in the build copy. Stateless
 * de-duplication: a version PyPI already has is never republished, and at most
 * MAX_PER_RUN projects go out per run. Only ventures with no runtime dependencies, a
 * LICENSE, a README and a src/ tree qualify; anything else is skipped and the
 * reason printed, not guessed at. Each package is built from a clean copy
 * (pyproject, LICENSE, README, src) so stray site files never ship; if the
 * pyproject lacks `readme` / `license` keys they are added in the copy only.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { allowed, loadAllowlist, loadVersions } from './versions.mjs';
import { isOurs } from './pypi.mjs';

const run = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
export const MAX_PER_RUN = 3;
const NAME_RE = /^[a-z0-9][a-z0-9-]{0,99}$/;

const exists = (p) => fs.access(p).then(() => true, () => false);

/** The `[project]` table of a pyproject.toml, as text (up to the next table header). */
export function projectTable(toml) {
  const m = toml.match(/^\[project\]\s*$([\s\S]*?)(?=^\[|(?![\s\S]))/m);
  return m ? m[1] : null;
}

/** Name, version and whether the project declares any runtime dependency. */
export function readProject(toml) {
  const t = projectTable(toml);
  if (t === null) return null;
  const name = t.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
  const version = t.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  const deps = t.match(/^dependencies\s*=\s*\[([\s\S]*?)\]/m)?.[1] ?? '';
  return { name, version, hasDeps: /["']/.test(deps), hasReadme: /^readme\s*=/m.test(t), hasLicense: /^license\s*=/m.test(t) };
}

/** Add `readme` / `license` to the [project] table when missing (for the build copy only). */
export function patchPyproject(toml) {
  const p = readProject(toml);
  const add = [];
  if (!p.hasReadme) add.push('readme = "README.md"');
  if (!p.hasLicense) add.push('license = {file = "LICENSE"}');
  return add.length ? toml.replace(/^\[project\]\s*$/m, `[project]\n${add.join('\n')}`) : toml;
}

/** Which ventures can be published, and why the others cannot. */
export async function discover(root = REPO_ROOT) {
  const dir = path.join(root, 'ventures');
  const ok = [];
  const skipped = [];
  for (const slug of (await fs.readdir(dir)).sort()) {
    const base = path.join(dir, slug);
    const toml = await fs.readFile(path.join(base, 'pyproject.toml'), 'utf8').catch(() => null);
    if (toml === null) continue;
    const p = readProject(toml);
    const why = !p ? 'no [project] table'
      : !p.name || !NAME_RE.test(p.name) ? 'invalid project name'
      : !p.version ? 'no version'
      : p.hasDeps ? 'declares runtime dependencies'
      : !(await exists(path.join(base, 'LICENSE'))) ? 'no LICENSE'
      : !(await exists(path.join(base, 'README.md'))) ? 'no README.md'
      : !(await exists(path.join(base, 'src'))) ? 'no src/ tree'
      : null;
    if (why) skipped.push({ slug, why });
    else ok.push({ slug, name: p.name, version: p.version, dir: base, toml });
  }
  return { ok, skipped };
}

/** 'free', 'ours' (this version already published), 'taken' (another project's name) or 'update'. */
async function onPyPI(fetchImpl, name, version) {
  const res = await fetchImpl(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`);
  if (res.status === 404) return 'free';
  if (!res.ok) throw new Error(`pypi.org lookup for ${name}: HTTP ${res.status}`);
  const doc = await res.json();
  if (!isOurs(doc)) return 'taken';
  return doc.releases?.[version] ? 'ours' : 'update';
}

/** Set the [project] version in a pyproject.toml. */
export const withVersion = (toml, version) => toml.replace(/^(\[project\][\s\S]*?^version\s*=\s*)"[^"]*"/m, `$1"${version}"`);

/** Write the clean build tree for one package into `out`. */
export async function stage(pkg, out) {
  await fs.mkdir(out, { recursive: true });
  await fs.writeFile(path.join(out, 'pyproject.toml'), patchPyproject(pkg.toml));
  for (const f of ['LICENSE', 'README.md']) await fs.copyFile(path.join(pkg.dir, f), path.join(out, f));
  await fs.cp(path.join(pkg.dir, 'src'), path.join(out, 'src'), {
    recursive: true,
    filter: (s) => !/(^|[\\/])(__pycache__|\.pytest_cache)([\\/]|$)|\.pyc$/.test(s),
  });
}

export async function main({ env = process.env, fetchImpl = fetch, log = console.log, exec = run, root = REPO_ROOT, allow, versions } = {}) {
  const live = env.DISTRIBUTE_PYPI === 'true' && !!env.TWINE_PASSWORD;
  allow ??= await loadAllowlist(root);
  versions ??= await loadVersions(root);
  const listed = allowed(allow, 'pypi-packages');
  const { ok, skipped } = await discover(root);
  for (const s of skipped) if (listed.has(s.slug)) log(`skip ${s.slug}: ${s.why}`);
  const todo = [];
  for (const found of ok) {
    if (todo.length >= MAX_PER_RUN) break;
    if (!listed.has(found.slug)) continue;
    const version = versions[found.slug]?.version;
    if (!version) { log(`skip ${found.slug}: no version in versions.json (run versions.mjs --write)`); continue; }
    const pkg = { ...found, version, toml: withVersion(found.toml, version) };
    if (live || env.PYPI_CHECK === 'true') {
      const state = await onPyPI(fetchImpl, pkg.name, version);
      if (state === 'ours') { log(`exists ${pkg.name} ${version}`); continue; }
      if (state === 'taken') { log(`skip ${pkg.name}: the name belongs to another project`); continue; }
    }
    todo.push(pkg);
  }
  if (!live) {
    log(`DRY RUN (set DISTRIBUTE_PYPI=true plus TWINE_PASSWORD to publish). ${todo.length} package(s):`);
    for (const p of todo) log(`--- ${p.name} ${p.version} (ventures/${p.slug})`);
    return { published: 0, planned: todo.length };
  }
  let published = 0;
  for (const pkg of todo) {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pypi-'));
    try {
      await stage(pkg, tmp);
      await exec('python3', ['-m', 'build', '--outdir', 'dist', '.'], { cwd: tmp });
      const files = (await fs.readdir(path.join(tmp, 'dist'))).map((f) => path.join('dist', f));
      await exec('python3', ['-m', 'twine', 'upload', '--non-interactive', ...files], {
        cwd: tmp, env: { ...env, TWINE_USERNAME: '__token__', TWINE_PASSWORD: env.TWINE_PASSWORD },
      });
      log(`published ${pkg.name} ${pkg.version}`);
      published++;
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  }
  return { published, planned: todo.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
