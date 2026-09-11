import test from 'node:test';
import assert from 'node:assert/strict';
import { runCheck } from './check.mjs';

function pageHtml(links) {
  const tags = links.map((l) => `<link rel="alternate" hreflang="${l.hreflang}" href="${l.href}">`).join('');
  return `<!doctype html><html><head>${tags}</head><body>hi</body></html>`;
}

test('runCheck fetches the target, follows its hreflang links, and builds a report', async () => {
  const en = 'https://example.com/en/';
  const fr = 'https://example.com/fr/';
  const pages = {
    [en]: pageHtml([{ hreflang: 'en', href: en }, { hreflang: 'fr', href: fr }]),
    [fr]: pageHtml([{ hreflang: 'en', href: en }, { hreflang: 'fr', href: fr }]),
  };
  const fetchFn = async (url) => ({ ok: true, status: 200, url, html: pages[url], error: null });

  const result = await runCheck(en, { fetchFn });
  assert.equal(result.target, en);
  assert.equal(result.fetchError, null);
  assert.equal(result.report.ok, true, JSON.stringify(result.report.findings));
  assert.equal(result.report.reciprocity.length, 1);
  assert.equal(result.report.reciprocity[0].status, 'confirmed');
});

test('runCheck reports a fetch failure on the target itself without throwing', async () => {
  const fetchFn = async () => ({ ok: false, status: null, url: 'x', html: null, error: 'connection refused' });
  const result = await runCheck('https://example.com/', { fetchFn });
  assert.equal(result.fetchError, 'connection refused');
  assert.equal(result.report.ok, false);
});

test('runCheck marks an alternate that failed to fetch as unchecked, and the overall report as not ok', async () => {
  const en = 'https://example.com/en/';
  const fr = 'https://example.com/fr/';
  const fetchFn = async (url) => {
    if (url === en) return { ok: true, status: 200, url, html: pageHtml([{ hreflang: 'en', href: en }, { hreflang: 'fr', href: fr }]), error: null };
    return { ok: false, status: null, url, html: null, error: 'timed out' };
  };
  const result = await runCheck(en, { fetchFn });
  assert.equal(result.report.incomplete, true);
  assert.equal(result.report.ok, false);
  assert.equal(result.report.reciprocity.find((r) => r.href === fr).status, 'unchecked');
});

test('runCheck deduplicates repeated alternate hrefs into a single fetch', async () => {
  const en = 'https://example.com/en/';
  const fr = 'https://example.com/fr/';
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(url);
    if (url === en) {
      return {
        ok: true, status: 200, url,
        html: pageHtml([{ hreflang: 'fr', href: fr }, { hreflang: 'fr-CA', href: fr }]),
        error: null,
      };
    }
    return { ok: true, status: 200, url, html: pageHtml([{ hreflang: 'en', href: en }]), error: null };
  };
  await runCheck(en, { fetchFn });
  const frCalls = calls.filter((c) => c === fr);
  assert.equal(frCalls.length, 1, 'the same href behind two hreflang codes should be fetched once');
});

test('runCheck respects --max-alternates and reports truncation', async () => {
  const en = 'https://example.com/en/';
  const links = Array.from({ length: 5 }, (_, i) => ({ hreflang: `en-${i}`, href: `https://example.com/${i}/` }));
  const fetchFn = async (url) => {
    if (url === en) return { ok: true, status: 200, url, html: pageHtml(links), error: null };
    return { ok: true, status: 200, url, html: '<html></html>', error: null };
  };
  const result = await runCheck(en, { fetchFn, maxAlternates: 2 });
  assert.equal(result.alternatesTruncated, true);
});

test('runCheck defaults to the real fetchPage when no fetchFn is injected', async () => {
  // A port nothing listens on resolves fast as a network failure, confirming
  // the default wiring calls the real network layer without depending on the
  // network being up.
  const result = await runCheck('http://127.0.0.1:1/', { timeoutMs: 500 });
  assert.equal(result.fetchError !== null, true);
});
