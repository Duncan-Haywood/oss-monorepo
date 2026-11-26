// The blog's stylesheet is one file at the site root, linked where the inline
// <style> used to sit (perf track, 2026-11-26:
// docs/history/pages-build-perf-2026-11-26-writing-stylesheet.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildWriting, renderWritingStyle, PHONE_TABLE_CSS, WRITING_PATH, WRITING_STYLE_FILE } from './writing.mjs';
import { SITE_STYLE_FILE } from './site-nav.mjs';

const post = (slug, tag, date) => `---\ntitle: "${slug}"\ndate: ${date}\ndescription: "D."\ntags: [${tag}]\n---\n\n# ${slug}\n\nBody.\n`;

let memo;
async function built() {
  if (memo) return memo;
  const root = mkdtempSync(path.join(os.tmpdir(), 'wst-'));
  mkdirSync(path.join(root, 'docs/posts'), { recursive: true });
  writeFileSync(path.join(root, 'docs/posts/2026-11-26-one.md'), post("one", "notes", "2026-11-26"));
  writeFileSync(path.join(root, 'docs/posts/2026-11-25-two.md'), post("two", "notes", "2026-11-25"));
  const out = mkdtempSync(path.join(os.tmpdir(), 'wst-out-'));
  await buildWriting(out, 'https://example.test/', { root });
  const pages = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.html')) pages.push(full);
    }
  };
  walk(path.join(out, WRITING_PATH));
  memo = { root, out, pages };
  return memo;
}

test('the stylesheet is written once, at the site root, with the rules the pages used to inline', async () => {
  const { out } = await built();
  const css = readFileSync(path.join(out, WRITING_STYLE_FILE), 'utf8');
  assert.equal(css, renderWritingStyle());
  assert.match(css, /^:root \{ --bg:#f7f8fa;/);
  assert.ok(css.includes(PHONE_TABLE_CSS), 'the phone table rule rides in it');
  assert.doesNotMatch(css, /<\/?style/i);
});

test('every blog page links it before pf-site.css, resolves it, and inlines no copy', async () => {
  const { out, pages } = await built();
  assert.ok(pages.length >= 3, `expected an index and two posts, got ${pages.length} pages`);
  for (const file of pages) {
    const rel = path.relative(out, file);
    const html = readFileSync(file, 'utf8');
    // Wrapper pages (redirect stubs) carry no blog chrome; everything else must.
    if (!html.includes('<div class="wrap">')) continue;
    assert.doesNotMatch(html, /<style\b/i, `${rel} still inlines a <style> block`);
    const links = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((m) => m[1]);
    const mine = links.findIndex((h) => h.endsWith(WRITING_STYLE_FILE));
    const site = links.findIndex((h) => h.endsWith(SITE_STYLE_FILE));
    assert.ok(mine >= 0, `${rel} does not link ${WRITING_STYLE_FILE}`);
    // pf-site.css overrides some of these rules on purpose (its comments say
    // which), so the blog sheet must come first, as the inline block did.
    assert.ok(site > mine, `${rel}: ${WRITING_STYLE_FILE} must precede ${SITE_STYLE_FILE}`);
    assert.ok(existsSync(path.resolve(path.dirname(file), links[mine])), `${rel}: ${links[mine]} does not resolve`);
  }
});

test('clean up', async () => {
  const { root, out } = await built();
  rmSync(root, { recursive: true, force: true });
  rmSync(out, { recursive: true, force: true });
});
