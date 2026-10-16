import test from 'node:test';
import assert from 'node:assert/strict';
import { complete, withFallback, configFromEnv, normalise, isConfigured, ByokError, PROVIDERS } from './byok.mjs';

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

test('config: missing key, model or base URL fails before any request', () => {
  assert.throws(() => normalise({ provider: 'anthropic' }), /API key/);
  assert.throws(() => normalise({ provider: 'openai', apiKey: 'k' }), /model name/);
  assert.throws(() => normalise({ provider: 'openai-compatible', model: 'm' }), /baseUrl/);
  assert.throws(() => normalise({ provider: 'nope' }), /unknown provider/);
  assert.equal(isConfigured(null), false);
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
