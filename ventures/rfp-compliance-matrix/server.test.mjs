import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { handler } from './server.mjs';
import { SAMPLE } from './sample.mjs';

async function boot(cfg) {
  const srv = http.createServer(handler(cfg));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = (path, { body, headers = {}, method = 'POST' } = {}) => fetch(base + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { call, close: () => srv.close() };
}
const llm = async () => ({ ok: true, json: async () => ({ content: [{ text: '[]' }] }) });

test('serves the page, its modules and a health check', async () => {
  const s = await boot({});
  try {
    assert.equal((await s.call('/healthz', { method: 'GET' })).status, 200);
    const page = await s.call('/', { method: 'GET' });
    assert.match(await page.text(), /Compliance Matrix/);
    for (const f of ['/extract.mjs', '/sample.mjs', '/usage.mjs', '/shred.mjs']) assert.equal((await s.call(f, { method: 'GET' })).status, 200, f);
    assert.equal((await s.call('/server.mjs', { method: 'GET' })).status, 404);
    assert.equal((await s.call('/.env', { method: 'GET' })).status, 404);
  } finally { s.close(); }
});

test('matrix, outline and coverage endpoints work without any key', async () => {
  const s = await boot({});
  try {
    const m = await (await s.call('/v1/matrix', { body: { text: SAMPLE } })).json();
    assert.ok(m.requirements.length > 3);
    assert.match(await (await s.call('/v1/matrix', { body: { text: SAMPLE, format: 'csv' } })).text(), /^ID,Section,Requirement/);
    const o = await (await s.call('/v1/outline', { body: { text: SAMPLE } })).json();
    assert.ok(o.volumes.length > 1);
    assert.equal((await s.call('/v1/coverage', { body: { text: SAMPLE } })).status, 400);
    const c = await (await s.call('/v1/coverage', { body: { text: SAMPLE, draft: 'nothing' } })).json();
    assert.ok(c.summary.missing > 0);
    assert.equal((await s.call('/v1/matrix', { body: { text: '' } })).status, 400);
    assert.equal((await s.call('/v1/matrix', { method: 'GET' })).status, 405);
  } finally { s.close(); }
});

test('refine is refused unless the deployer set both keys, and is rate limited', async () => {
  let s = await boot({});
  try {
    assert.equal((await s.call('/v1/matrix', { body: { text: SAMPLE, refine: true } })).status, 403);
  } finally { s.close(); }
  s = await boot({ apiKey: 'adm' });
  try {
    assert.equal((await s.call('/v1/matrix', { body: { text: SAMPLE } })).status, 401, 'API_KEY gates everything when set');
    assert.equal((await s.call('/v1/matrix', { body: { text: SAMPLE, refine: true }, headers: { authorization: 'Bearer adm' } })).status, 501);
  } finally { s.close(); }
  s = await boot({ apiKey: 'adm', anthropicKey: 'sk', fetchImpl: llm, refineLimit: 1 });
  try {
    const h = { authorization: 'Bearer adm' };
    assert.equal((await s.call('/v1/matrix', { body: { text: SAMPLE, refine: true }, headers: h })).status, 200);
    assert.equal((await s.call('/v1/matrix', { body: { text: SAMPLE, refine: true }, headers: h })).status, 429);
  } finally { s.close(); }
});

test('oversized bodies are rejected', async () => {
  const s = await boot({});
  try {
    const r = await s.call('/v1/matrix', { body: { text: 'x'.repeat(2_100_000) } }).catch(() => null);
    assert.ok(!r || r.status === 413);
  } finally { s.close(); }
});
