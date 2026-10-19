import test from 'node:test';
import assert from 'node:assert/strict';
import { probe, probeAll, fixFor, normaliseBaseUrl, isLoopback, guessOs, testPrompt, reportText, SERVERS, STATUSES } from './probe.mjs';
import { complete } from './byok.mjs';

// A browser-shaped fetch: `listening` ports answer; `corsOk` ports also send
// CORS headers, so only they can be read. A CORS refusal and a closed port
// both reject a normal request, as in a real browser; a no-cors request
// resolves (opaque) whenever something is listening.
function browserFetch({ listening = [], corsOk = [], models = {}, status = {} } = {}) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, mode: init.mode });
    const port = new URL(url).port;
    if (!listening.includes(port)) throw new TypeError('Failed to fetch');
    if (init.mode === 'no-cors') return { ok: false, status: 0, type: 'opaque' };
    if (!corsOk.includes(port)) throw new TypeError('Failed to fetch');
    if (status[port]) return { ok: false, status: status[port], json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ object: 'list', data: (models[port] || []).map(id => ({ id })) }) };
  };
  fn.calls = calls;
  return fn;
}

test('working server: lists its models', async () => {
  const f = browserFetch({ listening: ['11434'], corsOk: ['11434'], models: { 11434: ['llama3.2', 'qwen2.5:7b'] } });
  const r = await probe({ provider: 'ollama', baseUrl: 'http://localhost:11434/v1', fetch: f });
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.models, ['llama3.2', 'qwen2.5:7b']);
  assert.equal(f.calls[0].url, 'http://localhost:11434/v1/models');
  assert.equal(f.calls.length, 1, 'no second request when the first succeeds');
});

test('running but refusing this origin: the no-cors request tells it apart from off', async () => {
  const f = browserFetch({ listening: ['11434'] });
  const r = await probe({ provider: 'ollama', baseUrl: 'http://localhost:11434/v1', fetch: f });
  assert.equal(r.status, 'blocked');
  assert.deepEqual(f.calls.map(c => [c.url, c.mode]), [
    ['http://localhost:11434/v1/models', undefined],
    ['http://localhost:11434/', 'no-cors'],
  ]);
  const off = await probe({ provider: 'ollama', baseUrl: 'http://localhost:11434/v1', fetch: browserFetch() });
  assert.equal(off.status, 'unreachable');
});

test('reachable with no models, and other servers on the port', async () => {
  const f = browserFetch({ listening: ['1234', '8080'], corsOk: ['1234', '8080'], status: { 8080: 404 } });
  assert.equal((await probe({ provider: 'lmstudio', baseUrl: 'localhost:1234', fetch: f })).status, 'no-models');
  const other = await probe({ provider: 'llamacpp', baseUrl: 'localhost:8080', fetch: f });
  assert.equal(other.status, 'http-error');
  assert.equal(other.httpStatus, 404);
  const notJson = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('html'); } });
  assert.equal((await probe({ baseUrl: 'localhost:3000', fetch: notJson })).status, 'http-error');
  const wrongShape = async () => ({ ok: true, status: 200, json: async () => ({ models: [] }) });
  assert.equal((await probe({ baseUrl: 'localhost:3000', fetch: wrongShape })).status, 'http-error');
});

test('a hung server counts as unreachable after the timeout', async () => {
  const hang = (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  const r = await probe({ provider: 'ollama', baseUrl: 'localhost:11434', fetch: hang, timeoutMs: 10 });
  assert.equal(r.status, 'unreachable');
});

test('mixed content: an https page cannot reach plain http on the LAN, but can reach localhost', async () => {
  const f = browserFetch({ listening: ['11434'], corsOk: ['11434'], models: { 11434: ['m'] } });
  assert.equal((await probe({ baseUrl: 'http://192.168.1.20:11434', fetch: f })).status, 'mixed-content');
  assert.equal(f.calls.length, 0, 'nothing is sent when the browser would block it');
  assert.equal((await probe({ baseUrl: 'http://192.168.1.20:11434', pageProtocol: 'http:', fetch: f })).status, 'ok');
  assert.equal((await probe({ baseUrl: 'http://127.0.0.1:11434', fetch: f })).status, 'ok');
  assert.equal((await probe({ baseUrl: 'not a url at all', fetch: f })).status, 'bad-url');
  assert.equal((await probe({ baseUrl: '', fetch: f })).status, 'bad-url');
});

test('probeAll checks the three default ports', async () => {
  const f = browserFetch({ listening: ['11434', '1234'], corsOk: ['1234'], models: { 1234: ['phi-3'] } });
  const rs = await probeAll({ fetch: f });
  assert.deepEqual(rs.map(r => [r.provider, r.status]), [['ollama', 'blocked'], ['lmstudio', 'ok'], ['llamacpp', 'unreachable']]);
  assert.equal(SERVERS.length, 3);
});

test('normaliseBaseUrl and isLoopback', () => {
  assert.equal(normaliseBaseUrl('localhost:11434'), 'http://localhost:11434/v1');
  assert.equal(normaliseBaseUrl('http://box:1234/v1/'), 'http://box:1234/v1');
  assert.equal(normaliseBaseUrl('https://gpu.example.com/llm'), 'https://gpu.example.com/llm/v1');
  assert.equal(normaliseBaseUrl('   '), null);
  assert.equal(normaliseBaseUrl('http://'), null);
  for (const h of ['localhost', 'app.localhost', '127.0.0.1', '127.1.2.3', '[::1]']) assert.equal(isLoopback(h), true, h);
  for (const h of ['192.168.0.2', 'example.com', '10.0.0.1']) assert.equal(isLoopback(h), false, h);
});

test('fix for a blocked Ollama names this page origin, per operating system', () => {
  const r = { provider: 'ollama', baseUrl: 'http://localhost:11434/v1', status: 'blocked', models: [] };
  const origin = 'https://duncan-haywood.github.io';
  const cmds = os => fixFor(r, { origin, os }).steps.map(s => s.command).filter(Boolean);
  assert.ok(cmds('mac').includes(`launchctl setenv OLLAMA_ORIGINS "${origin}"`));
  assert.ok(cmds('linux').some(c => c.includes(`Environment="OLLAMA_ORIGINS=${origin}"`)));
  assert.ok(cmds('linux').includes('sudo systemctl daemon-reload && sudo systemctl restart ollama'));
  assert.ok(cmds('windows').includes(`setx OLLAMA_ORIGINS "${origin}"`));
  assert.match(fixFor(r, { origin, os: 'mac' }).title, /refuses https:\/\/duncan-haywood\.github\.io/);
});

test('fixes for every other state', () => {
  const at = (provider, status, extra = {}) => fixFor({ provider, status, baseUrl: SERVERS.find(s => s.id === provider)?.baseUrl || 'http://localhost:9000/v1', models: [], ...extra });
  assert.ok(at('lmstudio', 'blocked').steps.some(s => s.command === 'lms server start --cors'));
  assert.ok(at('ollama', 'unreachable').steps.some(s => s.command === 'ollama serve'));
  assert.ok(at('ollama', 'unreachable').steps.some(s => /local network access/.test(s.text)));
  assert.ok(at('llamacpp', 'unreachable').steps.some(s => /llama-server -m/.test(s.command || '')));
  assert.ok(at('ollama', 'no-models').steps.some(s => s.command === 'ollama pull llama3.2'));
  assert.ok(at('lmstudio', 'no-models').steps.some(s => /^lms get /.test(s.command || '')));
  assert.match(at('ollama', 'ok', { models: ['a', 'b'] }).steps[0].text, /a, b/);
  assert.match(at('custom', 'mixed-content', { baseUrl: 'http://192.168.1.5:11434/v1' }).steps[1].command, /ssh -N -L 11434:localhost:11434/);
  assert.match(at('custom', 'http-error', { httpStatus: 404 }).steps[0].text, /HTTP 404/);
  assert.equal(at('custom', 'bad-url').title, 'Check the address');
  for (const s of Object.keys(STATUSES)) assert.ok(at('ollama', s).title, s);
});

test('guessOs from a user agent', () => {
  assert.equal(guessOs('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'windows');
  assert.equal(guessOs('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)'), 'mac');
  assert.equal(guessOs('Mozilla/5.0 (X11; Linux x86_64)'), 'linux');
});

test('test prompt: times one keyless call through the shared client', async () => {
  let t = 1000;
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    t += 2000;
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'A model on your machine.' } }], usage: { prompt_tokens: 12, completion_tokens: 40 } }) };
  };
  const r = await testPrompt({ complete, provider: 'ollama', baseUrl: 'http://localhost:11434/v1', model: 'llama3.2', fetch: f, now: () => t });
  assert.deepEqual(r, { ok: true, text: 'A model on your machine.', ms: 2000, outputTokens: 40, tokensPerSecond: 20 });
  assert.equal(calls[0].url, 'http://localhost:11434/v1/chat/completions');
  assert.equal(calls[0].headers.authorization, undefined);
  assert.equal(calls[0].body.model, 'llama3.2');
  const custom = await testPrompt({ complete, provider: 'custom', baseUrl: 'http://localhost:9000/v1', model: 'm', fetch: f, now: () => t });
  assert.equal(custom.ok, true);
  const failed = await testPrompt({ complete, provider: 'ollama', baseUrl: 'http://localhost:11434/v1', model: 'm', fetch: async () => ({ ok: false, status: 404 }) });
  assert.deepEqual(failed, { ok: false, error: 'ollama returned HTTP 404' });
  const noModel = await testPrompt({ complete, provider: 'ollama', baseUrl: 'http://localhost:11434/v1', model: '', fetch: f });
  assert.equal(noModel.ok, false);
});

test('report text lists each server, its models and the next command', () => {
  const text = reportText([
    { provider: 'ollama', baseUrl: 'http://localhost:11434/v1', status: 'blocked', models: [] },
    { provider: 'lmstudio', baseUrl: 'http://localhost:1234/v1', status: 'ok', models: ['phi-3'] },
  ], { origin: 'https://example.org', os: 'linux' });
  assert.match(text, /^Local LLM connection check from https:\/\/example\.org/);
  assert.match(text, /Ollama at http:\/\/localhost:11434\/v1: Running, but it refuses/);
  assert.match(text, /OLLAMA_ORIGINS=https:\/\/example\.org/);
  assert.match(text, /models: phi-3/);
});
