/**
 * Versioned tool releases: one git tag `<slug>-v<version>` and one GitHub
 * release per allow-listed tool version, so a user can pin
 *
 *   uses: duncan-haywood/oss-monorepo/platform/distribution/actions/<slug>@<slug>-v0.1.0
 *   rev: <slug>-v0.1.0            (pre-commit)
 *
 * instead of following @main. A tool with a bundler (devsec-toolkit) also gets
 * its bundle attached as `<slug>-<version>.tar.gz`, with the SHA-256 in the
 * notes. Off by default. See portfolio/distribution/README.md, "Allow-list and versions".
 *
 *   node platform/distribution/tool-releases.mjs     # dry run: prints the releases it would create
 *   DISTRIBUTE_TOOL_RELEASES=true GITHUB_TOKEN=... GITHUB_REPOSITORY=o/r GITHUB_SHA=... GITHUB_REF=refs/heads/main \
 *     node platform/distribution/tool-releases.mjs
 *
 * Versions come from versions.json (versions.mjs). A run refuses to tag when
 * that file is stale, so a tag always points at a commit whose shipped files
 * hash to what the manifest says. Stateless de-duplication: a release that
 * already has its tag is left alone, and at most MAX_PER_RUN go out per run.
 * It only tags main.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { descriptionOf } from './npm.mjs';
import { BUNDLERS, buildBundle, hashAll, loadAllowlist, loadVersions, stamp, staleness, nextVersions } from './versions.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const exec = promisify(execFile);
export const MAX_PER_RUN = 5;
const REPO = 'duncan-haywood/oss-monorepo';

export const tagFor = (slug, version) => `${slug}-v${version}`;

/** Hook ids in `.pre-commit-hooks.yaml`. */
export const hookIds = (yaml) => new Set([...yaml.matchAll(/^- id:\s*(\S+)/gm)].map((m) => m[1]));

/**
 * Title and markdown notes for one release. `live` names the registry
 * channels that are switched on, so the notes never offer an install line
 * for a package that is not published.
 */
export function composeNotes({ slug, version, hash, description, channels, hasAction, hasHook, asset, live = {} }) {
  const tag = tagFor(slug, version);
  const lines = [description, '', `Version ${version} of \`${slug}\`. Pin it:`, ''];
  if (hasAction) lines.push(`- GitHub Actions: \`uses: ${REPO}/platform/distribution/actions/${slug}@${tag}\``);
  if (hasHook) lines.push(`- pre-commit: \`repo: https://github.com/${REPO}\`, \`rev: ${tag}\`, hook id \`${slug}\``);
  if (channels.includes('npm') && live.npm) lines.push(`- npm: \`npx ${slug}@${version}\``);
  if ((channels.includes('pypi') || channels.includes('pypi-packages')) && live.pypi) lines.push(`- PyPI: \`pipx run ${slug}==${version}\``);
  if (asset) lines.push(`- Download: \`${asset.name}\` (attached), SHA-256 \`${asset.sha256}\`; unpack it and run \`python3 devsec.py scan .\``);
  lines.push(`- Source at this version: https://github.com/${REPO}/tree/${tag}/ventures/${slug}`);
  lines.push('', `Content hash of the shipped files: \`${hash}\` (\`platform/distribution/versions.mjs\`).`);
  lines.push('', 'Free and open source (MIT). Findings are observations to review, not a security guarantee or professional advice.');
  lines.push('This release was created automatically from `portfolio/distribution/versions.json`.');
  return { tag, name: `${slug} ${version}`, body: lines.join('\n') };
}

/** Pending releases for every allow-listed `release` tool, in allow-list order. */
export async function plan({ root = REPO_ROOT, allow, versions, bundlers = BUNDLERS } = {}) {
  allow ??= await loadAllowlist(root);
  versions ??= await loadVersions(root);
  const hooks = hookIds(await fs.readFile(path.join(root, '.pre-commit-hooks.yaml'), 'utf8').catch(() => ''));
  const out = [];
  for (const tool of allow.tools) {
    if (!tool.channels.includes('release')) continue;
    const v = versions[tool.slug];
    if (!v) continue;
    const yaml = await fs.readFile(path.join(root, 'ventures', tool.slug, 'VENTURE.yaml'), 'utf8').catch(() => '');
    const hasAction = await fs.stat(path.join(root, 'platform/distribution/actions', tool.slug, 'action.yml')).then(() => true, () => false);
    out.push({
      slug: tool.slug, channels: tool.channels, version: v.version, hash: v.hash, tag: tagFor(tool.slug, v.version),
      description: descriptionOf(yaml) || tool.why, hasAction, hasHook: hooks.has(tool.slug), bundled: !!bundlers[tool.slug],
    });
  }
  return out;
}

/** Build `slug`'s bundle, stamped with `version`, as a .tar.gz: { name, bytes, sha256 }. */
export async function buildAsset(root, slug, version) {
  const dir = await buildBundle(root, slug);
  try {
    for (const rel of await fs.readdir(dir)) {
      if (!rel.endsWith('.py')) continue;
      const file = path.join(dir, rel);
      await fs.writeFile(file, stamp(await fs.readFile(file, 'utf8'), version));
    }
    const name = `${slug}-${version}.tar.gz`;
    const out = path.join(path.dirname(dir), name);
    // --transform puts every file under <slug>-<version>/ so unpacking never spills into the cwd.
    await exec('tar', ['-czf', out, '--sort=name', '--owner=0', '--group=0', '--numeric-owner', '--mtime=@0', `--transform=s,^\\.,${slug}-${version},`, '-C', dir, '.']);
    const bytes = await fs.readFile(out);
    await fs.rm(out, { force: true });
    return { name, bytes, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function gh(fetchImpl, token, method, url, body, { base = 'https://api.github.com', type = 'application/json' } = {}) {
  return fetchImpl(`${base}${url}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'content-type': type,
    },
    body: body === undefined ? undefined : type === 'application/json' ? JSON.stringify(body) : body,
  });
}

export async function run({ env = process.env, fetchImpl = fetch, log = console.log, root = REPO_ROOT, allow, versions, asset = buildAsset, bundlers = BUNDLERS } = {}) {
  allow ??= await loadAllowlist(root);
  versions ??= await loadVersions(root);
  const stale = staleness(versions, nextVersions(versions, await hashAll(root, allow)));
  if (stale.length) throw new Error(`versions.json is stale, refusing to tag:\n  ${stale.join('\n  ')}\nRun: node platform/distribution/versions.mjs --write`);
  const repo = env.GITHUB_REPOSITORY;
  const token = env.GITHUB_TOKEN;
  const onMain = env.GITHUB_REF === 'refs/heads/main';
  const live = env.DISTRIBUTE_TOOL_RELEASES === 'true' && !!token && !!env.GITHUB_SHA && onMain && /^[\w.-]+\/[\w.-]+$/.test(repo || '');
  const registries = { npm: env.DISTRIBUTE_NPM === 'true', pypi: env.DISTRIBUTE_PYPI === 'true' };
  const pending = await plan({ root, allow, versions, bundlers });
  const fresh = [];
  for (const r of pending) {
    if (fresh.length >= MAX_PER_RUN) break;
    if (live) {
      const seen = await gh(fetchImpl, token, 'GET', `/repos/${repo}/releases/tags/${encodeURIComponent(r.tag)}`);
      if (seen.ok) continue;
      if (seen.status !== 404) throw new Error(`releases: HTTP ${seen.status} for ${r.tag}`);
    }
    fresh.push(r);
  }
  if (!live) {
    log(`DRY RUN (set DISTRIBUTE_TOOL_RELEASES=true; runs only on main with GITHUB_TOKEN). ${pending.length} allow-listed tools; the first ${fresh.length} without a release:`);
    for (const r of fresh) log(`  ${r.tag}${r.hasAction ? '  action' : ''}${r.hasHook ? '  pre-commit' : ''}${r.bundled ? '  +archive' : ''}`);
    return { released: 0, planned: fresh.length };
  }
  let released = 0;
  for (const r of fresh) {
    const file = r.bundled ? await asset(root, r.slug, r.version) : null;
    const notes = composeNotes({ ...r, asset: file && { name: file.name, sha256: file.sha256 }, live: registries });
    // A draft until its archive is attached, so nobody sees a release with a missing download.
    const res = await gh(fetchImpl, token, 'POST', `/repos/${repo}/releases`, {
      tag_name: notes.tag, name: notes.name, body: notes.body, target_commitish: env.GITHUB_SHA, draft: !!file,
    });
    if (!res.ok) throw new Error(`releases: HTTP ${res.status} creating ${notes.tag}`);
    const rel = await res.json();
    if (file) {
      const up = await gh(fetchImpl, token, 'POST', `/repos/${repo}/releases/${rel.id}/assets?name=${encodeURIComponent(file.name)}`, file.bytes, { base: 'https://uploads.github.com', type: 'application/gzip' });
      if (!up.ok) throw new Error(`releases: HTTP ${up.status} uploading ${file.name}`);
      const pub = await gh(fetchImpl, token, 'PATCH', `/repos/${repo}/releases/${rel.id}`, { draft: false });
      if (!pub.ok) throw new Error(`releases: HTTP ${pub.status} publishing ${notes.tag}`);
    }
    released += 1;
    log(`released ${notes.tag}`);
  }
  return { released, planned: fresh.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((e) => { console.error(e.message); process.exit(1); });
}
