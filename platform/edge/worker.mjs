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
//                   instead of the page total (`core.mjs` has the lists). A
//                   funnel event (`{p, e, i?, t?}`, see `platform/counter/FUNNEL.md`)
//                   adds one to its `fn:` key and nothing else.
//   GET  /counts    the daily aggregates, which `platform/counter/pull.mjs`
//                   copies into `portfolio/usage/site-visits.json`.
//   POST /feedback  the site's "Report a problem or suggest a feature" form,
//                   stored in D1. A visitor needs no GitHub account, and this
//                   Worker holds no GitHub credential at all.
//   GET  /feedback  the stored messages, which `pull-feedback.mjs` copies into
//                   `portfolio/usage/site-feedback.json` for agents to read.
//                   Public, like /counts: the same text is committed to a
//                   public repository anyway.
//   GET  /inbox     mail sent to support@ and hello@marisstella.app, for
//                   agents holding INBOX_TOKEN (`inbox.mjs`). Never public,
//                   never committed. Messages older than 90 days are
//                   deleted (`inbox.mjs`, "Retention").
//   DELETE /inbox?id=<n>  erase one message sooner, same token.
//   POST /early-access         a paid product's early-access form (`early-access.mjs`):
//                              stored privately in D1, one row per product and address.
//   GET  /early-access/counts  sign-ups per product, numbers only, public.
//   GET  /early-access         the rows, INBOX_TOKEN only; DELETE ?email= erases one person.
//   email()         Cloudflare Email Routing delivers that mail here.
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
import { receiveEmail, readInbox, deleteInboxMessage } from './inbox.mjs';
import { storeOf } from './store.mjs';
import { handleEarlyAccess, earlyAccessCounts, readEarlyAccess, deleteEarlyAccess } from './early-access.mjs';

const FEEDBACK_MAX_BODY = 6000;

const json = (status, obj, headers = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...headers } });

async function countHit(request, env, headers, cf) {
  const body = await request.text();
  const verdict = classify({ method: 'POST', url: '/hit', headers, body });
  if (!verdict.count && !verdict.bot) return;
  const day = utcDay();
  const cap = Number(env.MAX_PER_SLUG_PER_DAY || 20000);
  const store = storeOf(env);
  const add = (slug) => store.addCount(day, slug, cap);
  // A funnel event adds to its own key only: the page load it happened on was
  // already counted, with its country and device, by that load's own beacon.
  if (verdict.funnel) {
    await add(verdict.funnel);
    return;
  }
  if (verdict.bot) {
    const counted = await add(`${BOT_KEY}${verdict.bot}`);
    if (counted && verdict.slug) await add(`${BOT_PAGE_KEY}${verdict.slug}`);
    return;
  }
  if (!(await add(verdict.slug))) return;
  if (verdict.ref) await add(`${REF_KEY}${verdict.ref}`);
  if (verdict.src) await add(`${SOURCE_KEY}${verdict.src}`);
  const geo = countryCode(cf?.country);
  if (geo) await add(`${GEO_KEY}${geo}`);
  await add(`${DEVICE_KEY}${deviceClass(headers['user-agent'] || '')}`);
}

async function readCounts(env, since) {
  const days = {};
  for (const { day, slug, n } of await storeOf(env).readCounts(since)) (days[day] ||= {})[slug] = n;
  return days;
}

/** One more submission today, unless the site-wide daily cap is reached. */
async function underDailyCap(env) {
  const cap = Number(env.FEEDBACK_DAILY_CAP || 50);
  return storeOf(env).takeDaily('feedback', utcDay(), cap);
}

function readFeedback(env, after) {
  return storeOf(env).readFeedback(after);
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
  // written anywhere by this code (on AWS only a keyed hash of it is, for two
  // minutes: aws/lambda.mjs). `x-edge-client-ip` is set by the Lambda adapter
  // from CloudFront's viewer address, after dropping any client-sent copy.
  if (env.FEEDBACK_LIMITER) {
    const { success } = await env.FEEDBACK_LIMITER.limit({ key: headers['cf-connecting-ip'] || headers['x-edge-client-ip'] || 'unknown' });
    if (!success) return json(429, { error: 'slow-down' }, cors);
  }
  if (!(await underDailyCap(env))) return json(429, { error: 'daily-cap' }, cors);
  const { type, tool, page, message } = verdict.record;
  await storeOf(env).insertFeedback({ day: utcDay(), type, tool, page, message });
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
        return json(200, { unit: 'page loads by browsers that did not opt out; not people (bot: and botpage: keys are crawler beacons, not page loads; fn: keys are funnel events on pages already counted)', days: await readCounts(env, since) },
          { 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
      }
      if (request.method === 'GET' && url.pathname === '/feedback') {
        const after = Math.max(0, Number.parseInt(url.searchParams.get('after') || '0', 10) || 0);
        return json(200, { feedback: await readFeedback(env, after) },
          { 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
      }
      if (request.method === 'GET' && url.pathname === '/inbox') return await readInbox(request, env);
      if (request.method === 'DELETE' && url.pathname === '/inbox') return await deleteInboxMessage(request, env);
      if (request.method === 'POST' && url.pathname === '/hit') {
        await countHit(request, env, headers, request.cf);
        // 204 either way, as in the Node counter: a refusal tells a page nothing.
        return new Response(null, { status: 204, headers: cors });
      }
      if (request.method === 'POST' && url.pathname === '/feedback') return await handleFeedback(request, env, headers, cors);
      if (request.method === 'POST' && url.pathname === '/early-access') {
        return await handleEarlyAccess(request, env, { headers, origins, cors, utcDay: utcDay() });
      }
      if (request.method === 'GET' && url.pathname === '/early-access/counts') return await earlyAccessCounts(env);
      if (request.method === 'GET' && url.pathname === '/early-access') return await readEarlyAccess(request, env);
      if (request.method === 'DELETE' && url.pathname === '/early-access') return await deleteEarlyAccess(request, env);
      return new Response('not found\n', { status: 404, headers: cors });
    } catch {
      return json(500, { error: 'internal' }, cors);
    }
  },
  async email(message, env) {
    await receiveEmail(message, env);
  },
};
