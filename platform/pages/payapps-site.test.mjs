import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildPayappsSite, PAYAPPS_EXPORT, rebase } from './payapps-site.mjs';
import { renderSitemapIndex } from './build.mjs';

test('copies the committed PayApps export to payapps/, pages and sitemap included', async () => {
  const out = mkdtempSync(path.join(os.tmpdir(), 'payapps-site-'));
  try {
    const written = await buildPayappsSite(out);
    for (const f of ['payapps/index.html', 'payapps/pricing.html', 'payapps/features.html', 'payapps/privacy.html', 'payapps/sitemap.xml', 'payapps/llms.txt', 'payapps/styles.css']) {
      assert.ok(written.includes(f), f);
      assert.ok(existsSync(path.join(out, f)), f);
    }
    const home = readFileSync(path.join(out, 'payapps/index.html'), 'utf8');
    assert.match(home, /<link rel="canonical" href="https:\/\/marisstella\.app\/payapps\/">/);
    // The product's own site: no form, no script beyond JSON-LD, no early-access list behind it.
    assert.doesNotMatch(home, /<form|early-access/);
    assert.doesNotMatch(home.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, ''), /<script/);
    // Sign-up goes to the app.
    assert.match(home, /href="https:\/\/payapps\.marisstella\.app\/\?signup&amp;from=payapps-site"/);
    await assert.rejects(buildPayappsSite(out), /already written/);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('a missing export (sparse checkout) writes nothing', async () => {
  const out = mkdtempSync(path.join(os.tmpdir(), 'payapps-site-'));
  try {
    assert.deepEqual(await buildPayappsSite(out, { from: path.join(out, 'nope') }), []);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('rebase moves only the site origin, never the app host', () => {
  const s = '<a href="https://marisstella.app/payapps/pricing"> <a href="https://payapps.marisstella.app/">';
  assert.equal(rebase(s, 'https://marisstella.app/'), s);
  assert.equal(rebase(s, 'http://localhost:8000/'), '<a href="http://localhost:8000/payapps/pricing"> <a href="https://payapps.marisstella.app/">');
});

test('the sitemap index lists the copied site\'s sitemap', () => {
  const xml = renderSitemapIndex([{ slug: 'tool' }], 'https://marisstella.app/', ['payapps/sitemap.xml']);
  assert.match(xml, /<loc>https:\/\/marisstella\.app\/payapps\/sitemap\.xml<\/loc>/);
  assert.match(xml, /<loc>https:\/\/marisstella\.app\/tool\/sitemap\.xml<\/loc>/);
});

test('the export is where the builder looks', () => {
  assert.ok(existsSync(path.join(PAYAPPS_EXPORT, 'index.html')));
});
