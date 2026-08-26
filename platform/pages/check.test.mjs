// Tests for check.mjs.
//
// A verifier that only ever passes is worse than no verifier, because it buys
// false confidence in the one artifact that reaches the public origin. Every
// test here builds a deliberately broken site in a temp directory and asserts
// the corresponding check *fires*. The last test asserts a well-formed site
// stays clean, so the suite fails if the checks become trigger-happy too.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { checkSite, localReferences, resolveReference } from './check.mjs';

const BASE = 'https://example.test/repo/';

/** Minimal page that satisfies every check by default. */
const page = (body = '') => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Tool</title>
<link rel="canonical" href="${BASE}"></head>
<body>${body}<footer>Free and as-is. No warranty.</footer></body></html>`;

const hub = (slugs) => page(
  slugs.map((s) => `<a href="${s}/" data-tool="${s}">${s}</a>`).join(''),
);

/**
 * Write a well-formed site, then let each test damage it. `overrides` maps a
 * relative path to contents; `null` deletes.
 */
async function fixture(overrides = {}, { tools = 20 } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pages-check-'));
  const slugs = Array.from({ length: tools }, (_, i) => `tool-${String(i + 1).padStart(2, '0')}`);

  await fs.writeFile(path.join(dir, 'index.html'), hub(slugs));
  await fs.writeFile(path.join(dir, '404.html'), page('Not found'));
  await fs.writeFile(path.join(dir, 'robots.txt'), `Sitemap: ${BASE}sitemap.xml\n`);
  await fs.writeFile(path.join(dir, 'sitemap-hub.xml'), `<urlset><url><loc>${BASE}</loc></url></urlset>`);
  await fs.writeFile(
    path.join(dir, 'sitemap.xml'),
    `<sitemapindex>${slugs.map((s) => `<sitemap><loc>${BASE}${s}/</loc></sitemap>`).join('')}</sitemapindex>`,
  );
  for (const slug of slugs) {
    await fs.mkdir(path.join(dir, slug), { recursive: true });
    await fs.writeFile(path.join(dir, slug, 'index.html'), page(`<h1>${slug}</h1>`));
  }

  for (const [rel, contents] of Object.entries(overrides)) {
    const target = path.join(dir, rel);
    if (contents === null) {
      await fs.rm(target, { recursive: true, force: true });
      continue;
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, contents);
  }

  return { dir, slugs };
}

const run = (dir) => checkSite({ distDir: dir, baseUrl: BASE, minTools: 20 });
const groups = (problems) => new Set(problems.map((p) => p.group));
const detailsOf = (problems, group) => problems.filter((p) => p.group === group).map((p) => p.detail);

// ---------------------------------------------------------------------------

test('a well-formed site reports no problems', async () => {
  const { dir } = await fixture();
  const { problems, stats } = await run(dir);
  assert.deepEqual(problems, [], `unexpected: ${JSON.stringify(problems, null, 2)}`);
  assert.equal(stats.tools, 20);
});

test('missing site directory is reported, not thrown', async () => {
  const { problems } = await checkSite({ distDir: '/nope/not/built', baseUrl: BASE });
  assert.equal(problems.length, 1);
  assert.match(problems[0].detail, /run build\.mjs first/);
});

test('a missing root file is caught', async () => {
  const { dir } = await fixture({ 'robots.txt': null, '404.html': null });
  const { problems } = await run(dir);
  const structure = detailsOf(problems, 'structure');
  assert.ok(structure.some((d) => d.includes('robots.txt')));
  assert.ok(structure.some((d) => d.includes('404.html')));
});

test('a tool directory without index.html is caught', async () => {
  const { dir } = await fixture({ 'tool-03/index.html': null });
  const { problems } = await run(dir);
  assert.ok(detailsOf(problems, 'structure').some((d) => d.includes('tool-03')));
});

test('a published tool the hub does not link is caught', async () => {
  // The quiet one: the tool builds fine and is simply unreachable.
  const { dir, slugs } = await fixture();
  await fs.writeFile(path.join(dir, 'index.html'), hub(slugs.slice(0, -1)));
  const { problems } = await run(dir);
  assert.ok(detailsOf(problems, 'hub').some((d) => d.includes(slugs.at(-1)) && d.includes('cannot find')));
});

test('a hub link with no directory behind it is caught', async () => {
  const { dir, slugs } = await fixture();
  await fs.writeFile(path.join(dir, 'index.html'), hub([...slugs, 'ghost-tool']));
  const { problems } = await run(dir);
  assert.ok(detailsOf(problems, 'hub').some((d) => d.includes('ghost-tool')));
});

test('a discovery collapse is caught by the tool-count floor', async () => {
  const { dir } = await fixture({}, { tools: 3 });
  const { problems } = await run(dir);
  assert.ok(detailsOf(problems, 'discovery').some((d) => /only 3 tool/.test(d)));
});

test('a relative link to an unpublished file is caught', async () => {
  // The real-world case: a calculator imports calc.mjs that the copy filter
  // dropped, so the form renders and then does nothing.
  const { dir } = await fixture({
    'tool-05/index.html': page('<script type="module">import { calc } from "./calc.mjs";</script>'),
  });
  const { problems } = await run(dir);
  assert.ok(detailsOf(problems, 'links').some((d) => d.includes('calc.mjs')));
});

test('a stylesheet or image that was not published is caught', async () => {
  const { dir } = await fixture({
    'tool-06/index.html': page('<link rel="stylesheet" href="style.css"><img src="chart.png" alt="">'),
  });
  const { problems } = await run(dir);
  const links = detailsOf(problems, 'links');
  assert.ok(links.some((d) => d.includes('style.css')));
  assert.ok(links.some((d) => d.includes('chart.png')));
});

test('a reference climbing out of the site root is caught', async () => {
  const { dir } = await fixture({
    'tool-07/index.html': page('<a href="../../../etc/passwd">x</a>'),
  });
  const { problems } = await run(dir);
  assert.ok(detailsOf(problems, 'links').some((d) => /escapes the site root/.test(d)));
});

test('the placeholder origin surviving into the artifact is caught', async () => {
  const { dir } = await fixture({
    'tool-08/index.html': page('<link rel="canonical" href="https://example.invalid/tool-08/">'),
  });
  const { problems } = await run(dir);
  assert.ok(detailsOf(problems, 'origin').some((d) => d.includes('tool-08')));
});

test('a tool shipping without a disclaimer is caught', async () => {
  const { dir } = await fixture({
    'tool-09/index.html': '<!doctype html><html lang="en"><head><title>t</title></head><body><h1>$420.00</h1></body></html>',
  });
  const { problems } = await run(dir);
  assert.ok(detailsOf(problems, 'disclaimer').some((d) => d.includes('tool-09')));
});

test('a hub shipping without a disclaimer is caught', async () => {
  const { dir, slugs } = await fixture();
  await fs.writeFile(
    path.join(dir, 'index.html'),
    `<!doctype html><html lang="en"><head><title>hub</title></head><body>${slugs
      .map((s) => `<a href="${s}/" data-tool="${s}">${s}</a>`)
      .join('')}</body></html>`,
  );
  const { problems } = await run(dir);
  assert.ok(detailsOf(problems, 'disclaimer').some((d) => /hub page/.test(d)));
});

test('leaked test payload and bookkeeping are caught', async () => {
  const { dir } = await fixture({
    'tool-10/calc.test.mjs': 'assert(true)',
    'tool-11/VENTURE.yaml': 'slug: tool-11',
    'tool-12/README.md': '# notes',
  });
  const { problems } = await run(dir);
  const leaked = detailsOf(problems, 'leaked');
  assert.ok(leaked.some((d) => d.includes('calc.test.mjs')));
  assert.ok(leaked.some((d) => d.includes('VENTURE.yaml')));
  assert.ok(leaked.some((d) => d.includes('README.md')));
});

test('a copied node_modules is caught without walking into it', async () => {
  const { dir } = await fixture();
  await fs.mkdir(path.join(dir, 'tool-13', 'node_modules', 'left-pad'), { recursive: true });
  await fs.writeFile(path.join(dir, 'tool-13', 'node_modules', 'left-pad', 'index.js'), 'x');
  const { problems } = await run(dir);
  assert.ok(detailsOf(problems, 'leaked').some((d) => d.includes('node_modules')));
});

test('a sitemap entry with nothing published behind it is caught', async () => {
  const { dir, slugs } = await fixture();
  await fs.writeFile(
    path.join(dir, 'sitemap.xml'),
    `<sitemapindex>${[...slugs, 'retired-tool']
      .map((s) => `<sitemap><loc>${BASE}${s}/</loc></sitemap>`)
      .join('')}</sitemapindex>`,
  );
  const { problems } = await run(dir);
  assert.ok(detailsOf(problems, 'sitemap').some((d) => d.includes('retired-tool')));
});

test('a base URL without a trailing slash does not fail a good site', async () => {
  // buildSite() appends the slash before writing any URL. If the checker did
  // not normalise identically, an owner setting PAGES_BASE_URL without one
  // would get a correctly built site and a check that rejected every sitemap
  // entry — blocking the deploy over nothing.
  const { dir } = await fixture();
  const { problems } = await checkSite({ distDir: dir, baseUrl: BASE.replace(/\/$/, ''), minTools: 20 });
  assert.deepEqual(problems, [], `unexpected: ${JSON.stringify(problems, null, 2)}`);
});

test('a sitemap written against the wrong origin is caught', async () => {
  const { dir } = await fixture({
    'sitemap.xml': '<sitemapindex><sitemap><loc>https://elsewhere.test/a/</loc></sitemap></sitemapindex>',
  });
  const { problems } = await run(dir);
  assert.ok(detailsOf(problems, 'origin').some((d) => /does not mention the base URL/.test(d)));
});

test('several independent problems are all reported together', async () => {
  const { dir } = await fixture({
    'robots.txt': null,
    'tool-14/index.html': page('<img src="missing.png" alt="">'),
    'tool-15/index.html': '<!doctype html><html lang="en"><head><title>t</title></head><body>x</body></html>',
    'tool-16/calc.test.mjs': 'x',
  });
  const { problems } = await run(dir);
  // One run must surface all of them — a checker that stops at the first
  // problem turns one fix-and-rerun cycle into four.
  assert.ok(groups(problems).size >= 4, `groups: ${[...groups(problems)].join(', ')}`);
});

// --- unit-level behaviour the site checks depend on ------------------------

test('data-URI favicons do not register as broken references', async () => {
  // Regression guard: inline SVG data URIs contain quotes and spaces, and a
  // naive attribute match reports ~20 phantom links per page.
  const svg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3C/svg%3E";
  const refs = localReferences(`<link rel="icon" href="${svg}"><img src="real.png" alt="">`);
  assert.deepEqual(refs, ['real.png']);
});

test('external, mailto and anchor references are ignored', () => {
  const refs = localReferences(
    '<a href="https://github.com/sponsors/x">s</a><a href="//cdn.test/a.js">c</a>' +
      '<a href="mailto:a@b.test">m</a><a href="#top">t</a><a href="calc.mjs">l</a>',
  );
  assert.deepEqual(refs, ['calc.mjs']);
});

test('query strings and fragments are stripped before resolving', () => {
  const refs = localReferences('<a href="page.html?v=2#section">x</a>');
  assert.deepEqual(refs, ['page.html']);
});

test('module specifiers in inline scripts are found', () => {
  const refs = localReferences(
    '<script type="module">import { a } from "./calc.mjs";\nconst m = await import("./share.mjs");</script>',
  );
  assert.deepEqual(refs.sort(), ['./calc.mjs', './share.mjs']);
});

test('root-relative references resolve against the deployed base path', () => {
  // A project Pages site is served from /monorepo-projects/, so a link written
  // as /monorepo-projects/x/ points at x/ inside dist — not at dist's parent.
  const resolved = resolveReference('/repo/tool-01/', '/d/index.html', '/d', '/repo/');
  assert.equal(resolved, path.join('/d', 'tool-01', 'index.html'));
});

test('a directory reference resolves to its index.html', () => {
  assert.equal(resolveReference('sub/', '/d/a/index.html', '/d', '/'), path.join('/d/a/sub', 'index.html'));
});
