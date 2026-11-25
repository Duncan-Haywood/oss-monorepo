#!/usr/bin/env node
// A local stand-in for the CloudFront distribution: publishes a build into an
// in-memory bucket with publish.mjs's layout and serves it through the two
// CloudFront Functions and the distribution's 403/404 -> /404.html rule.
//
//   node platform/aws/stacks/site/deploy/emulate.mjs --dir platform/pages/dist [--port 8787]
//   bash platform/pages/verify-live.sh http://127.0.0.1:8787/
//
// It is how verify-live.sh and check_site_fresh.py are tested against the AWS
// serving path before any AWS account exists (emulate.test.mjs). It does not
// emulate the WAF, caching or response-headers policy.

import { createHash } from 'node:crypto';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import { publish } from './publish.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const FN_DIR = path.join(here, '../../../modules/static-site/functions');

export function loadFunction(file, config) {
  let src = readFileSync(path.join(FN_DIR, file), 'utf8');
  if (config) src = src.replace('${config_json}', JSON.stringify(config));
  const ctx = vm.createContext({});
  vm.runInContext(src, ctx);
  return ctx.handler;
}

/** A publish.mjs client backed by a Map. */
export function memoryClient() {
  const bucket = new Map();
  return {
    bucket,
    async list() {
      return new Map([...bucket].map(([k, v]) => [k, v.etag]));
    },
    async put(_b, key, body, meta) {
      bucket.set(key, { body: Buffer.from(body), etag: createHash('md5').update(body).digest('hex'), ...meta });
    },
    async remove(_b, keys) {
      for (const k of keys) bucket.delete(k);
    },
    async invalidate() {
      return 'local';
    },
  };
}

// Grouped in a Map, then made an object with Object.fromEntries, which defines
// own properties: a query key such as `__proto__` or `constructor` is a plain
// key here, as in CloudFront's own event, never a write to Object.prototype.
export function toQuerystring(searchParams) {
  const groups = new Map();
  for (const [k, v] of searchParams) {
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push({ value: v });
  }
  return Object.fromEntries([...groups].map(([k, values]) =>
    [k, values.length === 1 ? values[0] : { value: values[0].value, multiValue: values }]));
}

export function edgeServer(bucket, config = { apex: 'marisstella.app', hostRedirects: {} }) {
  const viewerRequest = loadFunction('viewer-request.js', config);
  const viewerResponse = loadFunction('viewer-response.js');
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://local');
    const querystring = toQuerystring(url.searchParams);
    const event = { request: { method: req.method, uri: decodeURIComponent(url.pathname), querystring, headers: { host: { value: req.headers.host ?? '' } } } };
    const r = viewerRequest(event);
    if (r.statusCode) {
      res.writeHead(r.statusCode, Object.fromEntries(Object.entries(r.headers).map(([k, v]) => [k, v.value])));
      return res.end();
    }
    let obj = bucket.get(r.uri.slice(1));
    let status = 200;
    if (!obj) {
      obj = bucket.get('404.html');
      status = 404;
    }
    const headers = { 'content-type': { value: obj.contentType }, 'cache-control': { value: obj.cacheControl } };
    for (const [k, v] of Object.entries(obj.metadata ?? {})) headers[`x-amz-meta-${k}`] = { value: v };
    const out = viewerResponse({ request: { uri: event.request.uri, querystring }, response: { statusCode: status, headers } });
    res.writeHead(out.statusCode, Object.fromEntries(Object.entries(out.headers).map(([k, v]) => [k, v.value])));
    res.end(out.statusCode === 307 ? undefined : obj.body);
  });
}

export async function emulate(dir) {
  const client = memoryClient();
  await publish({ dir, bucket: 'local', distribution: 'local', client, log: () => {} });
  return edgeServer(client.bucket);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const dir = a[a.indexOf('--dir') + 1];
  const port = a.includes('--port') ? Number(a[a.indexOf('--port') + 1]) : 8787;
  if (!a.includes('--dir') || !dir) {
    console.error('usage: emulate.mjs --dir DIR [--port N]');
    process.exit(2);
  }
  const server = await emulate(dir);
  server.listen(port, '127.0.0.1', () => console.log(`serving ${dir} as CloudFront would at http://127.0.0.1:${port}/`));
}
