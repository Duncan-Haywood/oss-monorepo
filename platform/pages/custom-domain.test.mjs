// Does the catalogue survive being moved to a custom domain?
//
// WHY THIS EXISTS
//
// The site is served today from a project-Pages *subpath*
// (`https://duncan-haywood.github.io/monorepo-projects/`), and
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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { buildSite, DEFAULT_BASE_URL } from './build.mjs';

// An origin root, not a subpath — the shape a custom domain produces, and the
// one no other test in this directory exercises.
const APEX = 'https://catalogue.test/';
const DEFAULT_HOST = new URL(DEFAULT_BASE_URL).host;

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
    'index.html': page('Alpha Calculator', '<h1>Alpha Calculator</h1>', {
      canonical: `${DEFAULT_BASE_URL}alpha-calculator/`,
      extra: `<p>See <a href="${DEFAULT_BASE_URL}beta-calculator/">Beta</a>.</p>`,
    }),
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
  });

  const outDir = path.join(out, 'dist');
  await buildSite({
    venturesDir: ventures,
    outDir,
    baseUrl: APEX,
    log: () => {},
    disableWorker: true,
  });
  built = { outDir };
  return built;
}

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
  const files = await allFiles(outDir);
  assert.ok(files.length > 0, 'the fixture build produced no files at all');

  const offenders = [];
  for (const file of files) {
    // Text surfaces only. A binary asset cannot carry a URL we rewrote, and
    // reading one as utf8 would produce noise rather than a finding.
    if (!/\.(html|xml|txt|json|mjs|js|css|webmanifest)$/.test(file)) continue;
    const body = await fs.readFile(file, 'utf8');
    if (body.includes(DEFAULT_HOST)) offenders.push(path.relative(outDir, file));
  }

  assert.deepEqual(
    offenders,
    [],
    `these files still name the default origin (${DEFAULT_HOST}) after a build ` +
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
  const files = await allFiles(outDir);

  const offenders = [];
  for (const file of files) {
    if (!/\.(html|xml|txt|json|mjs|js|css|webmanifest)$/.test(file)) continue;
    const body = await fs.readFile(file, 'utf8');
    if (body.includes(PLACEHOLDER_ORIGIN)) offenders.push(path.relative(outDir, file));
  }

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
  const files = (await allFiles(outDir)).filter((f) => f.endsWith('.html'));
  assert.ok(files.length > 0, 'the fixture build wrote no HTML');

  let seen = 0;
  for (const file of files) {
    const html = await fs.readFile(file, 'utf8');
    for (const m of html.matchAll(/rel="canonical"\s+href="([^"]*)"/g)) {
      seen += 1;
      const href = m[1];
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
