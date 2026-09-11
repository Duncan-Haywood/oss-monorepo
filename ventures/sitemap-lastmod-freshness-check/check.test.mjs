import test from 'node:test';
import assert from 'node:assert/strict';
import { runCheck } from './check.mjs';

function sitemapXml(entries) {
  const rows = entries.map((e) => `<url><loc>${e.loc}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''}</url>`).join('');
  return `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${rows}</urlset>`;
}

test('runCheck fetches the sitemap, fetches live headers for entries with a claim, and builds a report', async () => {
  const target = 'https://example.com/sitemap.xml';
  const a = 'https://example.com/a';
  const xml = sitemapXml([{ loc: a, lastmod: '2026-01-01' }]);
  const fetchBodyFn = async (url) => ({ ok: true, status: 200, url, body: url === target ? xml : null, error: null });
  const fetchHeadersFn = async (url) => ({ ok: true, status: 200, url, lastModified: new Date('2026-01-01T00:00:00Z'), error: null });

  const result = await runCheck(target, { fetchBodyFn, fetchHeadersFn });
  assert.equal(result.target, target);
  assert.equal(result.fetchError, null);
  assert.equal(result.urlsChecked, 1);
  assert.equal(result.report.ok, true, JSON.stringify(result.report.findings));
});

test('runCheck reports a fetch failure on the sitemap itself without throwing', async () => {
  const fetchBodyFn = async () => ({ ok: false, status: null, url: 'x', body: null, error: 'connection refused' });
  const fetchHeadersFn = async () => { throw new Error('should never be called'); };
  const result = await runCheck('https://example.com/sitemap.xml', { fetchBodyFn, fetchHeadersFn });
  assert.equal(result.fetchError, 'connection refused');
  assert.equal(result.report.ok, false);
});

test('runCheck reports a parse failure when the fetched body is not a sitemap', async () => {
  const fetchBodyFn = async () => ({ ok: true, status: 200, url: 'x', body: '<not-a-sitemap/>', error: null });
  const result = await runCheck('https://example.com/sitemap.xml', { fetchBodyFn, fetchHeadersFn: async () => { throw new Error('unused'); } });
  assert.match(result.report.parseError, /No <urlset>/);
});

test('runCheck marks an entry whose live headers could not be fetched as unchecked, and overall not ok', async () => {
  const target = 'https://example.com/sitemap.xml';
  const a = 'https://example.com/a';
  const xml = sitemapXml([{ loc: a, lastmod: '2026-01-01' }]);
  const fetchBodyFn = async (url) => ({ ok: true, status: 200, url, body: xml, error: null });
  const fetchHeadersFn = async () => ({ ok: false, status: null, url: a, lastModified: null, error: 'timed out' });

  const result = await runCheck(target, { fetchBodyFn, fetchHeadersFn });
  assert.equal(result.report.incomplete, true);
  assert.equal(result.report.ok, false);
});

test('runCheck deduplicates repeated <loc> entries into a single live-headers fetch', async () => {
  const target = 'https://example.com/sitemap.xml';
  const a = 'https://example.com/a';
  const xml = sitemapXml([{ loc: a, lastmod: '2026-01-01' }, { loc: a, lastmod: '2026-01-01' }]);
  const fetchBodyFn = async (url) => ({ ok: true, status: 200, url, body: xml, error: null });
  const calls = [];
  const fetchHeadersFn = async (url) => {
    calls.push(url);
    return { ok: true, status: 200, url, lastModified: new Date('2026-01-01T00:00:00Z'), error: null };
  };

  await runCheck(target, { fetchBodyFn, fetchHeadersFn });
  assert.equal(calls.length, 1, 'the same loc appearing twice should be fetched once');
});

test('runCheck never fetches live headers for an entry with no lastmod claim', async () => {
  const target = 'https://example.com/sitemap.xml';
  const xml = sitemapXml([{ loc: 'https://example.com/a' }]);
  const fetchBodyFn = async (url) => ({ ok: true, status: 200, url, body: xml, error: null });
  const calls = [];
  const fetchHeadersFn = async (url) => { calls.push(url); return { ok: true, status: 200, url, lastModified: null, error: null }; };

  const result = await runCheck(target, { fetchBodyFn, fetchHeadersFn });
  assert.equal(calls.length, 0);
  assert.equal(result.urlsChecked, 0);
});

test('runCheck respects --max-urls and reports truncation', async () => {
  const target = 'https://example.com/sitemap.xml';
  const entries = Array.from({ length: 5 }, (_, i) => ({ loc: `https://example.com/${i}`, lastmod: '2026-01-01' }));
  const xml = sitemapXml(entries);
  const fetchBodyFn = async (url) => ({ ok: true, status: 200, url, body: xml, error: null });
  const fetchHeadersFn = async (url) => ({ ok: true, status: 200, url, lastModified: new Date('2026-01-01T00:00:00Z'), error: null });

  const result = await runCheck(target, { fetchBodyFn, fetchHeadersFn, maxUrls: 2 });
  assert.equal(result.urlsChecked, 2);
  assert.equal(result.urlsTruncated, true);
});

test('runCheck defaults to the real fetch functions when none are injected', async () => {
  const result = await runCheck('http://127.0.0.1:1/sitemap.xml', { timeoutMs: 500 });
  assert.equal(result.fetchError !== null, true);
});
