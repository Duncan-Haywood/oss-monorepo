// The self-hosted proxy: point an SDK's base URL here and every call passes
// the guard before it reaches the provider.
//
//   ANTHROPIC_BASE_URL=http://127.0.0.1:8787/anthropic
//   OPENAI_BASE_URL=http://127.0.0.1:8787/openai/v1
//
// Scope comes from request headers: x-guard-user, x-guard-feature, x-guard-run.
// The `key` scope is a fingerprint of the caller's credential, never the
// credential itself. Refusals use the provider's own error shape: HTTP 402
// when a budget is spent (SDKs do not retry it), 429 with Retry-After when a
// breaker is open (the wait is real).
//
// Keys: if the deployer sets an upstream key, callers must present one of
// GUARD_PROXY_TOKENS, or anyone who can reach the port spends the deployer's
// money. With no upstream key the caller's own key is forwarded untouched.

import { createServer } from 'node:http';
import { fingerprint } from './guard.mjs';
import { PROVIDERS, blockedBody, describeRequest, rewriteRequest, streamUsageReader, usageFromResponse } from './providers.mjs';

const MAX_BODY = 20 * 1024 * 1024;
// Hop-by-hop and length headers are the server's to set; the rest of the
// upstream response (request ids, rate-limit headers) is passed through.
const DROP_RESPONSE_HEADERS = new Set(['connection', 'keep-alive', 'transfer-encoding', 'content-length', 'content-encoding']);

function send(res, status, body, headers = {}) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text), ...headers });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('request body too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function bearer(req) {
  const h = req.headers.authorization ?? '';
  return h.toLowerCase().startsWith('bearer ') ? h.slice(7).trim() : null;
}

function route(pathname) {
  // /anthropic/v1/messages, /openai/v1/chat/completions, or the bare provider path.
  for (const [name, p] of Object.entries(PROVIDERS)) {
    if (pathname === `/${name}${p.path}` || pathname === p.path) return name;
  }
  return null;
}

/**
 * Build the request handler. `upstreams[provider]` is { baseUrl?, apiKey? }.
 * `proxyTokens` is the list callers must present when an upstream key is set.
 */
export function createHandler({ guard, upstreams = {}, proxyTokens = [], adminToken = null, fetch: fetchImpl = globalThis.fetch, log = () => {} }) {
  const tokens = new Set(proxyTokens.filter(Boolean));

  async function admin(req, res, url) {
    if (!adminToken || bearer(req) !== adminToken) return send(res, 401, { error: 'set GUARD_ADMIN_TOKEN and send it as a bearer token' });
    if (req.method === 'GET' && url.pathname === '/guard/status') return send(res, 200, guard.status());
    if (req.method === 'POST' && url.pathname === '/guard/halt') {
      guard.halt(url.searchParams.get('reason') || 'halted by operator');
      return send(res, 200, guard.status());
    }
    if (req.method === 'POST' && url.pathname === '/guard/resume') { guard.resume(); return send(res, 200, guard.status()); }
    return send(res, 404, { error: 'not found' });
  }

  return async function handle(req, res) {
    const url = new URL(req.url, 'http://proxy.local');
    if (url.pathname === '/healthz') return send(res, 200, { ok: true });
    if (url.pathname.startsWith('/guard/')) return admin(req, res, url);

    const provider = route(url.pathname);
    if (!provider || req.method !== 'POST') return send(res, 404, { error: `no route for ${req.method} ${url.pathname}` });
    const up = upstreams[provider] ?? {};

    // Who is calling, and with what credential.
    const callerKey = provider === 'anthropic' ? (req.headers['x-api-key'] ?? bearer(req)) : bearer(req);
    const guardToken = req.headers['x-guard-token'] ?? (up.apiKey ? callerKey : null);
    if (up.apiKey && !tokens.has(guardToken)) {
      return send(res, 401, blockedBody(provider, { reasons: [{ code: 'unauthorised', message: 'this proxy holds its own key; send a GUARD_PROXY_TOKENS value as the API key or x-guard-token' }] }));
    }
    const upstreamKey = up.apiKey ?? callerKey;
    if (!upstreamKey) return send(res, 401, blockedBody(provider, { reasons: [{ code: 'no-key', message: 'no API key on the request and none configured upstream' }] }));

    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch (e) {
      return send(res, e.status ?? 400, { error: e.status ? e.message : 'request body is not JSON' });
    }

    const d0 = describeRequest(provider, body);
    const scope = {
      user: req.headers['x-guard-user'],
      feature: req.headers['x-guard-feature'],
      run: req.headers['x-guard-run'],
      key: fingerprint(String(guardToken ?? upstreamKey)),
    };
    const decision = guard.check({ model: d0.model, maxOutputTokens: d0.maxOutputTokens, input: d0.input, scope });
    if (!decision.allowed) {
      const breaker = decision.reasons.find((r) => r.code.startsWith('breaker'));
      const status = breaker ? 429 : 402;
      const retry = Math.max(0, ...decision.reasons.map((r) => r.retryAfterSec ?? 0));
      log({ type: 'refused', provider, model: d0.model, status, reasons: decision.reasons.map((r) => r.code) });
      return send(res, status, blockedBody(provider, decision), {
        'x-guard-blocked': decision.reasons.map((r) => r.code).join(','),
        ...(retry ? { 'retry-after': String(retry) } : {}),
      });
    }

    const headers = { 'content-type': 'application/json' };
    if (provider === 'anthropic') {
      headers['x-api-key'] = upstreamKey;
      headers['anthropic-version'] = req.headers['anthropic-version'] ?? '2023-06-01';
      if (req.headers['anthropic-beta']) headers['anthropic-beta'] = req.headers['anthropic-beta'];
    } else {
      headers.authorization = `Bearer ${upstreamKey}`;
      if (req.headers['openai-organization']) headers['openai-organization'] = req.headers['openai-organization'];
      if (req.headers['openai-project']) headers['openai-project'] = req.headers['openai-project'];
    }
    const base = (up.baseUrl ?? PROVIDERS[provider].defaultBaseUrl).replace(/\/+$/, '');
    const target = `${base}${PROVIDERS[provider].path}`;
    const forward = rewriteRequest(provider, body, decision.maxOutputTokens);

    let upstream;
    try {
      upstream = await fetchImpl(target, { method: 'POST', headers, body: JSON.stringify(forward) });
    } catch (e) {
      guard.cancel(decision.id);
      return send(res, 502, { error: `could not reach ${provider}: ${e.message}` });
    }

    const outHeaders = {};
    upstream.headers.forEach((v, k) => { if (!DROP_RESPONSE_HEADERS.has(k)) outHeaders[k] = v; });
    if (decision.warnings.length) outHeaders['x-guard-warnings'] = decision.warnings.map((w) => w.code).join(',');

    if (!upstream.ok) {
      // Providers do not bill a request they reject; release the hold.
      guard.cancel(decision.id);
      const text = await upstream.text();
      res.writeHead(upstream.status, outHeaders);
      return res.end(text);
    }

    const isStream = (upstream.headers.get('content-type') ?? '').includes('text/event-stream');
    if (!isStream) {
      const text = await upstream.text();
      let usage = null;
      try { usage = usageFromResponse(provider, JSON.parse(text)); } catch { /* charged at the hold */ }
      const settled = guard.settle(decision.id, usage);
      log({ type: 'settled', provider, model: d0.model, ...settled });
      res.writeHead(upstream.status, outHeaders);
      return res.end(text);
    }

    // Stream: pass every byte through as it arrives while reading usage off it.
    res.writeHead(upstream.status, outHeaders);
    const reader = streamUsageReader(provider);
    const decoder = new TextDecoder();
    let settled = false;
    let complete = false;
    // Usage read off a stream that ended early may undercount what the
    // provider bills for it, so an incomplete stream is charged at its hold.
    const finish = () => {
      if (settled) return;
      settled = true;
      const s = guard.settle(decision.id, complete ? reader.usage() : null);
      log({ type: 'settled', provider, model: d0.model, stream: true, complete, ...s });
    };
    res.on('close', finish);
    try {
      for await (const chunk of upstream.body) {
        if (res.destroyed) break;
        reader.push(decoder.decode(chunk, { stream: true }));
        if (!res.write(chunk)) await new Promise((r) => { res.once('drain', r); res.once('close', r); });
      }
      complete = !res.destroyed;
    } catch {
      /* the client or the provider went away; finish() charges the hold */
    }
    finish();
    res.end();
  };
}

/** Start an HTTP server. Refuses to expose a deployer-held key on a public interface without tokens. */
export function startProxy({ host = '127.0.0.1', port = 8787, ...opts }) {
  const holdsKey = Object.values(opts.upstreams ?? {}).some((u) => u?.apiKey);
  const local = host === '127.0.0.1' || host === 'localhost' || host === '::1';
  if (holdsKey && !local && !(opts.proxyTokens ?? []).filter(Boolean).length) {
    throw new Error(`refusing to listen on ${host} with an upstream API key and no GUARD_PROXY_TOKENS: anyone who reaches the port would spend your money`);
  }
  const handler = createHandler(opts);
  const server = createServer((req, res) => {
    handler(req, res).catch((e) => {
      if (!res.headersSent) send(res, 500, { error: 'proxy error' });
      else res.end();
      opts.log?.({ type: 'error', message: e.message });
    });
  });
  return new Promise((resolve) => server.listen(port, host, () => resolve(server)));
}
