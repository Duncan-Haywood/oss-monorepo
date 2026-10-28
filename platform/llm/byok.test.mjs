import test from 'node:test';
import assert from 'node:assert/strict';
import { complete, withFallback, configFromEnv, normalise, isConfigured, isLocal, listModels, detectLocal, ByokError, PROVIDERS, LOCAL_PROVIDERS } from './byok.mjs';

function fakeFetch(reply, status = 200) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return { ok: status < 400, status, json: async () => reply };
  };
  fn.calls = calls;
  return fn;
}

test('anthropic: messages endpoint, version header, system, text joined, usage counts cache', async () => {
  const f = fakeFetch({ content: [{ type: 'thinking' }, { type: 'text', text: 'Hi ' }, { type: 'text', text: 'there' }],
    usage: { input_tokens: 3, cache_read_input_tokens: 10, cache_creation_input_tokens: 2, output_tokens: 5 } });
  const r = await complete({ provider: 'anthropic', apiKey: 'k' }, { system: 'S', prompt: 'P', fetch: f });
  assert.equal(r.text, 'Hi there');
  assert.equal(r.model, PROVIDERS.anthropic.defaultModel);
  assert.deepEqual(r.usage, { input: 15, output: 5 });
  const c = f.calls[0];
  assert.equal(c.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(c.init.headers['x-api-key'], 'k');
  assert.equal(c.init.headers['anthropic-version'], '2023-06-01');
  assert.equal(c.init.headers['anthropic-dangerous-direct-browser-access'], undefined);
  assert.equal(c.body.system, 'S');
  assert.deepEqual(c.body.messages, [{ role: 'user', content: 'P' }]);
});

test('anthropic: browser flag adds the direct-access header; a refusal is an error', async () => {
  const f = fakeFetch({ stop_reason: 'refusal', content: [] });
  await assert.rejects(complete({ provider: 'anthropic', apiKey: 'k', browser: true }, { prompt: 'P', fetch: f }), ByokError);
  assert.equal(f.calls[0].init.headers['anthropic-dangerous-direct-browser-access'], 'true');
});

test('openai and openai-compatible: chat/completions, bearer only when a key is set', async () => {
  const reply = { choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 4, completion_tokens: 1 } };
  const f = fakeFetch(reply);
  const r = await complete({ provider: 'openai', apiKey: 'k', model: 'm1' }, { system: 'S', prompt: 'P', fetch: f });
  assert.deepEqual([r.text, r.usage.input, r.usage.output], ['ok', 4, 1]);
  assert.equal(f.calls[0].url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(f.calls[0].init.headers.authorization, 'Bearer k');
  assert.deepEqual(f.calls[0].body.messages[0], { role: 'system', content: 'S' });

  const local = fakeFetch(reply);
  await complete({ provider: 'openai-compatible', baseUrl: 'http://localhost:11434/v1/', model: 'llama' }, { prompt: 'P', fetch: local });
  assert.equal(local.calls[0].url, 'http://localhost:11434/v1/chat/completions');
  assert.equal(local.calls[0].init.headers.authorization, undefined);
});

test('gemini: generateContent with the key in a header, not the URL', async () => {
  const f = fakeFetch({ candidates: [{ content: { parts: [{ text: 'a' }, { text: 'b' }] } }],
    usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 2 } });
  const r = await complete({ provider: 'gemini', apiKey: 'k', model: 'g1' }, { system: 'S', prompt: 'P', fetch: f });
  assert.equal(r.text, 'ab');
  assert.equal(f.calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/models/g1:generateContent');
  assert.ok(!f.calls[0].url.includes('k'));
  assert.equal(f.calls[0].init.headers['x-goog-api-key'], 'k');
  assert.equal(f.calls[0].body.systemInstruction.parts[0].text, 'S');
});

test('gemini: a reply without usageMetadata reports zero tokens', async () => {
  const f = fakeFetch({ candidates: [{ content: { parts: [{ text: 'a' }] } }] });
  const r = await complete({ provider: 'gemini', apiKey: 'k', model: 'g1' }, { prompt: 'P', fetch: f });
  assert.deepEqual([r.usage.input, r.usage.output], [0, 0]);
});

test('openai: a reply without usage reports zero tokens', async () => {
  const f = fakeFetch({ choices: [{ message: { content: 'a' } }] });
  const r = await complete({ provider: 'openai', apiKey: 'k', model: 'm1' }, { prompt: 'P', fetch: f });
  assert.deepEqual([r.usage.input, r.usage.output], [0, 0]);
});

test('config: missing key, model or base URL fails before any request', () => {
  assert.throws(() => normalise({ provider: 'anthropic' }), /API key/);
  assert.throws(() => normalise({ provider: 'openai', apiKey: 'k' }), /model name/);
  assert.throws(() => normalise({ provider: 'openai-compatible', model: 'm' }), /baseUrl/);
  assert.throws(() => normalise({ provider: 'nope' }), /unknown provider/);
  assert.equal(isConfigured(null), false);
});

test('config: null or a non-object is a ByokError, not a TypeError', () => {
  for (const bad of [null, undefined, 'anthropic']) {
    assert.throws(() => normalise(bad), err => err instanceof ByokError && /no model provider/.test(err.message));
  }
});

test('configFromEnv: picks the provider from whichever key is set; nothing set means null', () => {
  assert.equal(configFromEnv({}), null);
  assert.equal(configFromEnv({ ANTHROPIC_API_KEY: 'a' }).provider, 'anthropic');
  const o = configFromEnv({ OPENAI_API_KEY: 'o', LLM_MODEL: 'm' });
  assert.deepEqual([o.provider, o.apiKey, o.model], ['openai', 'o', 'm']);
  const l = configFromEnv({ LLM_BASE_URL: 'http://x/v1', LLM_MODEL: 'm' });
  assert.equal(l.provider, 'openai-compatible');
});

test('HTTP errors never echo the body and mark what is retryable', async () => {
  const f = fakeFetch({ error: 'your key sk-secret is bad' }, 429);
  await assert.rejects(complete({ provider: 'anthropic', apiKey: 'k' }, { prompt: 'P', fetch: f }), err => {
    assert.ok(err instanceof ByokError);
    assert.equal(err.retryable, true);
    assert.ok(!err.message.includes('sk-secret'));
    return true;
  });
});

test('withFallback: deterministic path without a key, on failure, model path otherwise', async () => {
  const det = () => 'template';
  assert.deepEqual(await withFallback(null, det, () => 'never'), { value: 'template', source: 'fallback' });
  const failed = await withFallback({ provider: 'anthropic', apiKey: 'k' }, det, async () => { throw new Error('boom'); });
  assert.deepEqual([failed.value, failed.source, failed.error], ['template', 'fallback', 'boom']);
  const ok = await withFallback({ provider: 'anthropic', apiKey: 'k' }, det, async c => `model:${c.model}`);
  assert.deepEqual(ok, { value: `model:${PROVIDERS.anthropic.defaultModel}`, source: 'model' });
});

test('guard: refused calls are never sent; allowed calls get the ceiling and are settled', async () => {
  const { createGuard } = await import('../../ventures/llm-spend-guard/guard.mjs');
  const guard = createGuard({
    prices: { 'claude-opus-5-5': { in: 5, out: 25 } },
    maxOutputTokens: 500,
    budgets: [{ id: 'd', limitUsd: 0.05 }],
  });
  let sent = 0;
  let lastBody = null;
  const f = async (url, init) => {
    sent++;
    lastBody = JSON.parse(init.body);
    return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 100, output_tokens: 400 } }) };
  };
  const r = await complete({ provider: 'anthropic', apiKey: 'k' }, { prompt: 'P', fetch: f, guard, scope: { feature: 'test' } });
  assert.equal(r.text, 'ok');
  assert.equal(lastBody.max_tokens, 500, 'the 2048 default is lowered to the policy ceiling');
  assert.equal(guard.status().budgets[0].spentUsd, 0.0105);
  // Three more calls spend $0.042 in all; the next worst-case hold ($0.0125) does not fit.
  for (let i = 0; i < 3; i++) await complete({ provider: 'anthropic', apiKey: 'k' }, { prompt: 'P', fetch: f, guard });
  const before = sent;
  await assert.rejects(complete({ provider: 'anthropic', apiKey: 'k' }, { prompt: 'P', fetch: f, guard }), err => {
    assert.ok(err instanceof ByokError);
    assert.match(err.message, /spend guard refused/);
    assert.equal(err.reasons[0].code, 'budget-exceeded');
    return true;
  });
  assert.equal(sent, before, 'a refused call never reaches the provider');
});

test('guard: a failed request releases its hold', async () => {
  const { createGuard } = await import('../../ventures/llm-spend-guard/guard.mjs');
  const guard = createGuard({ prices: { m: { in: 1, out: 1 } }, budgets: [{ id: 'd', limitUsd: 1 }] });
  const f = fakeFetch({}, 500);
  await assert.rejects(complete({ provider: 'openai', apiKey: 'k', model: 'm' }, { prompt: 'P', fetch: f, guard }), ByokError);
  const b = guard.status().budgets[0];
  assert.equal(b.spentUsd + b.heldUsd, 0);
});

test('local presets: no key, default localhost port, OpenAI wire format, no auth header', async () => {
  assert.deepEqual([...LOCAL_PROVIDERS], ['ollama', 'lmstudio', 'llamacpp']);
  const f = fakeFetch({ choices: [{ message: { content: 'local' } }], usage: { prompt_tokens: 2, completion_tokens: 1 } });
  const r = await complete({ provider: 'ollama', model: 'llama3.2' }, { system: 'S', prompt: 'P', fetch: f });
  assert.equal(r.text, 'local');
  assert.equal(f.calls[0].url, 'http://localhost:11434/v1/chat/completions');
  assert.equal(f.calls[0].init.headers.authorization, undefined);
  assert.equal(normalise({ provider: 'lmstudio', model: 'm' }).baseUrl, 'http://localhost:1234/v1');
  assert.equal(normalise({ provider: 'llamacpp', model: 'm', baseUrl: 'http://box:9000/v1/' }).baseUrl, 'http://box:9000/v1');
  assert.equal(isConfigured({ provider: 'ollama' }), false, 'a model is still named');
});

test('configFromEnv: OLLAMA_HOST or LLM_PROVIDER picks a local server without a key', () => {
  assert.equal(configFromEnv({ OLLAMA_HOST: '127.0.0.1:11434', LLM_MODEL: 'q' }).baseUrl, 'http://127.0.0.1:11434/v1');
  assert.equal(configFromEnv({ OLLAMA_HOST: '0.0.0.0', LLM_MODEL: 'q' }).baseUrl, 'http://localhost:11434/v1');
  assert.equal(configFromEnv({ OLLAMA_HOST: 'https://gpu.lan:8443/', LLM_MODEL: 'q' }).baseUrl, 'https://gpu.lan:8443/v1');
  const c = configFromEnv({ LLM_PROVIDER: 'lmstudio', LLM_MODEL: 'q' });
  assert.equal(c.baseUrl, 'http://localhost:1234/v1');
  assert.equal(c.apiKey, null);
  // A hosted key still wins over a stray OLLAMA_HOST.
  assert.equal(configFromEnv({ ANTHROPIC_API_KEY: 'k', OLLAMA_HOST: 'x' }).provider, 'anthropic');
});

test('isLocal: localhost and private addresses only', () => {
  assert.equal(isLocal({ provider: 'ollama', model: 'm' }), true);
  assert.equal(isLocal({ provider: 'openai-compatible', model: 'm', baseUrl: 'http://192.168.1.20:8080/v1' }), true);
  assert.equal(isLocal({ provider: 'openai-compatible', model: 'm', baseUrl: 'http://[::1]:8080/v1' }), true);
  assert.equal(isLocal({ provider: 'ollama', model: 'm', baseUrl: 'https://ollama.example.com/v1' }), false);
  assert.equal(isLocal({ provider: 'openai-compatible', model: 'm', baseUrl: 'http://172.32.0.1/v1' }), false);
  assert.equal(isLocal({ provider: 'anthropic', apiKey: 'k' }), false);
  // A DNS name that merely starts with digits and a dot is a remote host.
  for (const host of ['10.evil.com', '127.attacker.net', '192.168.x.example.org', '172.16.evil.io']) {
    assert.equal(isLocal({ provider: 'openai-compatible', model: 'm', baseUrl: `https://${host}/v1` }), false, host);
  }
  assert.equal(isLocal({ provider: 'ollama' }), false, 'an unusable config is not local');
});

test('listModels: OpenAI-style and Gemini lists, no model needed', async () => {
  const f = fakeFetchGet({ data: [{ id: 'llama3.2:3b' }, { id: 'qwen2.5' }] });
  assert.deepEqual(await listModels({ provider: 'ollama' }, { fetch: f }), ['llama3.2:3b', 'qwen2.5']);
  assert.equal(f.calls[0].url, 'http://localhost:11434/v1/models');
  assert.equal(f.calls[0].init.method, 'GET');
  const g = fakeFetchGet({ models: [{ name: 'models/gemini-x' }] });
  assert.deepEqual(await listModels({ provider: 'gemini', apiKey: 'k' }, { fetch: g }), ['gemini-x']);
  assert.equal(g.calls[0].init.headers['x-goog-api-key'], 'k');
  await assert.rejects(listModels({ provider: 'lmstudio' }, { fetch: fakeFetchGet({}, 500) }), ByokError);
});

test('listModels: an unreachable provider is a retryable ByokError', async () => {
  const down = async () => { throw new Error('ECONNREFUSED'); };
  await assert.rejects(listModels({ provider: 'ollama' }, { fetch: down }), err => {
    assert.ok(err instanceof ByokError);
    assert.equal(err.retryable, true);
    assert.match(err.message, /could not reach ollama: ECONNREFUSED/);
    return true;
  });
});

test('detectLocal: reports the servers that answered, never rejects', async () => {
  const f = async url => {
    if (url.startsWith('http://localhost:1234')) return { ok: true, status: 200, json: async () => ({ data: [{ id: 'phi' }] }) };
    if (url.startsWith('http://localhost:8080')) return { ok: false, status: 404, json: async () => ({}) };
    throw new TypeError('Failed to fetch');
  };
  assert.deepEqual(await detectLocal({ fetch: f }), [{ provider: 'lmstudio', baseUrl: 'http://localhost:1234/v1', models: ['phi'] }]);
  const hang = (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  assert.deepEqual(await detectLocal({ fetch: hang, timeoutMs: 10 }), []);
});

function fakeFetchGet(reply, status = 200) {
  const calls = [];
  const fn = async (url, init) => { calls.push({ url, init }); return { ok: status < 400, status, json: async () => reply }; };
  fn.calls = calls;
  return fn;
}

test('anthropic: a missing usage field counts as zero, not one (spend guard charges real usage)', async () => {
  const none = await complete({ provider: 'anthropic', apiKey: 'k' }, { prompt: 'P', fetch: fakeFetch({ content: [{ type: 'text', text: 'x' }] }) });
  assert.deepEqual(none.usage, { input: 0, output: 0 });
  const cached = await complete({ provider: 'anthropic', apiKey: 'k' }, { prompt: 'P', fetch: fakeFetch({ content: [], usage: { cache_read_input_tokens: 7, output_tokens: 2 } }) });
  assert.deepEqual(cached.usage, { input: 7, output: 2 });
});
