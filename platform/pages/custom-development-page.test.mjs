// The open custom development page (`custom-development/`): how to ask, the
// licence term stated up front, and the request queue from
// portfolio/requests/requests.json with nothing in it unescaped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderCustomDevelopmentPage, CUSTOM_DEV_PATH, renderHubSitemap } from './build.mjs';
import { renderSiteFooterNav } from './site-nav.mjs';
import { loadRequests } from '../../portfolio/requests/requests.mjs';

const base = 'https://example.test/';

test('states the MIT term, links the issue form, and is indexable', () => {
  const html = renderCustomDevelopmentPage({ baseUrl: base, requests: [] });
  assert.match(html, /MIT licen[cs]e/);
  assert.match(html, /held by the repository owner/);
  assert.match(html, /issues\/new\?template=custom-build\.yml/);
  assert.match(html, /No warranty/);
  assert.ok(!/content="noindex"/.test(html));
  assert.match(html, /No requests on file yet/);
});

test('lists the committed queue, escaped', () => {
  const requests = loadRequests();
  assert.ok(requests.length > 0);
  const html = renderCustomDevelopmentPage({ baseUrl: base, requests });
  for (const r of requests) assert.ok(html.includes(r.id));
  const evil = renderCustomDevelopmentPage({ baseUrl: base, requests: [{ id: 'R-0099', title: '<script>x</script>', ask: 'a', source: 'issue', status: 'received', received: '2026-10-30', updated: '2026-10-30' }] });
  assert.ok(!evil.includes('<script>x</script>'));
});

test('in the footer and the hub sitemap', () => {
  assert.match(renderSiteFooterNav({ toRoot: '../' }), new RegExp(`href="\\.\\./${CUSTOM_DEV_PATH}"`));
  assert.match(renderHubSitemap(base), new RegExp(`${base}${CUSTOM_DEV_PATH}`));
});
