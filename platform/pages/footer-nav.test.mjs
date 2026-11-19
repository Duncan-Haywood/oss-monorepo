// The shared footer's link block: four labelled groups, every destination the
// old 24-link run had, and labels short enough for one line in a phone's
// half-width column. polish-2026-11-19-footer-trim.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderSiteFooterNav, REPO_URL } from './site-nav.mjs';
import { disclaimerHtml } from './build.mjs';

const html = renderSiteFooterNav({ toRoot: '../' });

test('the footer nav keeps every destination it had before grouping', () => {
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  const expected = ['c/', 'research/', 'writing/', 'writing/podcast/', 'stories/', 'updates/', 'changelog/',
    'queue/', 'guides/', 'compare/', 'deploy/', 'about/', 'lab/', 'feedback/', 'custom-development/',
    'engineering/', 'dev/', 'dev/daily/', 'catalog.json', 'llms.txt', 'sitemap.xml', 'feed.xml',
    'changelog/feed.xml'].map((h) => `../${h}`);
  for (const h of [...expected, REPO_URL]) assert.ok(hrefs.includes(h), `lost ${h}`);
  assert.equal(new Set(hrefs).size, hrefs.length, 'a destination is listed twice');
});

test('links sit in labelled groups, and no label is long enough to wrap on a phone', () => {
  const nav = html.match(/<nav class="pfs-foot" aria-label="Site links">([\s\S]*?)<\/nav>/);
  assert.ok(nav, 'no labelled footer nav');
  const heads = [...nav[1].matchAll(/<h2>([^<]+)<\/h2>/g)].map((m) => m[1]);
  assert.deepEqual(heads, ['Tools', 'Read', 'Project', 'For machines']);
  for (const [, label] of nav[1].matchAll(/<a [^>]*>([^<]+)<\/a>/g)) {
    // ~22 characters fit a 165 px column at 14 px system-ui.
    assert.ok(label.replace(/&amp;/g, '&').length <= 22, `"${label}" will wrap in a phone column`);
  }
  assert.doesNotMatch(html, / · /, 'the dotted separators are back');
});

test('warranty, hosting and the privacy promise stay open; only the detail is folded', () => {
  const d = disclaimerHtml('./', [], { counter: true });
  const outside = d.replace(/<details[\s\S]*?<\/details>/g, '');
  for (const phrase of ['without warranty of any kind', 'You are responsible for reviewing and verifying',
    'accept no liability', 'taken offline without notice', 'Do not use them as',
    'What you type is never uploaded']) {
    assert.ok(outside.includes(phrase), `"${phrase}" is folded or gone`);
  }
  assert.match(d, /<summary>What is counted, and what happens to email you send<\/summary>/);
  assert.match(d, /deleted after 90 days/);
});
