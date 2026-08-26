// Tests the artifact check, over synthetic sites built in a temp directory.
//
// Each test constructs the smallest site that exhibits one defect, so a
// failure here names the defect rather than a line number. The point of the
// suite is that the check is not vacuous: it has to go red on artifacts that
// really did ship, not just green on a good one.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { checkSite } from './check.mjs';

const BASE_PATH = '/repo/';
const url = (relative) => `https://example.test${BASE_PATH}${relative}`;

const urlset = (...relatives) =>
  `<?xml version="1.0" encoding="UTF-8"?><urlset>${relatives
    .map((r) => `<url><loc>${url(r)}</loc></url>`)
    .join('')}</urlset>`;

const sitemapIndex = (...relatives) =>
  `<?xml version="1.0" encoding="UTF-8"?><sitemapindex>${relatives
    .map((r) => `<sitemap><loc>${url(r)}</loc></sitemap>`)
    .join('')}</sitemapindex>`;

/**
 * A minimal artifact that passes every check, plus whatever `files` overlays.
 * A test names only the files its defect involves.
 */
async function siteWith(files = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pages-check-'));

  // The hub and every product page carry the disclaimer marker, because a
  // real artifact does: the check treats a page without one as unpublishable.
  const defaults = {
    'index.html': '<a href="tool/" data-tool="tool">Tool</a><footer>No warranty.</footer>',
    'robots.txt': `User-agent: *\nAllow: /\n\nSitemap: ${url('sitemap.xml')}\n`,
    '404.html': '<p>gone</p>',
    '.nojekyll': '',
    'favicon.ico': '',
    'sitemap.xml': sitemapIndex('sitemap-hub.xml', 'tool/sitemap.xml'),
    'sitemap-hub.xml': urlset(''),
    'tool/index.html': '<p>Tool</p><footer>No warranty.</footer>',
    'tool/sitemap.xml': urlset('tool/'),
  };

  for (const [relative, contents] of Object.entries({ ...defaults, ...files })) {
    if (contents === null) continue;
    const target = path.join(dir, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, contents);
  }

  return dir;
}

const problemsFor = async (files) => checkSite(await siteWith(files));
const mentioning = (problems, needle) => problems.filter((p) => p.includes(needle));

test('a well-formed artifact passes', async () => {
  assert.deepEqual(await problemsFor(), []);
});

test('a missing root file is caught', async () => {
  const problems = await problemsFor({ '.nojekyll': null, 'robots.txt': null });
  // Without .nojekyll, Pages silently drops any `_`-prefixed directory.
  assert.equal(mentioning(problems, 'missing required file: .nojekyll').length, 1);
});

test('a page in no sitemap is caught', async () => {
  const problems = await problemsFor({ 'tool/compare.html': '<p>compare</p>' });
  assert.equal(mentioning(problems, 'tool/compare.html: served but absent').length, 1);
});

test('a sitemap URL that did not ship is caught', async () => {
  // The real defect: a venture sitemap written against `/ventures/<slug>/`,
  // a path this site does not serve, so every URL in it 404s.
  const problems = await problemsFor({ 'tool/sitemap.xml': urlset('tool/', 'ventures/tool/') });
  assert.equal(mentioning(problems, 'did not ship -> /ventures/tool/').length, 1);
});

test('a relative <loc> is caught', async () => {
  // `<loc>` must be a full absolute URL; crawlers reject a relative one, so a
  // sitemap full of them covers nothing at all.
  const problems = await problemsFor({
    'tool/sitemap.xml': '<urlset><url><loc>index.html</loc></url></urlset>',
  });
  assert.equal(mentioning(problems, '<loc> is not a URL').length, 1);
});

test('a leftover placeholder origin is caught', async () => {
  const problems = await problemsFor({
    'tool/index.html': '<link rel="canonical" href="https://example.invalid/tool/">',
  });
  assert.equal(mentioning(problems, 'still contains https://example.invalid').length, 1);
});

test('a dead relative link is caught', async () => {
  const problems = await problemsFor({ 'tool/index.html': '<a href="missing.html">gone</a>' });
  assert.equal(mentioning(problems, 'dead link -> missing.html').length, 1);
});

test('a link that climbs out of the site root is caught', async () => {
  const problems = await problemsFor({ 'tool/index.html': '<a href="../../etc/passwd">x</a>' });
  assert.equal(mentioning(problems, 'escapes the site root').length, 1);
});

test('an external link is not resolved on disk', async () => {
  const problems = await problemsFor({
    'tool/index.html':
      '<a href="https://github.com/sponsors/Duncan-Haywood">Sponsor</a><footer>No warranty.</footer>',
  });
  assert.deepEqual(problems, []);
});

test('a product directory with no landing page is caught', async () => {
  const problems = await problemsFor({ 'orphan/deep.html': '<p>no index</p>' });
  assert.equal(mentioning(problems, 'orphan/ has no index.html').length, 1);
});

test('a sitemap named by the index but never written is caught', async () => {
  const problems = await problemsFor({ 'tool/sitemap.xml': null });
  assert.equal(mentioning(problems, 'names a sitemap that did not ship').length, 1);
});

test('the index is followed into every sitemap it names', async () => {
  // A check that read only the root sitemap would pass here: the defect is one
  // level down, which is exactly where the real ones were.
  const problems = await problemsFor({ 'tool/sitemap.xml': urlset('tool/', 'tool/ghost.html') });
  assert.equal(mentioning(problems, 'did not ship -> /tool/ghost.html').length, 1);
});

// ---------------------------------------------------------------------------
// Reachability, disclaimers, leaked payload, discovery floor
//
// Added when two concurrent checkers were merged (#1744). These are the defects
// the sitemap-and-links half above cannot see: a page can ship, resolve every
// link, and appear in a sitemap while still being unreachable, undisclaimed, or
// accompanied by files no visitor should get.
// ---------------------------------------------------------------------------

test('a product the hub does not link is caught', async () => {
  // The quiet one. It built, it deployed, every other check passes, and no
  // visitor can reach it.
  const problems = await problemsFor({
    'ghost/index.html': '<p>Ghost</p><footer>No warranty.</footer>',
    'ghost/sitemap.xml': urlset('ghost/'),
    'sitemap.xml': sitemapIndex('sitemap-hub.xml', 'tool/sitemap.xml', 'ghost/sitemap.xml'),
  });
  assert.equal(mentioning(problems, 'ghost/: shipped but the hub does not link it').length, 1);
});

test('a hub link with no product behind it is caught', async () => {
  const problems = await problemsFor({
    'index.html': '<a href="tool/" data-tool="tool">Tool</a><a data-tool="vanished">V</a><footer>No warranty.</footer>',
  });
  assert.equal(mentioning(problems, 'hub links "vanished"').length, 1);
});

test('a product page shipping without a disclaimer is caught', async () => {
  const problems = await problemsFor({ 'tool/index.html': '<p>Your profit: $420.00</p>' });
  assert.equal(mentioning(problems, 'tool/index.html: carries no disclaimer').length, 1);
});

test('a hub shipping without a disclaimer is caught', async () => {
  const problems = await problemsFor({ 'index.html': '<a href="tool/" data-tool="tool">Tool</a>' });
  assert.equal(mentioning(problems, 'index.html: carries no disclaimer').length, 1);
});

test('leaked test payload and repo bookkeeping are caught', async () => {
  const problems = await problemsFor({
    'tool/calc.test.mjs': 'assert(true)',
    'tool/VENTURE.yaml': 'slug: tool',
    'tool/README.md': '# notes',
  });
  assert.equal(mentioning(problems, 'tool/calc.test.mjs').length, 1);
  assert.equal(mentioning(problems, 'tool/VENTURE.yaml').length, 1);
  assert.equal(mentioning(problems, 'tool/README.md').length, 1);
});

test('a published node_modules is caught', async () => {
  const problems = await problemsFor({ 'tool/node_modules/left-pad/index.js': 'x' });
  assert.ok(mentioning(problems, 'node_modules').length >= 1);
});

test('a discovery collapse is caught by the product floor', async () => {
  // The fixture has one product, which is fine by default; the CLI passes the
  // real floor, so this asserts the floor itself rather than the default.
  const problems = await checkSite(await siteWith(), { minProducts: 20 });
  assert.equal(mentioning(problems, 'only 1 product(s) published').length, 1);
});

test('the default floor does not reject a small artifact', async () => {
  assert.deepEqual(await problemsFor(), []);
});

test('a single-quoted module specifier is resolved', async () => {
  // `from './calc.mjs'` was invisible to the double-quote-only pattern, so a
  // calculator could lose its module and still pass.
  const problems = await problemsFor({
    'tool/index.html': "<script type=\"module\">import { calc } from './calc.mjs';</script><footer>No warranty.</footer>",
  });
  assert.equal(mentioning(problems, "dead link -> ./calc.mjs").length, 1);
});

test('a dynamic import specifier is resolved', async () => {
  const problems = await problemsFor({
    'tool/index.html': '<script type="module">const m = await import("./share.mjs");</script><footer>No warranty.</footer>',
  });
  assert.equal(mentioning(problems, 'dead link -> ./share.mjs').length, 1);
});

test('a data-tool literal inside a script is not read as a hub link', async () => {
  // Regression: the offline widget builds hub markup by concatenation, so the
  // hub's own script contains `data-tool="' + slug + '"`. Scraped raw that
  // reads as a link to a product named `' + slug + '`, and the reachability
  // check failed on a perfectly healthy site.
  const problems = await problemsFor({
    'index.html':
      '<a href="tool/" data-tool="tool">Tool</a>' +
      '<script>const card = (slug) => `<a data-tool="` + slug + `">x</a>`;</script>' +
      '<footer>No warranty.</footer>',
  });
  assert.deepEqual(problems, [], `unexpected: ${JSON.stringify(problems)}`);
});
