#!/usr/bin/env node
// Turn your own PostHog project into a daily metrics CSV the watch and the CLI can read: a count per day for each
// event you name (page views, sign-ups, a checkout step), plus the people who did any of them, so an event that stops
// being sent after a deploy, or a funnel step that quietly halves, is heard. Read-only, zero dependencies, runs
// wherever your key is (your laptop, your GitHub Actions); nothing passes through us. Works with PostHog Cloud (US or
// EU) and a self-hosted PostHog (POSTHOG_HOST).
//
//   POSTHOG_API_KEY=phx_... node posthog-metrics.mjs --project 12345 --event '$pageview' --event signed_up --out data/posthog.csv
//   node watch.mjs data/posthog.csv --state watch-state.json --columns event_pageview:poisson,event_signed_up:poisson
//
// API set-up: in PostHog, Settings > Personal API keys > Create, scope "Query: Read" for the project. Call: the query
// API, POST /api/projects/<id>/query/ with { query: { kind: "HogQLQuery", query: "SELECT ..." } }, answering
// { results: [[...], ...], columns: [...], hasMore } (posthog.com/docs/api/queries). One query per page:
//   SELECT toDate(timestamp) AS day, event, count(), count(DISTINCT person_id) ... GROUP BY day, event
// and one for the people across all the named events. HogQL reads timestamps in the project's time zone, so a day is
// the project's day.
//
// Statistical analysis of data you supply, not advice. MIT licence.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { retrying } from './search-console-metrics.mjs';
import { fillDays, readExisting, toCsv } from './ga4-metrics.mjs';

const CLOUD = 'https://us.posthog.com';
const REGIONS = { us: 'https://us.posthog.com', eu: 'https://eu.posthog.com' };
export const DEFAULT_EVENTS = ['$pageview'];
const MAX_EVENTS = 8;
const PAGE = 10000;

/**
 * The API's base: PostHog US Cloud, "us"/"eu" for either cloud, or POSTHOG_HOST's address for a self-hosted PostHog.
 * The key is sent there, so only https is taken, apart from a loopback http address (tests, a PostHog on this machine).
 * The ingestion address (us.i.posthog.com) does not answer the query API, so it is mapped to the app's.
 */
export function baseUrl(env = {}) {
  const v = String(env.POSTHOG_HOST ?? '').trim();
  if (!v) return CLOUD;
  if (REGIONS[v.toLowerCase()]) return REGIONS[v.toLowerCase()];
  let u;
  try { u = new URL(v); } catch { throw new Error(`POSTHOG_HOST "${v}" is not a URL: give us, eu, or your PostHog's address, e.g. https://posthog.example.com`); }
  const loop = u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost');
  if (u.protocol !== 'https:' && !loop) throw new Error('POSTHOG_HOST must be an https:// address (the API key is sent to it).');
  if (u.username || u.password || u.search || u.hash) throw new Error('POSTHOG_HOST takes the address only, with no user, query or fragment.');
  const ingest = /^(us|eu)\.i\.posthog\.com$/.exec(u.hostname);
  if (ingest) return REGIONS[ingest[1]];
  if (u.hostname === 'app.posthog.com') return REGIONS.us;
  return `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
}

/** --project: the numeric project ID (Settings > Project > Project ID, or the number in the app's address). */
export function projectId(s) {
  const t = String(s ?? '').trim();
  const fromUrl = /\/project\/(\d+)/.exec(t);
  const id = fromUrl ? fromUrl[1] : t;
  if (!/^\d{1,12}$/.test(id)) throw new Error(`--project "${s}" is not a PostHog project ID: give the number in Settings > Project (or in the app's address, /project/<id>).`);
  return id;
}

/** An event's column name: event_ and its name without a leading $, in lower case, letters and digits joined by _. */
export function eventColumn(name) {
  const slug = String(name).replace(/^\$/, '').toLowerCase().normalize('NFKD').replace(/\p{M}+/gu, '').replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '');
  if (!slug) throw new Error(`--event "${name}" has no Latin letters or digits to name its column; give an event with a Latin name.`);
  return `event_${slug}`;
}

/** A HogQL string literal: ClickHouse rules, backslash and single quote escaped. Control characters are refused. */
export function hogqlString(s) {
  const t = String(s);
  if (/[\u0000-\u001f\u007f]/.test(t)) throw new Error(`--event "${t.replace(/[\u0000-\u001f\u007f]/g, '?')}" has a control character.`);
  return `'${t.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

const addDays = (day, k) => new Date(Date.parse(`${day}T00:00:00Z`) + k * 86400000).toISOString().slice(0, 10);

/**
 * The HogQL for one page. The coarse timestamp bound (a day either side) lets PostHog skip old partitions whatever the
 * project's time zone; the toDate bound is the exact one, in the project's days.
 */
export function buildQuery({ events, from, to, byEvent, offset = 0 }) {
  const list = events.map(hogqlString).join(', ');
  const where = `event IN (${list}) AND timestamp >= toDateTime('${addDays(from, -1)} 00:00:00') AND timestamp < toDateTime('${addDays(to, 2)} 00:00:00') AND toDate(timestamp) >= toDate('${from}') AND toDate(timestamp) <= toDate('${to}')`;
  return byEvent
    ? `SELECT toDate(timestamp) AS day, event, count() AS n FROM events WHERE ${where} GROUP BY day, event ORDER BY day, event LIMIT ${PAGE} OFFSET ${offset}`
    : `SELECT toDate(timestamp) AS day, count(DISTINCT person_id) AS n FROM events WHERE ${where} GROUP BY day ORDER BY day LIMIT ${PAGE} OFFSET ${offset}`;
}

function refusal(status, ans) {
  const detail = typeof ans?.detail === 'string' ? `: ${ans.detail}` : '';
  if (status === 401) return `PostHog refused the API key (401)${detail}. Make a personal API key (Settings > Personal API keys) and put it in POSTHOG_API_KEY; a project key (phc_...) cannot query.`;
  if (status === 403) return `PostHog answered 403${detail}. Give the personal API key the "Query: Read" scope and access to this project.`;
  if (status === 404) return `PostHog answered 404${detail}. Check --project (the number in Settings > Project) and POSTHOG_HOST (us, eu, or your instance's address).`;
  if (status === 400) return `PostHog refused the query (400)${detail}. Check the --event names.`;
  return `PostHog answered ${status}${detail}.`;
}

/** Every row of one query, paged with LIMIT/OFFSET until hasMore is false or a page comes back short. */
async function rowsOf({ base, key, project, fetchImpl, sleep, make }) {
  const url = `${base}/api/projects/${project}/query/`;
  const out = [];
  for (let offset = 0; ; ) {
    const body = { query: { kind: 'HogQLQuery', query: make(offset) }, name: 'changepoint-watch daily counts' };
    const { r, body: ans } = await retrying(fetchImpl, sleep, url, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(refusal(r.status, ans));
    if (typeof ans?.error === 'string' && ans.error) throw new Error(`PostHog refused the query: ${ans.error}`);
    const page = Array.isArray(ans?.results) ? ans.results : [];
    out.push(...page);
    offset += page.length;
    if (!page.length || ans?.hasMore === false || (ans?.hasMore == null && page.length < PAGE)) break;
  }
  return out;
}

/**
 * Daily rows for [from, to]: { date, values: { event_<slug>: count, ..., users } }. `users` is the people (person_id)
 * who did any of the named events that day.
 */
export async function query({ base, key, project, events, from, to, fetchImpl = globalThis.fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const cols = events.map(eventColumn);
  const colOf = new Map(events.map((e, i) => [e, cols[i]]));
  const by = new Map();
  const at = (d) => { if (!by.has(d)) by.set(d, { date: d, values: {} }); return by.get(d).values; };
  const day = (x) => { const d = String(x ?? '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null; };
  const common = { base, key, project, fetchImpl, sleep };
  for (const [d0, ev, n] of await rowsOf({ ...common, make: (offset) => buildQuery({ events, from, to, byEvent: true, offset }) })) {
    const d = day(d0), c = colOf.get(ev);
    if (d && c) at(d)[c] = (at(d)[c] ?? 0) + (Number(n) || 0);
  }
  for (const [d0, n] of await rowsOf({ ...common, make: (offset) => buildQuery({ events, from, to, byEvent: false, offset }) })) {
    const d = day(d0);
    if (d) at(d).users = Number(n) || 0;
  }
  return [...by.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

const USAGE = `Make a daily metrics CSV from your own PostHog project, for the watch (node watch.mjs) or the CLI (node cli.mjs).

Usage:
  POSTHOG_API_KEY=phx_... node posthog-metrics.mjs --project <id> --out <file.csv> [options]

Options:
  --project <id>        the project ID (Settings > Project, or the number after /project/ in the app's address)
  --out <file>          the CSV to write (date, event_<name> per event, users); an existing one is extended: its last
                        --refetch days are fetched again, the rest kept
  --event <name>        an event to count per day, exactly as PostHog shows it (repeat for up to ${MAX_EVENTS}; default
                        ${DEFAULT_EVENTS.join(' ')}). E.g. --event '$pageview' --event signed_up --event "Checkout Started"
  --days <n>            how many days to fetch when there is no CSV yet (default: 480)
  --refetch <n>         days at the end of an existing CSV to fetch again (default: 3; late events from apps that were
                        offline land on the day they happened)
  --lag <n>             leave out the last n days before today (default: 1, so yesterday, a whole day, is the last)
  -h, --help            this help

Environment: POSTHOG_API_KEY (required: a personal API key with the "Query: Read" scope); POSTHOG_HOST: us (default),
eu, or a self-hosted PostHog's https address.

Columns: event_<name> (the name without a leading $, so $pageview is event_pageview) counts the event per day; users
counts the people who did any of the named events. Days are the project's own (its time zone in PostHog). A day with
no row is written as zeros: PostHog ingests live, so an empty day is a real one, which is the point when a tracking
call is dropped in a release.`;

export async function main(argv, { env = process.env, out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s), fetchImpl = globalThis.fetch, now = () => Date.now(), sleep } = {}) {
  let outPath = null, project = null, days = 480, refetch = 3, lag = 1;
  const events = [];
  const whole = (s, name, min) => { const v = Number(s); if (!Number.isInteger(v) || v < min) throw new Error(`${name} takes a whole number of ${min} or more.`); return v; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { out(USAGE + '\n'); return 0; }
    else if (a === '--out') outPath = argv[++i];
    else if (a === '--project') project = projectId(argv[++i]);
    else if (a === '--event') { const e = String(argv[++i] ?? '').trim(); if (!e) throw new Error('--event takes an event name.'); hogqlString(e); events.push(e); }
    else if (a === '--days') days = whole(argv[++i], '--days', 1);
    else if (a === '--refetch') refetch = whole(argv[++i], '--refetch', 0);
    else if (a === '--lag') lag = whole(argv[++i], '--lag', 0);
    else throw new Error(`Unknown option ${a} (see --help).`);
  }
  if (!outPath) throw new Error('Give --out <file.csv> (see --help).');
  if (!project) throw new Error('Give --project <id>, the number in Settings > Project.');
  if (!events.length) events.push(...DEFAULT_EVENTS);
  if (events.length > MAX_EVENTS) throw new Error(`--event: at most ${MAX_EVENTS} events.`);
  const evCols = events.map(eventColumn);
  if (new Set(evCols).size !== evCols.length) throw new Error('--event names the same event twice (or two names that make the same column).');
  const key = env.POSTHOG_API_KEY;
  if (!key) throw new Error('Set POSTHOG_API_KEY (Settings > Personal API keys > Create, scope "Query: Read").');
  if (/^phc_/.test(key)) throw new Error('POSTHOG_API_KEY is a project key (phc_...), which only sends events. Make a personal API key (phx_...) with the "Query: Read" scope.');
  const base = baseUrl(env);
  const columns = [...evCols, 'users'];

  const todayUtc = new Date(now()).toISOString().slice(0, 10);
  const to = addDays(todayUtc, -lag);
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

  const rows = await query({ base, key, project, events, from, to, fetchImpl, sleep: sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))) });
  const fresh = fillDays(rows, columns, from, to);
  const all = [...kept, ...fresh];
  if (outPath.includes('/')) await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, toCsv(all, columns));
  out(`${outPath}: ${all.length} days to ${to} (${fresh.length} fetched, ${fresh.reduce((s, r) => s + r.values[evCols[0]], 0)} ${events[0]}), project ${project}.\n`);
  if (fresh.length >= 7 && fresh.every((r) => columns.every((c) => r.values[c] === 0))) err(`Note: every day fetched is empty. Check --project and that the --event names match PostHog's exactly (they are case-sensitive).\n`);
  else for (let e = 0; e < events.length; e++) {
    if (fresh.length >= 28 && fresh.every((r) => r.values[evCols[e]] === 0)) err(`Note: event "${events[e]}" has no rows in ${fresh.length} days; check its exact name in PostHog's Activity tab.\n`);
  }
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { process.stderr.write(`${e.message}\n`); process.exit(2); });
}
