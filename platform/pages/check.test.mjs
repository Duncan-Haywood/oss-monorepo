// Tests the artifact checker.
//
// A checker that only ever passes is worse than no checker, because it reads as
// evidence. Every test here breaks a real built artifact in one specific way
// and asserts that break is reported — and the first one asserts a real build
// comes back clean, so the fixture itself is trustworthy.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { buildSite, REPO_ROOT } from './build.mjs';
import { checkSite } from './check.mjs';

const BASE = 'https://duncan-haywood.github.io/monorepo-projects/';

let pristine;

before(async () => {
  pristine = await fs.mkdtemp(path.join(os.tmpdir(), 'pages-check-'));
  await buildSite({ outDir: path.join(pristine, 'dist'), baseUrl: BASE });
});

after(async () => {
  await fs.rm(pristine, { recursive: true, force: true });
});

/** A throwaway copy of the good build, for one test to vandalise. */
async function scratchSite() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pages-scratch-'));
  const site = path.join(dir, 'dist');
  await fs.cp(path.join(pristine, 'dist'), site, { recursive: true });
  return site;
}

async function assertReports(site, needle) {
  const problems = await checkSite(site, { baseUrl: BASE });
  assert.ok(
    problems.some((p) => p.includes(needle)),
    `expected a problem containing ${JSON.stringify(needle)}, got: ${problems.slice(0, 5).join(' | ')}`,
  );
}

// --- the happy path first, so the fixture is trusted ------------------------

test('a real build passes clean', async () => {
  assert.deepEqual(await checkSite(path.join(pristine, 'dist'), { baseUrl: BASE }), []);
});

test('every venture sitemap is generated, absolute, and resolves', async () => {
  const site = path.join(pristine, 'dist');
  const index = await fs.readFile(path.join(site, 'sitemap.xml'), 'utf8');
  const children = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.ok(children.length > 30, `expected a child sitemap per venture, got ${children.length}`);

  for (const child of children) {
    assert.ok(child.startsWith(BASE), `child sitemap is not absolute: ${child}`);
    const file = path.join(site, child.slice(BASE.length));
    const text = await fs.readFile(file, 'utf8');
    for (const loc of [...text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])) {
      // The regression: `ventures/` is a repo path, never a published one.
      assert.ok(!loc.includes('/ventures/'), `sitemap URL carries a repo path: ${loc}`);
      assert.ok(loc.startsWith(BASE), `sitemap <loc> is not an absolute site URL: ${loc}`);
    }
  }
});

test('no sitemap advertises an index.html instead of its directory', async () => {
  const site = path.join(pristine, 'dist');
  const sitemap = await fs.readFile(
    path.join(site, 'walmart-marketplace-calculator', 'sitemap.xml'),
    'utf8',
  );
  assert.ok(sitemap.includes(`${BASE}walmart-marketplace-calculator/</loc>`));
  assert.ok(!sitemap.includes('index.html'));
});

// --- each failure mode ------------------------------------------------------

test('a missing root file is reported', async () => {
  const site = await scratchSite();
  await fs.rm(path.join(site, 'robots.txt'));
  await assertReports(site, 'missing required file: robots.txt');
});

test('a leftover placeholder origin is reported', async () => {
  const site = await scratchSite();
  const page = path.join(site, 'cut-list-optimizer', 'index.html');
  await fs.appendFile(page, '\n<link rel="canonical" href="https://example.invalid/x">');
  await assertReports(site, 'still contains https://example.invalid');
});

test('a dead internal link is reported', async () => {
  const site = await scratchSite();
  const page = path.join(site, 'index.html');
  const html = await fs.readFile(page, 'utf8');
  await fs.writeFile(page, html.replace('</body>', '<a href="gone.html">x</a></body>'));
  await assertReports(site, 'dead link -> gone.html');
});

test('a link escaping the site root is reported', async () => {
  const site = await scratchSite();
  const page = path.join(site, 'index.html');
  const html = await fs.readFile(page, 'utf8');
  await fs.writeFile(page, html.replace('</body>', '<a href="../../etc/passwd">x</a></body>'));
  await assertReports(site, 'escapes the site root');
});

test('a product with no landing page is reported', async () => {
  const site = await scratchSite();
  await fs.rm(path.join(site, 'cut-list-optimizer', 'index.html'));
  await assertReports(site, 'cut-list-optimizer/ has no index.html');
});

test('a sitemap URL that 404s is reported', async () => {
  const site = await scratchSite();
  const sitemap = path.join(site, 'cut-list-optimizer', 'sitemap.xml');
  const xml = await fs.readFile(sitemap, 'utf8');
  await fs.writeFile(
    sitemap,
    xml.replace('</urlset>', `  <url><loc>${BASE}ventures/cut-list-optimizer/</loc></url>\n</urlset>`),
  );
  await assertReports(site, 'advertises a URL that 404s');
});

test('a relative sitemap <loc> is reported as malformed, not as a 404', async () => {
  const site = await scratchSite();
  const sitemap = path.join(site, 'cut-list-optimizer', 'sitemap.xml');
  const xml = await fs.readFile(sitemap, 'utf8');
  await fs.writeFile(sitemap, xml.replace('</urlset>', '  <url><loc>index.html</loc></url>\n</urlset>'));
  await assertReports(site, 'not an absolute URL');
});

test('a sitemap URL on another host is reported as foreign', async () => {
  const site = await scratchSite();
  const sitemap = path.join(site, 'cut-list-optimizer', 'sitemap.xml');
  const xml = await fs.readFile(sitemap, 'utf8');
  await fs.writeFile(
    sitemap,
    xml.replace('</urlset>', '  <url><loc>https://example.org/elsewhere</loc></url>\n</urlset>'),
  );
  await assertReports(site, 'another host');
});

test('a served page in no sitemap is reported', async () => {
  const site = await scratchSite();
  await fs.writeFile(
    path.join(site, 'cut-list-optimizer', 'orphan.html'),
    '<html><body>not listed</body></html>',
  );
  await assertReports(site, 'served but in no sitemap');
});

test('a child sitemap named but not served is reported', async () => {
  const site = await scratchSite();
  await fs.rm(path.join(site, 'cut-list-optimizer', 'sitemap.xml'));
  await assertReports(site, 'child sitemap that is not served');
});

test('a missing directory is reported rather than crashing', async () => {
  const problems = await checkSite(path.join(os.tmpdir(), 'definitely-not-here-9134'), { baseUrl: BASE });
  assert.ok(problems.length > 0);
});

// --- things that must NOT be flagged ----------------------------------------

test('external, anchor, and mailto links are not flagged', async () => {
  const site = await scratchSite();
  const page = path.join(site, 'index.html');
  const html = await fs.readFile(page, 'utf8');
  await fs.writeFile(
    page,
    html.replace(
      '</body>',
      '<a href="https://example.org/x">e</a><a href="#top">a</a><a href="mailto:x@example.org">m</a></body>',
    ),
  );
  assert.deepEqual(await checkSite(site, { baseUrl: BASE }), []);
});

test('a query string and fragment are stripped before resolving', async () => {
  const site = await scratchSite();
  const page = path.join(site, 'index.html');
  const html = await fs.readFile(page, 'utf8');
  await fs.writeFile(
    page,
    html.replace('</body>', '<a href="cut-list-optimizer/index.html?a=1#b">q</a></body>'),
  );
  assert.deepEqual(await checkSite(site, { baseUrl: BASE }), []);
});

test('the 404 page is not required to appear in a sitemap', async () => {
  const site = path.join(pristine, 'dist');
  assert.deepEqual(await checkSite(site, { baseUrl: BASE }), []);
  const index = await fs.readFile(path.join(site, 'sitemap.xml'), 'utf8');
  assert.ok(!index.includes('404.html'));
});
