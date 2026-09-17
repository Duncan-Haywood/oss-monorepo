import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  INDEXNOW_ENDPOINT,
  MAX_URLS_PER_REQUEST,
  urlsFromCatalog,
  urlsFromSitemaps,
  locsIn,
  isSitemapIndex,
  buildPayload,
  submit,
  readerFor,
  fetchHint,
  assertKeyFilePublished,
  EXIT_NO_EGRESS,
  isEgressRefusal,
  originFromCatalog,
  resolveBaseUrl,
} from './indexnow.mjs';
import { INDEXNOW_KEY, indexNowKeyFileName } from '../pages/build.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, 'indexnow.mjs');

const CATALOG = {
  url: 'https://example.test/site/',
  categories: [
    { id: 'trades', url: 'https://example.test/site/c/trades/' },
    { id: 'seller-fees', url: 'https://example.test/site/c/seller-fees/' },
  ],
  tools: [
    { slug: 'gutter-guard-bid-calculator', url: 'https://example.test/site/gutter-guard-bid-calculator/' },
    { slug: 'shop-rate-calculator', url: 'https://example.test/site/shop-rate-calculator/' },
  ],
};

test('urlsFromCatalog collects the hub, every category, and every tool', () => {
  const urls = urlsFromCatalog(CATALOG);
  assert.deepEqual(urls, [
    'https://example.test/site/',
    'https://example.test/site/c/seller-fees/',
    'https://example.test/site/c/trades/',
    'https://example.test/site/gutter-guard-bid-calculator/',
    'https://example.test/site/shop-rate-calculator/',
  ]);
});

test('urlsFromCatalog de-duplicates and tolerates a catalog missing optional sections', () => {
  assert.deepEqual(urlsFromCatalog({ url: 'https://example.test/', tools: [{ url: 'https://example.test/' }] }), [
    'https://example.test/',
  ]);
  assert.deepEqual(urlsFromCatalog({}), []);
});

test('buildPayload names the key file at the site root, not the host root', () => {
  const payload = buildPayload({ baseUrl: 'https://duncan-haywood.github.io/monorepo-projects/', urls: ['https://duncan-haywood.github.io/monorepo-projects/'] });
  assert.equal(payload.host, 'duncan-haywood.github.io');
  assert.equal(payload.key, INDEXNOW_KEY);
  // The whole point of naming keyLocation explicitly (see build.mjs's
  // INDEXNOW_KEY comment): it lives under the site's own subpath, which a
  // host-root assumption would miss entirely -- the same gap pages_state.py
  // found in robots.txt's Sitemap: line.
  assert.equal(
    payload.keyLocation,
    `https://duncan-haywood.github.io/monorepo-projects/${indexNowKeyFileName()}`,
  );
  assert.deepEqual(payload.urlList, ['https://duncan-haywood.github.io/monorepo-projects/']);
});

test('submit posts JSON to the IndexNow endpoint and reports the response', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init });
    return new Response('', { status: 202 });
  });

  const payload = buildPayload({ baseUrl: 'https://example.test/', urls: ['https://example.test/'] });
  const result = await submit(payload);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, INDEXNOW_ENDPOINT);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json; charset=utf-8');
  assert.deepEqual(JSON.parse(calls[0].init.body), payload);
  assert.equal(result.status, 202);
  assert.equal(result.ok, true);
});

test('submit reports a rejected submission without throwing', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('bad key', { status: 422 }));
  const result = await submit(buildPayload({ baseUrl: 'https://example.test/', urls: ['https://example.test/'] }));
  assert.equal(result.ok, false);
  assert.equal(result.status, 422);
  assert.equal(result.body, 'bad key');
});

test('MAX_URLS_PER_REQUEST matches the protocol ceiling', () => {
  assert.equal(MAX_URLS_PER_REQUEST, 10000);
});

// --- the published surface, not just the catalogue index -------------------
//
// Measured 2026-09-11 against the live `gh-pages` snapshot: `catalog.json`
// named 261 URLs and the published sitemaps enumerated 973. The 712 in the
// difference are the `vs-*` comparison pages, guides and FAQ pages -- the
// long-tail surface this catalogue builds specifically to be found by search,
// and the surface IndexNow exists to announce. These tests pin the walk that
// closes that gap.

test('locsIn reads every <loc> and unescapes the one entity build.mjs writes', () => {
  assert.deepEqual(locsIn(urlset(['https://a.test/', 'https://a.test/b.html'])), [
    'https://a.test/',
    'https://a.test/b.html',
  ]);
  assert.deepEqual(locsIn('<url><loc>https://a.test/?x=1&amp;y=2</loc></url>'), ['https://a.test/?x=1&y=2']);
  assert.deepEqual(locsIn('<urlset></urlset>'), []);
});

test('isSitemapIndex distinguishes an index of sitemaps from a set of pages', () => {
  assert.equal(isSitemapIndex(SITEMAP_INDEX), true);
  assert.equal(isSitemapIndex(urlset(['https://a.test/'])), false);
});

test('urlsFromSitemaps follows the index into every child sitemap', () =>
  withFixtureDir(async (dir) => {
    const { urls, warnings, childCount } = await urlsFromSitemaps(readerFor({ dir }), BASE);
    assert.equal(childCount, 3);
    assert.deepEqual(warnings, []);
    assert.equal(urls.length, FIXTURE_PAGE_COUNT);
    // The regression this exists to prevent: reading only the root sitemap
    // yields the three *sitemap* URLs and not one page.
    assert.ok(urls.includes(`${BASE}gutter-guard-bid-calculator/vs-leaffilter.html`));
    assert.ok(!urls.some((u) => u.endsWith('sitemap.xml')));
  }));

test('urlsFromSitemaps returns a root <urlset> as-is, without a second pass', () =>
  withFixtureDir(async (dir) => {
    await fs.writeFile(path.join(dir, 'sitemap.xml'), urlset([BASE, `${BASE}solo.html`]));
    const { urls, childCount } = await urlsFromSitemaps(readerFor({ dir }), BASE);
    assert.equal(childCount, 0);
    assert.deepEqual(urls, [BASE, `${BASE}solo.html`]);
  }));

// Degrading rather than refusing is a deliberate trade: announcing most of
// the site beats announcing none of it because one child is unreadable. The
// warning is what keeps a systematic breakage from being silent.
test('urlsFromSitemaps skips an unreadable or foreign child sitemap and says so', () =>
  withFixtureDir(async (dir) => {
    await fs.rm(path.join(dir, 'shop-rate-calculator/sitemap.xml'));
    await fs.writeFile(
      path.join(dir, 'sitemap.xml'),
      SITEMAP_INDEX.replace('</sitemapindex>', '  <sitemap><loc>https://elsewhere.test/sitemap.xml</loc></sitemap>\n</sitemapindex>'),
    );
    const { urls, warnings } = await urlsFromSitemaps(readerFor({ dir }), BASE);
    assert.equal(urls.length, FIXTURE_PAGE_COUNT - 2); // the two shop-rate pages
    assert.equal(warnings.length, 2);
    assert.ok(warnings.some((w) => /absent from the artifact/.test(w)));
    assert.ok(warnings.some((w) => /not under/.test(w)));
  }));

test('the CLI submits the union of the catalogue and the sitemaps, and names both sources', () =>
  withFixtureDir(async (dir) => {
    const out = execFileSync(process.execPath, [SCRIPT, '--dir', dir], { encoding: 'utf8' });
    assert.match(out, new RegExp(`${CATALOG.tools.length + CATALOG.categories.length + 1} from catalog\\.json`));
    assert.match(out, new RegExp(`${FIXTURE_PAGE_COUNT} from 3 published sitemap\\(s\\)`));
  }));

// A missing sitemap must not cost the announcement entirely: the catalogue
// floor is still a correct submission. It must also not be quiet, because the
// difference between announcing the site and announcing a quarter of it is
// exactly what this change was about.
test('the CLI falls back to the catalogue floor, loudly, when the sitemaps cannot be read', () =>
  withFixtureDir(
    async (dir) => {
      const out = execFileSync(process.execPath, [SCRIPT, '--dir', dir], { encoding: 'utf8', stdio: 'pipe' });
      assert.match(out, new RegExp(`${CATALOG.tools.length + CATALOG.categories.length + 1} URL\\(s\\)`));
      assert.match(out, /sitemaps UNREAD/);
    },
    { sitemaps: false },
  ));

// The fixture mirrors what `build.mjs` actually publishes: `sitemap.xml` is a
// sitemap *index*, and the per-venture sitemaps it names carry pages that are
// not in `catalog.json` at all -- the `vs-*` comparison pages and guides.
// That shape is the whole point of the sitemap walk, so the fixture has to
// have it or the tests below would pass against a site that does not exist.
const BASE = CATALOG.url;
const SITEMAP_INDEX = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${BASE}sitemap-hub.xml</loc></sitemap>
  <sitemap><loc>${BASE}gutter-guard-bid-calculator/sitemap.xml</loc></sitemap>
  <sitemap><loc>${BASE}shop-rate-calculator/sitemap.xml</loc></sitemap>
</sitemapindex>`;
const CHILD_SITEMAPS = {
  'sitemap-hub.xml': [BASE, `${BASE}about.html`],
  // Three pages for one tool, only the first of which catalog.json names.
  'gutter-guard-bid-calculator/sitemap.xml': [
    `${BASE}gutter-guard-bid-calculator/`,
    `${BASE}gutter-guard-bid-calculator/vs-leaffilter.html`,
    `${BASE}gutter-guard-bid-calculator/guide.html`,
  ],
  'shop-rate-calculator/sitemap.xml': [
    `${BASE}shop-rate-calculator/`,
    `${BASE}shop-rate-calculator/vs-shopmonkey.html`,
  ],
};
const urlset = (locs) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locs
    .map((loc) => `  <url><loc>${loc}</loc></url>`)
    .join('\n')}\n</urlset>`;
// Every distinct page the fixture site publishes: 2 hub + 3 + 2.
const FIXTURE_PAGE_COUNT = 7;

async function withFixtureDir(fn, { sitemaps = true } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'indexnow-fixture-'));
  try {
    await fs.writeFile(path.join(dir, 'catalog.json'), JSON.stringify(CATALOG));
    await fs.writeFile(path.join(dir, indexNowKeyFileName()), INDEXNOW_KEY);
    if (sitemaps) {
      await fs.writeFile(path.join(dir, 'sitemap.xml'), SITEMAP_INDEX);
      for (const [rel, locs] of Object.entries(CHILD_SITEMAPS)) {
        await fs.mkdir(path.join(dir, path.dirname(rel)), { recursive: true });
        await fs.writeFile(path.join(dir, rel), urlset(locs));
      }
    }
    await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('readerFor(dir) reads catalog.json and the key file from a filesystem build', () =>
  withFixtureDir(async (dir) => {
    const read = readerFor({ dir });
    assert.deepEqual(JSON.parse(await read('catalog.json')), CATALOG);
    assert.equal((await read(indexNowKeyFileName())).trim(), INDEXNOW_KEY);
  }));

test('assertKeyFilePublished passes when the published key matches, throws when it does not', () =>
  withFixtureDir(async (dir) => {
    await assertKeyFilePublished(readerFor({ dir })); // does not throw

    await fs.writeFile(path.join(dir, indexNowKeyFileName()), 'some-other-key');
    await assert.rejects(() => assertKeyFilePublished(readerFor({ dir })), /does not match INDEXNOW_KEY/);
  }));

test('CLI dry run prints what would be submitted and makes no network call', () =>
  withFixtureDir(async (dir) => {
    // A dry run never calls fetch, so this is safe to actually spawn even in
    // a sandbox whose egress proxy blocks api.indexnow.org -- if this test
    // ever hangs or errors on network, that is this invariant breaking, not
    // an environment problem to work around.
    const out = execFileSync(process.execPath, [SCRIPT, '--dir', dir], { encoding: 'utf8' });
    assert.match(out, /Dry run — no request sent/);
    // The union of the catalogue floor and the published sitemaps. The two
    // category pages are catalogue-only (no sitemap lists them) and the
    // comparison/guide pages are sitemap-only, so this number being right
    // means both halves landed and neither replaced the other.
    assert.match(out, new RegExp(`${FIXTURE_PAGE_COUNT + CATALOG.categories.length} URL\\(s\\)`));
    assert.match(out, /example\.test/);
  }));

test('CLI refuses an empty URL list rather than submitting nothing', () =>
  withFixtureDir(async (dir) => {
    await fs.writeFile(path.join(dir, 'catalog.json'), JSON.stringify({}));
    assert.throws(() => execFileSync(process.execPath, [SCRIPT, '--dir', dir], { encoding: 'utf8', stdio: 'pipe' }));
  }));

// A transport failure and a rejection by the API mean different things and
// need different reactions, and until 2026-09-10 `submit` could not express
// the first at all -- `fetch` rejected straight out of it, past a CLI with no
// catch. That made the single most likely outcome of `--submit` in an agent
// sandbox (whose egress proxy answers 403 to CONNECT for api.indexnow.org) a
// raw `TypeError: fetch failed` stack trace, indistinguishable at a glance
// from this script being broken.
test('submit reports a transport failure as a result rather than throwing', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => {
    throw new TypeError('fetch failed');
  });
  const result = await submit(buildPayload({ baseUrl: 'https://example.test/site/', urls: ['https://example.test/site/'] }));
  assert.equal(result.ok, false);
  // Status 0 rather than an HTTP code: nothing answered, so there is no code
  // to report, and a caller switching on `status` must not mistake this for
  // one the API chose.
  assert.equal(result.status, 0);
  assert.match(result.error, /fetch failed/);
});

// The correction to what #4379 shipped, measured against the real proxy on
// 2026-09-10. `EXIT_NO_EGRESS` was added on the premise that a blocked host
// makes `fetch` reject -- which is what `curl` sees. Node's fetch instead
// resolves with an ordinary 403 carrying the proxy's own body, so the run took
// the generic-failure branch and reported the sandbox limit as "IndexNow
// refused what we sent", which is the exact confusion the exit code exists to
// remove.
test('an egress proxy answering 403 in IndexNow\'s place is recognised', () => {
  assert.equal(
    isEgressRefusal({
      status: 403,
      body: 'Host not in allowlist: api.indexnow.org. Add this host to your network egress settings to allow access.',
    }),
    true,
  );
});

test('IndexNow\'s own 403 stays a real failure', () => {
  // The expensive direction. IndexNow answers 403 for an invalid key, which is
  // a genuine defect in the published key file -- burying it under "no egress"
  // would be worse than the confusion this whole mechanism exists to fix, so
  // the match is on the proxy's own wording and not on the status.
  assert.equal(isEgressRefusal({ status: 403, body: 'Forbidden - Key not valid' }), false);
  assert.equal(isEgressRefusal({ status: 403, body: '' }), false);
  assert.equal(isEgressRefusal({ status: 422, body: 'Unprocessable Entity' }), false);
  assert.equal(
    isEgressRefusal({ status: 200, body: 'not in allowlist' }),
    false,
    'a 200 is an accepted submission whatever the body says',
  );
});

test('EXIT_NO_EGRESS is distinct from the ordinary failure exit', () => {
  // publish-branch.sh's `announce_to_indexnow` switches on this to tell "this
  // host cannot reach IndexNow" (expected; never fails a deploy that already
  // succeeded) from "IndexNow refused what we sent" (a real defect). Collapsing
  // them back to 1 would silently turn the second into the first.
  assert.notEqual(EXIT_NO_EGRESS, 0);
  assert.notEqual(EXIT_NO_EGRESS, 1);
});

// ------------------------------------------------- which origin gets announced
//
// The regression these pin is the one `resolveBaseUrl`'s docstring describes:
// the origin used to come from `publishedBaseUrl()` — a reading of the
// *gh-pages* branch — no matter which artifact was actually being submitted.
// For the Hetzner host route that produced a payload whose `host` and
// `keyLocation` named github.io while every URL in `urlList` was on
// marisstella.dev, which IndexNow rejects as a host mismatch.

test('originFromCatalog reads the origin the artifact was built for', () => {
  assert.equal(originFromCatalog(CATALOG), 'https://example.test/site/');
});

test('originFromCatalog adds the trailing slash keyLocation depends on', () => {
  // buildPayload concatenates the key filename onto this, so a bare origin
  // would produce a keyLocation one path segment short.
  assert.equal(originFromCatalog({ url: 'https://example.test' }), 'https://example.test/');
});

test('originFromCatalog returns null rather than guessing at an unusable url', () => {
  for (const url of [undefined, '', 'not-a-url', '/site/', 'ftp://example.test/']) {
    assert.equal(originFromCatalog({ url }), null, `expected null for ${JSON.stringify(url)}`);
  }
});

test('an explicit --base-url wins over both readings', () => {
  const resolved = resolveBaseUrl({
    explicit: 'https://marisstella.dev/',
    catalog: CATALOG,
    published: { baseUrl: 'https://duncan-haywood.github.io/monorepo-projects/', source: 'project-pages' },
    comparable: true,
  });
  assert.equal(resolved.baseUrl, 'https://marisstella.dev/');
  assert.equal(resolved.source, 'explicit');
});

test('an explicit --base-url is normalised to a trailing slash', () => {
  const resolved = resolveBaseUrl({
    explicit: 'https://marisstella.dev',
    catalog: null,
    published: { baseUrl: 'https://example.test/', source: 'cname' },
  });
  assert.equal(resolved.baseUrl, 'https://marisstella.dev/');
});

test('a malformed --base-url throws rather than reaching the API', () => {
  for (const explicit of ['nonsense', 'ftp://example.test/']) {
    assert.throws(
      () => resolveBaseUrl({ explicit, catalog: CATALOG, published: { baseUrl: 'https://x.test/', source: 'cname' } }),
      /--base-url/,
    );
  }
});

test('the artifact wins when the serving branch was never read', () => {
  // This is the Hetzner box: a deploy checkout that tracks `main` and has
  // never fetched `gh-pages`, so publishedBaseUrl() reports `assumed-default`
  // — which its own docstring flags as NOT a reading. There is nothing to
  // disagree with, so the artifact's own origin is the answer.
  const resolved = resolveBaseUrl({
    catalog: { url: 'https://marisstella.dev/' },
    published: {
      baseUrl: 'https://duncan-haywood.github.io/monorepo-projects/',
      source: 'assumed-default',
    },
  });
  assert.equal(resolved.baseUrl, 'https://marisstella.dev/');
  assert.match(resolved.source, /artifact/);
});

test('two real readings of the same site that disagree refuse rather than pick one', () => {
  // A stale snapshot, or a domain that moved without a republish. Submitting
  // either origin would be a guess, so this fails closed and names both.
  const resolved = resolveBaseUrl({
    catalog: { url: 'https://old.example.test/' },
    published: { baseUrl: 'https://new.example.test/', source: 'cname' },
    comparable: true,
  });
  assert.equal(resolved.baseUrl, null);
  assert.equal(resolved.source, 'conflict');
  assert.equal(resolved.conflict.artifact, 'https://old.example.test/');
  assert.equal(resolved.conflict.published, 'https://new.example.test/');
});

test('agreeing readings are not a conflict', () => {
  const resolved = resolveBaseUrl({
    catalog: { url: 'https://example.test/site/' },
    published: { baseUrl: 'https://example.test/site/', source: 'cname' },
    comparable: true,
  });
  assert.equal(resolved.baseUrl, 'https://example.test/site/');
  assert.match(resolved.source, /artifact/);
});

test('a --dir artifact is not compared against the serving branch at all', () => {
  // Two different sites that differ, not one site measured twice. The first
  // draft compared unconditionally, and a --dir submission then started
  // refusing the moment the clone happened to have gh-pages fetched --
  // whether an unrelated branch is present locally must not change what this
  // announces.
  const resolved = resolveBaseUrl({
    catalog: { url: 'https://old.example.test/' },
    published: { baseUrl: 'https://new.example.test/', source: 'cname' },
    comparable: false,
  });
  assert.equal(resolved.baseUrl, 'https://old.example.test/');
  assert.match(resolved.source, /artifact/);
});

test('an artifact with no usable origin falls back and says so', () => {
  const resolved = resolveBaseUrl({
    catalog: { tools: [] },
    published: { baseUrl: 'https://example.test/site/', source: 'cname' },
    comparable: true,
  });
  assert.equal(resolved.baseUrl, 'https://example.test/site/');
  assert.match(resolved.source, /published \(cname\)/);
});

test('the payload announces the origin the artifact carries, end to end', async () => {
  // The whole point: host and keyLocation must be on the same origin as the
  // URLs being submitted, or IndexNow rejects the request.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'indexnow-origin-'));
  const catalog = {
    url: 'https://marisstella.dev/',
    tools: [{ slug: 'shop-rate-calculator', url: 'https://marisstella.dev/shop-rate-calculator/' }],
  };
  await fs.writeFile(path.join(dir, 'catalog.json'), JSON.stringify(catalog));
  await fs.writeFile(path.join(dir, indexNowKeyFileName()), INDEXNOW_KEY);

  const out = execFileSync('node', [SCRIPT, '--dir', dir, '--base-url', 'https://marisstella.dev/'], {
    encoding: 'utf8',
  });
  assert.match(out, /host:\s+marisstella\.dev/);
  assert.match(out, new RegExp(`keyLocation:\\s+https://marisstella\\.dev/${indexNowKeyFileName()}`));
  assert.doesNotMatch(out, /github\.io/);
});

// ---------------------------------------------------------------------------
// The fetch hint printed when a ref is not in this clone
// ---------------------------------------------------------------------------

test('the fetch hint for a remote-tracking ref names the branch, not the tracking name', () => {
  // `git fetch origin origin/gh-pages` fails with
  // `fatal: couldn't find remote ref origin/gh-pages` -- there is no such ref on
  // the remote. This is the ref `indexnow_state.py` actually passes, so the hint
  // was wrong for the only caller there is.
  assert.equal(fetchHint('origin/gh-pages', ['origin']), 'git fetch origin gh-pages');
});

test('a bare ref is already the remote name and passes through', () => {
  assert.equal(fetchHint('gh-pages', ['origin']), 'git fetch origin gh-pages');
});

test('a branch whose own name contains a slash is not mangled', () => {
  // Only a real remote prefix is translated. `claude/happy-wozniak` is a branch
  // name, and `claude` is not a remote, so it stays whole -- otherwise the hint
  // would send the reader to fetch a branch called `happy-wozniak` from a
  // remote that does not exist.
  assert.equal(
    fetchHint('claude/happy-wozniak', ['origin']),
    'git fetch origin claude/happy-wozniak',
  );
});

test('a second remote is honoured rather than rewritten to origin', () => {
  assert.equal(fetchHint('upstream/gh-pages', ['origin', 'upstream']), 'git fetch upstream gh-pages');
});

test('the hint it prints is a command git accepts', () => {
  // The regression that started this: the message was built by interpolation and
  // nothing ever ran it. `--ref` a ref that cannot exist, then hand git the
  // command out of the error and require that it fails on the *ref* rather than
  // on the shape of the command.
  const hint = fetchHint('origin/definitely-not-a-branch-xyz', ['origin']);
  assert.equal(hint, 'git fetch origin definitely-not-a-branch-xyz');
  let stderr = '';
  try {
    execFileSync('git', ['fetch', 'origin', 'definitely-not-a-branch-xyz'], {
      cwd: path.dirname(SCRIPT),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    stderr = String(err.stderr || '');
  }
  // Either shape of "no such branch" is fine; what must NOT appear is the
  // doubled tracking name the old hint produced.
  assert.doesNotMatch(stderr, /origin\/definitely-not-a-branch-xyz/);
});
