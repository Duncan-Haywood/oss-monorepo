import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCaaSet } from './lookup.mjs';

const CAA = 257;
const CNAME = 5;

/** Builds a fake dohQueryFn from a table of `{name, type} -> answer`. */
function fakeResolver(table) {
  return async (name, type) => {
    const key = `${name}|${type}`;
    if (key in table) return table[key];
    return { ok: true, nxdomain: false, answers: [] };
  };
}

test('finds a CAA record at the exact name', async () => {
  const dohQueryFn = fakeResolver({
    'example.com|257': { ok: true, nxdomain: false, answers: [{ type: CAA, data: '0 issue "letsencrypt.org"' }] },
  });
  const r = await resolveCaaSet('example.com', { dohQueryFn });
  assert.equal(r.ok, true);
  assert.equal(r.foundAtName, 'example.com');
  assert.equal(r.records.length, 1);
  assert.equal(r.records[0].value, 'letsencrypt.org');
});

test('walks up to the parent when the exact name has no CAA records', async () => {
  const dohQueryFn = fakeResolver({
    'app.staging.example.com|257': { ok: true, nxdomain: false, answers: [] },
    'staging.example.com|257': { ok: true, nxdomain: false, answers: [] },
    'example.com|257': { ok: true, nxdomain: false, answers: [{ type: CAA, data: '0 issue "digicert.com"' }] },
  });
  const r = await resolveCaaSet('app.staging.example.com', { dohQueryFn });
  assert.equal(r.ok, true);
  assert.equal(r.foundAtName, 'example.com');
  assert.deepEqual(r.walkedNames, ['app.staging.example.com', 'staging.example.com', 'example.com']);
});

test('reports no CAA record anywhere when the walk reaches the top with nothing', async () => {
  const dohQueryFn = fakeResolver({});
  const r = await resolveCaaSet('a.b.example.com', { dohQueryFn });
  assert.equal(r.ok, true);
  assert.equal(r.foundAtName, null);
  assert.equal(r.records.length, 0);
});

test('follows a single CNAME hop before walking for CAA', async () => {
  const dohQueryFn = fakeResolver({
    'blog.example.com|5': { ok: true, nxdomain: false, answers: [{ type: CNAME, data: 'hosting.example.net.' }] },
    'blog.example.com|257': { ok: true, nxdomain: false, answers: [] },
    'hosting.example.net|257': { ok: true, nxdomain: false, answers: [{ type: CAA, data: '0 issue "sectigo.com"' }] },
  });
  const r = await resolveCaaSet('blog.example.com', { dohQueryFn });
  assert.equal(r.ok, true);
  assert.equal(r.canonicalName, 'hosting.example.net');
  assert.equal(r.foundAtName, 'hosting.example.net');
});

test('a resolver error at any step is surfaced rather than silently treated as "no records"', async () => {
  const dohQueryFn = fakeResolver({
    'example.com|5': { ok: true, nxdomain: false, answers: [] },
    'example.com|257': { ok: false, error: 'timed out' },
  });
  const r = await resolveCaaSet('example.com', { dohQueryFn });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'timed out');
});

test('NXDOMAIN on the CNAME lookup is not treated as an alias', async () => {
  const dohQueryFn = fakeResolver({
    'example.com|5': { ok: true, nxdomain: true, answers: [] },
    'example.com|257': { ok: true, nxdomain: false, answers: [{ type: CAA, data: '0 issue "letsencrypt.org"' }] },
  });
  const r = await resolveCaaSet('example.com', { dohQueryFn });
  assert.equal(r.canonicalName, 'example.com');
  assert.equal(r.ok, true);
});

test('a malformed CAA record at the found name is still returned, not dropped', async () => {
  const dohQueryFn = fakeResolver({
    'example.com|257': { ok: true, nxdomain: false, answers: [{ type: CAA, data: 'garbage' }] },
  });
  const r = await resolveCaaSet('example.com', { dohQueryFn });
  assert.equal(r.ok, true);
  assert.equal(r.records[0].ok, false);
});
