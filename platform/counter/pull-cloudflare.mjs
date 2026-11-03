// Copies Cloudflare's own analytics for the site into the repository, so the
// next session reads them like any other committed file (owner, 2026-10-31:
// "now that we are on cloudflare let's take advantage of the tooling there.
// analytics etc. loop things back into the repo").
//
//   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... node platform/counter/pull-cloudflare.mjs
//
// Writes `portfolio/usage/cloudflare-analytics.json`. Why it exists next to
// the first-party beacon (`platform/edge/`): the beacon is sent by the page's
// script, so it sees browsers and the few crawlers that run JavaScript. Every
// request to https://marisstella.app/ passes Cloudflare's edge, so Cloudflare
// sees all of them: crawlers that only fetch HTML (GPTBot, ClaudeBot, CCBot),
// vulnerability scanners, feed readers, and people with scripts blocked.
//
// What is kept, per UTC day (all aggregate; `portfolio/usage/README.md`, rule 1):
//
//   zone      requests, cached, bytes, page views, threats, unique IPs (a
//             count only), and requests by country and by status, from
//             `httpRequests1dGroups`.
//   classes   requests by kind of client, from `httpRequestsAdaptiveGroups`
//             grouped by browser string and path. Each browser string is
//             reduced here to a class (`botClass` in core.mjs, plus `browser`,
//             `no-ua` and `probe`) and then dropped: no browser string, IP
//             or referrer is written.
//   pages     the most-requested pages per class, counting only paths the
//             site answered 200/304 for, so a scanner's invented URLs never
//             reach the repository.
//   workers   invocations and errors per Worker, from
//             `workersInvocationsAdaptive`: how close the shard router and
//             the edge Worker are to the free plan's 100,000 a day.
//
// The token needs Account Analytics: Read, Zone Analytics: Read and Zone: Read
// (to find the zone by name; set CLOUDFLARE_ZONE_ID to skip that). The deploy
// token may have none of them, so CLOUDFLARE_ANALYTICS_TOKEN is tried first.
// A dataset the token cannot read is recorded under `last_pull.errors` and the
// script exits 0, so the daily job stays green and the gap stays visible.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { botClass } from './core.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const OUT = path.resolve(HERE, '..', '..', 'portfolio', 'usage', 'cloudflare-analytics.json');
const API = 'https://api.cloudflare.com/client/v4';
const UNIT = 'Cloudflare edge requests to the site per UTC day: every request, crawlers and scripts included, so not page loads and not people. `classes` splits eyeball requests by kind of client (a browser string reduced to a class, then dropped); `pages` lists the most-requested 200/304 paths per class';
const SOURCE = 'Cloudflare GraphQL Analytics API (httpRequests1dGroups, httpRequestsAdaptiveGroups, workersInvocationsAdaptive) via platform/counter/pull-cloudflare.mjs';
const DAY = /^\d{4}-\d{2}-\d{2}$/;
// The API's largest page. A day that fills it is marked `truncated`, and its
// class totals are then a lower bound.
export const ADAPTIVE_LIMIT = 10000;
const TOP_PAGES = 25;
const int = (n) => (Number.isInteger(n) && n >= 0 ? n : 0);

// Paths no page on this site has, which scanners try on every host. A request
// for one is a `probe` whatever browser string it sends.
export const PROBE_RE = /(^|\/)(wp-|wordpress|xmlrpc\.php|\.env|\.git\/|phpmyadmin|cgi-bin|\.aws|\.ssh|config\.(php|json|ya?ml)|admin\.php|setup\.php|vendor\/phpunit|actuator|\.DS_Store|server-status|boaform|HNAP1)|\.(php|asp|aspx|jsp|cgi)$/i;

/** The kind of client behind one request: a crawler class from core.mjs, `probe`, `no-ua` or `browser`. */
export function clientClass(userAgent, requestPath = '') {
  if (PROBE_RE.test(String(requestPath))) return 'probe';
  const ua = String(userAgent || '').trim();
  if (!ua) return 'no-ua';
  return botClass(ua) || 'browser';
}

/** A path worth listing as a page: answered 200/304, and an HTML route rather than an asset. */
export function isPagePath(p, status) {
  if (status !== 200 && status !== 304) return false;
  p = String(p || '');
  if (!/^\/[A-Za-z0-9._~%/-]{0,199}$/.test(p)) return false;
  return p.endsWith('/') || p.endsWith('.html') || /\.(txt|xml|json)$/.test(p) || !/\.[a-z0-9]{1,5}$/i.test(p);
}

/** `httpRequests1dGroups` rows into `{day: {requests, ..., countries, statuses}}`. */
export function zoneDays(rows = []) {
  const out = {};
  for (const r of rows) {
    const day = r?.dimensions?.date;
    if (!DAY.test(String(day))) continue;
    const s = r.sum || {};
    const countries = {};
    for (const c of s.countryMap || []) if (/^[A-Z0-9]{2}$/.test(c.clientCountryName)) countries[c.clientCountryName] = int(c.requests);
    const statuses = {};
    for (const c of s.responseStatusMap || []) if (Number.isInteger(c.edgeResponseStatus)) statuses[c.edgeResponseStatus] = int(c.requests);
    out[day] = {
      requests: int(s.requests), cached: int(s.cachedRequests), bytes: int(s.bytes),
      page_views: int(s.pageViews), threats: int(s.threats), unique_ips: int(r.uniq?.uniques),
      countries, statuses,
    };
  }
  return out;
}

/** One day's `httpRequestsAdaptiveGroups` rows (by userAgent, path, status) into class totals and top pages. */
export function classifyDay(rows = []) {
  const classes = {};
  const pages = {};
  for (const r of rows) {
    const n = int(r?.count);
    const d = r?.dimensions || {};
    const cls = clientClass(d.userAgent, d.clientRequestPath);
    classes[cls] = (classes[cls] || 0) + n;
    if (cls === 'probe' || !isPagePath(d.clientRequestPath, d.edgeResponseStatus)) continue;
    const p = (pages[cls] ||= {});
    p[d.clientRequestPath] = (p[d.clientRequestPath] || 0) + n;
  }
  const top = {};
  for (const [cls, p] of Object.entries(pages)) {
    top[cls] = Object.fromEntries(Object.entries(p).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, TOP_PAGES));
  }
  return { classes: sortKeys(classes), pages: sortKeys(top), truncated: rows.length >= ADAPTIVE_LIMIT };
}

/** `workersInvocationsAdaptive` rows into `{day: {script: {requests, errors}}}`. */
export function workerDays(rows = []) {
  const out = {};
  for (const r of rows) {
    const { date, scriptName } = r?.dimensions || {};
    if (!DAY.test(String(date)) || !scriptName) continue;
    const d = (out[date] ||= {});
    const w = (d[scriptName] ||= { requests: 0, errors: 0 });
    w.requests += int(r.sum?.requests);
    w.errors += int(r.sum?.errors);
  }
  return out;
}

function sortKeys(o) {
  return Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
}

const total = (d) => int(d?.requests) || Object.values(d?.classes || {}).reduce((a, b) => a + b, 0)
  || Object.values(d || {}).reduce((a, w) => a + int(w?.requests), 0);

/**
 * Merges pulled days into the file's. Each section of a day is replaced only
 * by a pull that counts at least as many requests, so a partial re-pull (the
 * current day, or a window Cloudflare has started to expire) never shrinks it.
 */
export function mergeDays(existing = {}, incoming = {}) {
  const out = structuredClone(existing);
  for (const [day, sections] of Object.entries(incoming)) {
    if (!DAY.test(day)) continue;
    const d = (out[day] ||= {});
    for (const [name, value] of Object.entries(sections || {})) {
      if (!d[name] || total(value) >= total(d[name])) d[name] = value;
    }
  }
  return sortKeys(out);
}

/** One line per day: edge requests, and how many came from ordinary browsers. */
export function summarise(days) {
  return Object.entries(days).map(([day, d]) => {
    const c = d.traffic?.classes || {};
    const all = Object.values(c).reduce((a, b) => a + b, 0);
    const bots = Object.entries(c).filter(([k]) => k !== 'browser').sort((a, b) => b[1] - a[1]).slice(0, 4)
      .map(([k, v]) => `${k} ${v}`).join(', ');
    const zone = d.zone ? `${d.zone.requests} requests, ${d.zone.page_views} page views` : 'no zone totals';
    const split = all ? `; browser ${c.browser || 0} of ${all} eyeball requests (${bots || 'no others'})` : '';
    return `${day}: ${zone}${split}`;
  });
}

export function addDays(day, n) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Days to pull: from two days before the last complete day on file (or `backfill` days back) to yesterday. */
export function window(days, today, backfill = 14) {
  const until = addDays(today, -1);
  const have = Object.keys(days).filter((k) => days[k].zone).sort();
  let since = have.length ? addDays(have[have.length - 1], -2) : addDays(today, -backfill);
  if (since < addDays(today, -30)) since = addDays(today, -30);
  return { since, until };
}

const ZONE_Q = `query($zone: String!, $since: Date!, $until: Date!) { viewer { zones(filter: {zoneTag: $zone}) {
  httpRequests1dGroups(limit: 40, filter: {date_geq: $since, date_leq: $until}, orderBy: [date_ASC]) {
    dimensions { date }
    sum { requests cachedRequests bytes pageViews threats
      countryMap { clientCountryName requests } responseStatusMap { edgeResponseStatus requests } }
    uniq { uniques } } } } }`;
const ADAPTIVE_Q = `query($zone: String!, $from: Time!, $to: Time!) { viewer { zones(filter: {zoneTag: $zone}) {
  httpRequestsAdaptiveGroups(limit: ${ADAPTIVE_LIMIT}, filter: {datetime_geq: $from, datetime_lt: $to, requestSource: "eyeball"}, orderBy: [count_DESC]) {
    count dimensions { userAgent clientRequestPath edgeResponseStatus } } } } }`;
const WORKERS_Q = `query($account: String!, $since: Date!, $until: Date!) { viewer { accounts(filter: {accountTag: $account}) {
  workersInvocationsAdaptive(limit: 1000, filter: {date_geq: $since, date_leq: $until}) {
    dimensions { date scriptName } sum { requests errors } } } } }`;

async function graphql(token, query, variables) {
  const res = await fetch(`${API}/graphql`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.errors?.length) {
    throw new Error(`GraphQL answered ${res.status}: ${(body.errors || []).map((e) => e.message).join('; ') || res.statusText}`);
  }
  return body.data;
}

async function zoneId(token, name) {
  const res = await fetch(`${API}/zones?name=${encodeURIComponent(name)}`, { headers: { authorization: `Bearer ${token}` } });
  const body = await res.json().catch(() => ({}));
  const id = body.result?.[0]?.id;
  if (!id) throw new Error(`zone lookup for ${name} answered ${res.status} with no zone (the token needs Zone: Read, or set CLOUDFLARE_ZONE_ID)`);
  return id;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const env = process.env;
  const token = env.CLOUDFLARE_ANALYTICS_TOKEN || env.CLOUDFLARE_API_TOKEN;
  const account = env.CLOUDFLARE_ACCOUNT_ID;
  const zoneName = env.CLOUDFLARE_ZONE_NAME || 'marisstella.app';
  if (!token) {
    console.log('No CLOUDFLARE_ANALYTICS_TOKEN or CLOUDFLARE_API_TOKEN; nothing to pull.');
    process.exit(0);
  }
  let doc = {};
  try {
    doc = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  } catch { /* first pull */ }
  const days = doc.days || {};
  const today = new Date().toISOString().slice(0, 10);
  const { since, until } = window(days, today, Number(env.CF_BACKFILL_DAYS) || 14);
  const pulled = {};
  const errors = [];
  const put = (day, name, value) => { (pulled[day] ||= {})[name] = value; };

  let zone = env.CLOUDFLARE_ZONE_ID || '';
  if (!zone) {
    try { zone = await zoneId(token, zoneName); } catch (e) { errors.push(`zone: ${e.message}`); }
  }
  if (zone) {
    try {
      const data = await graphql(token, ZONE_Q, { zone, since, until });
      for (const [day, v] of Object.entries(zoneDays(data.viewer.zones[0]?.httpRequests1dGroups))) put(day, 'zone', v);
    } catch (e) { errors.push(`httpRequests1dGroups: ${e.message}`); }
    for (let day = since; day <= until; day = addDays(day, 1)) {
      try {
        const data = await graphql(token, ADAPTIVE_Q, { zone, from: `${day}T00:00:00Z`, to: `${addDays(day, 1)}T00:00:00Z` });
        const rows = data.viewer.zones[0]?.httpRequestsAdaptiveGroups || [];
        if (rows.length) put(day, 'traffic', classifyDay(rows));
      } catch (e) {
        errors.push(`httpRequestsAdaptiveGroups ${day}: ${e.message}`);
        break; // the same permission or plan error would repeat for every day
      }
    }
  }
  if (account) {
    try {
      const data = await graphql(token, WORKERS_Q, { account, since, until });
      for (const [day, v] of Object.entries(workerDays(data.viewer.accounts[0]?.workersInvocationsAdaptive))) put(day, 'workers', v);
    } catch (e) { errors.push(`workersInvocationsAdaptive: ${e.message}`); }
  } else {
    errors.push('workersInvocationsAdaptive: CLOUDFLARE_ACCOUNT_ID is not set');
  }

  const merged = mergeDays(days, pulled);
  const out = {
    unit: UNIT,
    source: SOURCE,
    zone: zoneName,
    last_pull: { on: today, window: [since, until], days_pulled: Object.keys(pulled).length, errors },
    days: merged,
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
  for (const line of summarise(merged).slice(-7)) console.log(line);
  for (const e of errors) console.log(`::warning::${e}`);
  console.log(`Wrote ${path.relative(process.cwd(), OUT)}: ${Object.keys(pulled).length} day(s) pulled, ${errors.length} dataset error(s).`);
}
