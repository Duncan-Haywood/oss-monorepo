import test from 'node:test';
import assert from 'node:assert/strict';
import { runCheck } from './check.mjs';

test('runCheck reports fetchError and ok:false when the page itself cannot be fetched', async () => {
  const fetchTextFn = async () => ({ ok: false, status: null, text: null, error: 'timed out' });
  const report = await runCheck('https://example.com/', { fetchTextFn });
  assert.equal(report.ok, false);
  assert.equal(report.fetchError, 'timed out');
  assert.equal(report.thirdPartyCount, 0);
});

test('runCheck extracts cross-origin assets from the fetched page and classifies them', async () => {
  const fetchTextFn = async () => ({
    ok: true,
    status: 200,
    text: '<script src="https://cdn.example.com/lib.js"></script>',
    error: null,
  });
  const fetchAllAssetsFn = async () => new Map();
  const report = await runCheck('https://mysite.example/', { fetchTextFn, fetchAllAssetsFn });
  assert.equal(report.thirdPartyCount, 1);
  assert.equal(report.ok, false);
  assert.equal(report.findings[0].id, 'missing-integrity');
});

test('runCheck skips the asset-fetch round when fetchAssets is false', async () => {
  const fetchTextFn = async () => ({
    ok: true,
    status: 200,
    text: '<script src="https://cdn.example.com/lib.js" integrity="sha384-AAA" crossorigin="anonymous"></script>',
    error: null,
  });
  let called = false;
  const fetchAllAssetsFn = async () => { called = true; return new Map(); };
  const report = await runCheck('https://mysite.example/', { fetchTextFn, fetchAllAssetsFn, fetchAssets: false });
  assert.equal(called, false);
  assert.equal(report.assets[0].status, 'not-verified');
});

test('runCheck passes timeoutMs through to both fetch functions when given', async () => {
  const seenPage = [];
  const seenAssets = [];
  const fetchTextFn = async (url, opts) => { seenPage.push(opts); return { ok: true, status: 200, text: '', error: null }; };
  const fetchAllAssetsFn = async (assets, opts) => { seenAssets.push(opts); return new Map(); };
  await runCheck('https://mysite.example/', { fetchTextFn, fetchAllAssetsFn });
  await runCheck('https://mysite.example/', { fetchTextFn, fetchAllAssetsFn, timeoutMs: 5000 });
  assert.deepEqual(seenPage[0], {});
  assert.deepEqual(seenPage[1], { timeoutMs: 5000 });
  assert.deepEqual(seenAssets[1], { timeoutMs: 5000 });
});

test('runCheck defaults to the real fetch functions when none are injected', async () => {
  // A port nothing listens on resolves fast as a network failure rather than
  // reaching anywhere, confirming the default wiring calls the real network
  // layer without this test depending on the network being up.
  const report = await runCheck('http://127.0.0.1:1/', {});
  assert.equal(report.ok, false);
  assert.equal(typeof report.fetchError, 'string');
});
