import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildJobshopSite, JOBSHOP_EXPORT, rebase, relativise } from './jobshop-site.mjs';

test('copies the committed Job Shop Quote export to jobshop/, pages, sitemap and image included', async () => {
  const out = mkdtempSync(path.join(os.tmpdir(), 'jobshop-site-'));
  try {
    const written = await buildJobshopSite(out);
    for (const f of ['jobshop/index.html', 'jobshop/how-it-works.html', 'jobshop/pricing.html', 'jobshop/faq.html', 'jobshop/for-cmmc-shops.html', 'jobshop/privacy.html', 'jobshop/sitemap.xml', 'jobshop/llms.txt', 'jobshop/styles.css', 'jobshop/og.png']) {
      assert.ok(written.includes(f), f);
      assert.ok(existsSync(path.join(out, f)), f);
    }
    // og.png is copied byte for byte, not through the text rewrite.
    assert.deepEqual(readFileSync(path.join(out, 'jobshop/og.png')), readFileSync(path.join(JOBSHOP_EXPORT, 'og.png')));
    const home = readFileSync(path.join(out, 'jobshop/index.html'), 'utf8');
    assert.match(home, /<link rel="canonical" href="https:\/\/marisstella\.app\/jobshop\/">/);
    // The product's own site: no form, no script beyond JSON-LD, no early-access list behind it.
    assert.doesNotMatch(home, /<form|href="[^"]*early-access/);
    assert.doesNotMatch(home.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, ''), /<script/);
    // Sign-up goes to the app.
    assert.match(home, /href="https:\/\/jobshop-quote\.marisstella\.app\/sign-up"/);
    // Links between its pages are relative, so the copy works under any base path.
    assert.doesNotMatch(home, /(href|src)="\//);
    assert.match(home, /href="\.\/pricing"/);
    assert.match(home, /no warranty/i);
    await assert.rejects(buildJobshopSite(out), /already written/);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('a missing export (sparse checkout) writes nothing', async () => {
  const out = mkdtempSync(path.join(os.tmpdir(), 'jobshop-site-'));
  try {
    assert.deepEqual(await buildJobshopSite(out, { from: path.join(out, 'nope') }), []);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('rebase moves only the site origin, never the app host', () => {
  const s = '<a href="https://marisstella.app/jobshop/pricing"> <a href="https://jobshop-quote.marisstella.app/sign-up">';
  assert.equal(rebase(s, 'https://marisstella.app/'), s);
  assert.equal(rebase(s, 'http://localhost:8000/'), '<a href="http://localhost:8000/jobshop/pricing"> <a href="https://jobshop-quote.marisstella.app/sign-up">');
  assert.equal(rebase('<a href="https://marisstella.app/industries/manufacturing/#cmmc">', 'https://catalogue.test/'), '<a href="https://catalogue.test/industries/manufacturing/#cmmc">');
});

test('every catalogue-origin link in the export points at a page this build serves', () => {
  // The CMMC link goes to the manufacturing page's section, not an unserved /cmmc/.
  const home = readFileSync(path.join(JOBSHOP_EXPORT, 'index.html'), 'utf8');
  for (const [, url] of home.matchAll(/href="https:\/\/marisstella\.app\/([^"#]*)/g)) {
    assert.ok(url === '' || url.startsWith('jobshop/') || url === 'industries/manufacturing/', url);
  }
});

test('relativise turns the site\'s root-relative links into ./ links, nothing else', () => {
  assert.equal(relativise('<a href="/jobshop/">x</a><link href="/jobshop/styles.css"><a href="/other/">'), '<a href="./">x</a><link href="./styles.css"><a href="/other/">');
});

test('the export is where the builder looks', () => {
  assert.ok(existsSync(path.join(JOBSHOP_EXPORT, 'index.html')));
});
