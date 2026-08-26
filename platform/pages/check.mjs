#!/usr/bin/env node
// Check a built Pages artifact before it is allowed to publish.
//
// `build.mjs` can succeed and still produce a site that is broken for a reader
// or invisible to a crawler: a footer linking a file that did not ship, a
// canonical tag still naming `example.invalid`, a sitemap advertising a path
// this site does not serve. None of that shows up in a test over the sources,
// because the defect is created by the copy, not by the input.
//
// So this runs over the real output directory. It is the guard that would have
// caught the two sitemap defects fixed alongside it: 70 pages listed in no
// sitemap, and 11 sitemap URLs pointing at `/ventures/<slug>/`, a path the
// site does not serve.
//
//   node platform/pages/check.mjs dist
//
// Adapted from the `check_site.py` written for PR #1723, which proposed a
// second, competing Pages builder. That builder is not needed — this repo
// already has one on `main` — but its artifact check was the better idea and
// `main` had no equivalent, so it is carried over here.

import { promises as fs } from 'node:fs';
import path from 'node:path';

const PLACEHOLDER_ORIGIN = 'https://example.invalid';

const REQUIRED_ROOT_FILES = [
  'index.html',
  'sitemap.xml',
  'sitemap-hub.xml',
  'robots.txt',
  '404.html',
  '.nojekyll',
  // Browsers request /favicon.ico on their own for every page, so if it is
  // missing every page load logs a 404 and opens an anonymous blank tab.
  'favicon.ico',
];

// Files whose contents are worth reading for links and stale origins.
const TEXT_EXTENSIONS = new Set(['.html', '.xml', '.txt', '.mjs', '.js', '.css', '.json']);
// Files whose links are worth resolving. A `.css` url() is not checked.
const LINKED_EXTENSIONS = new Set(['.html', '.mjs', '.js']);

const REFERENCE_RE = /(?:href|src)\s*=\s*"([^"]+)"/g;
const IMPORT_RE = /\bfrom\s+"(\.{1,2}\/[^"]+)"/g;
const LOC_RE = /<loc>([^<]+)<\/loc>/g;

const EXTERNAL_PREFIXES = ['http://', 'https://', 'mailto:', 'tel:', 'data:', 'javascript:', '//', '#'];
const isExternal = (target) => EXTERNAL_PREFIXES.some((prefix) => target.startsWith(prefix));

const exists = (target) => fs.access(target).then(() => true, () => false);

async function walk(dir, prefix = '') {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...(await walk(path.join(dir, entry.name), relative)));
    else if (entry.isFile()) files.push(relative);
  }
  return files.sort();
}

/**
 * Where this site is rooted, read from the artifact rather than assumed.
 *
 * `robots.txt` names its sitemap by absolute URL, so that URL's directory is
 * the origin path every other absolute URL in the artifact should share. A
 * hard-coded guess here would pass on a site published at the wrong prefix.
 */
async function readBasePath(site) {
  // A missing robots.txt is already reported as a missing root file; crashing
  // here would hide every other problem behind a stack trace.
  const robots = await fs.readFile(path.join(site, 'robots.txt'), 'utf8').catch(() => null);
  const match = robots?.match(/^Sitemap:\s*(\S+)/m);
  if (!match) return null;
  try {
    return new URL(match[1]).pathname.replace(/sitemap\.xml$/, '');
  } catch {
    return null;
  }
}

/** Every `<loc>` in the sitemap tree, following the index into each sitemap. */
async function collectSitemapUrls(site, basePath, relative, seen, out, problems) {
  if (seen.has(relative)) return;
  seen.add(relative);

  const file = path.join(site, relative);
  if (!(await exists(file))) {
    problems.push(`sitemap.xml: names a sitemap that did not ship -> ${relative}`);
    return;
  }

  for (const [, loc] of (await fs.readFile(file, 'utf8')).matchAll(LOC_RE)) {
    let urlPath;
    try {
      urlPath = new URL(loc).pathname;
    } catch {
      problems.push(`${relative}: <loc> is not a URL -> ${loc}`);
      continue;
    }
    if (!urlPath.startsWith(basePath)) {
      problems.push(`${relative}: <loc> outside the site root -> ${loc}`);
      continue;
    }
    const inSite = urlPath.slice(basePath.length);
    if (inSite.endsWith('sitemap.xml') || inSite.endsWith('sitemap-hub.xml')) {
      await collectSitemapUrls(site, basePath, inSite, seen, out, problems);
    } else {
      out.set(inSite, relative);
    }
  }
}

export async function checkSite(site) {
  const problems = [];

  if (!(await exists(site))) return [`${site} is not a directory`];

  for (const required of REQUIRED_ROOT_FILES) {
    if (!(await exists(path.join(site, required)))) problems.push(`missing required file: ${required}`);
  }

  const entries = await fs.readdir(site, { withFileTypes: true });
  const productDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  if (productDirs.length === 0) problems.push('no product directories in the artifact');
  for (const product of productDirs) {
    if (!(await exists(path.join(site, product, 'index.html')))) {
      problems.push(`${product}/ has no index.html`);
    }
  }

  const files = await walk(site);
  const servedPages = files.filter((f) => f.endsWith('.html'));

  for (const relative of files) {
    const extension = path.extname(relative).toLowerCase();
    if (!TEXT_EXTENSIONS.has(extension)) continue;

    const text = await fs.readFile(path.join(site, relative), 'utf8');
    if (text.includes(PLACEHOLDER_ORIGIN)) {
      problems.push(`${relative}: still contains ${PLACEHOLDER_ORIGIN}`);
    }
    if (!LINKED_EXTENSIONS.has(extension)) continue;

    const targets = [
      ...[...text.matchAll(REFERENCE_RE)].map((m) => m[1]),
      ...[...text.matchAll(IMPORT_RE)].map((m) => m[1]),
    ];
    for (const target of targets) {
      if (isExternal(target)) continue;
      const cleaned = decodeURIComponent(target.split('#')[0].split('?')[0]);
      if (!cleaned) continue;

      const from = path.resolve(site, path.dirname(relative));
      let resolved = path.resolve(from, cleaned);
      if (path.relative(path.resolve(site), resolved).startsWith('..')) {
        problems.push(`${relative}: link escapes the site root -> ${target}`);
        continue;
      }
      if (cleaned.endsWith('/')) resolved = path.join(resolved, 'index.html');
      else if (!path.extname(resolved)) {
        // A extension-less link is served as a directory if one is there.
        if (await exists(path.join(resolved, 'index.html'))) resolved = path.join(resolved, 'index.html');
      }
      if (!(await exists(resolved))) problems.push(`${relative}: dead link -> ${target}`);
    }
  }

  // ---- Sitemaps: the two ways organic discovery quietly fails --------------

  const basePath = await readBasePath(site);
  if (basePath === null) {
    problems.push('robots.txt: no Sitemap line, so crawlers get no entry point');
    return problems;
  }

  const listed = new Map();
  await collectSitemapUrls(site, basePath, 'sitemap.xml', new Set(), listed, problems);

  // A URL that 404s is worse than no sitemap at all: it teaches a crawler the
  // site is broken.
  for (const [urlPath, source] of listed) {
    const target = urlPath === '' || urlPath.endsWith('/') ? `${urlPath}index.html` : urlPath;
    if (!(await exists(path.join(site, target)))) {
      problems.push(`${source}: lists a URL that did not ship -> /${urlPath}`);
    }
  }

  // A page in no sitemap is built, deployed, and never found.
  for (const page of servedPages) {
    if (page === '404.html') continue;
    const candidates = [page];
    if (page.endsWith('/index.html')) candidates.push(page.slice(0, -'index.html'.length));
    if (page === 'index.html') candidates.push('');
    if (!candidates.some((c) => listed.has(c))) {
      problems.push(`${page}: served but absent from every sitemap`);
    }
  }

  return problems;
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (invokedDirectly) {
  const site = path.resolve(process.argv[2] ?? 'dist');
  const problems = await checkSite(site);

  if (problems.length > 0) {
    console.error(`${problems.length} problem(s) in ${site}:`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }

  const files = await walk(site);
  const pages = files.filter((f) => f.endsWith('.html')).length;
  const products = (await fs.readdir(site, { withFileTypes: true })).filter((e) => e.isDirectory()).length;
  console.log(`${site} looks publishable: ${products} products, ${pages} pages, no dead links.`);
}
