#!/usr/bin/env node
// Turn your own Umami site (Umami Cloud or a self-hosted Umami) into a daily metrics CSV the watch and the CLI can
// read: page views and visitors per day, plus a column per custom event you name (a sign-up, a checkout), so a tracker
// dropped from some pages or a button that stops sending its event is heard. Read-only, zero dependencies, runs
// wherever your key is (your laptop, your GitHub Actions); nothing passes through us.
//
//   UMAMI_API_KEY=... node umami-metrics.mjs --website <website id> --event signup --out data/umami.csv
//   node watch.mjs data/umami.csv --state watch-state.json --columns pageviews:poisson,event_signup:poisson
//
// API set-up. Umami Cloud: Settings > API keys > Create key; the key goes in the x-umami-api-key header and calls go
// to https://api.umami.is/v1/websites/... (the cloud API has no /api in its paths). Self-hosted: set UMAMI_URL to the
// address you log in at; the key (an API key, umami_..., made in Settings > API keys on versions that have them, or a
// token from POST /api/auth/login on older ones) goes in an Authorization: Bearer header, calls to
// <UMAMI_URL>/api/websites/... The two calls, read from Umami's own route code (src/app/api/websites/[websiteId]/):
//   GET /api/websites/<id>/pageviews?startAt&endAt&unit=day&timezone   -> { pageviews: [{x, y}], sessions: [{x, y}] }
//   GET /api/websites/<id>/events/series?startAt&endAt&unit=day&timezone -> [{ x: event name, t: day, y: count }]
// x (or t) is the day as "YYYY-MM-DD" (PostgreSQL) or "YYYY-MM-DDT00:00:00Z" (ClickHouse); days with nothing are
// left out. Umami answers by the day only for a range of at most seven calendar months (a longer one is silently
// answered by the month: getAllowedUnits in src/lib/date.ts), so a long fetch is cut into windows of 180 days.
//
// Statistical analysis of data you supply, not advice. MIT licence.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { retrying } from './search-console-metrics.mjs';
import { fillDays, readExisting, toCsv } from './ga4-metrics.mjs';

const CLOUD = 'https://api.umami.is/v1';
const MAX_EVENTS = 8;
// Umami's day buckets need a range within seven calendar months; 180 days is always inside that.
export const WINDOW_DAYS = 180;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Where to call and how to send the key: Umami Cloud's API (x-umami-api-key) when UMAMI_URL is unset, else the
 * self-hosted Umami at UMAMI_URL (Authorization: Bearer). The key is sent there, so only https is taken, apart from a
 * loopback http address (tests, an Umami on the same machine). Pasting cloud.umami.is (the dashboard) means the cloud.
 */
export function endpoint(env = {}) {
  const v = String(env.UMAMI_URL ?? '').trim();
  if (!v) return { base: CLOUD, cloud: true };
  let u;
  try { u = new URL(v); } catch { throw new Error(`UMAMI_URL "${v}" is not a URL: give your Umami's address, e.g. https://umami.example.com`); }
  const loop = u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost');
  if (u.protocol !== 'https:' && !loop) throw new Error('UMAMI_URL must be an https:// address (the API key is sent to it).');
  if (u.username || u.password || u.search || u.hash) throw new Error('UMAMI_URL takes the address only, with no user, query or fragment.');
  if (/^(cloud|api)\.umami\.is$/i.test(u.hostname)) return { base: CLOUD, cloud: true };
  // A pasted address may end in /api or a dashboard path; the routes hang off the root the app is served from.
  const path = u.pathname.replace(/\/(api|websites|dashboard|settings)(\/.*)?$/i, '').replace(/\/+$/, '');
  return { base: `${u.origin}${path}/api`, cloud: false };
}

/** The website ID: a UUID, from the ID itself or a pasted dashboard address (.../websites/<id>/...). */
export function websiteId(s) {
  const m = UUID.exec(String(s ?? ''));
  if (!m) throw new Error(`--website "${s}" is not an Umami website ID: copy it from Settings > Websites > Edit (a UUID like 3f0e7c1a-...) or paste the website's dashboard address.`);
  return m[0].toLowerCase();
}

/** An event's column name: event_ and its name in lower case, letters and digits joined by underscores. */
export function eventColumn(name) {
  const slug = String(name).toLowerCase().normalize('NFKD').replace(/\p{M}+/gu, '').replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '');
  if (!slug) throw new Error(`--event "${name}" has no Latin letters or digits to name its column.`);
  return `event_${slug}`;
}

/** A time zone Intl knows (Europe/Berlin, UTC); Umami buckets days in it. */
export function timeZone(s) {
  const t = String(s ?? '').trim();
  try { new Intl.DateTimeFormat('en-US', { timeZone: t }); } catch { throw new Error(`--timezone "${s}" is not a time zone name (e.g. UTC, Europe/Berlin, America/New_York).`); }
  if (!t) throw new Error('--timezone takes a time zone name.');
  return t;
}

const addDays = (day, k) => new Date(Date.parse(`${day}T00:00:00Z`) + k * 86400000).toISOString().slice(0, 10);

// How far `tz` is ahead of UTC at instant `ms`, in milliseconds.
function offsetMs(ms, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
}

/** The instant (ms) a day begins in `tz`: midnight local time, found by correcting a UTC guess twice (DST-safe). */
export function dayStart(day, tz) {
  const guess = Date.parse(`${day}T00:00:00Z`);
  let t = guess - offsetMs(guess, tz);
  t = guess - offsetMs(t, tz);
  return t;
}

/** Today's date in `tz`. */
export function todayIn(ms, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

/** [from, to] cut into windows of at most WINDOW_DAYS days, oldest first. */
export function windows(from, to, size = WINDOW_DAYS) {
  const out = [];
  for (let a = from; a <= to; a = addDays(a, size)) {
    const b = addDays(a, size - 1);
    out.push([a, b < to ? b : to]);
  }
  return out;
}

// A row's day, or null when Umami answered by some other unit (an hour, a month) than the day asked for.
function dayOf(v) {
  const s = String(v ?? '');
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ]00:00(?::00(?:\.0+)?)?Z?)?$/.exec(s);
  return m ? m[1] : null;
}

async function get({ base, cloud, key, path, params, fetchImpl, sleep }) {
  // An API request to the deployer's own Umami, not a page URL: the parameters are the date range, never shared state.
  const q = new URLSearchParams(params);
  const url = `${base}${path}?` + q;
  const headers = cloud ? { 'x-umami-api-key': key, accept: 'application/json' } : { authorization: `Bearer ${key}`, accept: 'application/json' };
  const { r, body } = await retrying(fetchImpl, sleep, url, { method: 'GET', headers });
  if (!r.ok) {
    const e = body?.error;
    const msg = typeof e === 'string' ? `: ${e}` : typeof e?.message === 'string' ? `: ${e.message}` : '';
    const where = cloud ? 'Umami Cloud' : 'Umami';
    if (r.status === 401) throw new Error(`${where} refused the API key (401)${msg}. ${cloud ? 'Make one in Umami Cloud under Settings > API keys' : 'Make an API key in Settings > API keys (or, on an older Umami, a token from /api/auth/login)'} and put it in UMAMI_API_KEY; the key's user must be able to view the website.`);
    if (r.status === 403) throw new Error(`${where} answered 403${msg}: the key's user may not view this website's ${path.includes('/events/') ? 'events' : 'overview'}. Check --website and the user's role on it.`);
    if (r.status === 404) throw new Error(`${where} answered 404${msg}. Check --website${cloud ? '' : ' and UMAMI_URL (the address you log in at)'}.`);
    if (r.status === 400) throw new Error(`${where} refused the request (400)${msg}. Check --timezone and --website.`);
    throw new Error(`${where} answered ${r.status}${msg}.`);
  }
  return body;
}

/**
 * Page views, visitors and custom-event counts per day for [from, to] (the days of `tz`), one request pair per
 * window. Returns { rows: [{ date, values }], seen: Map(event name -> total) } where values hold pageviews,
 * visitors and event_<name> for each of `events`; `seen` counts every event name Umami answered, named or not.
 */
export async function fetchDays({ base, cloud, key, website, from, to, tz = 'UTC', events = [], fetchImpl = globalThis.fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const cols = new Map(events.map((e) => [e, eventColumn(e)]));
  const by = new Map();
  const put = (day, col, v) => { if (day < from || day > to) return; const r = by.get(day) ?? { date: day, values: {} }; r.values[col] = (r.values[col] ?? 0) + (Number.isFinite(v) ? v : 0); by.set(day, r); };
  const seen = new Map();
  const odd = (what, v) => new Error(`Umami answered ${what} by "${v}", not by the day: the range was too long for day buckets, or this Umami version answers differently. Try a smaller --days and say which Umami version this is.`);
  for (const [a, b] of windows(from, to)) {
    const params = { startAt: String(dayStart(a, tz)), endAt: String(dayStart(addDays(b, 1), tz) - 1), unit: 'day', timezone: tz };
    const common = { base, cloud, key, params, fetchImpl, sleep };
    const pv = await get({ ...common, path: `/websites/${website}/pageviews` });
    for (const [field, col] of [['pageviews', 'pageviews'], ['sessions', 'visitors']]) {
      for (const p of Array.isArray(pv?.[field]) ? pv[field] : []) {
        const d = dayOf(p?.x);
        if (!d) throw odd(field, p?.x);
        put(d, col, Number(p?.y));
      }
    }
    const ev = await get({ ...common, path: `/websites/${website}/events/series` });
    for (const p of Array.isArray(ev) ? ev : []) {
      const d = dayOf(p?.t);
      if (!d) throw odd('events', p?.t);
      const name = String(p?.x ?? '');
      const n = Number(p?.y);
      seen.set(name, (seen.get(name) ?? 0) + (Number.isFinite(n) ? n : 0));
      if (cols.has(name)) put(d, cols.get(name), n);
    }
  }
  return { rows: [...by.values()].sort((x, y) => (x.date < y.date ? -1 : 1)), seen };
}

const USAGE = `Make a daily metrics CSV from your own Umami site (Umami Cloud or self-hosted), for the watch (node watch.mjs)
or the CLI (node cli.mjs).

Usage:
  UMAMI_API_KEY=... node umami-metrics.mjs --website <id> --out <file.csv> [options]

Options:
  --website <id>        the website ID (Settings > Websites > Edit), or its dashboard address
  --out <file>          the CSV to write (date, pageviews, visitors, then one column per event); an existing one is
                        extended: its last --refetch days are fetched again, the rest kept
  --event <name>        also write the custom event's count per day as event_<name> (repeat for up to ${MAX_EVENTS}; the name
                        exactly as Umami lists it under Events, e.g. --event signup --event "Checkout started")
  --timezone <tz>       the time zone days are counted in (default: UTC; use the one your Umami dashboard shows)
  --days <n>            how many days to fetch when there is no CSV yet (default: 480)
  --refetch <n>         days at the end of an existing CSV to fetch again (default: 2)
  --lag <n>             leave out the last n days before today (default: 1, so yesterday, a whole day, is the last)
  -h, --help            this help

Environment: UMAMI_API_KEY (required); UMAMI_URL for a self-hosted Umami (https only; unset means Umami Cloud).

visitors is Umami's count of distinct sessions with a page view that day (its dashboard's Visitors for one day). A day
with no row is written as zeros: Umami counts live, so an empty day is a real one, which is the point when the tracker
falls off the site. Each run prints the custom events Umami saw, with their totals, so you can pick names for --event.`;

export async function main(argv, { env = process.env, out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s), fetchImpl = globalThis.fetch, now = () => Date.now(), sleep } = {}) {
  let outPath = null, website = null, days = 480, refetch = 2, lag = 1, tz = 'UTC';
  const events = [];
  const whole = (s, name, min) => { const v = Number(s); if (!Number.isInteger(v) || v < min) throw new Error(`${name} takes a whole number of ${min} or more.`); return v; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { out(USAGE + '\n'); return 0; }
    else if (a === '--out') outPath = argv[++i];
    else if (a === '--website') website = websiteId(argv[++i]);
    else if (a === '--event') { const e = String(argv[++i] ?? ''); if (!e.trim()) throw new Error('--event takes an event name.'); events.push(e); }
    else if (a === '--timezone') tz = timeZone(argv[++i]);
    else if (a === '--days') days = whole(argv[++i], '--days', 1);
    else if (a === '--refetch') refetch = whole(argv[++i], '--refetch', 0);
    else if (a === '--lag') lag = whole(argv[++i], '--lag', 0);
    else throw new Error(`Unknown option ${a} (see --help).`);
  }
  if (!outPath) throw new Error('Give --out <file.csv> (see --help).');
  if (!website) throw new Error('Give --website <id>, the website ID from Settings > Websites > Edit.');
  if (events.length > MAX_EVENTS) throw new Error(`--event: at most ${MAX_EVENTS} events.`);
  const eventCols = events.map(eventColumn);
  if (new Set(eventCols).size !== eventCols.length) throw new Error('--event names the same event twice (or two names that make one column).');
  const key = env.UMAMI_API_KEY;
  if (!key) throw new Error('Set UMAMI_API_KEY (Settings > API keys in Umami).');
  const { base, cloud } = endpoint(env);
  const columns = ['pageviews', 'visitors', ...eventCols];

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

  const { rows, seen } = await fetchDays({ base, cloud, key, website, from, to, tz, events, fetchImpl, sleep: sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))) });
  const fresh = fillDays(rows, columns, from, to);
  const all = [...kept, ...fresh];
  if (outPath.includes('/')) await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, toCsv(all, columns));
  out(`${outPath}: ${all.length} days to ${to} (${fresh.length} fetched, ${fresh.reduce((s, r) => s + r.values.pageviews, 0)} page views), website ${website}${cloud ? ' on Umami Cloud' : ''}.\n`);
  if (seen.size) {
    const list = [...seen].sort((x, y) => y[1] - x[1]).slice(0, 12).map(([n, c]) => `${JSON.stringify(n)} ${c}`).join(', ');
    out(`Custom events in the days fetched: ${list}${seen.size > 12 ? `, and ${seen.size - 12} more` : ''}.\n`);
  }
  const empty = fresh.filter((r) => columns.every((c) => r.values[c] === 0)).length;
  if (fresh.length >= 7 && empty === fresh.length) err(`Note: every day fetched is empty. Check --website (the ID of the site that has the tracker)${cloud ? ', and that a free Umami Cloud account keeps 6 months of history' : ''}.\n`);
  for (let k = 0; k < events.length; k++) {
    if (fresh.length >= 28 && fresh.every((r) => r.values[eventCols[k]] === 0)) err(`Note: event ${JSON.stringify(events[k])} has no rows in ${fresh.length} days; event names are case-sensitive (see the list above).\n`);
  }
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { process.stderr.write(`${e.message}\n`); process.exit(2); });
}
