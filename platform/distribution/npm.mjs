/**
 * npm publisher: turns each zero-dependency venture CLI (`ventures/<slug>/cli.mjs`)
 * into an npm package so `npx <name>` works. Off by default. See
 * portfolio/distribution/README.md.
 *
 *   node platform/distribution/npm.mjs                  # dry run: prints the packages it would publish
 *   node platform/distribution/npm.mjs --pack <slug> <outDir>   # write one package to disk (to inspect or `npm pack`)
 *   DISTRIBUTE_NPM=true NODE_AUTH_TOKEN=... [NPM_SCOPE=@you] node platform/distribution/npm.mjs
 *
 * Only tools on the npm allow-list (portfolio/distribution/allowlist.json) are
 * published, at the version versions.json gives them (versions.mjs). Stateless
 * de-duplication: a version the registry already has is left alone, and at
 * most MAX_PER_RUN packages go out per run. Only CLIs that import nothing but
 * node: builtins and their own sibling files qualify; anything with a
 * dependency is skipped, not guessed at.
 *
 * Why a wrapper: ~90 of the CLIs only run when "invoked directly"
 * (`import.meta.url === file://${process.argv[1]}`). npm links a package's bin
 * as a symlink, so argv[1] is the symlink path, the comparison fails, and the
 * CLI would exit 0 having printed nothing. The generated `bin.mjs` points
 * argv[1] at the real file before importing the CLI.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { toolUrl } from './bluesky.mjs';
import { tagUrl } from './attribution.mjs';
import { allowed, loadAllowlist, loadVersions } from './versions.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
export const MAX_PER_RUN = 5;
export const VERSION = '0.1.0';
const REPO_URL = 'https://github.com/duncan-haywood/oss-monorepo';
const NAME_RE = /^(@[a-z0-9][a-z0-9-]*\/)?[a-z0-9][a-z0-9-]{0,213}$/;
const IMPORT_RE = /^\s*(?:import|export)\b[^;'"]*?\bfrom\s*(["'])([^"']+)\1|^\s*import\s*(["'])([^"']+)\3|\bimport\s*\(\s*(["'])([^"']+)\5/gm;

/** Specifiers imported by `src` (static `from`, bare `import "x"`, and `import("x")`). */
export function importsOf(src) {
  return [...src.matchAll(IMPORT_RE)].map((m) => m[2] ?? m[4] ?? m[6]);
}

/**
 * Files a CLI needs, as relative paths, or { skip: reason }. Follows relative
 * imports transitively; node: builtins are fine, any other package is a skip.
 */
export async function closure(dir, entry = 'cli.mjs') {
  const seen = new Set();
  const queue = [entry];
  while (queue.length) {
    const rel = queue.pop();
    if (seen.has(rel)) continue;
    seen.add(rel);
    const src = await fs.readFile(path.join(dir, rel), 'utf8').catch(() => null);
    if (src === null) return { skip: `missing ${rel}` };
    for (const spec of importsOf(src)) {
      if (spec.startsWith('node:')) continue;
      if (!spec.startsWith('./') && !spec.startsWith('../')) return { skip: `imports package "${spec}"` };
      const next = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
      if (next.startsWith('..')) return { skip: `imports outside its directory (${spec})` };
      queue.push(next);
    }
  }
  return { files: [...seen].sort() };
}

/** `description:` of a VENTURE.yaml (single-line scalar), first sentence, or ''. */
export function descriptionOf(yaml) {
  const m = /^description:\s*(.+)$/m.exec(yaml);
  if (!m) return '';
  const text = m[1].trim().replace(/^["']|["']$/g, '');
  const first = text.split(/(?<=\.)\s/)[0];
  return first.length > 300 ? `${first.slice(0, 299).trimEnd()}…` : first;
}

export const packageName = (slug, scope = '') => `${scope ? `${scope.replace(/\/$/, '')}/` : ''}${slug}`;

export const BIN_WRAPPER = `#!/usr/bin/env node
// npm links bin files as symlinks, so process.argv[1] is the link, not this
// package's real cli.mjs. Many CLIs only run when invoked directly, so point
// argv[1] at the real file before loading it.
import { fileURLToPath } from 'node:url';
process.argv[1] = fileURLToPath(new URL('./cli.mjs', import.meta.url));
await import('./cli.mjs');
`;

/**
 * The package for one venture: { name, files: { relPath: text } } or { skip }.
 * `read(relPath)` returns the venture's file text or null.
 */
export async function buildPackage({ slug, dir, scope = '', version = VERSION }) {
  const name = packageName(slug, scope);
  if (!NAME_RE.test(name)) return { skip: `invalid package name ${name}` };
  const cli = await fs.readFile(path.join(dir, 'cli.mjs'), 'utf8').catch(() => null);
  if (cli === null) return { skip: 'no cli.mjs' };
  if (!cli.startsWith('#!')) return { skip: 'cli.mjs has no shebang' };
  const license = await fs.readFile(path.join(dir, 'LICENSE'), 'utf8').catch(() => null);
  if (license === null || !/MIT License/i.test(license)) return { skip: 'no MIT LICENSE' };
  const yaml = await fs.readFile(path.join(dir, 'VENTURE.yaml'), 'utf8').catch(() => '');
  const description = descriptionOf(yaml);
  if (!description) return { skip: 'no description in VENTURE.yaml' };
  const c = await closure(dir);
  if (c.skip) return { skip: c.skip };
  const files = {};
  for (const rel of c.files) files[rel] = await fs.readFile(path.join(dir, rel), 'utf8');
  files['bin.mjs'] = BIN_WRAPPER;
  files.LICENSE = license;
  const readme = await fs.readFile(path.join(dir, 'README.md'), 'utf8').catch(() => `# ${slug}\n\n${description}\n`);
  files['README.md'] = `${readme.trimEnd()}\n\n---\n\nFree and open source (MIT), from [Maris Stella Labs](${tagUrl(toolUrl(slug), 'npm')}). Not legal, tax or professional advice.\nSource: ${REPO_URL}/tree/main/ventures/${slug}\n`;
  files['package.json'] = `${JSON.stringify({
    name,
    version,
    description,
    type: 'module',
    bin: { [slug]: 'bin.mjs' },
    files: [...c.files, 'bin.mjs', 'LICENSE', 'README.md'],
    engines: { node: '>=18' },
    license: 'MIT',
    homepage: tagUrl(toolUrl(slug), 'npm'),
    repository: { type: 'git', url: `git+${REPO_URL}.git`, directory: `ventures/${slug}` },
    bugs: { url: `${REPO_URL}/issues` },
    keywords: ['cli', 'free', 'open-source', ...slug.split('-').filter((w) => w.length > 2).slice(0, 4)],
    publishConfig: { access: 'public' },
  }, null, 2)}\n`;
  return { name, version, files };
}

/** Every venture directory with a cli.mjs, as slugs. */
export async function discover(root = REPO_ROOT) {
  const dir = path.join(root, 'ventures');
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory() && await fs.stat(path.join(dir, e.name, 'cli.mjs')).then(() => true, () => false)) out.push(e.name);
  }
  return out.sort();
}

export async function writePackage(pkg, outDir) {
  for (const [rel, text] of Object.entries(pkg.files)) {
    const target = path.join(outDir, rel);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, text);
  }
  await fs.chmod(path.join(outDir, 'bin.mjs'), 0o755);
}

/** Packages that qualify, with skip reasons for the rest. `versions` maps slug -> { version }. */
export async function plan({ root = REPO_ROOT, scope = '', slugs, versions = {} } = {}) {
  const ok = [];
  const skipped = [];
  for (const slug of slugs ?? await discover(root)) {
    const version = versions[slug]?.version ?? VERSION;
    const pkg = await buildPackage({ slug, dir: path.join(root, 'ventures', slug), scope, version });
    if (pkg.skip) skipped.push({ slug, reason: pkg.skip });
    else ok.push({ slug, ...pkg });
  }
  return { ok, skipped };
}

const exec = promisify(execFile);

/** Whether a registry document is a package this repository published (its repository URL names this repo). */
export const isOurs = (doc) => String(doc?.repository?.url ?? '').toLowerCase().includes('duncan-haywood/oss-monorepo');

export async function run({ env = process.env, fetchImpl = fetch, log = console.log, publish, root = REPO_ROOT, allow, versions } = {}) {
  const scope = env.NPM_SCOPE || '';
  const live = env.DISTRIBUTE_NPM === 'true' && !!env.NODE_AUTH_TOKEN;
  allow ??= await loadAllowlist(root);
  versions ??= await loadVersions(root);
  const slugs = [...allowed(allow, 'npm')].sort();
  const { ok, skipped } = await plan({ root, scope, slugs, versions });
  log(`${ok.length} of ${slugs.length} allow-listed CLIs qualify`);
  for (const s of skipped) log(`  skip ${s.slug}: ${s.reason}`);
  const fresh = [];
  for (const p of ok) {
    if (fresh.length >= MAX_PER_RUN) break;
    if (!versions[p.slug]) { log(`  skip ${p.slug}: no version in versions.json (run versions.mjs --write)`); continue; }
    const res = await fetchImpl(`https://registry.npmjs.org/${p.name.replace('/', '%2F')}`);
    if (res.status === 200) {
      const doc = await res.json();
      if (!isOurs(doc)) { log(`  skip ${p.name}: the name belongs to another project (set NPM_SCOPE to publish under a scope)`); continue; }
      if (doc.versions?.[p.version]) continue;
    } else if (res.status !== 404) throw new Error(`npm registry: HTTP ${res.status} for ${p.name}`);
    fresh.push(p);
  }
  if (!live) {
    log(`DRY RUN (set DISTRIBUTE_NPM=true and NODE_AUTH_TOKEN to publish). Would publish up to ${MAX_PER_RUN} new versions:`);
    for (const p of fresh) log(`  ${p.name}@${p.version}  ${Object.keys(p.files).length} files`);
    return { published: 0, planned: fresh.length };
  }
  const doPublish = publish ?? (async (dir) => exec('npm', ['publish', '--access', 'public', '--provenance'], { cwd: dir, env }));
  let published = 0;
  for (const p of fresh) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'npmpkg-'));
    try {
      await writePackage(p, dir);
      await doPublish(dir);
      published += 1;
      log(`published ${p.name}@${p.version}`);
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
    const pkg = await buildPackage({ slug, dir: path.join(REPO_ROOT, 'ventures', slug), scope: process.env.NPM_SCOPE || '', version });
    if (pkg.skip) { console.error(`${slug}: ${pkg.skip}`); process.exit(1); }
    await writePackage(pkg, outDir);
    console.log(`wrote ${pkg.name}@${pkg.version} to ${outDir}`);
  } else {
    run().catch((e) => { console.error(e.message); process.exit(1); });
  }
}
