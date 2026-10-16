/**
 * PyPI publisher: turns each dependency-free Python venture (`ventures/<slug>/pyproject.toml`
 * with a `src/` package) into a PyPI package so `pipx install <name>` works.
 * Off by default. See portfolio/distribution/README.md.
 *
 *   node platform/distribution/pypi.mjs                      # dry run: prints the packages it would publish
 *   DISTRIBUTE_PYPI=true PYPI_TOKEN=pypi-... node platform/distribution/pypi.mjs
 *
 * Stateless de-duplication: a project name that already exists on PyPI is
 * left alone (never republished or overwritten), and at most MAX_PER_RUN new
 * projects go out per run. Only ventures with no runtime dependencies, a
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

async function onPyPI(fetchImpl, name) {
  const res = await fetchImpl(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`);
  if (res.status === 404) return false;
  if (!res.ok) throw new Error(`pypi.org lookup for ${name}: HTTP ${res.status}`);
  return true;
}

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

export async function main({ env = process.env, fetchImpl = fetch, log = console.log, exec = run, root = REPO_ROOT } = {}) {
  const live = env.DISTRIBUTE_PYPI === 'true' && !!env.PYPI_TOKEN;
  const { ok, skipped } = await discover(root);
  for (const s of skipped) log(`skip ${s.slug}: ${s.why}`);
  const todo = [];
  for (const pkg of ok) {
    if (todo.length >= MAX_PER_RUN) break;
    if (live || env.PYPI_CHECK === 'true') {
      if (await onPyPI(fetchImpl, pkg.name)) { log(`exists ${pkg.name}`); continue; }
    }
    todo.push(pkg);
  }
  if (!live) {
    log(`DRY RUN (set DISTRIBUTE_PYPI=true plus PYPI_TOKEN to publish). ${todo.length} package(s):`);
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
        cwd: tmp, env: { ...env, TWINE_USERNAME: '__token__', TWINE_PASSWORD: env.PYPI_TOKEN },
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
