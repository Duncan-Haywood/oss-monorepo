#!/usr/bin/env node
// Verifies a built Pages artifact before it is allowed to publish.
//
// Why this exists
// ---------------
// `build.mjs` has unit tests, but they test the builder's functions against
// fixtures. This checks the *output* — the actual directory that is about to
// become the public site. The two fail in different ways: a builder can pass
// every unit test and still emit a tree with a dead link, a sitemap pointing
// at a file it never wrote, or a leftover `example.invalid` canonical tag that
// tells Google the real page is somewhere unreachable.
//
// Discovery here is deliberately independent of `build.mjs`. It walks the
// finished tree and re-derives what it finds rather than importing the
// builder's own idea of what it produced — a check that asks the builder what
// it built can only ever confirm the builder agrees with itself.
//
//   node check_site.mjs dist
//
// Exits non-zero with a report naming every problem, so a broken artifact
// turns the build red instead of turning the live site broken.

import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';

// Written into every venture's canonical tags and sitemap back when the
// portfolio had no real origin. `build.mjs` rewrites it; if one survives, that
// page is telling crawlers its canonical home is a domain that does not exist.
//
// Checked only where a URL carries authority — canonical tags, og:url, and
// sitemap entries — never against page text. Several tools legitimately show
// `https://example.com` inside sample payloads (the Shopify accessibility tool
// ships an axe-core JSON fixture that contains one), and flagging demo content
// as a broken canonical would train everyone to ignore this check.
const PLACEHOLDER_HOSTS = ['example.invalid', 'example.com', 'example.org', 'localhost'];

// The tags whose URL is a claim about where this page really lives.
const AUTHORITATIVE_URL = [
  /<link\b[^>]*\brel\s*=\s*["']canonical["'][^>]*\bhref\s*=\s*["']([^"']+)["']/gi,
  /<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*\brel\s*=\s*["']canonical["']/gi,
  /<meta\b[^>]*\bproperty\s*=\s*["']og:url["'][^>]*\bcontent\s*=\s*["']([^"']+)["']/gi,
];

// A site missing any of these is broken in a way a visitor or a crawler hits
// immediately, so they are checked by name rather than by link-following.
const REQUIRED_FILES = ['index.html', '404.html', 'robots.txt', 'sitemap.xml'];

const LINK_ATTR = /(?:href|src)\s*=\s*["']([^"']+)["']/gi;
const LOC_TAG = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;

/** Every file under `dir`, as paths relative to it, with `/` separators. */
export async function walk(dir, base = dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full, base)));
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

/**
 * Resolve a link as a browser would, relative to the page that carries it.
 * Returns null for anything not served from this artifact (absolute URLs,
 * mailto:, data:, bare fragments) — those are somebody else's to keep alive.
 */
export function resolveLink(raw, pageRel) {
  const href = raw.split('#')[0].split('?')[0].trim();
  if (!href) return null;
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) return null;

  let decoded;
  try {
    decoded = decodeURIComponent(href);
  } catch {
    // A malformed escape is not a dead link; leave it as written.
    decoded = href;
  }

  const from = href.startsWith('/') ? '.' : path.posix.dirname(pageRel);
  const joined = path.posix.normalize(path.posix.join(from, decoded.replace(/^\//, '')));
  // A link that climbs above the site root can never resolve once published.
  return joined.startsWith('..') ? { escaped: true, target: joined } : { escaped: false, target: joined };
}

/**
 * A link target is satisfied by the file itself or, for a directory-style
 * link, by the index.html inside it — which is how GitHub Pages serves them.
 */
function targetExists(target, files) {
  if (!target || target === '.') return files.has('index.html');
  return (
    files.has(target) ||
    files.has(`${target}/index.html`) ||
    files.has(`${target}index.html`)
  );
}

export async function checkSite(outDir) {
  const problems = [];
  const note = (message) => problems.push(message);

  if (!existsSync(outDir)) {
    return { problems: [`${outDir} does not exist — nothing was built`], stats: null };
  }

  const fileList = await walk(outDir);
  const files = new Set(fileList);

  for (const required of REQUIRED_FILES) {
    if (!files.has(required)) note(`missing required file: ${required}`);
  }

  const htmlPages = fileList.filter((f) => f.endsWith('.html'));
  if (htmlPages.length === 0) note('the artifact contains no HTML at all');

  // Products are the top-level directories that carry an entry point. Derived
  // from the tree, so a product that failed to copy is absent here rather than
  // being reported present because the builder meant to include it.
  const products = [...new Set(
    fileList
      .filter((f) => f.includes('/') && f.endsWith('/index.html') && f.split('/').length === 2)
      .map((f) => f.split('/')[0]),
  )].sort();

  if (products.length === 0) note('no product directories with an index.html were found');

  let deadLinks = 0;
  let scannedLinks = 0;

  for (const page of htmlPages) {
    const html = await fs.readFile(path.join(outDir, page), 'utf8');

    for (const pattern of AUTHORITATIVE_URL) {
      for (const match of html.matchAll(pattern)) {
        const host = PLACEHOLDER_HOSTS.find((h) => match[1].includes(`//${h}`));
        if (host) note(`${page}: canonical URL still points at the placeholder origin ${host} -> ${match[1]}`);
      }
    }

    for (const match of html.matchAll(LINK_ATTR)) {
      const resolved = resolveLink(match[1], page);
      if (!resolved) continue;
      scannedLinks += 1;
      if (resolved.escaped) {
        deadLinks += 1;
        note(`${page}: link escapes the site root -> ${match[1]}`);
      } else if (!targetExists(resolved.target, files)) {
        deadLinks += 1;
        note(`${page}: dead internal link -> ${match[1]}`);
      }
    }
  }

  // Sitemap entries are promises made to a crawler. An entry with no file
  // behind it earns a 404 in Search Console on every recrawl.
  //
  // The site's own root URL comes from the hub's canonical tag, so entries can
  // be mapped back to files in this artifact. Without that mapping the check
  // can only compare entries to each other — which is how two ventures shipped
  // sitemaps whose every entry carried a `ventures/` path segment that does
  // not exist in the published layout: internally consistent, uniformly 404.
  const hubHtml = files.has('index.html')
    ? await fs.readFile(path.join(outDir, 'index.html'), 'utf8')
    : '';
  const hubCanonical = /<link\b[^>]*\brel\s*=\s*["']canonical["'][^>]*\bhref\s*=\s*["']([^"']+)["']/i.exec(hubHtml);
  let siteRoot = null;
  if (hubCanonical) {
    try {
      siteRoot = new URL(hubCanonical[1]);
    } catch {
      note(`index.html: canonical href is not a valid URL -> ${hubCanonical[1]}`);
    }
  } else if (files.has('index.html')) {
    note('index.html: no canonical tag, so sitemap entries cannot be checked against the artifact');
  }

  const sitemaps = fileList.filter((f) => f.endsWith('.xml'));
  let sitemapEntries = 0;
  let unresolvable = 0;
  let baseOrigin = null;

  for (const sitemap of sitemaps) {
    const xml = await fs.readFile(path.join(outDir, sitemap), 'utf8');
    for (const match of xml.matchAll(LOC_TAG)) {
      const loc = match[1];
      sitemapEntries += 1;

      for (const host of PLACEHOLDER_HOSTS) {
        if (loc.includes(`//${host}`)) {
          note(`${sitemap}: sitemap entry uses the placeholder origin -> ${loc}`);
          break;
        }
      }

      let url;
      try {
        url = new URL(loc);
      } catch {
        note(`${sitemap}: sitemap entry is not an absolute URL -> ${loc}`);
        continue;
      }

      // Every sitemap in one artifact must agree on the origin, or half of
      // them are advertising a site nobody is serving.
      baseOrigin ??= url.origin;
      if (url.origin !== baseOrigin) {
        note(`${sitemap}: sitemap entry origin ${url.origin} disagrees with ${baseOrigin}`);
      }

      // The entry must name a file this artifact actually contains. A sitemap
      // is the one place a wrong URL is invisible in testing and expensive in
      // production: nobody clicks it, and the crawler that does quietly drops
      // the page from the index.
      if (siteRoot && url.origin === siteRoot.origin) {
        if (!url.pathname.startsWith(siteRoot.pathname)) {
          unresolvable += 1;
          note(`${sitemap}: entry is outside the published site root -> ${loc}`);
          continue;
        }
        const rel = decodeURIComponent(url.pathname.slice(siteRoot.pathname.length)).replace(/^\//, '');
        // Sitemaps may list `sitemap-*.xml` children, which are files too.
        if (!targetExists(rel === '' ? '.' : rel.replace(/\/$/, ''), files)) {
          unresolvable += 1;
          note(`${sitemap}: entry has no page behind it in the artifact -> ${loc}`);
        }
      }
    }
  }

  if (sitemapEntries === 0) note('no sitemap entries were emitted — nothing is advertised to crawlers');

  return {
    problems,
    stats: {
      products: products.length,
      pages: htmlPages.length,
      files: fileList.length,
      links: scannedLinks,
      deadLinks,
      sitemapEntries,
      unresolvable,
    },
  };
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith('check_site.mjs');

if (invokedDirectly) {
  const outDir = path.resolve(process.argv[2] || 'dist');
  const { problems, stats } = await checkSite(outDir);

  if (problems.length) {
    console.error(`${outDir} is not publishable — ${problems.length} problem(s):\n`);
    for (const problem of problems.slice(0, 50)) console.error(`  ${problem}`);
    if (problems.length > 50) console.error(`  ... and ${problems.length - 50} more`);
    process.exit(1);
  }

  console.log(
    `${outDir} looks publishable: ${stats.products} products, ${stats.pages} pages, ` +
    `${stats.links} internal links all resolve, ${stats.sitemapEntries} sitemap entries.`,
  );
}
