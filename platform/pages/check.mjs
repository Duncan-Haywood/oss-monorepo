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
//
// Extended 2026-08-26 by merging a concurrent checker written against the same
// gap (#1744). Two sessions reached the same conclusion from #1723 within the
// hour and each caught things the other missed, so both sets are kept: the
// sitemap-coverage and base-path logic here, plus reachability (the hub and the
// artifact agreeing in *both* directions), the disclaimer requirement, leaked
// bookkeeping, a product-count floor, and single-quoted / dynamic `import()`
// specifiers. `journey.mjs` is the browser half of that merge — this file can
// prove a page shipped and its links resolve, but not that the calculator
// computes.

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
// `href`/`src` are markup, so REFERENCE_RE must not see script or style bodies.
// `tender-radar` builds its result rows at runtime with
// `` `<a href="${escapeHtml(href)}">` ``; scanning the whole file read that
// template placeholder as a dead link and failed the Pages build over a page
// that is correct. The hub check below already strips scripts for this reason;
// this applies the same rule to the per-page scan.
const SCRIPT_OR_STYLE_RE = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
// Both quote styles, and `import(...)` as well as `from ...`. Every calculator
// here loads its `calc.mjs` from an inline module script, and a specifier this
// pattern misses is a tool that renders its form and then does nothing. These
// two deliberately scan the *unstripped* text: an import specifier only ever
// appears inside a script, which is exactly what REFERENCE_RE must skip.
const IMPORT_RE = /\bfrom\s+['"](\.{1,2}\/[^'"]+)['"]/g;
const DYNAMIC_IMPORT_RE = /\bimport\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;
const LOC_RE = /<loc>([^<]+)<\/loc>/g;

// Every user-facing surface here carries a liability disclaimer
// (PRODUCT_PLAYBOOK.md §5b). This is the marker phrase they share. A product
// page missing it ships calculated money figures with no limitation of
// liability — the one defect in this file with legal weight rather than just
// broken-link weight.
const DISCLAIMER_MARKER = /no warranty/i;

// Bookkeeping and test payload that exists for the repo, not for a visitor.
// Finding any of it here means the copy filter in build.mjs regressed.
const LEAKED_FILE_RE = /(?:^|\/)(?:[^/]+\.test\.(?:mjs|js|cjs|py)|VENTURE\.yaml|README\.md|package-lock\.json)$/;
const LEAKED_DIRS = new Set(['node_modules', '__pycache__', 'coverage', '.git']);

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

/**
 * @param site  the built artifact directory
 * @param minProducts  floor on the number of published products. Defaults to 1
 *   so a small synthetic fixture is valid; the CLI passes the real floor,
 *   because the failure worth catching is a *discovery collapse* — build.mjs
 *   finding almost nothing, emitting a hub that looks fine with three tools on
 *   it, and every check below passing.
 */
export async function checkSite(site, { minProducts = 1 } = {}) {
  const problems = [];

  if (!(await exists(site))) return [`${site} is not a directory`];

  for (const required of REQUIRED_ROOT_FILES) {
    if (!(await exists(path.join(site, required)))) problems.push(`missing required file: ${required}`);
  }

  const entries = await fs.readdir(site, { withFileTypes: true });
  const productDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  if (productDirs.length === 0) problems.push('no product directories in the artifact');
  else if (productDirs.length < minProducts) {
    problems.push(`only ${productDirs.length} product(s) published, expected at least ${minProducts} — discovery may have regressed`);
  }
  for (const product of productDirs) {
    if (!(await exists(path.join(site, product, 'index.html')))) {
      problems.push(`${product}/ has no index.html`);
    }
  }

  // ---- Reachability: the hub and the artifact must agree, both ways --------
  //
  // Checked in both directions because the two failures are different. A hub
  // link with nothing behind it is a 404 a visitor sees. A product with no hub
  // link is worse and quieter: it built, deployed, passed every other check,
  // and no visitor can reach it.
  const hubHtml = await fs.readFile(path.join(site, 'index.html'), 'utf8').catch(() => null);
  if (hubHtml !== null) {
    // Scripts first, because a hub link is markup and script is not. The
    // offline widget builds hub markup by concatenation, so its source contains
    // the literal `data-tool="' + slug + '"` — scraped raw, that reads as a link
    // to a product called `' + slug + '` and fails the check on a healthy site.
    const markupOnly = hubHtml.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    const linked = new Set([...markupOnly.matchAll(/data-tool="([^"]+)"/g)].map((m) => m[1]));
    if (linked.size > 0) {
      for (const slug of linked) {
        if (!productDirs.includes(slug)) problems.push(`index.html: hub links "${slug}" but no such product shipped`);
      }
      for (const product of productDirs) {
        if (!linked.has(product)) problems.push(`${product}/: shipped but the hub does not link it, so nobody can reach it`);
      }
    }
    if (!DISCLAIMER_MARKER.test(hubHtml)) problems.push('index.html: carries no disclaimer');
  }

  const files = await walk(site);
  const servedPages = files.filter((f) => f.endsWith('.html'));

  // ---- Disclaimers and leaked payload -------------------------------------
  for (const product of productDirs) {
    const index = path.join(site, product, 'index.html');
    const html = await fs.readFile(index, 'utf8').catch(() => null);
    if (html !== null && !DISCLAIMER_MARKER.test(html)) {
      problems.push(`${product}/index.html: carries no disclaimer, so it must not ship`);
    }
  }

  for (const relative of files) {
    if (LEAKED_FILE_RE.test(relative)) problems.push(`${relative}: repo bookkeeping or test payload was published`);
    else if (relative.split('/').some((segment) => LEAKED_DIRS.has(segment))) {
      problems.push(`${relative}: published from a directory that should never ship`);
    }
  }

  // A canonical tag must name a URL under this site's own base, and the hub's
  // canonical is what that base is. Anything else tells crawlers the real page
  // lives somewhere other than where it just shipped.
  //
  // The case this exists for is not a placeholder but a *stale real origin*:
  // three ventures wrote `duncan-haywood.github.io/...` into their canonicals
  // as a literal instead of using the placeholder. That is invisible today,
  // because it happens to match where the site is served. The day
  // `PAGES_BASE_URL` points at a custom domain, every one of those pages hands
  // the new domain a duplicate and keeps the old address as canonical. The
  // build now rewrites them; this is the check that says so.
  let siteBase = null;
  if (files.includes('index.html')) {
    const hub = await fs.readFile(path.join(site, 'index.html'), 'utf8');
    const canonical = /<link\b[^>]*\brel=["']canonical["'][^>]*\bhref=["']([^"']+)["']/i.exec(hub);
    if (canonical) {
      try {
        siteBase = new URL(canonical[1]);
      } catch {
        problems.push(`index.html: canonical href is not a valid URL -> ${canonical[1]}`);
      }
    }
  }

  if (siteBase) {
    const prefix = `${siteBase.origin}${siteBase.pathname}`;
    for (const relative of servedPages) {
      const html = await fs.readFile(path.join(site, relative), 'utf8');
      const canonical = /<link\b[^>]*\brel=["']canonical["'][^>]*\bhref=["']([^"']+)["']/i.exec(html);
      if (canonical && /^https?:/i.test(canonical[1]) && !canonical[1].startsWith(prefix)) {
        problems.push(`${relative}: canonical points outside this site -> ${canonical[1]}`);
      }
    }
  }

  for (const relative of files) {
    const extension = path.extname(relative).toLowerCase();
    if (!TEXT_EXTENSIONS.has(extension)) continue;

    const text = await fs.readFile(path.join(site, relative), 'utf8');
    if (text.includes(PLACEHOLDER_ORIGIN)) {
      problems.push(`${relative}: still contains ${PLACEHOLDER_ORIGIN}`);
    }
    if (!LINKED_EXTENSIONS.has(extension)) continue;

    const markupOnly = text.replace(SCRIPT_OR_STYLE_RE, '');
    const targets = [
      ...[...markupOnly.matchAll(REFERENCE_RE)].map((m) => m[1]),
      ...[...text.matchAll(IMPORT_RE)].map((m) => m[1]),
      ...[...text.matchAll(DYNAMIC_IMPORT_RE)].map((m) => m[1]),
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
    // ...unless it asked not to be found. The offline fallback is a shell, and
    // indexed it would be the search result for a calculator. A page that
    // declares noindex and is then listed in a sitemap is the contradiction;
    // one that declares it and stays out is correct.
    if (/<meta name="robots" content="noindex">/i.test(await fs.readFile(path.join(site, page), 'utf8'))) {
      continue;
    }
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
  const positional = process.argv.slice(2).find((a) => !a.startsWith('--'));
  const flag = process.argv.find((a) => a.startsWith('--dist='))?.slice('--dist='.length);
  const site = path.resolve(flag ?? positional ?? 'dist');

  // Deliberately well below the ~38 products on `main`, so a venture landing
  // does not require touching this number, while a collapse still fails.
  const problems = await checkSite(site, { minProducts: 20 });

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
