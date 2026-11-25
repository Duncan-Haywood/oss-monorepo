// Unit tests for the CloudFront Functions, run in Node against the exact
// files OpenTofu uploads:
//
//   node --test platform/aws/modules/static-site/functions/functions.test.mjs
//
// CloudFront Functions are plain scripts with a global `handler`, not
// modules, so each file is evaluated in a fresh vm context. The
// viewer-request placeholder is filled the way main.tf's templatefile() does.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

const CONFIG = {
  apex: 'marisstella.app',
  hostRedirects: { 'www.marisstella.app': '', 'grants.marisstella.app': '/grants' },
};

function load(file, config) {
  let src = readFileSync(path.join(here, file), 'utf8');
  if (config) {
    assert.equal(src.split('${config_json}').length, 2, 'exactly one placeholder');
    src = src.replace('${config_json}', JSON.stringify(config));
  }
  // templatefile() would choke on any other interpolation or directive.
  assert.doesNotMatch(src, /\$\{|%\{/, `${file} has a sequence templatefile() would interpret`);
  const ctx = vm.createContext({});
  vm.runInContext(src, ctx);
  return ctx.handler;
}

const viewerRequest = load('viewer-request.js', CONFIG);
const viewerResponse = load('viewer-response.js');

function req(uri, { host = 'marisstella.app', querystring = {} } = {}) {
  return { request: { method: 'GET', uri, querystring, headers: { host: { value: host } } } };
}

test('directory paths fetch index.html', () => {
  assert.equal(viewerRequest(req('/')).uri, '/index.html');
  assert.equal(viewerRequest(req('/wall-framing-takeoff/')).uri, '/wall-framing-takeoff/index.html');
  assert.equal(viewerRequest(req('/research/a/b/')).uri, '/research/a/b/index.html');
});

test('extensionless and asset paths pass through unchanged', () => {
  // /tool/page is served from S3 key tool/page (deploy uploads page.html there).
  assert.equal(viewerRequest(req('/wall-framing-takeoff/how')).uri, '/wall-framing-takeoff/how');
  assert.equal(viewerRequest(req('/wall-framing-takeoff')).uri, '/wall-framing-takeoff');
  for (const p of ['/sitemap.xml', '/catalog.json', '/robots.txt', '/a/share-card.png', '/version.json']) {
    assert.equal(viewerRequest(req(p)).uri, p);
  }
});

test('.html spellings redirect to the served form, as auto-trailing-slash did', () => {
  const r = viewerRequest(req('/wall-framing-takeoff/how.html'));
  assert.equal(r.statusCode, 307);
  assert.equal(r.headers.location.value, '/wall-framing-takeoff/how');
  const i = viewerRequest(req('/wall-framing-takeoff/index.html'));
  assert.equal(i.statusCode, 307);
  assert.equal(i.headers.location.value, '/wall-framing-takeoff/');
  assert.equal(viewerRequest(req('/index.html')).headers.location.value, '/');
});

test('query strings survive redirects', () => {
  const r = viewerRequest(req('/a/b.html', {
    querystring: { utm_source: { value: 'x' }, flag: { value: '' }, t: { value: '1', multiValue: [{ value: '1' }, { value: '2' }] } },
  }));
  assert.equal(r.headers.location.value, '/a/b?utm_source=x&flag&t=1&t=2');
});

test('www and grants hosts 301 to the apex', () => {
  const w = viewerRequest(req('/x/', { host: 'www.marisstella.app' }));
  assert.equal(w.statusCode, 301);
  assert.equal(w.headers.location.value, 'https://marisstella.app/x/');
  const g = viewerRequest(req('/apply', { host: 'GRANTS.marisstella.app', querystring: { a: { value: 'b' } } }));
  assert.equal(g.statusCode, 301);
  assert.equal(g.headers.location.value, 'https://marisstella.app/grants/apply?a=b');
});

test('the apex and the CloudFront default host are served, not redirected', () => {
  assert.equal(viewerRequest(req('/', { host: 'd111111abcdef8.cloudfront.net' })).uri, '/index.html');
  assert.equal(viewerRequest(req('/x/')).statusCode, undefined);
});

function resp(uri, headers, statusCode = 200, querystring = {}) {
  return { request: { uri, querystring, headers: {} }, response: { statusCode, headers } };
}

test('a directory stub becomes a 307 to the trailing-slash URL', () => {
  const r = viewerResponse(resp('/wall-framing-takeoff', { 'x-amz-meta-dir-redirect': { value: '1' } }, 200, { q: { value: 'z' } }));
  assert.equal(r.statusCode, 307);
  assert.equal(r.headers.location.value, '/wall-framing-takeoff/?q=z');
  assert.equal(r.headers['x-amz-meta-dir-redirect'], undefined);
});

test('ordinary responses pass through and never leak the stub header', () => {
  const ok = viewerResponse(resp('/a/b', { 'content-type': { value: 'text/html' } }));
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.headers.location, undefined);
  const notFound = viewerResponse(resp('/missing', { 'x-amz-meta-dir-redirect': { value: '1' } }, 404));
  assert.equal(notFound.statusCode, 404);
  assert.equal(notFound.headers['x-amz-meta-dir-redirect'], undefined);
});

test('both functions fit CloudFront Functions\' 10 KB code limit', () => {
  for (const f of ['viewer-request.js', 'viewer-response.js']) {
    assert.ok(readFileSync(path.join(here, f)).length < 10 * 1024, f);
  }
});
