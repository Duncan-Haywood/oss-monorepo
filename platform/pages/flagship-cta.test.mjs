// Polish track (2026-10-29): a visitor on a phone should see an action before
// a wall of text. Every flagship venture with a single-file tool page carries a
// `.cta` link under its h1 (same pattern as ai-bookkeeper, shift-roster-builder).
// Flagships whose page is built from a site/ folder are out of scope here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const yaml = readFileSync(new URL('portfolio/flagships.yaml', root), 'utf8');
const slugs = [...yaml.matchAll(/^ {2}- venture: (\S+)/gm)].map((m) => m[1]);

test('flagships list parses', () => assert.ok(slugs.length >= 5));

for (const slug of slugs) {
  const page = new URL(`ventures/${slug}/index.html`, root);
  if (!existsSync(page)) continue;
  test(`${slug} has a call-to-action link under its h1`, () => {
    const html = readFileSync(page, 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
    const h1 = html.search(/<h1[\s>]/);
    assert.ok(h1 >= 0, 'page has an h1');
    const cta = html.slice(h1).search(/<a[^>]*class="[^"]*\bcta\b/);
    assert.ok(cta >= 0 && cta < 2500, 'a.cta within 2500 characters after the h1');
  });
}
