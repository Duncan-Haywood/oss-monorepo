#!/usr/bin/env node
// Turn your own Matomo (self-hosted, or Matomo Cloud at <name>.matomo.cloud) into a daily metrics CSV the watch and
// the CLI can read: visits, unique visitors and page views per day, plus a column per goal (conversions) and per
// custom event action you name, so a tracking code dropped from some pages, a goal that stops converting or a button
// that stops sending its event is heard. Read-only, zero dependencies, runs wherever your token is (your laptop, your
// GitHub Actions); nothing passes through us.
//
//   MATOMO_URL=https://matomo.example.com MATOMO_TOKEN=... node matomo-metrics.mjs --site 1 --goal 2 --out data/matomo.csv
//   node watch.mjs data/matomo.csv --state watch-state.json --columns pageviews:poisson,goal_2:poisson
//
// API set-up: in Matomo, Administration (the cog) > Personal > Security > Auth tokens > Create new token. Matomo 5
// makes "only allow secure requests" tokens by default, which work only when sent in a POST body, so every call here
// is a POST to <MATOMO_URL>/index.php with module=API, the method, format=JSON and token_auth in the form body. The
// user the token belongs to needs view access to the site. The calls (Matomo's Reporting API, documented at
// developer.matomo.org/api-reference/reporting-api):
//   SitesManager.getSiteFromId idSite                     -> { name, timezone, ... }    (checks the token and the site)
//   VisitsSummary.get period=day date=A,B                 -> { "A": { nb_visits, nb_uniq_visitors, ... } | [], ... }
//   Actions.get period=day date=A,B                       -> { "A": { nb_pageviews, ... } | [], ... }
//   Goals.get idGoal=N period=day date=A,B                -> { "A": { nb_conversions, ... } | [], ... }
//   Events.getAction period=day date=A,B flat=1           -> { "A": [{ label, nb_events, ... }], ... }
// A day with no data is answered as an empty list. Days are the site's own days (its time zone in Matomo's website
// settings), so "today" is worked out in that zone. Errors come back as HTTP 200 with { result: "error", message }.
// Long fetches are cut into windows of 180 days so a server archiving reports on demand is not asked for years at once.
//
// Statistical analysis of data you supply, not advice. FSL-1.1-MIT licence.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { retrying } from './search-console-metrics.mjs';
import { fillDays, readExisting, toCsv } from './ga4-metrics.mjs';
import { windows } from './umami-metrics.mjs';

const MAX_GOALS = 8;
const MAX_EVENTS = 8;

/**
 * The API endpoint: <MATOMO_URL>/index.php. The token is sent there, so only https is taken, apart from a loopback
 * http address (tests, a Matomo on the same machine). A pasted dashboard address (.../index.php?module=CoreHome...)
 * is cut back to the folder Matomo is served from.
 */
export function endpoint(env = {}) {
  const v = String(env.MATOMO_URL ?? '').trim();
  if (!v) throw new Error('Set MATOMO_URL to the address you log in to Matomo at (e.g. https://matomo.example.com or https://yourname.matomo.cloud).');
  let u;
  try { u = new URL(v); } catch { throw new Error(`MATOMO_URL "${v}" is not a URL: give your Matomo's address, e.g. https://matomo.example.com`); }
  const loop = u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost');
  if (u.protocol !== 'https:' && !loop) throw new Error('MATOMO_URL must be an https:// address (the token is sent to it).');
  if (u.username || u.password) throw new Error('MATOMO_URL takes the address only, with no user or password in it.');
  const path = u.pathname.replace(/\/index\.php$/i, '').replace(/\/[^/]*\.php$/i, '').replace(/\/+$/, '');
  return `${u.origin}${path}/index.php`;
}

/** The site ID (idSite): a whole number, from the number itself or a pasted dashboard address (...idSite=3...). */
export function siteId(s) {
  const t = String(s ?? '').trim();
  const m = /^\d+$/.test(t) ? [null, t] : /[?&#]idSite=(\d+)/i.exec(t);
  if (!m || Number(m[1]) < 1) throw new Error(`--site "${s}" is not a Matomo site ID: use the number in Administration > Websites > Manage (the ID column), or paste the site's dashboard address.`);
  return String(Number(m[1]));
}

/** A goal ID: a whole number (Goals > Manage goals, the ID column). */
export function goalId(s) {
  const t = String(s ?? '').trim();
  if (!/^\d+$/.test(t) || Number(t) < 1) throw new Error(`--goal "${s}" is not a goal ID: use the number in Goals > Manage goals (the ID column).`);
  return String(Number(t));
}

/** An event action's column name: event_ and the action in lower case, letters and digits joined by underscores. */
export function eventColumn(name) {
  const slug = String(name).toLowerCase().normalize('NFKD').replace(/\p{M}+/gu, '').replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '');
  if (!slug) throw new Error(`--event "${name}" has no Latin letters or digits to name its column.`);
  return `event_${slug}`;
}

const addDays = (day, k) => new Date(Date.parse(`${day}T00:00:00Z`) + k * 86400000).toISOString().slice(0, 10);

/**
 * Today's date in a Matomo site time zone: an IANA name (Europe/Berlin), or one of Matomo's fixed offsets
 * ("UTC", "UTC+5.5", "UTC-3"). An unknown name falls back to UTC, which is off by at most a day.
 */
export function todayIn(ms, tz) {
  const t = String(tz ?? '').trim();
  const off = /^UTC([+-]\d+(?:\.\d+)?)?$/i.exec(t);
  if (off) return new Date(ms + Number(off[1] ?? 0) * 3600000).toISOString().slice(0, 10);
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: t, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

/** One Reporting API call, as a POST so a secure-only token works. Throws Matomo's own message on an error. */
export async function call({ url, token, method, params = {}, fetchImpl, sleep }) {
  const form = new URLSearchParams({ module: 'API', method, format: 'JSON', ...params, token_auth: token });
  const { r, body } = await retrying(fetchImpl, sleep, url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: form.toString() });
  const msg = body && typeof body === 'object' && !Array.isArray(body) && body.result === 'error' ? String(body.message ?? '') : '';
  if (msg || !r.ok) {
    let plain = msg, prevPlain;
    do { prevPlain = plain; plain = plain.replace(/<[^>]+>/g, ''); } while (plain !== prevPlain);
    const said = msg ? `: ${plain.trim()}` : '';
    if (/token_auth|authenticat|not logged in|access|permission/i.test(msg) || r.status === 401 || r.status === 403) {
      throw new Error(`Matomo refused ${method}${said}. Make a token under Administration > Personal > Security > Auth tokens, put it in MATOMO_TOKEN, and check its user can view --site.`);
    }
    if (r.status === 404) throw new Error(`Matomo answered 404 for ${url}. Check MATOMO_URL (the address you log in at).`);
    throw new Error(`Matomo answered ${r.status} to ${method}${said}.`);
  }
  if (body === null) throw new Error(`Matomo's answer to ${method} was not JSON. Check MATOMO_URL points at Matomo itself (the page you log in at).`);
  return body;
}

// A day-keyed answer ({ "YYYY-MM-DD": row | [] }) as [day, row] pairs; anything else means the period was not "day".
function days(body, method) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error(`Matomo answered ${method} without one entry per day; this Matomo version may answer differently (say which version it is).`);
  return Object.entries(body).map(([d, v]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`Matomo answered ${method} by "${d}", not by the day.`);
    return [d, v];
  });
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/**
 * Visits, unique visitors, page views, goal conversions and event-action counts per day for [from, to]. Returns
 * { rows: [{ date, values }], seenEvents: Map(action -> total), noVisitors: days with visits but no unique count }.
 */
export async function fetchDays({ url, token, site, from, to, goals = [], events = [], fetchImpl = globalThis.fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const cols = new Map(events.map((e) => [e, eventColumn(e)]));
  const by = new Map();
  const put = (day, col, v) => { if (day < from || day > to) return; const r = by.get(day) ?? { date: day, values: {} }; r.values[col] = (r.values[col] ?? 0) + num(v); by.set(day, r); };
  const seenEvents = new Map();
  let noVisitors = 0;
  for (const [a, b] of windows(from, to)) {
    const common = { url, token, fetchImpl, sleep };
    const params = { idSite: site, period: 'day', date: `${a},${b}` };
    for (const [d, v] of days(await call({ ...common, method: 'VisitsSummary.get', params }), 'VisitsSummary.get')) {
      if (Array.isArray(v)) continue;
      put(d, 'visits', v?.nb_visits);
      if (v && 'nb_uniq_visitors' in v) put(d, 'visitors', v.nb_uniq_visitors);
      else if (num(v?.nb_visits) > 0) noVisitors++;
    }
    for (const [d, v] of days(await call({ ...common, method: 'Actions.get', params }), 'Actions.get')) {
      if (!Array.isArray(v)) put(d, 'pageviews', v?.nb_pageviews);
    }
    for (const g of goals) {
      for (const [d, v] of days(await call({ ...common, method: 'Goals.get', params: { ...params, idGoal: g } }), 'Goals.get')) {
        if (!Array.isArray(v)) put(d, `goal_${g}`, v?.nb_conversions);
      }
    }
    if (events.length) {
      for (const [d, list] of days(await call({ ...common, method: 'Events.getAction', params: { ...params, flat: '1', filter_limit: '-1' } }), 'Events.getAction')) {
        for (const row of Array.isArray(list) ? list : []) {
          const name = String(row?.label ?? '');
          seenEvents.set(name, (seenEvents.get(name) ?? 0) + num(row?.nb_events));
          if (cols.has(name)) put(d, cols.get(name), row?.nb_events);
        }
      }
    }
  }
  return { rows: [...by.values()].sort((x, y) => (x.date < y.date ? -1 : 1)), seenEvents, noVisitors };
}

const USAGE = `Make a daily metrics CSV from your own Matomo (self-hosted or Matomo Cloud), for the watch (node watch.mjs)
or the CLI (node cli.mjs).

Usage:
  MATOMO_URL=https://... MATOMO_TOKEN=... node matomo-metrics.mjs --site <id> --out <file.csv> [options]

Options:
  --site <id>           the site ID (Administration > Websites > Manage), or the site's dashboard address
  --out <file>          the CSV to write (date, visits, visitors, pageviews, then one column per goal and event); an
                        existing one is extended: its last --refetch days are fetched again, the rest kept
  --goal <id>           also write the goal's conversions per day as goal_<id> (repeat for up to ${MAX_GOALS}; the ID from
                        Goals > Manage goals)
  --event <action>      also write the custom event action's count per day as event_<action> (repeat for up to ${MAX_EVENTS};
                        the action exactly as Matomo lists it under Behaviour > Events > Event Actions)
  --days <n>            how many days to fetch when there is no CSV yet (default: 480)
  --refetch <n>         days at the end of an existing CSV to fetch again (default: 2)
  --lag <n>             leave out the last n days before today in the site's time zone (default: 1)
  -h, --help            this help

Environment: MATOMO_URL (required, https only) and MATOMO_TOKEN (required; Administration > Personal > Security >
Auth tokens). The token is sent in a POST body, so tokens limited to secure requests work.

Matomo builds its daily reports by archiving. If browser-triggered archiving is off on your server and the archiving
cron has not run, the newest days read as empty; the default --lag 1 and --refetch 2 fetch them again on the next run.
A day with no visits is written as zeros, which is the point when the tracking code falls off the site. With --event,
each run prints the event actions Matomo saw, with their totals, so you can pick names.`;

export async function main(argv, { env = process.env, out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s), fetchImpl = globalThis.fetch, now = () => Date.now(), sleep } = {}) {
  let outPath = null, site = null, days = 480, refetch = 2, lag = 1;
  const goals = [], events = [];
  const whole = (s, name, min) => { const v = Number(s); if (!Number.isInteger(v) || v < min) throw new Error(`${name} takes a whole number of ${min} or more.`); return v; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { out(USAGE + '\n'); return 0; }
    else if (a === '--out') outPath = argv[++i];
    else if (a === '--site') site = siteId(argv[++i]);
    else if (a === '--goal') goals.push(goalId(argv[++i]));
    else if (a === '--event') { const e = String(argv[++i] ?? ''); if (!e.trim()) throw new Error('--event takes an event action.'); events.push(e); }
    else if (a === '--days') days = whole(argv[++i], '--days', 1);
    else if (a === '--refetch') refetch = whole(argv[++i], '--refetch', 0);
    else if (a === '--lag') lag = whole(argv[++i], '--lag', 0);
    else throw new Error(`Unknown option ${a} (see --help).`);
  }
  if (!outPath) throw new Error('Give --out <file.csv> (see --help).');
  if (!site) throw new Error('Give --site <id>, the site ID from Administration > Websites > Manage.');
  if (goals.length > MAX_GOALS) throw new Error(`--goal: at most ${MAX_GOALS} goals.`);
  if (new Set(goals).size !== goals.length) throw new Error('--goal names the same goal twice.');
  if (events.length > MAX_EVENTS) throw new Error(`--event: at most ${MAX_EVENTS} event actions.`);
  const eventCols = events.map(eventColumn);
  if (new Set(eventCols).size !== eventCols.length) throw new Error('--event names the same action twice (or two names that make one column).');
  const token = env.MATOMO_TOKEN;
  const url = endpoint(env);
  if (!token) throw new Error('Set MATOMO_TOKEN (Administration > Personal > Security > Auth tokens in Matomo).');
  const columns = ['visits', 'visitors', 'pageviews', ...goals.map((g) => `goal_${g}`), ...eventCols];
  const slp = sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));

  const info = await call({ url, token, method: 'SitesManager.getSiteFromId', params: { idSite: site }, fetchImpl, sleep: slp });
  const tz = info?.timezone ?? 'UTC';
  const to = addDays(todayIn(now(), tz), -lag);
  let kept = [];
  let from = addDays(to, 1 - days);
  if (existsSync(outPath)) {
    const prev = readExisting(await readFile(outPath, 'utf8'), columns);
    if (prev && prev.length) {
      kept = prev.filter((r) => r.date < addDays(prev[prev.length - 1].date, 1 - refetch));
      from = kept.length ? addDays(kept[kept.length - 1].date, 1) : prev[0].date;
    } else if (prev === null) err(`${outPath} has other columns than this run writes; fetching ${days} days afresh.\n`);
  }
  if (from > to) { err(`${outPath} is already up to date.\n`); return 0; }

  const { rows, seenEvents, noVisitors } = await fetchDays({ url, token, site, from, to, goals, events, fetchImpl, sleep: slp });
  const fresh = fillDays(rows, columns, from, to);
  const all = [...kept, ...fresh];
  if (outPath.includes('/')) await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, toCsv(all, columns));
  const name = typeof info?.name === 'string' && info.name ? ` (${info.name.replace(/[\r\n]+/g, ' ').slice(0, 80)})` : '';
  out(`${outPath}: ${all.length} days to ${to} (${fresh.length} fetched, ${fresh.reduce((s, r) => s + r.values.visits, 0)} visits), site ${site}${name}, days in ${tz}.\n`);
  if (events.length && seenEvents.size) {
    const list = [...seenEvents].sort((x, y) => y[1] - x[1]).slice(0, 12).map(([n, c]) => `${JSON.stringify(n)} ${c}`).join(', ');
    out(`Event actions in the days fetched: ${list}${seenEvents.size > 12 ? `, and ${seenEvents.size - 12} more` : ''}.\n`);
  }
  if (noVisitors) err(`Note: ${noVisitors} day(s) had visits but no unique-visitor count (Matomo can turn that off); their visitors column reads 0, so watch visits instead.\n`);
  const empty = fresh.filter((r) => columns.every((c) => r.values[c] === 0)).length;
  if (fresh.length >= 7 && empty === fresh.length) err('Note: every day fetched is empty. Check --site (the ID of the site that has the tracking code), and that Matomo\'s archiving has run for these days.\n');
  for (let k = 0; k < goals.length; k++) {
    if (fresh.length >= 28 && fresh.every((r) => r.values[`goal_${goals[k]}`] === 0)) err(`Note: goal ${goals[k]} has no conversions in ${fresh.length} days; check the ID under Goals > Manage goals.\n`);
  }
  for (let k = 0; k < events.length; k++) {
    if (fresh.length >= 28 && fresh.every((r) => r.values[eventCols[k]] === 0)) err(`Note: event action ${JSON.stringify(events[k])} has no rows in ${fresh.length} days; actions are case-sensitive (see the list above).\n`);
  }
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { process.stderr.write(`${e.message}\n`); process.exit(2); });
}
