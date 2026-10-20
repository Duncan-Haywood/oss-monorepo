import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.mjs';
import { feedbackIssue, MESSAGE_MAX } from './feedback.mjs';

/** An in-memory stand-in for the three D1 statements the worker issues. */
function fakeDb() {
  const counts = new Map();
  const daily = new Map();
  return {
    counts,
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
              throw new Error(`unexpected run: ${sql}`);
            },
            async all() {
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
  DB: fakeDb(), ALLOWED_ORIGIN: ORIGIN, GITHUB_REPO: 'o/r', GITHUB_TOKEN: 't', SITE_BASE: `${ORIGIN}/monorepo-projects/`, FEEDBACK_DAILY_CAP: '2', ...over,
});
const req = (path, { method = 'POST', body, headers = {} } = {}) =>
  new Request(`https://edge.example${path}`, { method, body, headers: { 'user-agent': 'Mozilla/5.0', ...headers } });

test('a hit is counted per day and slug, and /counts returns it', async () => {
  const e = env();
  for (let i = 0; i < 2; i++) await worker.fetch(req('/hit', { body: JSON.stringify({ p: 'roof-bid', r: 'npm' }) }), e);
  await worker.fetch(req('/hit', { body: JSON.stringify({ p: 'roof-bid' }), headers: { dnt: '1' } }), e);
  await worker.fetch(req('/hit', { body: JSON.stringify({ p: '../etc' }) }), e);
  const res = await worker.fetch(req('/counts', { method: 'GET' }), e);
  const { days } = await res.json();
  const [day] = Object.keys(days);
  assert.deepEqual(days[day], { 'roof-bid': 2, 'ref:npm': 2 });
});

test('feedback becomes a fenced, labelled issue with emails removed', () => {
  const { issue } = feedbackIssue({
    type: 'problem', tool: 'roof-bid', page: '/monorepo-projects/roof-bid/',
    message: 'Total is wrong @someone see ![x](https://evil/p.png) mail me a@b.co\n~~~~\nclose',
  }, { siteBase: 'https://s/' });
  assert.deepEqual(issue.labels, ['site-feedback', 'bug']);
  assert.match(issue.title, /^\[Problem\] roof-bid: Total is wrong/);
  assert.ok(!issue.body.includes('a@b.co'));
  assert.match(issue.body, /\[email removed\]/);
  // The message's own tildes cannot close the fence early.
  const fences = issue.body.split('\n').filter((l) => /^~~~~/.test(l));
  assert.equal(fences.length, 2);
  assert.match(issue.body, /https:\/\/s\/roof-bid\//);
});

test('feedback validation', () => {
  assert.deepEqual(feedbackIssue({ type: 'idea', message: 'hi', website: 'spam' }), { drop: true });
  assert.equal(feedbackIssue({ type: 'nope', message: 'hello there' }).error, 'type');
  assert.equal(feedbackIssue({ type: 'idea', tool: 'a b', message: 'hello there' }).error, 'tool');
  assert.equal(feedbackIssue({ type: 'idea', message: 'x' }).error, 'message');
  assert.equal(feedbackIssue({ type: 'idea', message: 'x'.repeat(MESSAGE_MAX + 1) }).error, 'message');
  assert.ok(feedbackIssue({ type: 'other', message: 'hello there', page: 'javascript:alert(1)' }).issue.body.indexOf('Page') === -1);
});

test('/feedback posts to GitHub, refuses other origins, and honours the daily cap', async (t) => {
  const posted = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    posted.push({ url, init: JSON.parse(init.body), auth: init.headers.authorization });
    return new Response(JSON.stringify({ html_url: 'https://github.com/o/r/issues/1' }), { status: 201 });
  });
  const e = env();
  const send = (origin) => worker.fetch(req('/feedback', {
    body: JSON.stringify({ type: 'idea', tool: 'roof-bid', message: 'Add a metric toggle please' }),
    headers: { origin, 'content-type': 'application/json' },
  }), e);

  assert.equal((await send('https://evil.example')).status, 403);
  const ok = await send(ORIGIN);
  assert.equal(ok.status, 201);
  assert.equal(ok.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal((await ok.json()).url, 'https://github.com/o/r/issues/1');
  assert.equal(posted[0].url, 'https://api.github.com/repos/o/r/issues');
  assert.equal(posted[0].auth, 'Bearer t');
  assert.deepEqual(posted[0].init.labels, ['site-feedback', 'enhancement']);
  assert.equal((await send(ORIGIN)).status, 201);
  assert.equal((await send(ORIGIN)).status, 429, 'third of the day is over the cap of 2');
});

test('a label GitHub refuses does not lose the report', async (t) => {
  const bodies = [];
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return bodies.length === 1
      ? new Response('{}', { status: 422 })
      : new Response(JSON.stringify({ html_url: 'https://github.com/o/r/issues/2' }), { status: 201 });
  });
  const res = await worker.fetch(req('/feedback', {
    body: JSON.stringify({ type: 'other', message: 'Nice tools' }), headers: { origin: ORIGIN },
  }), env());
  assert.equal(res.status, 201);
  assert.equal(bodies[1].labels, undefined);
});

test('no token configured answers 503 instead of failing silently', async () => {
  const res = await worker.fetch(req('/feedback', {
    body: JSON.stringify({ type: 'other', message: 'Nice tools' }), headers: { origin: ORIGIN },
  }), env({ GITHUB_TOKEN: '' }));
  assert.equal(res.status, 503);
});

test('a filled honeypot is accepted and dropped', async (t) => {
  const calls = t.mock.method(globalThis, 'fetch', async () => { throw new Error('must not post'); });
  const res = await worker.fetch(req('/feedback', {
    body: JSON.stringify({ type: 'other', message: 'Buy now', website: 'x' }), headers: { origin: ORIGIN },
  }), env());
  assert.equal(res.status, 200);
  assert.equal(calls.mock.callCount(), 0);
});
