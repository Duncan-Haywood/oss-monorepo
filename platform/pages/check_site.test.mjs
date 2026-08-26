// Tests for the built-artifact checker.
//
// These deliberately build broken sites. A checker is only worth running if it
// fails on the things it claims to catch, and every case below is a bug this
// repository actually shipped into `ventures/` at some point — relative
// sitemap entries, a guessed path segment, a canonical left on a placeholder
// origin. The "clean site passes" case guards the opposite failure: a check so
// eager that everyone learns to ignore it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { checkSite, resolveLink, walk } from './check_site.mjs';

const BASE = 'https://example.test/site/';

/** Build a site tree from a {relativePath: contents} map. */
async function siteWith(files) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'check-site-'));
  for (const [rel, contents] of Object.entries(files)) {
    const full = path.join(dir, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, contents);
  }
  return dir;
}

const page = (body = '', canonical = BASE) =>
  `<!doctype html><html><head><link rel="canonical" href="${canonical}"></head><body>${body}</body></html>`;

const sitemap = (locs) =>
  `<?xml version="1.0"?><urlset>${locs.map((l) => `<url><loc>${l}</loc></url>`).join('')}</urlset>`;

/** A minimal site that should pass every check. */
function healthySite(extra = {}) {
  return {
    'index.html': page('<a href="tool/">Tool</a>'),
    '404.html': page('Not found'),
    'robots.txt': 'User-agent: *\n',
    'sitemap.xml': sitemap([`${BASE}`, `${BASE}tool/`]),
    'tool/index.html': page('A tool', `${BASE}tool/`),
    ...extra,
  };
}

test('a healthy site passes with no problems', async () => {
  const dir = await siteWith(healthySite());
  const { problems, stats } = await checkSite(dir);
  assert.deepEqual(problems, []);
  assert.equal(stats.products, 1);
  assert.equal(stats.deadLinks, 0);
  assert.equal(stats.sitemapEntries, 2);
});

test('a dead internal link is caught', async () => {
  const dir = await siteWith(healthySite({
    'index.html': page('<a href="tool/">Tool</a><a href="gone.html">Gone</a>'),
  }));
  const { problems } = await checkSite(dir);
  assert.ok(problems.some((p) => p.includes('dead internal link') && p.includes('gone.html')), problems.join('\n'));
});

test('a link that climbs above the site root is caught', async () => {
  const dir = await siteWith(healthySite({
    'tool/index.html': page('<a href="../../secrets.html">up</a>', `${BASE}tool/`),
  }));
  const { problems } = await checkSite(dir);
  assert.ok(problems.some((p) => p.includes('escapes the site root')), problems.join('\n'));
});

// The bug that would have cost the portfolio half its organic reach: a sitemap
// entry that is internally plausible but resolves to nothing.
test('a sitemap entry with no page behind it is caught', async () => {
  const dir = await siteWith(healthySite({
    'sitemap.xml': sitemap([`${BASE}`, `${BASE}ventures/tool/`]),
  }));
  const { problems } = await checkSite(dir);
  assert.ok(problems.some((p) => p.includes('no page behind it')), problems.join('\n'));
});

test('a relative sitemap entry is caught rather than silently accepted', async () => {
  const dir = await siteWith(healthySite({
    'sitemap.xml': sitemap([`${BASE}`, './tool/']),
  }));
  const { problems } = await checkSite(dir);
  assert.ok(problems.some((p) => p.includes('not an absolute URL')), problems.join('\n'));
});

test('a sitemap entry outside the published root is caught', async () => {
  const dir = await siteWith(healthySite({
    'sitemap.xml': sitemap([`${BASE}`, 'https://example.test/elsewhere/']),
  }));
  const { problems } = await checkSite(dir);
  assert.ok(problems.some((p) => p.includes('outside the published site root')), problems.join('\n'));
});

test('a canonical left on the placeholder origin is caught', async () => {
  const dir = await siteWith(healthySite({
    'tool/index.html': page('A tool', 'https://example.invalid/tool/'),
  }));
  const { problems } = await checkSite(dir);
  assert.ok(problems.some((p) => p.includes('placeholder origin')), problems.join('\n'));
});

// The false positive that made the first version of this check useless: a tool
// that legitimately displays a sample URL in its own page copy.
test('a placeholder host in page content is not mistaken for a canonical', async () => {
  const dir = await siteWith(healthySite({
    'tool/index.html': page(
      '<textarea>{"url":"https://example.com","violations":[]}</textarea>',
      `${BASE}tool/`,
    ),
  }));
  const { problems } = await checkSite(dir);
  assert.deepEqual(problems, []);
});

test('missing required files are reported by name', async () => {
  const dir = await siteWith({
    'index.html': page(),
    'tool/index.html': page('A tool', `${BASE}tool/`),
    'sitemap.xml': sitemap([`${BASE}`]),
  });
  const { problems } = await checkSite(dir);
  assert.ok(problems.some((p) => p.includes('missing required file: 404.html')), problems.join('\n'));
  assert.ok(problems.some((p) => p.includes('missing required file: robots.txt')), problems.join('\n'));
});

test('a missing output directory is reported rather than throwing', async () => {
  const { problems, stats } = await checkSite('/definitely/not/here');
  assert.equal(stats, null);
  assert.ok(problems[0].includes('does not exist'));
});

test('off-site and non-http links are not treated as internal', async () => {
  const dir = await siteWith(healthySite({
    'index.html': page(
      '<a href="tool/">Tool</a>' +
      '<a href="https://github.com/x">gh</a><a href="mailto:a@b.c">mail</a>' +
      '<a href="#top">top</a><img src="data:image/gif;base64,R0lGOD">',
    ),
  }));
  const { problems } = await checkSite(dir);
  assert.deepEqual(problems, []);
});

test('resolveLink returns null for anything not served by the artifact', () => {
  assert.equal(resolveLink('https://example.com/x', 'index.html'), null);
  assert.equal(resolveLink('mailto:a@b.c', 'index.html'), null);
  assert.equal(resolveLink('#section', 'index.html'), null);
  assert.equal(resolveLink('//cdn.example/x.js', 'index.html'), null);
});

test('resolveLink resolves relative to the page, and root-relative to the root', () => {
  assert.equal(resolveLink('b.html', 'tool/a.html').target, 'tool/b.html');
  // The trailing slash survives normalisation; `targetExists` resolves that
  // form to `other/index.html`, which is how Pages serves a directory link.
  assert.equal(resolveLink('/other/', 'tool/a.html').target, 'other/');
  assert.equal(resolveLink('../x.html', 'tool/a.html').target, 'x.html');
  assert.equal(resolveLink('../../x.html', 'tool/a.html').escaped, true);
});

test('walk lists nested files with forward slashes', async () => {
  const dir = await siteWith({ 'a.html': 'x', 'deep/nested/b.html': 'y' });
  const files = (await walk(dir)).sort();
  assert.deepEqual(files, ['a.html', 'deep/nested/b.html']);
});
