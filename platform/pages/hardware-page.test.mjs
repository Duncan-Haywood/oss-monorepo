// The hardware page (`hardware/`): every design's stage still matches its
// README, nothing is offered for sale, and every interest link goes to the
// existing feedback form.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderHardwarePage, HARDWARE, HARDWARE_PATH, interestHref } from './hardware-page.mjs';
import { renderHubSitemap } from './build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const base = 'https://example.test/';
const html = renderHardwarePage({ baseUrl: base, footerHtml: '<p>DISCLAIMER</p>', chromeScript: '<script src="../pf-site.js"></script>' });
const text = html.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');

test('covers the five designs the owner named', () => {
  assert.deepEqual(HARDWARE.map((h) => h.id), ['tennis', 'floor', 'mower', 'house', 'construction']);
  for (const h of HARDWARE) assert.ok(html.includes(`id="${h.id}"`), h.id);
});

test("each stage is still true: its README carries the evidence phrase", () => {
  for (const h of HARDWARE) {
    const readme = readFileSync(path.join(ROOT, h.source), 'utf8').replace(/\*\*/g, '').replace(/\n>?\s*/g, ' ');
    assert.ok(readme.toLowerCase().includes(h.evidence.toLowerCase()), `${h.source} no longer says "${h.evidence}"`);
    assert.ok(existsSync(path.join(ROOT, h.repo)), h.repo);
  }
});

test('the licences claimed are the licences committed', () => {
  for (const h of HARDWARE) {
    const lic = path.join(ROOT, h.repo.startsWith('research/') ? 'LICENSE' : `${h.repo}/LICENSE`);
    assert.match(readFileSync(lic, 'utf8'), /^MIT License/, lic);
    assert.match(h.licence, /^MIT/);
  }
});

test('says plainly that nothing is built or for sale, and quotes no price, date or pre-order', () => {
  assert.match(text, /Nothing here has been built yet/);
  assert.match(text, /CAD and simulation/);
  assert.match(text, /None of these is for sale/);
  assert.doesNotMatch(text, /\$\s?\d|USD|€|£/);
  assert.doesNotMatch(text, /pre-?order (now|today)|buy now|add to cart|ships? (in|by|on) |available (in|from) (january|february|march|april|may|june|july|august|september|october|november|december|20\d\d|q[1-4])/i);
  assert.doesNotMatch(text, /\b(?:launch|ship|release)s? in 20\d\d/i);
});

test('every interest link uses the existing feedback form, nothing new', () => {
  const hrefs = [...html.matchAll(/href="([^"]*feedback\/[^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
  for (const h of HARDWARE) assert.ok(hrefs.includes(interestHref('../', h)), h.id);
  for (const href of hrefs) assert.match(href, /^\.\.\/feedback\/(\?type=idea&tool=[a-z0-9-]+)?$/, href);
  assert.doesNotMatch(html, /<form\b(?![^>]*pfs-search)/); // only the site header's search box
  assert.doesNotMatch(html, /fetch\(/);
});

test('carries the footer, the usage counter, a canonical URL, and is in the hub sitemap', () => {
  assert.ok(html.includes('<p>DISCLAIMER</p>'));
  assert.ok(html.includes('../pf-site.js'));
  assert.ok(html.includes(`<link rel="canonical" href="${base}${HARDWARE_PATH}">`));
  assert.doesNotMatch(html, /noindex/);
  assert.ok(renderHubSitemap(base).includes(`<loc>${base}${HARDWARE_PATH}</loc>`));
});

test('escapes what it prints', () => {
  const evil = renderHardwarePage({ baseUrl: 'https://x.test/"><script>' });
  assert.ok(!evil.includes('"><script>'));
});
