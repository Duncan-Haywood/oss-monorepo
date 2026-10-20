// The site's one server-side process, as a Cloudflare Worker on the free plan.
//
// GitHub Pages serves files and cannot receive anything, so two things the
// owner asked for on 2026-10-20 need somewhere to land:
//
//   POST /hit       the page-view ping `pf-site.js` already sends when
//                   `platform/counter/site.json` names an origin. Same rules as
//                   the Node counter (`platform/counter/core.mjs`), stored in D1.
//   GET  /counts    the daily aggregates, which `platform/counter/pull.mjs`
//                   copies into `portfolio/usage/site-visits.json`.
//   POST /feedback  the site's "Report a problem or suggest a feature" form.
//                   Opens a GitHub issue with a token held here as a Worker
//                   secret, so a visitor needs no GitHub account and no token
//                   ever reaches a public page.
//   GET  /healthz   a health check.
//
// Cost: the free plan has hard daily limits (Workers requests, D1 rows
// written) and stops answering past them rather than billing. Nothing here can
// run up a charge. Setup: `README.md` beside this file.

import { classify, utcDay, REF_KEY } from '../counter/core.mjs';
import { feedbackIssue } from './feedback.mjs';

const FEEDBACK_MAX_BODY = 6000;

const json = (status, obj, headers = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...headers } });

async function countHit(request, env, headers) {
  const body = await request.text();
  const verdict = classify({ method: 'POST', url: '/hit', headers, body });
  if (!verdict.count) return;
  const day = utcDay();
  const cap = Number(env.MAX_PER_SLUG_PER_DAY || 20000);
  const add = (slug) =>
    env.DB.prepare(
      'INSERT INTO counts (day, slug, n) VALUES (?1, ?2, 1) ON CONFLICT (day, slug) DO UPDATE SET n = n + 1 WHERE n < ?3',
    ).bind(day, slug, cap).run();
  const r = await add(verdict.slug);
  if (verdict.ref && r?.meta?.changes) await add(`${REF_KEY}${verdict.ref}`);
}

async function readCounts(env, since) {
  const { results = [] } = await env.DB.prepare('SELECT day, slug, n FROM counts WHERE day >= ?1 ORDER BY day, slug')
    .bind(since).all();
  const days = {};
  for (const { day, slug, n } of results) (days[day] ||= {})[slug] = n;
  return days;
}

/** One more submission today, unless the site-wide daily cap is reached. */
async function underDailyCap(env) {
  const cap = Number(env.FEEDBACK_DAILY_CAP || 50);
  const r = await env.DB.prepare(
    'INSERT INTO feedback_daily (day, n) VALUES (?1, 1) ON CONFLICT (day) DO UPDATE SET n = n + 1 WHERE n < ?2',
  ).bind(utcDay(), cap).run();
  return Boolean(r?.meta?.changes);
}

async function openIssue(env, issue) {
  const post = (payload) => fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/issues`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'user-agent': 'monorepo-projects-feedback',
      'x-github-api-version': '2022-11-28',
    },
    body: JSON.stringify(payload),
  });
  let res = await post(issue);
  // A token allowed to open issues but not to create a missing label gets a
  // 403 or 422 for the labels alone. The report matters more than its tags.
  if (res.status === 422 || res.status === 403) res = await post({ title: issue.title, body: issue.body });
  if (!res.ok) return null;
  const created = await res.json();
  return created.html_url || null;
}

async function handleFeedback(request, env, headers, cors) {
  // Browsers always send Origin on a cross-site POST; anything else posting
  // here is a script, and the form only lives on the site.
  if (headers.origin !== env.ALLOWED_ORIGIN) return json(403, { error: 'origin' }, cors);
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) return json(503, { error: 'not-configured' }, cors);
  const raw = await request.text();
  if (raw.length > FEEDBACK_MAX_BODY) return json(413, { error: 'size' }, cors);
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return json(400, { error: 'body' }, cors);
  }
  const verdict = feedbackIssue(input, { siteBase: env.SITE_BASE || '' });
  if (verdict.drop) return json(200, { ok: true }, cors);
  if (verdict.error) return json(400, { error: verdict.error }, cors);
  // Per-sender burst limit. The address is used for this check and never
  // written anywhere by this code.
  if (env.FEEDBACK_LIMITER) {
    const { success } = await env.FEEDBACK_LIMITER.limit({ key: headers['cf-connecting-ip'] || 'unknown' });
    if (!success) return json(429, { error: 'slow-down' }, cors);
  }
  if (!(await underDailyCap(env))) return json(429, { error: 'daily-cap' }, cors);
  const url = await openIssue(env, verdict.issue);
  return url ? json(201, { ok: true, url }, cors) : json(502, { error: 'github' }, cors);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = Object.fromEntries([...request.headers].map(([k, v]) => [k.toLowerCase(), v]));
    const cors = { 'access-control-allow-origin': env.ALLOWED_ORIGIN, vary: 'origin' };
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { ...cors, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400' },
      });
    }
    try {
      if (request.method === 'GET' && url.pathname === '/healthz') return new Response('ok\n');
      if (request.method === 'GET' && url.pathname === '/counts') {
        const since = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('since') || '') ? url.searchParams.get('since') : '0000-00-00';
        return json(200, { unit: 'page loads by browsers that did not opt out; not people', days: await readCounts(env, since) },
          { 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
      }
      if (request.method === 'POST' && url.pathname === '/hit') {
        await countHit(request, env, headers);
        // 204 either way, as in the Node counter: a refusal tells a page nothing.
        return new Response(null, { status: 204, headers: cors });
      }
      if (request.method === 'POST' && url.pathname === '/feedback') return await handleFeedback(request, env, headers, cors);
      return new Response('not found\n', { status: 404, headers: cors });
    } catch {
      return json(500, { error: 'internal' }, cors);
    }
  },
};
