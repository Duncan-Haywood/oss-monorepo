/**
 * Allow-list and versions for the registry and release channels. See
 * portfolio/distribution/README.md, "Allow-list and versions".
 *
 *   node platform/distribution/versions.mjs            # print each allow-listed tool's version and whether it moved
 *   node platform/distribution/versions.mjs --write    # bump the version of every tool whose shipped files changed
 *   node platform/distribution/versions.mjs --check    # exit 1 when versions.json is stale
 *
 * A tool's version follows what it ships, not what was edited near it: the
 * hash covers the files each of its channels would publish (built at a
 * placeholder version, so the version itself is not hashed), plus its
 * composite action and its `bundle` output where those exist. Editing a test
 * or a page leaves the version alone; editing the shipped CLI bumps the patch.
 * For a minor or major release, run --write and then raise `version` by hand:
 * --check compares hashes only, so a raised version stands until the next change.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { buildPackage as npmPackage } from './npm.mjs';
import { buildPackage as pypiPackage } from './pypi.mjs';
import { discover as pyprojectVentures } from './pypi-packages.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const exec = promisify(execFile);
export const ALLOWLIST = 'portfolio/distribution/allowlist.json';
export const VERSIONS = 'portfolio/distribution/versions.json';
export const CHANNELS = ['release', 'npm', 'pypi', 'pypi-packages'];
export const FIRST_VERSION = '0.1.0';
const PLACEHOLDER = '0.0.0';
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,99}$/;
const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

/** Tools whose release carries an archive, and how to build it into `out`. */
export const BUNDLERS = {
  'devsec-toolkit': async (root, out) => {
    await exec('python3', [path.join(root, 'ventures/devsec-toolkit/devsec.py'), 'bundle', out], { cwd: root });
  },
};

/** `VERSION = "x"` in a bundled runner is stamped at release time, so it is not hashed. */
export const unstamp = (rel, text) => (/\.py$/.test(rel) ? text.replace(/^VERSION = "[^"]*"$/m, `VERSION = "${PLACEHOLDER}"`) : text);
export const stamp = (text, version) => text.replace(/^VERSION = "[^"]*"$/m, `VERSION = "${version}"`);

/** Validated allow-list: { tools: [{ slug, channels, why }], bySlug: Map }. Throws on a malformed entry. */
export function parseAllowlist(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  const tools = data.tools ?? [];
  const bySlug = new Map();
  for (const t of tools) {
    if (!SLUG_RE.test(t.slug ?? '')) throw new Error(`allowlist: invalid slug ${JSON.stringify(t.slug)}`);
    if (bySlug.has(t.slug)) throw new Error(`allowlist: ${t.slug} is listed twice`);
    if (!Array.isArray(t.channels) || !t.channels.length) throw new Error(`allowlist: ${t.slug} names no channel`);
    for (const c of t.channels) if (!CHANNELS.includes(c)) throw new Error(`allowlist: ${t.slug} names unknown channel ${c}`);
    if (!t.why) throw new Error(`allowlist: ${t.slug} says nothing about why it is published`);
    bySlug.set(t.slug, t);
  }
  return { tools, bySlug };
}

export async function loadAllowlist(root = REPO_ROOT) {
  return parseAllowlist(await fs.readFile(path.join(root, ALLOWLIST), 'utf8'));
}

/** Slugs allow-listed for `channel`. */
export const allowed = (allow, channel) => new Set(allow.tools.filter((t) => t.channels.includes(channel)).map((t) => t.slug));

export async function loadVersions(root = REPO_ROOT) {
  const text = await fs.readFile(path.join(root, VERSIONS), 'utf8').catch(() => null);
  return text === null ? {} : JSON.parse(text).tools ?? {};
}

export function bumpPatch(version) {
  const m = SEMVER_RE.exec(version);
  if (!m) throw new Error(`not a version: ${version}`);
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
}

async function readTree(dir, prefix = '') {
  const out = {};
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (e.name === '__pycache__' || e.name === '.pytest_cache' || e.name.endsWith('.pyc')) continue;
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) Object.assign(out, await readTree(path.join(dir, e.name), rel));
    else if (e.isFile()) out[rel] = await fs.readFile(path.join(dir, e.name), 'utf8');
  }
  return out;
}

/** Build `slug`'s bundle into a fresh temporary directory; the caller removes it. */
export async function buildBundle(root, slug) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `bundle-${slug}-`));
  await BUNDLERS[slug](root, dir);
  return dir;
}

/**
 * Every file `slug` ships on its allow-listed channels, keyed `<part>:<path>`,
 * or { skip } when a channel's builder refuses it.
 */
export async function payload(root, tool) {
  const { slug } = tool;
  const dir = path.join(root, 'ventures', slug);
  const files = {};
  const add = (part, entries) => { for (const [rel, text] of Object.entries(entries)) files[`${part}:${rel}`] = text; };
  for (const channel of tool.channels) {
    if (channel === 'npm') {
      const pkg = await npmPackage({ slug, dir, version: PLACEHOLDER });
      if (pkg.skip) return { skip: `npm: ${pkg.skip}` };
      add('npm', pkg.files);
    } else if (channel === 'pypi') {
      const pkg = await pypiPackage({ slug, dir, version: PLACEHOLDER });
      if (pkg.skip) return { skip: `pypi: ${pkg.skip}` };
      add('pypi', pkg.files);
    } else if (channel === 'pypi-packages') {
      const p = (await pyprojectVentures(root)).ok.find((v) => v.slug === slug);
      if (!p) return { skip: 'pypi-packages: does not qualify (see pypi-packages.mjs dry run)' };
      const toml = p.toml.replace(/^version\s*=\s*"[^"]*"/m, `version = "${PLACEHOLDER}"`);
      add('pypi-packages', { 'pyproject.toml': toml, LICENSE: await fs.readFile(path.join(dir, 'LICENSE'), 'utf8'), 'README.md': await fs.readFile(path.join(dir, 'README.md'), 'utf8') });
      add('pypi-packages', Object.fromEntries(Object.entries(await readTree(path.join(dir, 'src'))).map(([k, v]) => [`src/${k}`, v])));
    }
  }
  if (tool.channels.includes('release')) {
    const action = await fs.readFile(path.join(root, 'platform/distribution/actions', slug, 'action.yml'), 'utf8').catch(() => null);
    if (action !== null) {
      add('action', { 'action.yml': action, 'check.py': await fs.readFile(path.join(dir, 'check.py'), 'utf8') });
    }
    if (BUNDLERS[slug]) {
      const out = await buildBundle(root, slug);
      try {
        const tree = await readTree(out);
        add('bundle', Object.fromEntries(Object.entries(tree).map(([rel, text]) => [rel, unstamp(rel, text)])));
      } finally {
        await fs.rm(out, { recursive: true, force: true });
      }
    }
  }
  if (!Object.keys(files).length) return { skip: 'ships nothing: a release-only tool needs a composite action or a bundler' };
  return { files };
}

export function hashFiles(files) {
  const h = crypto.createHash('sha256');
  for (const key of Object.keys(files).sort()) h.update(`${key}\0${files[key]}\0`);
  return `sha256-${h.digest('hex')}`;
}

/** Next manifest from the current one and the fresh hashes ({ slug: hash }). */
export function nextVersions(prev, hashes) {
  const out = {};
  for (const slug of Object.keys(hashes).sort()) {
    const old = prev[slug];
    if (!old) out[slug] = { version: FIRST_VERSION, hash: hashes[slug] };
    else if (old.hash === hashes[slug]) out[slug] = { version: old.version, hash: old.hash };
    else out[slug] = { version: bumpPatch(old.version), hash: hashes[slug] };
  }
  return out;
}

/** Current hash for every allow-listed tool; throws listing every tool that cannot be built. */
export async function hashAll(root = REPO_ROOT, allow) {
  allow ??= await loadAllowlist(root);
  const hashes = {};
  const broken = [];
  for (const tool of allow.tools) {
    const p = await payload(root, tool);
    if (p.skip) broken.push(`${tool.slug}: ${p.skip}`);
    else hashes[tool.slug] = hashFiles(p.files);
  }
  if (broken.length) throw new Error(`allow-listed tools that cannot be packaged:\n  ${broken.join('\n  ')}`);
  return hashes;
}

export function render(tools) {
  return `${JSON.stringify({
    about: 'Generated by `node platform/distribution/versions.mjs --write`. The version of each allow-listed tool; the patch number rises when the files it ships change. To cut a minor or major release, run --write, then raise `version` here by hand.',
    tools,
  }, null, 2)}\n`;
}

/** Differences between the committed manifest and a fresh one, as readable lines. */
export function staleness(prev, next) {
  const lines = [];
  for (const slug of Object.keys(next)) {
    if (!prev[slug]) lines.push(`${slug}: not in versions.json`);
    else if (prev[slug].hash !== next[slug].hash) lines.push(`${slug}: shipped files changed (${prev[slug].version} -> ${next[slug].version})`);
  }
  for (const slug of Object.keys(prev)) if (!next[slug]) lines.push(`${slug}: no longer allow-listed`);
  return lines;
}

export async function main(argv = process.argv.slice(2), { root = REPO_ROOT, log = console.log } = {}) {
  const prev = await loadVersions(root);
  const next = nextVersions(prev, await hashAll(root));
  const stale = staleness(prev, next);
  if (argv.includes('--write')) {
    await fs.writeFile(path.join(root, VERSIONS), render(next));
    log(stale.length ? `updated ${VERSIONS}:\n  ${stale.join('\n  ')}` : `${VERSIONS} already current`);
    return 0;
  }
  if (argv.includes('--check')) {
    if (!stale.length) { log(`${VERSIONS} is current (${Object.keys(next).length} tools)`); return 0; }
    log(`${VERSIONS} is stale:\n  ${stale.join('\n  ')}\nRun: node platform/distribution/versions.mjs --write`);
    return 1;
  }
  for (const [slug, v] of Object.entries(next)) log(`${slug}@${v.version}${prev[slug]?.hash === v.hash ? '' : '  (moved)'}`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code), (e) => { console.error(e.message); process.exit(1); });
}
