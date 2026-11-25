// Does the catalogue survive being moved to a custom domain?
//
// WHY THIS EXISTS
//
// The site is served today from a project-Pages *subpath*
// (`https://duncan-haywood.github.io/oss-monorepo/`), and
// `platform/ci/pages_state.py`'s `indexing` row records what that costs: a
// crawler fetches `robots.txt` from the *host* root, which belongs to the
// owner's separate user-level Pages site, so the `Sitemap:` line this build
// writes has never been read by anything. Sitemap auto-discovery has never
// happened for any of the 881 pages published here, and
// `portfolio/usage/usage.yaml` still records zero visitors across all of them.
//
// One of the two owner-only fixes named in that row is to configure a custom
// domain. `platform/pages/publish-branch.sh` already carries a `CNAME` through
// to the serving branch (`PAGES_CNAME`), and `published-base-url.mjs` already
// reads it back — so the repository side of that switch is built. What was
// missing is a guard that the switch produces a *correct* site.
//
// That gap was not theoretical. Every base-URL assertion in `build.test.mjs`
// runs against `https://example.test/site/` — a subpath, like today's origin.
// A custom domain moves the site to an origin *root*, which changes the base
// path from `/monorepo-projects/` to `/`, and `applyBaseUrl` rewrites absolute
// URLs by string substitution of `DEFAULT_BASE_URL` (build.mjs:2152). A
// substitution that misses one construction site ships a page whose canonical
// tag still names the old origin — which is not a broken link a visitor would
// report, but a duplicate-content signal that splits the ranking of a page
// nobody has found yet, on the very day the domain is supposed to fix that.
//
// So this file pins the property that makes the DNS change safe: after a build
// under a custom origin, *nothing in the artifact still names the default one*,
// and the three surfaces a crawler actually reads — `robots.txt`, `sitemap.xml`
// and every `rel="canonical"` — all carry the new origin.
//
// Verified by hand against the real catalogue before this was written: a full
// `--base=https://marisstella.dev/` build produced 2,543 files, 229 sitemap
// `<loc>`s and zero references to the default origin. This test is that check
// made repeatable on a fixture, because a verification run once and not encoded
// is the shape CLAUDE.md records paying for repeatedly.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { buildSite, DEFAULT_BASE_URL, COMPARE_PATH, GUIDES_PATH } from './build.mjs';

// An origin root, not a subpath — the shape a custom domain produces, and the
// one no other test in this directory exercises.
const APEX = 'https://catalogue.test/';
const DEFAULT_HOST = new URL(DEFAULT_BASE_URL).host;
const HOST_RE = DEFAULT_HOST.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const DEFAULT_ORIGIN_LINK = new RegExp(
  `(?:\\b(?:href|src|content|action)=["']|<loc>|"(?:url|item|@id|sameAs|contentUrl|image)"\\s*:\\s*")(?:https?:)?//${HOST_RE}`,
);

// The two origins a venture's own markup can carry before the build rewrites
// them: `PLACEHOLDER_ORIGIN` (`https://example.invalid/`), which pages were
// written against before any real origin existed, and `DEFAULT_BASE_URL`,
// which pages written since the Pages route went up carry instead.
//
// The fixture below must contain BOTH, and that is not cosmetic. An earlier
// draft of this file built pages with no absolute URLs at all, so it never
// reached `applyBaseUrl` — deleting that function's rewrite outright left all
// four tests green. A fixture that cannot fail is the "guard worth less than
// no guard" case CLAUDE.md records; these two constants are what give the
// suite teeth, and the mutation is re-run in the test below.
const PLACEHOLDER_ORIGIN = 'https://example.invalid/';

const page = (title, body, { canonical = null, extra = '' } = {}) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>` +
  (canonical ? `<link rel="canonical" href="${canonical}">` : '') +
  `<meta name="description" content="A free calculator that does arithmetic in your browser."></head>` +
  `<body>${body}${extra}<p>No warranty: this is an estimate, not advice.</p></body></html>`;

let built;
async function site() {
  if (built) return built;
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'apex-'));
  const ventures = path.join(out, 'ventures');
  const mk = async (slug, files) => {
    await fs.mkdir(path.join(ventures, slug), { recursive: true });
    for (const [name, body] of Object.entries(files)) {
      await fs.writeFile(path.join(ventures, slug, name), body);
    }
  };
  await mk('alpha-calculator', {
    // Carries a canonical already pointing at the *default* origin — the shape
    // of a venture page written since the Pages route went up. This is the one
    // that dies if `applyBaseUrl`'s default-origin rewrite is removed.
    'index.html': page(
      'Alpha Calculator',
      '<h1>Alpha Calculator</h1><a href="how-much-to-charge.html">How much to charge</a>',
      {
        canonical: `${DEFAULT_BASE_URL}alpha-calculator/`,
        extra: `<p>See <a href="${DEFAULT_BASE_URL}beta-calculator/">Beta</a>.</p>`,
      },
    ),
    // A guide, for the /guides/ test below; a comparison page belongs to
    // /compare/, not /guides/.
    'how-much-to-charge.html': page('How much to charge', '<h1>How much to charge</h1>'),
    'vs-jobber.html': page('This calculator vs. Jobber', '<h1>This calculator vs. Jobber</h1>', {
      canonical: `${DEFAULT_BASE_URL}alpha-calculator/vs-jobber.html`,
    }),
  });
  await mk('beta-calculator', {
    // Carries the older placeholder origin instead, so both rewrite paths are
    // exercised rather than only whichever one happens to be current.
    // The body link matters more than the canonical here: the build *computes*
    // every canonical, so a hardcoded one is replaced whether or not the
    // rewrite ran, and asserting on it proves nothing about the rewrite. A
    // body link is only ever rewritten, so it is the one that goes dead.
    'index.html': page('Beta Calculator', '<h1>Beta Calculator</h1>', {
      canonical: `${PLACEHOLDER_ORIGIN}beta-calculator/`,
      extra: `<p>Docs at <a href="${PLACEHOLDER_ORIGIN}docs/guide.html">the guide</a>.</p>`,
    }),
    // A second tool comparing itself with the same product, so /compare/
    // groups two pages under one subject.
    'vs-jobber.html': page('This calculator vs. Jobber', '<h1>This calculator vs. Jobber</h1>'),
  });

  const outDir = path.join(out, 'dist');
  const result = await buildSite({
    venturesDir: ventures,
    outDir,
    baseUrl: APEX,
    log: () => {},
    disableWorker: true,
    // Markup only: no test here reads a card, and this base URL gives every
    // card its own key, so drawing them cost ~7,000 cold draws.
    cards: false,
  });
  built = { out, outDir, comparisons: result.comparisons };
  return built;
}

// The build output is read-only once site() resolves, and three tests sweep
// all of it: one walk and one read of each text file serve them all. Each
// sweep had walked about 8,500 files and re-read every text one, about 2 s a
// sweep alone; what each test asks of a file is kept, not the file
// (docs/history/pages-test-perf-2026-11-18-temp-dirs-and-one-read.md).
const TEXT = /\.(html|xml|txt|json|mjs|js|css|webmanifest)$/;
let sweepMemo;
function sweep() {
  sweepMemo ??= site().then(async ({ outDir }) => {
    const files = await allFiles(outDir);
    const rows = [];
    for (const file of files) {
      // Text surfaces only. A binary asset cannot carry a URL we rewrote, and
      // reading one as utf8 would produce noise rather than a finding.
      if (!TEXT.test(file)) continue;
      const body = await fs.readFile(file, 'utf8');
      rows.push({
        file,
        // A link, canonical, <loc> or JSON-LD URL, not any mention: since
        // 2026-11-10 the default origin is the site's own domain, which posts
        // and the plain-text search index name in prose ("marisstella.app
        // answered 200 ..."). Prose is not a link or a canonical signal.
        defaultLink: DEFAULT_ORIGIN_LINK.test(body),
        placeholder: body.includes(PLACEHOLDER_ORIGIN),
        canonicals: file.endsWith('.html')
          ? [...body.matchAll(/rel="canonical"\s+href="([^"]*)"/g)].map((m) => m[1])
          : null,
      });
    }
    return { files, rows };
  });
  return sweepMemo;
}

// The fixture build is about 350 MB; until 2026-11-18 every run left it in
// the temp directory.
after(async () => {
  if (built) await fs.rm(built.out, { recursive: true, force: true });
});

/** Every file in the artifact, as absolute paths. */
async function allFiles(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await allFiles(full)));
    else out.push(full);
  }
  return out;
}

test('a custom-domain build leaves no reference to the default origin', async () => {
  const { outDir } = await site();
  const { files, rows } = await sweep();
  assert.ok(files.length > 0, 'the fixture build produced no files at all');

  // Which files count, and what a hit is, are set in sweep().
  const offenders = rows.filter((r) => r.defaultLink).map((r) => path.relative(outDir, r.file));

  assert.deepEqual(
    offenders,
    [],
    `these files still link the default origin (//${DEFAULT_HOST}) after a build ` +
      `under ${APEX}. A canonical tag or <loc> naming the old origin is a ` +
      'duplicate-content signal, not a visible breakage — which is why it needs ' +
      'a test rather than a page load to catch.',
  );
});

test('a custom-domain build leaves no reference to the placeholder origin', async () => {
  // Separate from the default-origin sweep above because the two fail for
  // different reasons and a reader should not have to guess which. This one is
  // the older rewrite (`example.invalid` → the real base), and its failure mode
  // is worse than a duplicate-content signal: `.invalid` is reserved by RFC
  // 2606 and resolves nowhere, so a surviving link is simply dead for every
  // visitor who clicks it.
  //
  // It also covers a path the canonical assertion below cannot: the build
  // *computes* each page's canonical tag, so a page's own hardcoded canonical
  // is replaced regardless of whether the rewrite ran. Body links are not —
  // they are only ever rewritten. Deleting the placeholder rewrite leaves this
  // test as the sole thing that goes red.
  const { outDir } = await site();
  const { rows } = await sweep();

  const offenders = rows.filter((r) => r.placeholder).map((r) => path.relative(outDir, r.file));

  assert.deepEqual(
    offenders,
    [],
    `these files still name the placeholder origin (${PLACEHOLDER_ORIGIN}) after ` +
      `a build under ${APEX}. That host is reserved and resolves nowhere, so ` +
      'every surviving reference is a dead link.',
  );
});

test('robots.txt points a crawler at the sitemap on the custom origin', async () => {
  const { outDir } = await site();
  const robots = await fs.readFile(path.join(outDir, 'robots.txt'), 'utf8');

  // The whole point of the custom domain: at an origin root this file is the
  // one a crawler actually fetches, so its Sitemap line finally means something.
  assert.match(robots, /^Sitemap: https:\/\/catalogue\.test\/sitemap\.xml$/m);
  assert.ok(!robots.includes(DEFAULT_HOST));
});

test('every sitemap <loc> is an absolute URL on the custom origin', async () => {
  const { outDir } = await site();
  const xml = await fs.readFile(path.join(outDir, 'sitemap.xml'), 'utf8');

  const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
  assert.ok(locs.length > 0, 'the sitemap listed nothing');

  for (const loc of locs) {
    assert.ok(loc.startsWith(APEX), `sitemap <loc> is not on the custom origin: ${loc}`);
    // A doubled slash is the classic root-vs-subpath join bug: it only appears
    // when the base path is "/" rather than "/monorepo-projects/", which is
    // exactly the case no other test here builds.
    assert.ok(
      !new URL(loc).pathname.includes('//'),
      `sitemap <loc> has a doubled slash in its path: ${loc}`,
    );
  }
});

test('every canonical tag names the custom origin', async () => {
  const { outDir } = await site();
  const pages = (await sweep()).rows.filter((r) => r.canonicals);
  assert.ok(pages.length > 0, 'the fixture build wrote no HTML');

  let seen = 0;
  for (const { file, canonicals } of pages) {
    for (const href of canonicals) {
      seen += 1;
      assert.ok(
        href.startsWith(APEX),
        `${path.relative(outDir, file)} has a canonical off the custom origin: ${href}`,
      );
      assert.ok(
        !new URL(href).pathname.includes('//'),
        `${path.relative(outDir, file)} has a doubled slash in its canonical: ${href}`,
      );
    }
  }
  assert.ok(seen > 0, 'no canonical tags were found, so this asserted nothing');
});

// The /compare/ and /guides/ end-to-end tests. They lived in build.test.mjs
// with a two-venture fixture build of their own, the same fixed work as the
// build above (every post, research page and hub section) for two extra pages;
// one fixture now serves both files' tests, one full fixture build fewer per
// suite run (docs/history/pages-test-perf-2026-11-25-one-fixture-build.md).
// Their URLs are on APEX, an origin root, as the old fixture's were.

test('the built site publishes /compare/, links it, and lists it in the sitemap', async () => {
  const { outDir: dist, comparisons } = await site();
  assert.equal(comparisons.length, 1, 'both tools compare with one product');
  assert.equal(comparisons[0].subject, 'Jobber');

  const compare = await fs.readFile(path.join(dist, COMPARE_PATH, 'index.html'), 'utf8');
  assert.ok(compare.includes('href="../alpha-calculator/vs-jobber.html"'));
  assert.ok(compare.includes('href="../beta-calculator/vs-jobber.html"'));

  const hub = await fs.readFile(path.join(dist, 'index.html'), 'utf8');
  assert.ok(hub.includes(`href="${COMPARE_PATH}"`), 'the hub must link /compare/');

  const hubSitemap = await fs.readFile(path.join(dist, 'sitemap-hub.xml'), 'utf8');
  assert.ok(hubSitemap.includes(`<loc>${APEX}${COMPARE_PATH}</loc>`));

  const llms = await fs.readFile(path.join(dist, 'llms.txt'), 'utf8');
  assert.ok(llms.includes(`${APEX}${COMPARE_PATH}`), 'llms.txt must name /compare/');
});

test('the built site publishes /guides/, links it, and lists it in the sitemap', async () => {
  // The end-to-end half of the guides index: the three places a page has to
  // appear before anyone reaches it — a link a visitor can click, a sitemap
  // entry a crawler follows, and an llms.txt line an assistant reads.
  const { outDir: dist } = await site();

  const guides = await fs.readFile(path.join(dist, GUIDES_PATH, 'index.html'), 'utf8');
  assert.ok(guides.includes('href="../alpha-calculator/how-much-to-charge.html"'));
  assert.ok(guides.includes('How much to charge'), 'the page’s own heading is the entry');
  assert.ok(
    !guides.includes('vs-jobber.html'),
    'a comparison page has /compare/ and must not be listed twice',
  );

  const hub = await fs.readFile(path.join(dist, 'index.html'), 'utf8');
  assert.ok(hub.includes(`href="${GUIDES_PATH}"`), 'the hub must link /guides/');

  const hubSitemap = await fs.readFile(path.join(dist, 'sitemap-hub.xml'), 'utf8');
  assert.ok(hubSitemap.includes(`<loc>${APEX}${GUIDES_PATH}</loc>`));

  const llms = await fs.readFile(path.join(dist, 'llms.txt'), 'utf8');
  assert.ok(llms.includes(`${APEX}${GUIDES_PATH}`), 'llms.txt must name /guides/');
});
