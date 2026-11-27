import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildCmmcSite, relativise } from './cmmc-site.mjs';
import { CMMC_SITE_DIR, SITE_OWN_DIRS } from './check.mjs';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'cmmc-site-'));

test('builds the open CMMC site into cmmc/: pages, sitemap, llms.txt and the browser calculator', async () => {
  const out = tmp();
  try {
    const written = await buildCmmcSite(out);
    for (const f of ['index.html', 'pricing.html', 'privacy.html', 'sprs-score-calculator.html', 'sitemap.xml', 'llms.txt', 'styles.css', 'sprs.js', 'sprs-page.js']) {
      assert.ok(written.includes(`cmmc/${f}`), f);
      assert.ok(existsSync(path.join(out, 'cmmc', f)), f);
    }
    // Open: no early-access pages or form; sign-up links into the app.
    assert.ok(!written.some((f) => f.includes('early-access')), 'no early-access pages');
    const home = readFileSync(path.join(out, 'cmmc/index.html'), 'utf8');
    assert.match(home, /<link rel="canonical" href="https:\/\/marisstella\.app\/cmmc\/">/);
    assert.doesNotMatch(home, /<form|early-access/);
    assert.match(home, /href="https:\/\/cmmc\.marisstella\.app\/signup\?from=cmmc-site%2Fhome"/);
    assert.match(home, /no warranty/i);
    // Links between its pages are relative, so the copy works under any base path.
    assert.doesNotMatch(home, /(href|src|action)="\//);
    assert.match(home, /href="\.\/pricing"/);
    assert.match(home, /href="\.\/styles\.css"/);
    const sprs = readFileSync(path.join(out, 'cmmc/sprs-score-calculator.html'), 'utf8');
    assert.match(sprs, /<form class="sprs" method="get" action="\.\/sprs-score-calculator#result">/);
    assert.match(sprs, /<script type="module" src="\.\/sprs-page\.js"><\/script>/);
    const sitemap = readFileSync(path.join(out, 'cmmc/sitemap.xml'), 'utf8');
    assert.match(sitemap, /<loc>https:\/\/marisstella\.app\/cmmc\/sprs-score-calculator<\/loc>/);
    await assert.rejects(buildCmmcSite(out), /already written/);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('canonicals follow the build origin', async () => {
  const out = tmp();
  try {
    await buildCmmcSite(out, { baseUrl: 'https://example.test/' });
    const home = readFileSync(path.join(out, 'cmmc/index.html'), 'utf8');
    assert.match(home, /<link rel="canonical" href="https:\/\/example\.test\/cmmc\/">/);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('a missing app (sparse checkout) writes nothing', async () => {
  const out = tmp();
  try {
    assert.deepEqual(await buildCmmcSite(out, { app: path.join(out, 'nope') }), []);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('relativise rewrites only links under /cmmc/', () => {
  assert.equal(relativise('<a href="/cmmc/pricing"><form action="/cmmc/x">'), '<a href="./pricing"><form action="./x">');
  assert.equal(relativise('<a href="/other/">'), '<a href="/other/">');
  assert.equal(relativise('<a href="https://x/cmmc/">'), '<a href="https://x/cmmc/">');
});

test('check.mjs treats cmmc/ as a site directory, not a free tool', () => {
  assert.equal(CMMC_SITE_DIR, 'cmmc');
  assert.ok(SITE_OWN_DIRS.has('cmmc'));
});
