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

  const defaults = {
    'index.html': '<a href="tool/">Tool</a>',
    'robots.txt': `User-agent: *\nAllow: /\n\nSitemap: ${url('sitemap.xml')}\n`,
    '404.html': '<p>gone</p>',
    '.nojekyll': '',
    'favicon.ico': '',
    'sitemap.xml': sitemapIndex('sitemap-hub.xml', 'tool/sitemap.xml'),
    'sitemap-hub.xml': urlset(''),
    'tool/index.html': '<p>Tool</p>',
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
    'tool/index.html': '<a href="https://github.com/sponsors/Duncan-Haywood">Sponsor</a>',
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
