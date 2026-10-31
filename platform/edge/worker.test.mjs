import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.mjs';
import { feedbackRecord, MESSAGE_MAX } from './feedback.mjs';
import { mergeFeedback } from './pull-feedback.mjs';

/** An in-memory stand-in for the three D1 statements the worker issues. */
function fakeDb() {
  const counts = new Map();
  const daily = new Map();
  const feedback = [];
  return {
    counts,
    feedback,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async run() {
              if (sql.startsWith('INSERT INTO counts')) {
                const [day, slug, cap] = args;
                const k = `${day}|${slug}`;
                const n = counts.get(k) || 0;
                if (n >= cap) return { meta: { changes: 0 } };
                counts.set(k, n + 1);
                return { meta: { changes: 1 } };
              }
              if (sql.startsWith('INSERT INTO feedback_daily')) {
                const [day, cap] = args;
                const n = daily.get(day) || 0;
                if (n >= cap) return { meta: { changes: 0 } };
                daily.set(day, n + 1);
                return { meta: { changes: 1 } };
              }
              if (sql.startsWith('INSERT INTO feedback ')) {
                const [day, type, tool, page, message] = args;
                feedback.push({ id: feedback.length + 1, day, type, tool, page, message });
                return { meta: { changes: 1 } };
              }
              throw new Error(`unexpected run: ${sql}`);
            },
            async all() {
              if (sql.includes('FROM feedback')) return { results: feedback.filter((r) => r.id > args[0]) };
              const [since] = args;
              const results = [...counts].map(([k, n]) => { const [day, slug] = k.split('|'); return { day, slug, n }; })
                .filter((r) => r.day >= since);
              return { results };
            },
          };
        },
      };
    },
  };
}

const ORIGIN = 'https://duncan-haywood.github.io';
const env = (over = {}) => ({
  DB: fakeDb(), ALLOWED_ORIGIN: ORIGIN, FEEDBACK_DAILY_CAP: '2', ...over,
});
const req = (path, { method = 'POST', body, headers = {}, cf } = {}) => {
  const r = new Request(`https://edge.example${path}`, { method, body, headers: { 'user-agent': 'Mozilla/5.0', ...headers } });
  // Cloudflare attaches `request.cf`; a plain Request has none.
  if (cf) Object.defineProperty(r, 'cf', { value: cf });
  return r;
};

test('a hit is counted per day and slug, and /counts returns it', async () => {
  const e = env();
  for (let i = 0; i < 2; i++) await worker.fetch(req('/hit', { body: JSON.stringify({ p: 'roof-bid', r: 'npm', s: 'google' }) }), e);
  await worker.fetch(req('/hit', { body: JSON.stringify({ p: 'roof-bid', s: 'example.com' }) }), e);
  await worker.fetch(req('/hit', { body: JSON.stringify({ p: 'roof-bid' }), headers: { dnt: '1' } }), e);
  await worker.fetch(req('/hit', { body: JSON.stringify({ p: '../etc' }) }), e);
  const res = await worker.fetch(req('/counts', { method: 'GET' }), e);
  const { days } = await res.json();
  const [day] = Object.keys(days);
  assert.deepEqual(days[day], { 'roof-bid': 3, 'ref:npm': 2, 'src:google': 2, 'dev:desktop': 3 }, 'a source outside the closed list is dropped');
});

test('a load adds its country and device class; a crawler beacon adds to bot: keys, not the page', async () => {
  const e = env();
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148';
  const hit = (headers, cf, p = 'roof-bid') => worker.fetch(req('/hit', { body: JSON.stringify({ p }), headers, cf }), e);
  await hit({ 'user-agent': iphone }, { country: 'GB' });
  await hit({ 'user-agent': 'Mozilla/5.0 (Linux; Android 14; SM-X200)' }, { country: 'not a code' });
  await hit({ 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' }, { country: 'US' });
  await hit({ 'user-agent': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ChatGPT-User/1.0; +https://openai.com/bot)' }, {}, 'hub');
  await hit({ 'user-agent': 'SomethingBot/1.0' }, {}, '../etc');
  const { days } = await (await worker.fetch(req('/counts', { method: 'GET' }), e)).json();
  const [day] = Object.keys(days);
  assert.deepEqual(days[day], {
    'roof-bid': 2, 'geo:GB': 1, 'dev:mobile': 1, 'dev:tablet': 1,
    'bot:googlebot': 1, 'botpage:roof-bid': 1, 'bot:chatgpt-user': 1, 'botpage:hub': 1, 'bot:other': 1,
  });
});

test('feedback validation, with emails removed', () => {
  const { record } = feedbackRecord({ type: 'problem', tool: 'roof-bid', page: '/monorepo-projects/roof-bid/', message: 'Total is wrong, mail me a@b.co' });
  assert.deepEqual(record, { type: 'problem', tool: 'roof-bid', page: '/monorepo-projects/roof-bid/', message: 'Total is wrong, mail me [email removed]' });
  assert.deepEqual(feedbackRecord({ type: 'idea', message: 'hi', website: 'spam' }), { drop: true });
  assert.equal(feedbackRecord({ type: 'nope', message: 'hello there' }).error, 'type');
  assert.equal(feedbackRecord({ type: 'idea', tool: 'a b', message: 'hello there' }).error, 'tool');
  assert.equal(feedbackRecord({ type: 'idea', message: 'x' }).error, 'message');
  assert.equal(feedbackRecord({ type: 'idea', message: 'x'.repeat(MESSAGE_MAX + 1) }).error, 'message');
  assert.equal(feedbackRecord({ type: 'other', message: 'hello there', page: 'javascript:alert(1)' }).record.page, '');
});

test('/feedback stores a message, refuses other origins, honours the daily cap, and serves what it stored', async (t) => {
  const net = t.mock.method(globalThis, 'fetch', async () => { throw new Error('the worker makes no outbound call'); });
  const e = env();
  const send = (origin, message = 'Add a metric toggle please') => worker.fetch(req('/feedback', {
    body: JSON.stringify({ type: 'idea', tool: 'roof-bid', message }),
    headers: { origin, 'content-type': 'application/json' },
  }), e);
  assert.equal((await send('https://evil.example')).status, 403);
  const ok = await send(ORIGIN);
  assert.equal(ok.status, 201);
  assert.equal(ok.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal((await send(ORIGIN, 'Second message here')).status, 201);
  assert.equal((await send(ORIGIN)).status, 429, 'third of the day is over the cap of 2');
  assert.equal(net.mock.callCount(), 0);

  const all = await (await worker.fetch(req('/feedback', { method: 'GET' }), e)).json();
  assert.deepEqual(all.feedback.map((r) => [r.id, r.tool, r.message]), [[1, 'roof-bid', 'Add a metric toggle please'], [2, 'roof-bid', 'Second message here']]);
  const later = await (await worker.fetch(req('/feedback?after=1', { method: 'GET' }), e)).json();
  assert.deepEqual(later.feedback.map((r) => r.id), [2]);
});

test('a filled honeypot is accepted and dropped', async () => {
  const e = env();
  const res = await worker.fetch(req('/feedback', {
    body: JSON.stringify({ type: 'other', message: 'Buy now', website: 'x' }), headers: { origin: ORIGIN },
  }), e);
  assert.equal(res.status, 200);
  assert.equal(e.DB.feedback.length, 0);
});

test('pulling feedback is append-only by id', () => {
  const a = { id: 1, day: '2026-10-20', type: 'idea', tool: '', page: '', message: 'one' };
  const merged = mergeFeedback([a], [{ ...a, message: 'rewritten' }, { id: 2, day: '2026-10-21', type: 'problem', message: 'two' }, { id: 'x', message: 'bad' }]);
  assert.deepEqual(merged.map((r) => [r.id, r.message]), [[1, 'one'], [2, 'two']]);
});

test('ALLOWED_ORIGIN can list several origins, and CORS echoes the one that posted', async () => {
  const second = 'https://site.example.dev';
  const e = env({ ALLOWED_ORIGIN: `${ORIGIN}, ${second}`, FEEDBACK_DAILY_CAP: '10' });
  const send = (origin) => worker.fetch(req('/feedback', {
    body: JSON.stringify({ type: 'idea', tool: 'roof-bid', message: 'Add a metric toggle please' }),
    headers: { origin, 'content-type': 'application/json' },
  }), e);
  for (const origin of [ORIGIN, second]) {
    const r = await send(origin);
    assert.equal(r.status, 201);
    assert.equal(r.headers.get('access-control-allow-origin'), origin);
  }
  const refused = await send('https://evil.example');
  assert.equal(refused.status, 403);
  assert.equal(refused.headers.get('access-control-allow-origin'), ORIGIN);
});

test('/healthz answers only GET, unknown POST paths are 404, and a malformed feedback body is a 400', async () => {
  const e = env();
  const ok = await worker.fetch(req('/healthz', { method: 'GET' }), e);
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), 'ok\n');
  assert.equal((await worker.fetch(req('/healthz', { method: 'POST' }), e)).status, 404);
  const stray = await worker.fetch(req('/nope', { body: '{}', headers: { origin: ORIGIN } }), e);
  assert.equal(stray.status, 404, 'a POST to an unknown path must not reach the feedback handler');
  const bad = await worker.fetch(req('/feedback', { body: '{not json', headers: { origin: ORIGIN } }), e);
  assert.equal(bad.status, 400);
  assert.deepEqual(await bad.json(), { error: 'body' });
});

test('/feedback accepts a body of exactly the size cap and refuses one byte more', async () => {
  const e = env();
  const padded = (n) => {
    const head = '{"type":"idea","message":"Boundary check message"}';
    return head + ' '.repeat(n - head.length);
  };
  const send = (body) => worker.fetch(req('/feedback', { body, headers: { origin: ORIGIN } }), e);
  assert.equal((await send(padded(6000))).status, 201, 'a 6000-character body is within the cap');
  const over = await send(padded(6001));
  assert.equal(over.status, 413);
  assert.deepEqual(await over.json(), { error: 'size' });
});

test('/counts?since= keeps only days from that date, and ignores a malformed value', async () => {
  const e = env();
  await worker.fetch(req('/hit', { body: JSON.stringify({ p: 'roof-bid' }) }), e);
  const days = async (q) => (await (await worker.fetch(req(`/counts${q}`, { method: 'GET' }), e)).json()).days;
  assert.equal(Object.keys(await days('')).length, 1);
  assert.equal(Object.keys(await days('?since=0000-00-00')).length, 1);
  assert.deepEqual(await days('?since=9999-12-31'), {}, 'a valid future date filters today out');
  assert.equal(Object.keys(await days('?since=9999-12-3')).length, 1, 'a malformed date falls back to everything');
  assert.equal(Object.keys(await days('?since=99999-12-31')).length, 1, 'a five-digit year is malformed');
});
