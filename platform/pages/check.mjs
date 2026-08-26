// Check a built Pages artifact before it is allowed to publish.
//
// `build.mjs` can succeed and still produce a site that is broken for a reader
// or a crawler, because the defect is created by the *copy*, not by the sources
// — so no unit test over `ventures/` can see it. That is not hypothetical.
// Measured against the build as it stood before the sitemap fix in `build.mjs`,
// of 184 sitemap entries:
//
//   * 55 were not absolute URLs (bare `index.html`, `./`), which the sitemaps
//     protocol does not allow and a crawler discards;
//   * 11 advertised a URL that 404s, because `3pl-quote-normalizer` and
//     `invoice-payment-terms-calculator` spell their committed paths with the
//     repo's own `ventures/` segment and the origin rewrite preserved it;
//   *  3 named a URL on another host.
//
// Separately, 72 of 187 served pages were in no sitemap at all. All of it is
// fixed in `build.mjs` by generating sitemaps from the output; this is the
// guard that stops the class of defect coming back.
//
// Fails on:
//   * a missing top-level file (index, sitemap, robots, 404)
//   * any `example.invalid` left in a served file
//   * a relative href/src/import that resolves to nothing
//   * a link that escapes the site root
//   * a product directory with no landing page
//   * a sitemap (or sitemap-index child) naming a URL that is not served
//   * a served page in no sitemap
//
// Usage:  node platform/pages/check.mjs [dist]

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const PLACEHOLDER_ORIGIN = 'https://example.invalid';
const REQUIRED_ROOT_FILES = ['index.html', 'sitemap.xml', 'robots.txt', '404.html'];
const TEXT_EXTENSIONS = new Set(['.html', '.xml', '.txt', '.mjs', '.js', '.css', '.json']);
const LINKABLE_EXTENSIONS = new Set(['.html', '.mjs', '.js']);
const EXTERNAL = /^(https?:|mailto:|tel:|data:|javascript:|\/\/|#)/i;

const REFERENCE = /(?:href|src)\s*=\s*"([^"]+)"/g;
const IMPORT = /\bfrom\s+"(\.{1,2}\/[^"]+)"/g;
const LOC = /<loc>([^<]+)<\/loc>/g;

const exists = async (p) => !!(await fs.stat(p).catch(() => null));

async function walk(dir, root = dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full, root)));
    else if (entry.isFile()) out.push(path.relative(root, full));
  }
  return out;
}

const matches = (text, pattern) => [...text.matchAll(pattern)].map((m) => m[1]);

/**
 * Classify one sitemap `<loc>`.
 *
 * Three distinct failures, kept distinct because the fix for each differs and a
 * diagnostic that blurs them sends the reader to the wrong place:
 *
 *   `malformed`  — not an absolute URL. Several committed venture sitemaps hold
 *                  bare `index.html` or `./`, which the sitemaps protocol does
 *                  not allow; a crawler discards the entry.
 *   `foreign`    — an absolute URL on some other host, which does not belong in
 *                  this origin's sitemap.
 *   `missing`    — same origin, but nothing is served there: an advertised 404.
 */
function classifyLoc(loc, site, origin, baseUrlPath) {
  let url;
  try {
    url = new URL(loc);
  } catch {
    return { kind: 'malformed' };
  }
  if (url.origin !== origin) return { kind: 'foreign' };
  if (!url.pathname.startsWith(baseUrlPath)) return { kind: 'missing' };

  const relative = url.pathname.slice(baseUrlPath.length);
  const target = path.join(site, relative);
  return {
    kind: 'resolved',
    page: relative,
    file: relative === '' || relative.endsWith('/') ? path.join(target, 'index.html') : target,
  };
}

/** The origin and path prefix this artifact will be served from, per its own robots.txt. */
async function siteOrigin(site, fallback) {
  const robots = await fs.readFile(path.join(site, 'robots.txt'), 'utf8').catch(() => '');
  const declared = robots.match(/^Sitemap:\s*(\S+)/im)?.[1];
  try {
    const url = new URL(declared ?? fallback);
    return { origin: url.origin, baseUrlPath: url.pathname.replace(/sitemap\.xml$/, '') };
  } catch {
    const url = new URL(fallback);
    return { origin: url.origin, baseUrlPath: url.pathname };
  }
}

/** The canonical site-relative URL for a served page, matching what we publish. */
function canonicalFor(relativePath) {
  const posix = relativePath.split(path.sep).join('/');
  if (posix === 'index.html') return '';
  if (posix.endsWith('/index.html')) return posix.slice(0, -'index.html'.length);
  return posix;
}

const FALLBACK_BASE = 'https://duncan-haywood.github.io/monorepo-projects/';

export async function checkSite(site, { baseUrl = FALLBACK_BASE } = {}) {
  const problems = [];
  if (!(await exists(site))) return [`${site} does not exist — run build.mjs first`];
  const { origin, baseUrlPath } = await siteOrigin(site, baseUrl);

  for (const required of REQUIRED_ROOT_FILES) {
    if (!(await exists(path.join(site, required)))) problems.push(`missing required file: ${required}`);
  }

  const entries = await fs.readdir(site, { withFileTypes: true });
  const productDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  if (productDirs.length === 0) problems.push('no product directories in the artifact');
  for (const dir of productDirs) {
    if (!(await exists(path.join(site, dir, 'index.html')))) problems.push(`${dir}/ has no index.html`);
  }

  const files = await walk(site);
  const servedPages = new Set();

  for (const relative of files) {
    const extension = path.extname(relative).toLowerCase();
    if (!TEXT_EXTENSIONS.has(extension)) continue;

    const full = path.join(site, relative);
    const text = await fs.readFile(full, 'utf8');
    const posix = relative.split(path.sep).join('/');

    if (text.includes(PLACEHOLDER_ORIGIN)) problems.push(`${posix}: still contains ${PLACEHOLDER_ORIGIN}`);
    if (extension === '.html' && posix !== '404.html') servedPages.add(canonicalFor(relative));
    if (!LINKABLE_EXTENSIONS.has(extension)) continue;

    for (const target of [...matches(text, REFERENCE), ...matches(text, IMPORT)]) {
      if (EXTERNAL.test(target)) continue;
      const cleaned = decodeURIComponent(target.split('#')[0].split('?')[0]);
      if (!cleaned) continue;

      const resolved = path.resolve(path.dirname(full), cleaned);
      if (!resolved.startsWith(path.resolve(site))) {
        problems.push(`${posix}: link escapes the site root -> ${target}`);
        continue;
      }
      const stat = await fs.stat(resolved).catch(() => null);
      const finalTarget = stat?.isDirectory() ? path.join(resolved, 'index.html') : resolved;
      if (!(await exists(finalTarget))) problems.push(`${posix}: dead link -> ${target}`);
    }
  }

  // Sitemaps: follow one level of <sitemapindex>, then verify every URL serves.
  const indexText = await fs.readFile(path.join(site, 'sitemap.xml'), 'utf8').catch(() => '');
  const isIndex = indexText.includes('<sitemapindex');
  const sitemapFiles = ['sitemap.xml'];

  if (isIndex) {
    for (const child of matches(indexText, LOC)) {
      const result = classifyLoc(child, site, origin, baseUrlPath);
      if (result.kind !== 'resolved' || !(await exists(result.file))) {
        problems.push(`sitemap.xml: names a child sitemap that is not served -> ${child}`);
        continue;
      }
      sitemapFiles.push(path.relative(site, result.file).split(path.sep).join('/'));
    }
  }

  const advertised = new Set();
  for (const sitemap of sitemapFiles) {
    const text = await fs.readFile(path.join(site, sitemap), 'utf8').catch(() => '');
    if (text.includes('<sitemapindex')) continue; // children already expanded
    for (const loc of matches(text, LOC)) {
      const result = classifyLoc(loc, site, origin, baseUrlPath);
      if (result.kind === 'malformed') {
        problems.push(`${sitemap}: <loc> is not an absolute URL, crawlers discard it -> ${loc}`);
      } else if (result.kind === 'foreign') {
        problems.push(`${sitemap}: names a URL on another host -> ${loc}`);
      } else if (result.kind === 'missing' || !(await exists(result.file))) {
        problems.push(`${sitemap}: advertises a URL that 404s -> ${loc}`);
      } else {
        advertised.add(result.page);
      }
    }
  }

  for (const page of [...servedPages].sort()) {
    if (!advertised.has(page)) problems.push(`${page || '/'}: served but in no sitemap`);
  }

  return problems;
}

async function main() {
  const site = process.argv[2] ?? path.join(HERE, 'dist');
  const problems = await checkSite(site);

  if (problems.length) {
    console.error(`${problems.length} problem(s) in ${site}:`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exitCode = 1;
    return;
  }

  const files = await walk(site);
  const pages = files.filter((f) => f.endsWith('.html')).length;
  const products = (await fs.readdir(site, { withFileTypes: true })).filter((e) => e.isDirectory()).length;
  console.log(`${site} looks publishable: ${products} products, ${pages} pages, no dead links, sitemaps complete.`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
