// node --test platform/aws/site/deploy/publish.test.mjs
//
// The publish plan against a fake S3/CloudFront client, and an end-to-end
// check that the bucket layout plus the two CloudFront Functions serve every
// URL form Cloudflare's auto-trailing-slash served (served-path.mjs).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import { desired, plan, publish, keysFor, cacheControl, EMPTY_MD5, STUB_META } from './publish.mjs';
import { servedPath } from '../../../pages/served-path.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fnDir = path.join(here, '../../modules/static-site/functions');

function loadFn(file, config) {
  let src = readFileSync(path.join(fnDir, file), 'utf8');
  if (config) src = src.replace('${config_json}', JSON.stringify(config));
  const ctx = vm.createContext({});
  vm.runInContext(src, ctx);
  return ctx.handler;
}
const viewerRequest = loadFn('viewer-request.js', { apex: 'marisstella.app', hostRedirects: {} });
const viewerResponse = loadFn('viewer-response.js');

async function makeBuild(files) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'site-build-'));
  for (const [rel, body] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await fs.writeFile(path.join(dir, rel), body);
  }
  return dir;
}

const BUILD = {
  'index.html': '<h1>home</h1>',
  '404.html': 'not found',
  'version.json': '{"sha":"abc"}',
  'sitemap.xml': '<sitemapindex/>',
  '_headers': '/*\n  X: y\n',
  'wall-framing-takeoff/index.html': 'tool',
  'wall-framing-takeoff/how.html': 'how',
  'wall-framing-takeoff/app.js': 'js',
  'research/a/index.html': 'paper',
  'research/a/share-card.png': 'png',
};

/** A fake client holding a bucket in memory. */
function fakeClient(initial = new Map()) {
  const bucket = new Map(initial); // key -> { body, etag, contentType, cacheControl, metadata }
  const calls = { put: [], remove: [], invalidate: [] };
  return {
    bucket,
    calls,
    async list() {
      return new Map([...bucket].map(([k, v]) => [k, v.etag]));
    },
    async put(_b, key, body, meta) {
      const { createHash } = await import('node:crypto');
      calls.put.push(key);
      bucket.set(key, { body: Buffer.from(body), etag: createHash('md5').update(body).digest('hex'), ...meta });
    },
    async remove(_b, keys) {
      calls.remove.push(...keys);
      for (const k of keys) bucket.delete(k);
    },
    async invalidate(_d, paths) {
      calls.invalidate.push(paths);
      return 'I123';
    },
  };
}

/** Serve a URL the way CloudFront would: function, bucket, error page. */
function serve(bucket, uri) {
  const r = viewerRequest({ request: { uri, querystring: {}, headers: { host: { value: 'marisstella.app' } } } });
  if (r.statusCode) return { status: r.statusCode, location: r.headers.location.value };
  const obj = bucket.get(r.uri.slice(1));
  if (!obj) return { status: 404, body: bucket.get('404.html').body.toString() };
  const headers = {};
  for (const [k, v] of Object.entries(obj.metadata ?? {})) headers[`x-amz-meta-${k}`] = { value: v };
  const out = viewerResponse({ request: { uri, querystring: {} }, response: { statusCode: 200, headers } });
  if (out.statusCode !== 200) return { status: out.statusCode, location: out.headers.location.value };
  return { status: 200, body: obj.body.toString(), contentType: obj.contentType };
}

test('keys follow the served form', () => {
  assert.deepEqual(keysFor('index.html'), ['index.html']);
  assert.deepEqual(keysFor('a/index.html'), ['a/index.html']);
  assert.deepEqual(keysFor('a/b.html'), ['a/b']);
  assert.deepEqual(keysFor('404.html'), ['404.html', '404']);
  assert.deepEqual(keysFor('a/app.js'), ['a/app.js']);
  // The URL a key answers at is exactly servedPath() of its file.
  for (const rel of ['a/b.html', 'a/b/c.html', 'x.json']) assert.equal(keysFor(rel)[0], servedPath(rel));
});

test('directory stubs, collisions and skipped config files', () => {
  const { objects, warnings, errors } = desired([
    { rel: '_headers', md5: 'h' },
    { rel: 'a/index.html', md5: '1' },
    { rel: 'a/b.html', md5: '2' },
    { rel: 'a/b/index.html', md5: '3' },
  ]);
  assert.equal(objects.has('_headers'), false);
  assert.equal(objects.get('a').metadata[STUB_META], '1');
  assert.equal(objects.get('a').md5, EMPTY_MD5);
  assert.equal(objects.get('a/b').rel, 'a/b.html', 'a page wins over a directory stub');
  assert.equal(warnings.length, 1);
  assert.deepEqual(errors, []);
  const dup = desired([{ rel: 'a/b.html', md5: '1' }, { rel: 'a/b', md5: '2' }]);
  assert.equal(dup.errors.length, 1);
});

test('version.json is never kept at the edge; everything else revalidates in browsers', () => {
  assert.match(cacheControl('version.json'), /s-maxage=0/);
  assert.match(cacheControl('a/b'), /max-age=0, must-revalidate/);
});

test('plan uploads only changed keys, assets before HTML before stubs', () => {
  const { objects } = desired([
    { rel: 'a/index.html', md5: '1' },
    { rel: 'a/app.js', md5: '2' },
    { rel: 'b.html', md5: '3' },
  ]);
  const p = plan(objects, new Map([['a/index.html', '1'], ['old', 'x'], ['a/app.js', '2'], ['b', '3'], ['c', '9']]));
  assert.deepEqual(p.uploads.map((u) => u.key), ['a']);
  assert.deepEqual(p.deletes, ['c', 'old']);
  assert.equal(p.problems.length, 1, '2 of 5 deleted is over the 25% guard');
  const full = plan(objects, new Map());
  assert.deepEqual(full.uploads.map((u) => u.key), ['a/app.js', 'a/index.html', 'b', 'a']);
});

test('publish to an empty bucket, then a no-op, then a change', async () => {
  const dir = await makeBuild(BUILD);
  const client = fakeClient();
  const quiet = () => {};
  const first = await publish({ dir, bucket: 'b', distribution: 'D', client, log: quiet });
  assert.equal(first.invalidation, 'I123');
  assert.equal(client.bucket.has('_headers'), false);
  assert.equal(client.bucket.get('wall-framing-takeoff/how').contentType, 'text/html; charset=utf-8');

  const again = await publish({ dir, bucket: 'b', distribution: 'D', client, log: quiet });
  assert.equal(again.uploads.length, 0);
  assert.equal(again.invalidation, null);

  await fs.writeFile(path.join(dir, 'version.json'), '{"sha":"def"}');
  await fs.rm(path.join(dir, 'research/a/share-card.png'));
  const third = await publish({ dir, bucket: 'b', distribution: 'D', client, log: quiet });
  assert.deepEqual(third.uploads.map((u) => u.key), ['version.json']);
  assert.deepEqual(third.deletes, ['research/a/share-card.png']);
  assert.deepEqual(client.calls.invalidate.at(-1), ['/*']);
});

test('the published bucket serves every URL form Cloudflare served', async () => {
  const dir = await makeBuild(BUILD);
  const client = fakeClient();
  await publish({ dir, bucket: 'b', distribution: 'D', client, log: () => {} });
  const b = client.bucket;
  assert.deepEqual(serve(b, '/'), { status: 200, body: '<h1>home</h1>', contentType: 'text/html; charset=utf-8' });
  assert.equal(serve(b, '/wall-framing-takeoff/').body, 'tool');
  assert.deepEqual(serve(b, '/wall-framing-takeoff'), { status: 307, location: '/wall-framing-takeoff/' });
  assert.equal(serve(b, '/wall-framing-takeoff/how').body, 'how');
  assert.deepEqual(serve(b, '/wall-framing-takeoff/how.html'), { status: 307, location: '/wall-framing-takeoff/how' });
  assert.deepEqual(serve(b, '/wall-framing-takeoff/index.html'), { status: 307, location: '/wall-framing-takeoff/' });
  assert.equal(serve(b, '/research/a/').body, 'paper');
  assert.equal(serve(b, '/research/a/share-card.png').body, 'png');
  assert.equal(serve(b, '/version.json').contentType, 'application/json; charset=utf-8');
  assert.deepEqual(serve(b, '/nope/'), { status: 404, body: 'not found' });
  assert.equal(serve(b, '/_headers').status, 404);
});

test('a build missing its core files, or one that would empty the bucket, publishes nothing', async () => {
  const empty = await makeBuild({ 'index.html': 'x' });
  const client = fakeClient();
  await assert.rejects(publish({ dir: empty, bucket: 'b', distribution: 'D', client, log: () => {} }), /no 404.html/);

  const full = await makeBuild(BUILD);
  await publish({ dir: full, bucket: 'b', distribution: 'D', client, log: () => {} });
  const tiny = await makeBuild({ 'index.html': 'x', '404.html': 'y', 'version.json': '{}', 'sitemap.xml': 's' });
  const before = client.calls.put.length;
  await assert.rejects(publish({ dir: tiny, bucket: 'b', distribution: 'D', client, log: () => {} }), /allow-mass-delete/);
  assert.equal(client.calls.put.length, before, 'nothing uploaded when the guard trips');
});

test('dry run changes nothing', async () => {
  const dir = await makeBuild(BUILD);
  const client = fakeClient();
  const r = await publish({ dir, bucket: 'b', distribution: 'D', client, dryRun: true, log: () => {} });
  assert.ok(r.uploads.length > 0);
  assert.equal(client.calls.put.length, 0);
  assert.equal(client.calls.invalidate.length, 0);
});
