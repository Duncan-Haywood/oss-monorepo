import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  INDEXNOW_ENDPOINT,
  MAX_URLS_PER_REQUEST,
  urlsFromCatalog,
  buildPayload,
  submit,
  readerFor,
  assertKeyFilePublished,
  EXIT_NO_EGRESS,
} from './indexnow.mjs';
import { INDEXNOW_KEY, indexNowKeyFileName } from '../pages/build.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, 'indexnow.mjs');

const CATALOG = {
  url: 'https://example.test/site/',
  categories: [
    { id: 'trades', url: 'https://example.test/site/c/trades/' },
    { id: 'seller-fees', url: 'https://example.test/site/c/seller-fees/' },
  ],
  tools: [
    { slug: 'gutter-guard-bid-calculator', url: 'https://example.test/site/gutter-guard-bid-calculator/' },
    { slug: 'shop-rate-calculator', url: 'https://example.test/site/shop-rate-calculator/' },
  ],
};

test('urlsFromCatalog collects the hub, every category, and every tool', () => {
  const urls = urlsFromCatalog(CATALOG);
  assert.deepEqual(urls, [
    'https://example.test/site/',
    'https://example.test/site/c/seller-fees/',
    'https://example.test/site/c/trades/',
    'https://example.test/site/gutter-guard-bid-calculator/',
    'https://example.test/site/shop-rate-calculator/',
  ]);
});

test('urlsFromCatalog de-duplicates and tolerates a catalog missing optional sections', () => {
  assert.deepEqual(urlsFromCatalog({ url: 'https://example.test/', tools: [{ url: 'https://example.test/' }] }), [
    'https://example.test/',
  ]);
  assert.deepEqual(urlsFromCatalog({}), []);
});

test('buildPayload names the key file at the site root, not the host root', () => {
  const payload = buildPayload({ baseUrl: 'https://duncan-haywood.github.io/monorepo-projects/', urls: ['https://duncan-haywood.github.io/monorepo-projects/'] });
  assert.equal(payload.host, 'duncan-haywood.github.io');
  assert.equal(payload.key, INDEXNOW_KEY);
  // The whole point of naming keyLocation explicitly (see build.mjs's
  // INDEXNOW_KEY comment): it lives under the site's own subpath, which a
  // host-root assumption would miss entirely -- the same gap pages_state.py
  // found in robots.txt's Sitemap: line.
  assert.equal(
    payload.keyLocation,
    `https://duncan-haywood.github.io/monorepo-projects/${indexNowKeyFileName()}`,
  );
  assert.deepEqual(payload.urlList, ['https://duncan-haywood.github.io/monorepo-projects/']);
});

test('submit posts JSON to the IndexNow endpoint and reports the response', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init });
    return new Response('', { status: 202 });
  });

  const payload = buildPayload({ baseUrl: 'https://example.test/', urls: ['https://example.test/'] });
  const result = await submit(payload);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, INDEXNOW_ENDPOINT);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json; charset=utf-8');
  assert.deepEqual(JSON.parse(calls[0].init.body), payload);
  assert.equal(result.status, 202);
  assert.equal(result.ok, true);
});

test('submit reports a rejected submission without throwing', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('bad key', { status: 422 }));
  const result = await submit(buildPayload({ baseUrl: 'https://example.test/', urls: ['https://example.test/'] }));
  assert.equal(result.ok, false);
  assert.equal(result.status, 422);
  assert.equal(result.body, 'bad key');
});

test('MAX_URLS_PER_REQUEST matches the protocol ceiling', () => {
  assert.equal(MAX_URLS_PER_REQUEST, 10000);
});

async function withFixtureDir(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'indexnow-fixture-'));
  try {
    await fs.writeFile(path.join(dir, 'catalog.json'), JSON.stringify(CATALOG));
    await fs.writeFile(path.join(dir, indexNowKeyFileName()), INDEXNOW_KEY);
    await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('readerFor(dir) reads catalog.json and the key file from a filesystem build', () =>
  withFixtureDir(async (dir) => {
    const read = readerFor({ dir });
    assert.deepEqual(JSON.parse(await read('catalog.json')), CATALOG);
    assert.equal((await read(indexNowKeyFileName())).trim(), INDEXNOW_KEY);
  }));

test('assertKeyFilePublished passes when the published key matches, throws when it does not', () =>
  withFixtureDir(async (dir) => {
    await assertKeyFilePublished(readerFor({ dir })); // does not throw

    await fs.writeFile(path.join(dir, indexNowKeyFileName()), 'some-other-key');
    await assert.rejects(() => assertKeyFilePublished(readerFor({ dir })), /does not match INDEXNOW_KEY/);
  }));

test('CLI dry run prints what would be submitted and makes no network call', () =>
  withFixtureDir(async (dir) => {
    // A dry run never calls fetch, so this is safe to actually spawn even in
    // a sandbox whose egress proxy blocks api.indexnow.org -- if this test
    // ever hangs or errors on network, that is this invariant breaking, not
    // an environment problem to work around.
    const out = execFileSync(process.execPath, [SCRIPT, '--dir', dir], { encoding: 'utf8' });
    assert.match(out, /Dry run — no request sent/);
    assert.match(out, new RegExp(`${CATALOG.tools.length + CATALOG.categories.length + 1} URL\\(s\\)`));
    assert.match(out, /example\.test/);
  }));

test('CLI refuses an empty URL list rather than submitting nothing', () =>
  withFixtureDir(async (dir) => {
    await fs.writeFile(path.join(dir, 'catalog.json'), JSON.stringify({}));
    assert.throws(() => execFileSync(process.execPath, [SCRIPT, '--dir', dir], { encoding: 'utf8', stdio: 'pipe' }));
  }));

// A transport failure and a rejection by the API mean different things and
// need different reactions, and until 2026-09-10 `submit` could not express
// the first at all -- `fetch` rejected straight out of it, past a CLI with no
// catch. That made the single most likely outcome of `--submit` in an agent
// sandbox (whose egress proxy answers 403 to CONNECT for api.indexnow.org) a
// raw `TypeError: fetch failed` stack trace, indistinguishable at a glance
// from this script being broken.
test('submit reports a transport failure as a result rather than throwing', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => {
    throw new TypeError('fetch failed');
  });
  const result = await submit(buildPayload({ baseUrl: 'https://example.test/site/', urls: ['https://example.test/site/'] }));
  assert.equal(result.ok, false);
  // Status 0 rather than an HTTP code: nothing answered, so there is no code
  // to report, and a caller switching on `status` must not mistake this for
  // one the API chose.
  assert.equal(result.status, 0);
  assert.match(result.error, /fetch failed/);
});

test('EXIT_NO_EGRESS is distinct from the ordinary failure exit', () => {
  // publish-branch.sh's `announce_to_indexnow` switches on this to tell "this
  // host cannot reach IndexNow" (expected; never fails a deploy that already
  // succeeded) from "IndexNow refused what we sent" (a real defect). Collapsing
  // them back to 1 would silently turn the second into the first.
  assert.notEqual(EXIT_NO_EGRESS, 0);
  assert.notEqual(EXIT_NO_EGRESS, 1);
});
