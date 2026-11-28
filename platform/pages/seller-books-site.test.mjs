import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildSellerBooksSite, rebase, relativise, SELLER_BOOKS_SITE_APP } from './seller-books-site.mjs';

const htmlLinks = (html) => [...html.matchAll(/(?:href|src)="([^"#]+)"/g)].map((m) => m[1]);

test('builds Seller Books\' site into seller-books/: pages, platform pages, sitemap, llms.txt', async () => {
  const out = mkdtempSync(path.join(os.tmpdir(), 'seller-books-site-'));
  try {
    const written = await buildSellerBooksSite(out);
    for (const f of ['index.html', 'pricing.html', 'faq.html', 'schedule-c-worksheet.html', '1099-k.html', 'platforms.html', 'platforms/ebay.html', 'privacy.html', 'sitemap.xml', 'llms.txt', 'assets/site.css']) {
      assert.ok(written.includes(`seller-books/${f}`), f);
      assert.ok(existsSync(path.join(out, 'seller-books', f)), f);
    }
    assert.ok(!written.includes('seller-books/404.html'), 'the catalogue serves its own 404');
    assert.ok(!written.some((f) => f.includes('early-access')), 'no early-access pages: their API is not deployed');
    assert.ok(written.includes('seller-books/assets/og.png'));
    const pages = written.filter((f) => f.endsWith('.html'));
    for (const rel of pages) {
      const html = readFileSync(path.join(out, rel), 'utf8');
      // The catalogue's rules (check.mjs): a disclaimer, no root-relative links, no script.
      assert.match(html, /no warranty/i, rel);
      assert.doesNotMatch(html, /(href|src|action)="\//, rel);
      assert.doesNotMatch(html, /<form|<script(?! type="application\/ld\+json")/, rel);
      // Every relative link lands on a file this copy wrote.
      for (const link of htmlLinks(html).filter((l) => !/^[a-z]+:/.test(l))) {
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(rel), link));
        const file = target.endsWith('/') ? `${target}index.html` : path.posix.extname(target) ? target : `${target}.html`;
        // The site-wide privacy policy (Web Analytics) is the catalogue's own page; check.mjs checks it in the full build.
        if (file === 'privacy/index.html') continue;
        assert.ok(written.includes(file), `${rel} links ${link} (${file})`);
      }
    }
    const home = readFileSync(path.join(out, 'seller-books/index.html'), 'utf8');
    assert.match(home, /<link rel="canonical" href="https:\/\/marisstella\.app\/seller-books\/?">/);
    assert.match(home, /href="https:\/\/seller-books\.marisstella\.app\/signup\?from=seller-books-site/);
    const ebay = readFileSync(path.join(out, 'seller-books/platforms/ebay.html'), 'utf8');
    assert.match(ebay, /href="\.\.\/pricing"/);
    assert.match(ebay, /href="\.\.\/assets\/site\.css"/);
    await assert.rejects(buildSellerBooksSite(out), /already written/);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('a missing venture (sparse checkout) writes nothing', async () => {
  const out = mkdtempSync(path.join(os.tmpdir(), 'seller-books-site-'));
  try {
    assert.deepEqual(await buildSellerBooksSite(out, { app: path.join(out, 'nope') }), []);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('rebase moves only the site origin, never the app host', () => {
  const s = '<a href="https://marisstella.app/seller-books/pricing"> <a href="https://seller-books.marisstella.app/signup">';
  assert.equal(rebase(s, 'https://marisstella.app/'), s);
  assert.equal(rebase(s, 'http://localhost:8000/'), '<a href="http://localhost:8000/seller-books/pricing"> <a href="https://seller-books.marisstella.app/signup">');
});

test('relativise prefixes by the page\'s depth and leaves other links alone', () => {
  const html = '<a href="/seller-books/">x</a><link href="/seller-books/assets/site.css"><a href="/other/">';
  assert.equal(relativise(html, 'pricing.html'), '<a href="./">x</a><link href="./assets/site.css"><a href="/other/">');
  assert.equal(relativise(html, 'platforms/ebay.html'), '<a href="../">x</a><link href="../assets/site.css"><a href="/other/">');
});

test('the site\'s builder is where this module looks', () => {
  assert.ok(existsSync(path.join(SELLER_BOOKS_SITE_APP, 'build.mjs')));
});
