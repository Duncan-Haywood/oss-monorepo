#!/usr/bin/env node
// Publishes a build of the site (platform/pages/build.mjs output) to the
// private S3 bucket behind CloudFront, then invalidates the distribution.
//
//   node platform/aws/stacks/site/deploy/publish.mjs --dir platform/pages/dist \
//        --bucket <bucket_name> --distribution <distribution_id> [--dry-run]
//
// Credentials come from the environment (GitHub OIDC via
// aws-actions/configure-aws-credentials, role output publisher_role_arn).
// No long-lived keys.
//
// Layout. Cloudflare served the build with html_handling =
// "auto-trailing-slash" (platform/pages/served-path.mjs): "a/index.html" at
// "/a/", "a/b.html" at "/a/b", and "/a" redirected to "/a/". The site's
// canonical URLs, sitemaps and links use those served forms, so S3 must too:
//
//   a/index.html -> key "a/index.html"  (viewer-request maps "/a/" to it)
//   a/b.html     -> key "a/b"           (Content-Type text/html)
//   a/ (a dir)   -> key "a", an empty stub with x-amz-meta-dir-redirect,
//                   which viewer-response turns into a 307 to "/a/"
//   404.html     -> keys "404.html" (CloudFront's error page) and "404"
//   anything else keeps its path.
//
// Change detection. With SSE-S3 a single-part object's ETag is its MD5, so
// only files whose MD5 differs are uploaded, and keys no longer in the build
// are deleted (the bucket is versioned: a bad deploy is undone by restoring
// the previous versions). A deploy that would delete more than a quarter of
// the bucket stops unless --allow-mass-delete is given, so a broken or empty
// build cannot wipe the site.

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const STUB_META = 'dir-redirect';
export const EMPTY_MD5 = 'd41d8cd98f00b204e9800998ecf8427e';
export const MAX_DELETE_FRACTION = 0.25;
/** Files Cloudflare read as configuration, never served. */
export const SKIP = new Set(['_headers', '_redirects', '_routes.json']);
/** A build without these is not a site. */
export const REQUIRED = ['index.html', '404.html', 'version.json', 'sitemap.xml'];

const HTML = 'text/html; charset=utf-8';
const TYPES = {
  '.html': HTML,
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.ics': 'text/calendar; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.pdf': 'application/pdf',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.vtt': 'text/vtt; charset=utf-8',
  '.wasm': 'application/wasm',
  '.zip': 'application/zip',
  '.gz': 'application/gzip',
  '.rss': 'application/rss+xml; charset=utf-8',
  '.atom': 'application/atom+xml; charset=utf-8',
  '.geojson': 'application/geo+json; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
};

/** Browsers revalidate every time (as on Cloudflare: ETag + 304); the edge
 *  keeps a copy until the next deploy invalidates it. version.json is what
 *  verify-live.sh and check_site_fresh.py read, so the edge never keeps it. */
export function cacheControl(key) {
  if (key === 'version.json') return 'no-cache, s-maxage=0';
  return 'public, max-age=0, must-revalidate, s-maxage=31536000';
}

export function contentType(rel) {
  return TYPES[path.posix.extname(rel).toLowerCase()] ?? 'application/octet-stream';
}

/** The S3 keys a built file is published under. */
export function keysFor(rel) {
  if (rel === '404.html') return ['404.html', '404'];
  if (rel === 'index.html' || rel.endsWith('/index.html')) return [rel];
  if (rel.endsWith('.html')) return [rel.slice(0, -'.html'.length)];
  return [rel];
}

/**
 * The desired bucket contents for a list of built files.
 * files: [{ rel, md5 }] with POSIX relative paths.
 * Returns { objects: Map key -> { rel|null, md5, contentType, cacheControl, metadata }, warnings }.
 */
export function desired(files) {
  const objects = new Map();
  const warnings = [];
  const errors = [];
  for (const f of files) {
    if (SKIP.has(f.rel)) continue;
    for (const key of keysFor(f.rel)) {
      if (objects.has(key)) {
        errors.push(`two files publish to key "${key}": ${objects.get(key).rel} and ${f.rel}`);
        continue;
      }
      objects.set(key, {
        rel: f.rel,
        md5: f.md5,
        contentType: f.rel.endsWith('.html') ? HTML : contentType(f.rel),
        cacheControl: cacheControl(key),
        metadata: {},
      });
    }
  }
  for (const f of files) {
    if (!f.rel.endsWith('/index.html')) continue;
    const dir = f.rel.slice(0, -'/index.html'.length);
    if (objects.has(dir)) {
      // "a/b.html" and "a/b/index.html" both exist: "/a/b" serves the page,
      // as Cloudflare's auto-trailing-slash does, and "/a/b/" the index.
      warnings.push(`"/${dir}" serves ${objects.get(dir).rel}; ${f.rel} is reachable only at "/${dir}/"`);
      continue;
    }
    objects.set(dir, {
      rel: null,
      md5: EMPTY_MD5,
      contentType: HTML,
      cacheControl: 'public, max-age=300, s-maxage=31536000',
      metadata: { [STUB_META]: '1' },
    });
  }
  return { objects, warnings, errors };
}

/**
 * What to change. remote: Map key -> etag (quotes stripped).
 * Uploads are ordered so a page never names an asset that is not there yet:
 * assets first, then HTML, then directory stubs.
 */
export function plan(want, remote, { force = false, allowMassDelete = false } = {}) {
  const uploads = [];
  for (const [key, o] of want) {
    if (force || remote.get(key) !== o.md5) uploads.push({ key, ...o });
  }
  const rank = (u) => (u.rel === null ? 2 : u.contentType === HTML ? 1 : 0);
  uploads.sort((a, b) => rank(a) - rank(b) || a.key.localeCompare(b.key));
  const deletes = [...remote.keys()].filter((k) => !want.has(k)).sort();
  const problems = [];
  if (remote.size > 0 && deletes.length > remote.size * MAX_DELETE_FRACTION && !allowMassDelete) {
    problems.push(
      `would delete ${deletes.length} of ${remote.size} objects (over ${MAX_DELETE_FRACTION * 100}%); ` +
        'check the build, or pass --allow-mass-delete',
    );
  }
  return { uploads, deletes, problems };
}

export async function listBuild(dir) {
  const out = [];
  async function walk(d) {
    for (const e of await fs.readdir(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile()) {
        const rel = path.relative(dir, full).split(path.sep).join('/');
        const md5 = createHash('md5').update(await fs.readFile(full)).digest('hex');
        out.push({ rel, md5 });
      }
    }
  }
  await walk(dir);
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

async function pool(items, n, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

/**
 * Runs a publish. client: { list(bucket) -> Map key->etag,
 * put(bucket, key, body, { contentType, cacheControl, metadata }),
 * remove(bucket, keys), invalidate(distributionId, paths) -> id }.
 */
export async function publish({ dir, bucket, distribution, client, dryRun = false, force = false, allowMassDelete = false, log = console.log, concurrency = 32 }) {
  for (const r of REQUIRED) {
    if (!(await fs.stat(path.join(dir, r)).catch(() => null))) throw new Error(`${dir} has no ${r}: not a site build`);
  }
  const files = await listBuild(dir);
  const { objects, warnings, errors } = desired(files);
  for (const w of warnings) log(`warning: ${w}`);
  if (errors.length) throw new Error(errors.join('\n'));
  const remote = await client.list(bucket);
  const p = plan(objects, remote, { force, allowMassDelete });
  log(`${files.length} built files -> ${objects.size} keys; bucket holds ${remote.size}; ` +
    `${p.uploads.length} to upload, ${p.deletes.length} to delete`);
  if (p.problems.length) throw new Error(p.problems.join('\n'));
  if (dryRun) {
    for (const u of p.uploads.slice(0, 50)) log(`  put ${u.key}`);
    for (const d of p.deletes.slice(0, 50)) log(`  delete ${d}`);
    return { ...p, invalidation: null };
  }
  // Each rank finishes before the next starts (assets, HTML, stubs).
  for (const rank of [0, 1, 2]) {
    const batch = p.uploads.filter((u) => (u.rel === null ? 2 : u.contentType === HTML ? 1 : 0) === rank);
    await pool(batch, concurrency, async (u) => {
      const body = u.rel === null ? Buffer.alloc(0) : await fs.readFile(path.join(dir, u.rel));
      await client.put(bucket, u.key, body, { contentType: u.contentType, cacheControl: u.cacheControl, metadata: u.metadata });
    });
  }
  for (let i = 0; i < p.deletes.length; i += 1000) await client.remove(bucket, p.deletes.slice(i, i + 1000));
  // One wildcard path: free (first 1,000 paths a month), and every deploy
  // changes version.json anyway.
  let invalidation = null;
  if (p.uploads.length || p.deletes.length) invalidation = await client.invalidate(distribution, ['/*']);
  log(`published: ${p.uploads.length} uploaded, ${p.deletes.length} deleted, invalidation ${invalidation ?? 'not needed'}`);
  return { ...p, invalidation };
}

function args(argv) {
  const a = { dryRun: false, force: false, allowMassDelete: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--dry-run') a.dryRun = true;
    else if (k === '--force') a.force = true;
    else if (k === '--allow-mass-delete') a.allowMassDelete = true;
    else if (k === '--dir' || k === '--bucket' || k === '--distribution') a[k.slice(2)] = argv[++i];
    else throw new Error(`unknown argument ${k}`);
  }
  if (!a.dir || !a.bucket || !a.distribution) throw new Error('usage: publish.mjs --dir DIR --bucket BUCKET --distribution ID [--dry-run] [--force] [--allow-mass-delete]');
  return a;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const a = args(process.argv.slice(2));
    const { sdkClient } = await import('./sdk.mjs');
    await publish({ ...a, client: await sdkClient() });
  } catch (e) {
    console.error(`::error::${e.message}`);
    process.exit(1);
  }
}
