// The site's one server-side process, as a Cloudflare Worker on the free plan.
//
// GitHub Pages serves files and cannot receive anything, so two things the
// owner asked for on 2026-10-20 need somewhere to land:
//
//   POST /hit       the page-view ping `pf-site.js` already sends when
//                   `platform/counter/site.json` names an origin. Same rules as
//                   the Node counter (`platform/counter/core.mjs`), stored in D1.
//                   Each counted load also adds one to its day's `geo:<country>`
//                   (Cloudflare's own country lookup) and `dev:<class>`; a
//                   crawler's beacon adds to `bot:<class>` and `botpage:<slug>`
//                   instead of the page total (`core.mjs` has the lists).
//   GET  /counts    the daily aggregates, which `platform/counter/pull.mjs`
//                   copies into `portfolio/usage/site-visits.json`.
//   POST /feedback  the site's "Report a problem or suggest a feature" form,
//                   stored in D1. A visitor needs no GitHub account, and this
//                   Worker holds no GitHub credential at all.
//   GET  /feedback  the stored messages, which `pull-feedback.mjs` copies into
//                   `portfolio/usage/site-feedback.json` for agents to read.
//                   Public, like /counts: the same text is committed to a
//                   public repository anyway.
//   GET  /healthz   a health check.
//
// Cost: the free plan has hard daily limits (Workers requests, D1 rows
// written) and stops answering past them rather than billing. Nothing here can
// run up a charge. Setup: `README.md` beside this file.

import {
  classify, utcDay, deviceClass, countryCode,
  REF_KEY, SOURCE_KEY, GEO_KEY, DEVICE_KEY, BOT_KEY, BOT_PAGE_KEY,
} from '../counter/core.mjs';
import { feedbackRecord } from './feedback.mjs';

const FEEDBACK_MAX_BODY = 6000;

const json = (status, obj, headers = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...headers } });

async function countHit(request, env, headers, cf) {
  const body = await request.text();
  const verdict = classify({ method: 'POST', url: '/hit', headers, body });
  if (!verdict.count && !verdict.bot) return;
  const day = utcDay();
  const cap = Number(env.MAX_PER_SLUG_PER_DAY || 20000);
  const add = (slug) =>
    env.DB.prepare(
      'INSERT INTO counts (day, slug, n) VALUES (?1, ?2, 1) ON CONFLICT (day, slug) DO UPDATE SET n = n + 1 WHERE n < ?3',
    ).bind(day, slug, cap).run();
  if (verdict.bot) {
    const r = await add(`${BOT_KEY}${verdict.bot}`);
    if (r?.meta?.changes && verdict.slug) await add(`${BOT_PAGE_KEY}${verdict.slug}`);
    return;
  }
  const r = await add(verdict.slug);
  if (!r?.meta?.changes) return;
  if (verdict.ref) await add(`${REF_KEY}${verdict.ref}`);
  if (verdict.src) await add(`${SOURCE_KEY}${verdict.src}`);
  const geo = countryCode(cf?.country);
  if (geo) await add(`${GEO_KEY}${geo}`);
  await add(`${DEVICE_KEY}${deviceClass(headers['user-agent'] || '')}`);
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

async function readFeedback(env, after) {
  const { results = [] } = await env.DB.prepare(
    'SELECT id, day, type, tool, page, message FROM feedback WHERE id > ?1 ORDER BY id LIMIT 1000',
  ).bind(after).all();
  return results;
}

// ALLOWED_ORIGIN is a comma-separated list, so the site can be served from
// more than one host while it moves (GitHub Pages to Cloudflare, 2026-10-29).
function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGIN || '').split(',').map((o) => o.trim()).filter(Boolean);
}

async function handleFeedback(request, env, headers, cors) {
  // Browsers always send Origin on a cross-site POST; anything else posting
  // here is a script, and the form only lives on the site.
  if (!allowedOrigins(env).includes(headers.origin)) return json(403, { error: 'origin' }, cors);
  const raw = await request.text();
  if (raw.length > FEEDBACK_MAX_BODY) return json(413, { error: 'size' }, cors);
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return json(400, { error: 'body' }, cors);
  }
  const verdict = feedbackRecord(input);
  if (verdict.drop) return json(200, { ok: true }, cors);
  if (verdict.error) return json(400, { error: verdict.error }, cors);
  // Per-sender burst limit. The address is used for this check and never
  // written anywhere by this code.
  if (env.FEEDBACK_LIMITER) {
    const { success } = await env.FEEDBACK_LIMITER.limit({ key: headers['cf-connecting-ip'] || 'unknown' });
    if (!success) return json(429, { error: 'slow-down' }, cors);
  }
  if (!(await underDailyCap(env))) return json(429, { error: 'daily-cap' }, cors);
  const { type, tool, page, message } = verdict.record;
  await env.DB.prepare('INSERT INTO feedback (day, type, tool, page, message) VALUES (?1, ?2, ?3, ?4, ?5)')
    .bind(utcDay(), type, tool, page, message).run();
  return json(201, { ok: true }, cors);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = Object.fromEntries([...request.headers].map(([k, v]) => [k.toLowerCase(), v]));
    const origins = allowedOrigins(env);
    const cors = { 'access-control-allow-origin': origins.includes(headers.origin) ? headers.origin : origins[0] || '', vary: 'origin' };
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
        return json(200, { unit: 'page loads by browsers that did not opt out; not people (bot: and botpage: keys are crawler beacons, not page loads)', days: await readCounts(env, since) },
          { 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
      }
      if (request.method === 'GET' && url.pathname === '/feedback') {
        const after = Math.max(0, Number.parseInt(url.searchParams.get('after') || '0', 10) || 0);
        return json(200, { feedback: await readFeedback(env, after) },
          { 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
      }
      if (request.method === 'POST' && url.pathname === '/hit') {
        await countHit(request, env, headers, request.cf);
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
