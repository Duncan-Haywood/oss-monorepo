#!/usr/bin/env node
// Moves router.mjs's SHARD_DIRS out of the built site into the shard Worker's
// asset directory, copies 404.html beside them, and checks both halves fit the
// free plan: at most 20,000 files per Worker and 25 MiB per file. It also
// writes the site Worker's _headers, which sends visitors on the workers.dev
// address to the domain. The shard's share cards are packed into a few
// hundred files first (cardpack.mjs), which is most of its headroom.
//
//   node platform/pages/cloudflare/split.mjs platform/pages/dist platform/pages/dist-shard

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SHARD_DIRS, SITE_ORIGIN, WORKERS_DEV_HOST } from './router.mjs';
import { SECURITY_HEADERS } from './security-headers.mjs';
import { packCards } from './cardpack-build.mjs';

export { SECURITY_HEADERS };

export const MAX_FILES = 20000;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

async function survey(dir) {
  let files = 0;
  const big = [];
  async function walk(d) {
    for (const e of await fs.readdir(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else {
        files++;
        if ((await fs.stat(full)).size > MAX_FILE_BYTES) big.push(path.relative(dir, full));
      }
    }
  }
  await walk(dir);
  return { files, big };
}

/** A _headers rule for the workers.dev address only. Static files there are
 *  served without running the router (run_worker_first lists only the shard
 *  directories, which keeps them unmetered), so a Worker 301 cannot reach
 *  them; browsers follow a `Refresh` header instead, and `noindex` keeps the
 *  address out of search results. :splat carries the path across. */
export function workersDevHeaders() {
  return `https://${WORKERS_DEV_HOST}/*\n` +
    `  Refresh: 0; url=${SITE_ORIGIN}/:splat\n` +
    `  X-Robots-Tag: noindex\n`;
}

/** Baseline response headers for every static file, on both Workers. Before
 *  2026-11-10 the site sent none (quality audit, portfolio/quality/audits/
 *  2026-11-10-platform-pages-cloudflare.json). Deliberately left out:
 *  frame protection (X-Frame-Options, frame-ancestors), because the tools
 *  are meant to be embedded on other sites (embed.mjs), and a Content-
 *  Security-Policy, which needs an inventory of every page's inline scripts
 *  and endpoints first. HSTS omits includeSubDomains and preload: both are
 *  hard to undo, and no subdomain is served yet. */
export function securityHeaders() {
  return '/*\n' + Object.entries(SECURITY_HEADERS).map(([k, v]) => `  ${k}: ${v}\n`).join('');
}

/** File types a browser may reuse for a day without asking again. Every file
 *  on the site used to answer `public, max-age=0, must-revalidate` (Workers'
 *  default; docs/reports/2026-11-07-live-site-measurements.md), so a repeat
 *  view revalidated each icon, font and picture: one round trip apiece. These
 *  types are safe to cache because a stale one never breaks a page; at worst
 *  an edited picture shows its old version for a day. HTML, CSS, scripts and
 *  modules are deliberately absent: new HTML importing an old cached module
 *  can break the page, so they wait for content-hashed URLs
 *  (portfolio/work/tasks.yaml, site-perf-hashed-modules). Lower and upper
 *  case are both listed because _headers paths match case-sensitively. */
export const LONG_CACHE_EXTENSIONS = Object.freeze([
  'png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'svg', 'ico',
  'woff2', 'woff', 'ttf', 'otf',
  'mp3', 'mp4', 'webm',
]);
export const LONG_CACHE_CONTROL = 'public, max-age=86400, stale-while-revalidate=604800';

/** One _headers rule per extension. A splat matches any path, so `/*.png`
 *  reaches every PNG at any depth. Cloudflare allows 100 rules per file. */
export function assetCacheHeaders() {
  const exts = [...new Set(LONG_CACHE_EXTENSIONS.flatMap((e) => [e, e.toUpperCase()]))];
  return exts.map((e) => `/*.${e}\n  Cache-Control: ${LONG_CACHE_CONTROL}\n`).join('');
}

export async function split(siteDir, shardDir) {
  await fs.mkdir(shardDir, { recursive: true });
  for (const d of SHARD_DIRS) {
    const from = path.join(siteDir, d);
    if (await fs.stat(from).catch(() => null)) await fs.rename(from, path.join(shardDir, d));
  }
  await fs.copyFile(path.join(siteDir, '404.html'), path.join(shardDir, '404.html'));
  // One file per page's share card filled the shard; pack them (cardpack.mjs).
  const packed = await packCards(shardDir);
  const site = await survey(siteDir);
  const shard = await survey(shardDir);
  // After the count: Cloudflare reads _headers as configuration, not an asset.
  await fs.writeFile(path.join(siteDir, '_headers'), workersDevHeaders() + securityHeaders() + assetCacheHeaders());
  // The shard serves its own assets, so its responses need the rules too.
  await fs.writeFile(path.join(shardDir, '_headers'), securityHeaders() + assetCacheHeaders());
  const problems = [];
  for (const [name, s] of [['site', site], ['shard', shard]]) {
    if (s.files > MAX_FILES) problems.push(`${name}: ${s.files} files, over the free plan's ${MAX_FILES}`);
    for (const f of s.big) problems.push(`${name}: ${f} is over 25 MiB`);
  }
  return { site: site.files, shard: shard.files, problems, packed };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [siteDir, shardDir] = process.argv.slice(2);
  if (!siteDir || !shardDir) {
    console.error('usage: split.mjs <built-site-dir> <shard-dir>');
    process.exit(2);
  }
  const r = await split(siteDir, shardDir);
  console.log(`site Worker: ${r.site} files; shard Worker: ${r.shard} files (limit ${MAX_FILES} each)`);
  console.log(`shard share cards: ${r.packed.cards} packed into ${r.packed.packs} file(s)`);
  for (const p of r.problems) console.log(`::error::${p}`);
  for (const [name, n] of [['site', r.site], ['shard', r.shard]]) {
    if (n > MAX_FILES * 0.9 && n <= MAX_FILES) console.log(`::warning::the ${name} Worker holds ${n} of ${MAX_FILES} files; move another directory into SHARD_DIRS (router.mjs)`);
  }
  process.exit(r.problems.length ? 1 : 0);
}
