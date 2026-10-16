import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createGuard } from './guard.mjs';
import { startProxy } from './proxy.mjs';
import { describeRequest, rewriteRequest, streamUsageReader, usageFromResponse } from './providers.mjs';

const PRICES = { 'claude-test': { in: 3, out: 15 }, 'gpt-test': { in: 1, out: 4, cacheRead: 0.5 } };

// A fake provider on a real socket: records what it received, answers as told.
async function fakeUpstream(respond) {
  const seen = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const json = JSON.parse(body);
      seen.push({ url: req.url, headers: req.headers, body: json });
      respond(json, res, req);
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, seen, close: () => server.close() };
}

async function harness(policy, respond, opts = {}) {
  const up = await fakeUpstream(respond);
  const guard = createGuard({ prices: PRICES, ...policy });
  const server = await startProxy({
    port: 0,
    guard,
    upstreams: { anthropic: { baseUrl: up.url, apiKey: opts.anthropicKey ?? null }, openai: { baseUrl: up.url, apiKey: opts.openaiKey ?? null } },
    proxyTokens: opts.proxyTokens ?? [],
    adminToken: opts.adminToken ?? null,
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { guard, up, base, close: () => { server.close(); up.close(); } };
}

const anthropicOk = (body, res) => {
  res.writeHead(200, { 'content-type': 'application/json', 'request-id': 'req_1' });
  res.end(JSON.stringify({ id: 'msg', type: 'message', content: [{ type: 'text', text: 'hi' }], usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 0 } }));
};

const post = (url, body, headers = {}) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('providers: request description, rewrite and usage parsing', () => {
  assert.deepEqual(describeRequest('openai', { model: 'm', max_tokens: 5, messages: [] }).maxOutputTokens, 5);
  assert.equal(describeRequest('openai', { model: 'm', max_tokens: 5, max_completion_tokens: 9 }).maxOutputTokens, 9);
  assert.equal(rewriteRequest('openai', { max_tokens: 99999 }, 100).max_tokens, 100);
  assert.equal(rewriteRequest('openai', {}, 100).max_completion_tokens, 100);
  assert.deepEqual(rewriteRequest('openai', { stream: true, stream_options: { x: 1 } }, 10).stream_options, { x: 1, include_usage: true });
  assert.equal(rewriteRequest('anthropic', {}, 7).max_tokens, 7);
  assert.deepEqual(usageFromResponse('openai', { usage: { prompt_tokens: 100, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 60 } } }), { input: 40, output: 5, cacheRead: 60, cacheWrite: 0 });
  assert.equal(usageFromResponse('anthropic', {}), null);

  const r = streamUsageReader('anthropic');
  r.push('event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":50,"cache_read_input_tokens":10,"output_tokens":1}}}\n\n');
  r.push('event: message_delta\ndata: {"type":"message_delta","usage":{"output_t');
  r.push('okens":42}}\n\n');
  assert.deepEqual(r.usage(), { input: 50, output: 42, cacheRead: 10, cacheWrite: 0 });
});

test('anthropic call passes through, gets an output cap, and is settled at reported usage', async () => {
  const h = await harness({ defaultMaxOutputTokens: 256, budgets: [{ id: 'd', limitUsd: 1 }] }, anthropicOk);
  try {
    const res = await post(`${h.base}/anthropic/v1/messages`, { model: 'claude-test', messages: [{ role: 'user', content: 'hi' }] }, { 'x-api-key': 'sk-caller', 'x-guard-user': 'ann' });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('request-id'), 'req_1');
    assert.equal(res.headers.get('x-guard-warnings'), 'output-cap-added');
    assert.equal((await res.json()).content[0].text, 'hi');
    assert.equal(h.up.seen[0].body.max_tokens, 256);
    assert.equal(h.up.seen[0].headers['x-api-key'], 'sk-caller', 'with no upstream key the caller\'s own key is forwarded');
    const b = h.guard.status().budgets[0];
    assert.equal(b.spentUsd, 0.006); // 1000 in x $3 + 200 out x $15, per million
    assert.equal(b.heldUsd, 0);
  } finally { h.close(); }
});

test('budget refusal is HTTP 402 in the provider\'s error shape and never reaches upstream', async () => {
  const h = await harness({ budgets: [{ id: 'd', limitUsd: 0.001 }] }, anthropicOk);
  try {
    const res = await post(`${h.base}/openai/v1/chat/completions`, { model: 'gpt-test', max_tokens: 1000, messages: [{ role: 'user', content: 'x' }] }, { authorization: 'Bearer sk-c' });
    assert.equal(res.status, 402);
    assert.equal(res.headers.get('x-guard-blocked'), 'budget-exceeded');
    const body = await res.json();
    assert.equal(body.error.type, 'spend_guard_blocked');
    assert.match(body.error.message, /budget d/);
    assert.equal(h.up.seen.length, 0);
  } finally { h.close(); }
});

test('an open breaker is HTTP 429 with Retry-After', async () => {
  const h = await harness({ breakers: [{ id: 'loop', scope: 'run', maxRepeats: 2, cooldownSec: 60 }] }, anthropicOk);
  try {
    const body = { model: 'claude-test', max_tokens: 10, messages: [{ role: 'user', content: 'again' }] };
    const hdr = { 'x-api-key': 'k', 'x-guard-run': 'r1' };
    assert.equal((await post(`${h.base}/v1/messages`, body, hdr)).status, 200);
    assert.equal((await post(`${h.base}/v1/messages`, body, hdr)).status, 200);
    const res = await post(`${h.base}/v1/messages`, body, hdr);
    assert.equal(res.status, 429);
    assert.equal(res.headers.get('retry-after'), '60');
    assert.equal((await res.json()).error.code, 'breaker-tripped');
    // Another run is unaffected.
    assert.equal((await post(`${h.base}/v1/messages`, body, { ...hdr, 'x-guard-run': 'r2' })).status, 200);
  } finally { h.close(); }
});

test('openai stream: bytes pass through, include_usage is switched on, usage is settled', async () => {
  const h = await harness({ budgets: [{ id: 'd', limitUsd: 1 }] }, (body, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write('data: {"choices":[{"delta":{"content":"he"}}]}\n\n');
    res.write('data: {"choices":[{"delta":{"content":"llo"}}]}\n\n');
    res.write('data: {"choices":[],"usage":{"prompt_tokens":2000,"completion_tokens":100,"prompt_tokens_details":{"cached_tokens":1000}}}\n\n');
    res.end('data: [DONE]\n\n');
  });
  try {
    const res = await post(`${h.base}/openai/v1/chat/completions`, { model: 'gpt-test', stream: true, max_completion_tokens: 500, messages: [{ role: 'user', content: 'x' }] }, { authorization: 'Bearer sk-c' });
    const text = await res.text();
    assert.match(text, /"content":"he"/);
    assert.match(text, /\[DONE\]/);
    assert.equal(h.up.seen[0].body.stream_options.include_usage, true);
    // 1000 fresh x $1 + 1000 cached x $0.5 + 100 out x $4, per million.
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(h.guard.status().budgets[0].spentUsd, 0.0019);
  } finally { h.close(); }
});

test('an upstream rejection releases the hold (providers do not bill it)', async () => {
  const h = await harness({ budgets: [{ id: 'd', limitUsd: 1 }] }, (body, res) => {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end('{"type":"error","error":{"type":"invalid_request_error"}}');
  });
  try {
    const res = await post(`${h.base}/v1/messages`, { model: 'claude-test', max_tokens: 10, messages: [] }, { 'x-api-key': 'k' });
    assert.equal(res.status, 400);
    assert.match(await res.text(), /invalid_request_error/);
    const b = h.guard.status().budgets[0];
    assert.equal(b.spentUsd + b.heldUsd, 0);
    assert.equal(b.calls, 0);
  } finally { h.close(); }
});

test('with a deployer-held key, callers need a proxy token and never see the real key', async () => {
  const h = await harness({}, anthropicOk, { anthropicKey: 'sk-deployer', proxyTokens: ['team-token'] });
  try {
    const body = { model: 'claude-test', max_tokens: 10, messages: [] };
    assert.equal((await post(`${h.base}/v1/messages`, body, { 'x-api-key': 'guess' })).status, 401);
    assert.equal((await post(`${h.base}/v1/messages`, body)).status, 401);
    const ok = await post(`${h.base}/v1/messages`, body, { 'x-api-key': 'team-token' });
    assert.equal(ok.status, 200);
    assert.equal(h.up.seen[0].headers['x-api-key'], 'sk-deployer');
  } finally { h.close(); }
});

test('admin endpoints need the admin token; halt refuses calls', async () => {
  const h = await harness({}, anthropicOk, { adminToken: 'adm' });
  try {
    assert.equal((await fetch(`${h.base}/guard/status`)).status, 401);
    const halt = await fetch(`${h.base}/guard/halt?reason=spike`, { method: 'POST', headers: { authorization: 'Bearer adm' } });
    assert.equal((await halt.json()).halted, 'spike');
    const res = await post(`${h.base}/v1/messages`, { model: 'claude-test', max_tokens: 10, messages: [] }, { 'x-api-key': 'k' });
    assert.equal(res.status, 402);
    assert.equal((await res.json()).error.code, 'halted');
    await fetch(`${h.base}/guard/resume`, { method: 'POST', headers: { authorization: 'Bearer adm' } });
    assert.equal((await post(`${h.base}/v1/messages`, { model: 'claude-test', max_tokens: 10, messages: [] }, { 'x-api-key': 'k' })).status, 200);
  } finally { h.close(); }
});

test('refuses to expose a deployer key on a public interface without proxy tokens', () => {
  const guard = createGuard({ prices: PRICES });
  assert.throws(() => startProxy({ host: '0.0.0.0', port: 0, guard, upstreams: { openai: { apiKey: 'sk' } } }), /GUARD_PROXY_TOKENS/);
});

test('unknown routes and bad bodies', async () => {
  const h = await harness({}, anthropicOk);
  try {
    assert.equal((await fetch(`${h.base}/healthz`)).status, 200);
    assert.equal((await post(`${h.base}/v1/embeddings`, {})).status, 404);
    const bad = await fetch(`${h.base}/v1/messages`, { method: 'POST', headers: { 'x-api-key': 'k' }, body: 'not json' });
    assert.equal(bad.status, 400);
  } finally { h.close(); }
});
