// Every page a venture ships must be listed in that venture's own sitemap.xml.
//
// Why this exists, and what it is *not* about. The published site does not
// serve these files: `build.mjs`'s `renderVentureSitemap` regenerates a sitemap
// per venture from what actually landed in the artifact, so a page missing here
// is still crawlable at https://duncan-haywood.github.io/oss-monorepo/.
// The committed file is the one a venture carries when it is served on its own
// -- from its directory, a fork, or the standalone copy its README describes --
// and it is also the file each venture's `page.test.mjs` asserts against when
// it checks that a new page "is reachable from the sitemap".
//
// The drift is silent in both directions, which is the whole argument for a
// check rather than a convention. Nothing in the tree reads the committed
// sitemap except a per-venture test that the venture's own author remembered to
// write -- so a venture that gains a comparison page and does not gain the test
// loses the sitemap line with nothing going red. Measured 2026-09-16: 8 of the
// 266 ventures carrying a sitemap had a page missing from it, and two of those
// pages were the venture's only organic entry point. Not one was caught by
// anything; they were found by enumerating, which is the cheap version of this
// lesson CLAUDE.md already records three times over.
//
// Scope, deliberately narrow: a venture with no sitemap.xml at all is not a
// failure here. Seven ventures keep a flat static site with no committed
// sitemap, and inventing the requirement for them is a different decision from
// keeping an existing file honest.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { generateVenturePages } from './generated-pages.mjs';

const VENTURES = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'ventures');

// Pages a venture writes at build time (GENERATED_PAGES, gitignored) are pages
// it ships, so they exist before this reads the tree, as for every other reader.
generateVenturePages(VENTURES);

// Unlinked by design: both are served by the host on a condition rather than
// reached by a crawler, so listing either in a sitemap would advertise a URL
// that is not a page.
const NOT_PAGES = new Set(['404.html', 'offline.html']);

/**
 * The path inside the venture directory that a `<loc>` points at.
 *
 * A sitemap here is spelled one of two ways -- relatively (`./x.html`, `./site/x.html`)
 * or against `https://example.invalid/<slug>/...`, the placeholder origin every
 * venture's canonical tags use -- and the two must reduce to the same thing or
 * this check would only ever see half the catalogue. An entry ending in `/` is
 * the directory form of `index.html`, which is how the page is served; it is
 * returned as the bare directory so a caller can tell the two apart, because an
 * app-shaped venture (vendor-watch is a Next.js build) legitimately has no
 * `index.html` on disk to point at.
 */
function locPath(loc, slug) {
  const raw = loc.trim().replace(/[?#].*$/, '');
  const trailingSlash = raw.endsWith('/');
  const parts = raw.replace(/^https?:\/\//, '').split('/');
  // Anchor on the slug rather than on a fixed number of leading segments: the
  // committed sitemaps were written against at least three different origins
  // (`example.invalid`, the Pages subpath, a bare relative path), and stripping
  // "the host" by pattern gets the subpath ones wrong by two segments.
  const at = parts.lastIndexOf(slug);
  const rest = at === -1 ? parts.filter((s) => s !== '.' && s !== '') : parts.slice(at + 1);
  const p = rest.filter((s) => s !== '.').join('/');
  return trailingSlash && p !== '' ? `${p}/` : p;
}

function sitemapPaths(xml, slug) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => locPath(m[1], slug));
}

/**
 * Where the venture keeps the pages this sitemap is about: the directory its
 * own entry-page entry points at. Five ventures keep a flat static site under
 * `site/` rather than at the root, so reading the root unconditionally would
 * report every one of their pages as missing and every sitemap line as dangling.
 * Taken from the file rather than guessed, so a sixth layout needs no edit here.
 */
function pageRoot(paths) {
  const entry = paths.find((p) => p === '' || p.endsWith('/') || p.endsWith('index.html'));
  if (entry === undefined) return '';
  return entry.replace(/index\.html$/, '').replace(/\/$/, '');
}

function venturesWithASitemap() {
  return readdirSync(VENTURES)
    .filter((slug) => statSync(join(VENTURES, slug)).isDirectory())
    .filter((slug) => existsSync(join(VENTURES, slug, 'sitemap.xml')))
    .sort();
}

// A check that walks the tree can go quiet by walking the wrong tree -- a moved
// directory, a renamed file, a resolver that returns nothing -- and a green run
// says the same thing either way. This is the cheap assertion that it did not.
test('the check is looking at the catalogue and not at an empty directory', () => {
  assert.ok(
    venturesWithASitemap().length > 200,
    `expected the catalogue's ventures, found ${venturesWithASitemap().length} sitemaps under ${VENTURES}`,
  );
});

test('every venture that ships a sitemap lists every page beside it', () => {
  const gaps = [];

  for (const slug of venturesWithASitemap()) {
    const dir = join(VENTURES, slug);
    const paths = sitemapPaths(readFileSync(join(dir, 'sitemap.xml'), 'utf8'), slug);
    const root = pageRoot(paths);
    const listed = new Set(paths.map((p) => p.split('/').pop()));
    const missing = readdirSync(join(dir, root))
      .filter((f) => f.endsWith('.html') && !NOT_PAGES.has(f))
      // A page that asked to stay out of search (an app's admin dashboard)
      // belongs in no sitemap; check.mjs exempts it the same way.
      .filter((f) => !/<meta\s+name="robots"\s+content="[^"]*noindex/i.test(readFileSync(join(dir, root, f), 'utf8')))
      // `index.html` is listed as the directory it is served as, so a sitemap
      // that carries `./` or `./site/` already covers it.
      .filter((f) => !(f === 'index.html' && paths.some((p) => p === root || p === `${root}/`)))
      .filter((f) => !listed.has(f))
      .sort();
    if (missing.length) gaps.push(`  ${slug}: ${missing.join(', ')}`);
  }

  assert.equal(
    gaps.length,
    0,
    `these pages exist but are absent from their venture's own sitemap.xml.\n${gaps.join(
      '\n',
    )}\nAdd a <url><loc> for each, in the spelling that file already uses.`,
  );
});

// The other direction. A sitemap naming a page that is not there advertises a
// 404 to anything reading the committed file, which is the failure mode that
// survives a rename: the page moves, the sitemap does not.
test('no venture sitemap names a page that does not exist', () => {
  const dangling = [];

  for (const slug of venturesWithASitemap()) {
    const dir = join(VENTURES, slug);
    for (const p of sitemapPaths(readFileSync(join(dir, 'sitemap.xml'), 'utf8'), slug)) {
      // Only entries naming an explicit file are checked. A directory entry is
      // how an entry page is served, and an app-shaped venture may build that
      // page rather than commit it -- asserting on it would fail the honest case.
      if (!p.endsWith('.html')) continue;
      if (!existsSync(join(dir, p))) dangling.push(`  ${slug}: ${p}`);
    }
  }

  assert.equal(
    dangling.length,
    0,
    `these sitemap entries point at a file that is not in the venture:\n${dangling.join('\n')}`,
  );
});
