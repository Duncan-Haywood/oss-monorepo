// The CI install snippets on the 20 linter pages (build.mjs, renderCiInstall).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOWNLOADABLE_CLI_FILES, hasCiChannels, injectChrome } from './build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = 'https://example.test/site/';
const page = '<!doctype html><html><head><title>t</title></head><body><main>x</main></body></html>';
const chrome = (slug, isEntry) =>
  injectChrome(page, { slug, toRoot: '../', total: 3, canonical: `${BASE}${slug}/`, baseUrl: BASE, isEntry, title: 'T' });

test('every generated action has a hook, a flake app and a published check.py', () => {
  const hooks = fs.readFileSync(path.join(ROOT, '.pre-commit-hooks.yaml'), 'utf8');
  const flake = fs.readFileSync(path.join(ROOT, 'flake.nix'), 'utf8');
  const slugs = fs.readdirSync(path.join(ROOT, 'platform/distribution/actions')).filter((s) => hasCiChannels(s));
  assert.ok(slugs.length >= 1);
  for (const slug of slugs) {
    assert.match(hooks, new RegExp(`^- id: ${slug}$`, 'm'), slug);
    assert.ok(flake.includes(`"${slug}" = tool "${slug}"`), slug);
    assert.ok(fs.existsSync(path.join(ROOT, 'ventures', slug, 'check.py')), slug);
    // The box is on the tool page, and its curl line downloads check.py from the
    // site, which publishes only listed .py files. A linter with no page gets no box.
    if (fs.existsSync(path.join(ROOT, 'ventures', slug, 'index.html'))) {
      assert.ok((DOWNLOADABLE_CLI_FILES[slug] || []).includes('check.py'), `${slug} check.py is not published`);
    }
  }
});

test('a linter entry page offers the snippets; deep pages and other tools do not', () => {
  const slug = 'actions-timeout-check';
  assert.ok(hasCiChannels(slug));
  const html = chrome(slug, true);
  assert.ok(html.includes(`curl -fsSLO ${BASE}${slug}/check.py`));
  assert.ok(html.includes(`uses: duncan-haywood/oss-monorepo/platform/distribution/actions/${slug}@main`));
  assert.ok(html.includes(`- id: ${slug}`));
  assert.ok(html.includes(`nix run github:duncan-haywood/oss-monorepo#${slug}`));
  assert.ok(!chrome(slug, false).includes('pf-ci'));
  assert.ok(!hasCiChannels('amazon-fba-calculator'));
  assert.ok(!chrome('amazon-fba-calculator', true).includes('pf-ci'));
});

test('snippets sit inside the footer the embed pass looks for', () => {
  const html = chrome('actions-timeout-check', true);
  const footer = html.match(/<aside class="pf-chrome pf-chrome-foot"[\s\S]*?<\/aside>/i)[0];
  assert.ok(footer.includes('class="pf-ci"'));
});
