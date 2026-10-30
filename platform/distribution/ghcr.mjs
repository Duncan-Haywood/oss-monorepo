/**
 * GHCR container images: each npm-allow-listed venture CLI (allowlist.json) also becomes
 * `ghcr.io/<owner>/<slug>:<version>`, so `docker run --rm -v "$PWD:/work" ghcr.io/<owner>/<slug> <args>`
 * works with no Node install. Off by default. See portfolio/distribution/README.md.
 *
 *   node platform/distribution/ghcr.mjs                          # dry run: lists the images it would push
 *   node platform/distribution/ghcr.mjs --pack <slug> <dir>      # writes the build context (Dockerfile + package)
 *   DISTRIBUTE_GHCR=true node platform/distribution/ghcr.mjs     # build and push (needs docker, a logged-in ghcr.io)
 *
 * Needs no account beyond this repository: the workflow logs in to ghcr.io with
 * the job's own GITHUB_TOKEN. Stateless: an image tag that already exists
 * (`docker manifest inspect`) is left alone, and at most MAX_PER_RUN new images
 * are pushed per run. The OCI source label links each package to this repository.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { plan, buildPackage, writePackage, VERSION } from './npm.mjs';
import { toolUrl } from './bluesky.mjs';
import { tagUrl } from './attribution.mjs';
import { allowed, loadAllowlist, loadVersions } from './versions.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const REPO_URL = 'https://github.com/Duncan-Haywood/oss-monorepo';
export const MAX_PER_RUN = 5;
export const BASE_IMAGE = 'node:22-alpine';

const exec = promisify(execFile);

/** Image reference for a slug, or null when the owner or slug cannot form a valid one. */
export function imageRef(owner, slug, version = VERSION) {
  const o = String(owner || '').toLowerCase();
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(o) || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) return null;
  return `ghcr.io/${o}/${slug}:${version}`;
}

const oneLine = (s) => s.replace(/[\r\n]+/g, ' ').replace(/"/g, "'").trim().slice(0, 300);

/** Dockerfile for one packaged venture CLI (the build context is the npm package directory). */
export function dockerfile({ slug, description, version = VERSION }) {
  return `FROM ${BASE_IMAGE}
LABEL org.opencontainers.image.title="${slug}" \\
      org.opencontainers.image.description="${oneLine(description)}" \\
      org.opencontainers.image.source="${REPO_URL}" \\
      org.opencontainers.image.url="${tagUrl(toolUrl(slug), 'ghcr')}" \\
      org.opencontainers.image.licenses="MIT" \\
      org.opencontainers.image.version="${version}"
COPY . /opt/tool
USER node
WORKDIR /work
ENTRYPOINT ["node", "/opt/tool/bin.mjs"]
`;
}

export const DOCKERIGNORE = 'Dockerfile\n.dockerignore\n';

/** Writes the build context for a built package. */
export async function writeContext(pkg, dir) {
  await writePackage(pkg, dir);
  const description = JSON.parse(pkg.files['package.json']).description;
  await fs.writeFile(path.join(dir, 'Dockerfile'), dockerfile({ slug: pkg.name, description, version: pkg.version }));
  await fs.writeFile(path.join(dir, '.dockerignore'), DOCKERIGNORE);
}

const dockerExists = async (ref) => exec('docker', ['manifest', 'inspect', ref]).then(() => true, () => false);

async function dockerBuildPush(ref, dir) {
  await exec('docker', ['build', '-t', ref, dir], { maxBuffer: 1 << 26 });
  await exec('docker', ['push', ref], { maxBuffer: 1 << 26 });
}

export async function run({ env = process.env, log = console.log, root = REPO_ROOT, exists = dockerExists, buildPush = dockerBuildPush, owner = env.GITHUB_REPOSITORY_OWNER || 'duncan-haywood', allow, versions } = {}) {
  const live = env.DISTRIBUTE_GHCR === 'true';
  allow ??= await loadAllowlist(root);
  versions ??= await loadVersions(root);
  const slugs = [...allowed(allow, 'npm')].sort();
  const { ok, skipped } = await plan({ root, slugs, versions });
  log(`${ok.length} of ${slugs.length} npm-allow-listed CLIs qualify (${skipped.length} skipped)`);
  const todo = [];
  for (const p of ok) {
    if (todo.length >= MAX_PER_RUN) break;
    const ref = imageRef(owner, p.name, p.version);
    if (!ref || await exists(ref)) continue;
    todo.push({ pkg: p, ref });
  }
  if (!live) {
    log(`DRY RUN (set DISTRIBUTE_GHCR=true, with docker logged in to ghcr.io, to push). Would push up to ${MAX_PER_RUN} new images:`);
    for (const t of todo) log(`  ${t.ref}  ${Object.keys(t.pkg.files).length} files`);
    return { pushed: 0, planned: todo.length };
  }
  let pushed = 0;
  for (const t of todo) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ghcr-'));
    try {
      await writeContext(t.pkg, dir);
      await buildPush(t.ref, dir);
      pushed += 1;
      log(`pushed ${t.ref}`);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
  return { pushed, planned: todo.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [flag, slug, outDir] = process.argv.slice(2);
  if (flag === '--pack') {
    const pkg = await buildPackage({ slug, dir: path.join(REPO_ROOT, 'ventures', slug) });
    if (pkg.skip) { console.error(`${slug}: ${pkg.skip}`); process.exit(1); }
    await writeContext(pkg, outDir);
    console.log(`wrote build context for ${imageRef(process.env.GITHUB_REPOSITORY_OWNER || 'duncan-haywood', pkg.name, pkg.version)} to ${outDir}`);
  } else {
    run().catch((e) => { console.error(e.message); process.exit(1); });
  }
}
