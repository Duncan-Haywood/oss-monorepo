#!/usr/bin/env node
// Turn your own Mixpanel project into a daily metrics CSV the watch and the CLI can read: a count per day for each
// event you name (page views, sign-ups, a checkout step), plus the daily unique users of the first one, so an event that
// stops being sent after a release, or a funnel step that quietly halves, is heard. Read-only, zero dependencies, runs
// wherever your credentials are (your laptop, your GitHub Actions); nothing passes through us. Works with Mixpanel's
// US, EU and India data residency (MIXPANEL_HOST).
//
//   MIXPANEL_SERVICE_ACCOUNT='name.abc123.mp-service-account:SECRET' node mixpanel-metrics.mjs --project 1234567 --event 'Sign Up' --out data/mixpanel.csv
//   node watch.mjs data/mixpanel.csv --state watch-state.json --columns event_sign_up:poisson,users:poisson
//
// API set-up: in Mixpanel, Organization Settings > Service Accounts > Add, role Consumer (read-only) on the project;
// keep the username and the secret it shows once. Call: the Query API's aggregated event counts,
//   GET /api/query/events?project_id=<id>&event=["a","b"]&type=general&unit=day&from_date=...&to_date=...
// with HTTP Basic auth (username:secret), answering
//   { data: { series: ["2026-01-01", ...], values: { "a": { "2026-01-01": 12, ... }, ... } }, legend_size }
// (Mixpanel's Query API reference, "Aggregated Event Counts"). type=unique gives each event's daily unique users.
// Mixpanel counts days in the project's time zone, so a day is the project's day.
//
// Statistical analysis of data you supply, not advice. MIT licence.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { retrying } from './search-console-metrics.mjs';
import { fillDays, readExisting, toCsv } from './ga4-metrics.mjs';
import { eventColumn } from './posthog-metrics.mjs';

const REGIONS = { us: 'https://mixpanel.com', eu: 'https://eu.mixpanel.com', in: 'https://in.mixpanel.com' };
export const DEFAULT_EVENTS = ['$mp_web_page_view'];
const MAX_EVENTS = 8;

export { eventColumn };

/**
 * The Query API's base: US residency by default, "eu"/"in" for the other two, or an https address (a proxy you run in
 * front of Mixpanel). Mixpanel's own hosts are mapped to the query host of their residency (data-eu and api-eu answer
 * ingestion, not queries). The credentials are sent there, so only https is taken, apart from a loopback http address
 * (tests).
 */
export function baseUrl(env = {}) {
  const v = String(env.MIXPANEL_HOST ?? '').trim();
  if (!v) return REGIONS.us;
  if (REGIONS[v.toLowerCase()]) return REGIONS[v.toLowerCase()];
  let u;
  try { u = new URL(v); } catch { throw new Error(`MIXPANEL_HOST "${v}" is not a URL: give us, eu or in (your project's data residency).`); }
  const loop = u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost');
  if (u.protocol !== 'https:' && !loop) throw new Error('MIXPANEL_HOST must be us, eu, in or an https:// address (the credentials are sent to it).');
  if (u.username || u.password || u.search || u.hash) throw new Error('MIXPANEL_HOST takes the address only, with no user, query or fragment.');
  const own = /^(?:(?:api|data)(?:-(eu|in))?\.|(eu|in)\.)?mixpanel\.com$/.exec(u.hostname);
  if (own) return REGIONS[own[1] ?? own[2] ?? 'us'];
  return `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
}

/** --project: the numeric project ID (Project Settings > Overview, or the number after /project/ in the app's address). */
export function projectId(s) {
  const t = String(s ?? '').trim();
  const fromUrl = /\/project\/(\d+)/.exec(t);
  const id = fromUrl ? fromUrl[1] : t;
  if (!/^\d{1,12}$/.test(id)) throw new Error(`--project "${s}" is not a Mixpanel project ID: give the number in Project Settings > Overview (or in the app's address, /project/<id>).`);
  return id;
}

/**
 * The Authorization header. MIXPANEL_SERVICE_ACCOUNT is "username:secret" (a service account, the documented way); a
 * value with no colon is taken as the project's legacy API secret (Basic with the secret as the user, no password).
 */
export function authHeader(raw) {
  const v = String(raw ?? '').trim();
  if (!v) throw new Error('Set MIXPANEL_SERVICE_ACCOUNT to "username:secret" of a service account (Organization Settings > Service Accounts, role Consumer on the project).');
  if (/[\u0000-\u001f\u007f]/.test(v)) throw new Error('MIXPANEL_SERVICE_ACCOUNT has a line break or control character; paste username:secret on one line.');
  const i = v.indexOf(':');
  const pair = i < 0 ? `${v}:` : v;
  if (i === 0 || i === v.length - 1) throw new Error('MIXPANEL_SERVICE_ACCOUNT is "username:secret"; one side is empty.');
  return `Basic ${Buffer.from(pair, 'utf8').toString('base64')}`;
}

/** An event name as Mixpanel takes it: any text, but no control characters (they cannot be an event's name). */
export function eventName(s) {
  const t = String(s ?? '').trim();
  if (!t) throw new Error('--event takes an event name.');
  if (/[\u0000-\u001f\u007f]/.test(t)) throw new Error(`--event "${t.replace(/[\u0000-\u001f\u007f]/g, '?')}" has a control character.`);
  if (t.length > 255) throw new Error('--event: an event name is at most 255 characters.');
  return t;
}

const addDays = (day, k) => new Date(Date.parse(`${day}T00:00:00Z`) + k * 86400000).toISOString().slice(0, 10);

/** The URL of one aggregated-counts query: the event list goes as a JSON array, URL-encoded, so a name cannot escape it. */
export function buildUrl({ base, project, events, from, to, type }) {
  const q = new URLSearchParams({ project_id: project, event: JSON.stringify(events), type, unit: 'day', from_date: from, to_date: to });
  return `${base}/api/query/events?${q}`;
}

function refusal(status, ans) {
  const said = typeof ans?.error === 'string' ? ans.error : typeof ans?.detail === 'string' ? ans.detail : '';
  const detail = said ? `: ${said}` : '';
  if (status === 401) return `Mixpanel refused the credentials (401)${detail}. Put a service account's "username:secret" in MIXPANEL_SERVICE_ACCOUNT (Organization Settings > Service Accounts).`;
  if (status === 403) return `Mixpanel answered 403${detail}. Give the service account a role (Consumer is enough) on this project, and check --project.`;
  if (status === 404) return `Mixpanel answered 404${detail}. Check --project and MIXPANEL_HOST (us, eu or in: the project's data residency).`;
  if (status === 429) return `Mixpanel answered 429 after retrying${detail}: the Query API allows about 60 queries an hour per project. Run again later.`;
  if (status === 400) return `Mixpanel refused the query (400)${detail}. Check --project, MIXPANEL_HOST (a project in the EU answers only on eu) and the --event names.`;
  return `Mixpanel answered ${status}${detail}.`;
}

async function counts({ base, auth, project, events, from, to, type, fetchImpl, sleep }) {
  const url = buildUrl({ base, project, events, from, to, type });
  const { r, body: ans } = await retrying(fetchImpl, sleep, url, { method: 'GET', headers: { authorization: auth, accept: 'application/json' } });
  if (!r.ok) throw new Error(refusal(r.status, ans));
  if (typeof ans?.error === 'string' && ans.error) throw new Error(`Mixpanel refused the query: ${ans.error}`);
  const values = ans?.data?.values;
  if (!values || typeof values !== 'object') throw new Error('Mixpanel answered without data.values; is MIXPANEL_HOST the Query API (us, eu or in)?');
  return values;
}

/**
 * Daily rows for [from, to]: { date, values: { event_<slug>: count, ..., users } }. `users` is the daily unique users of
 * the first event named (Mixpanel's type=unique), the people behind the column the watch leans on most.
 */
export async function query({ base, auth, project, events, from, to, fetchImpl = globalThis.fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const by = new Map();
  const at = (d) => { if (!by.has(d)) by.set(d, { date: d, values: {} }); return by.get(d).values; };
  const day = (x) => { const d = String(x ?? '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= from && d <= to ? d : null; };
  const common = { base, auth, project, from, to, fetchImpl, sleep };
  const total = await counts({ ...common, events, type: 'general' });
  for (const e of events) {
    const c = eventColumn(e);
    for (const [d0, n] of Object.entries(total[e] ?? {})) { const d = day(d0); if (d) at(d)[c] = (at(d)[c] ?? 0) + (Number(n) || 0); }
  }
  const uniq = await counts({ ...common, events: [events[0]], type: 'unique' });
  for (const [d0, n] of Object.entries(uniq[events[0]] ?? {})) { const d = day(d0); if (d) at(d).users = Number(n) || 0; }
  return [...by.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

const USAGE = `Make a daily metrics CSV from your own Mixpanel project, for the watch (node watch.mjs) or the CLI (node cli.mjs).

Usage:
  MIXPANEL_SERVICE_ACCOUNT='username:secret' node mixpanel-metrics.mjs --project <id> --out <file.csv> [options]

Options:
  --project <id>        the project ID (Project Settings > Overview, or the number after /project/ in the app's address)
  --out <file>          the CSV to write (date, event_<name> per event, users); an existing one is extended: its last
                        --refetch days are fetched again, the rest kept
  --event <name>        an event to count per day, exactly as Mixpanel shows it (repeat for up to ${MAX_EVENTS}; default
                        ${DEFAULT_EVENTS.join(' ')}, autocapture's page view). E.g. --event 'Sign Up' --event 'Checkout Started'
  --days <n>            how many days to fetch when there is no CSV yet (default: 480)
  --refetch <n>         days at the end of an existing CSV to fetch again (default: 3; events from apps that were
                        offline land on the day they happened)
  --lag <n>             leave out the last n days before today (default: 1, so yesterday, a whole day, is the last)
  -h, --help            this help

Environment: MIXPANEL_SERVICE_ACCOUNT (required: "username:secret" of a service account with a role on the project; a
value with no colon is read as the project's legacy API secret); MIXPANEL_HOST: us (default), eu or in, the project's
data residency.

Columns: event_<name> (the name without a leading $, in lower case, so 'Sign Up' is event_sign_up) counts the event per
day; users is the daily unique users of the first --event. Days are the project's own (its time zone in Mixpanel). A day
with no count is written as zero: Mixpanel ingests live, so an empty day is a real one, which is the point when a
tracking call is dropped in a release. Two queries a run; the Query API allows about 60 an hour per project.`;

export async function main(argv, { env = process.env, out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s), fetchImpl = globalThis.fetch, now = () => Date.now(), sleep } = {}) {
  let outPath = null, project = null, days = 480, refetch = 3, lag = 1;
  const events = [];
  const whole = (s, name, min) => { const v = Number(s); if (!Number.isInteger(v) || v < min) throw new Error(`${name} takes a whole number of ${min} or more.`); return v; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { out(USAGE + '\n'); return 0; }
    else if (a === '--out') outPath = argv[++i];
    else if (a === '--project') project = projectId(argv[++i]);
    else if (a === '--event') events.push(eventName(argv[++i]));
    else if (a === '--days') days = whole(argv[++i], '--days', 1);
    else if (a === '--refetch') refetch = whole(argv[++i], '--refetch', 0);
    else if (a === '--lag') lag = whole(argv[++i], '--lag', 0);
    else throw new Error(`Unknown option ${a} (see --help).`);
  }
  if (!outPath) throw new Error('Give --out <file.csv> (see --help).');
  if (!project) throw new Error('Give --project <id>, the number in Project Settings > Overview.');
  if (!events.length) events.push(...DEFAULT_EVENTS);
  if (events.length > MAX_EVENTS) throw new Error(`--event: at most ${MAX_EVENTS} events.`);
  const evCols = events.map(eventColumn);
  if (new Set(evCols).size !== evCols.length) throw new Error('--event names the same event twice (or two names that make the same column).');
  const auth = authHeader(env.MIXPANEL_SERVICE_ACCOUNT);
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

  const rows = await query({ base, auth, project, events, from, to, fetchImpl, sleep: sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))) });
  const fresh = fillDays(rows, columns, from, to);
  const all = [...kept, ...fresh];
  if (outPath.includes('/')) await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, toCsv(all, columns));
  out(`${outPath}: ${all.length} days to ${to} (${fresh.length} fetched, ${fresh.reduce((s, r) => s + r.values[evCols[0]], 0)} ${events[0]}), project ${project}.\n`);
  if (fresh.length >= 7 && fresh.every((r) => columns.every((c) => r.values[c] === 0))) err(`Note: every day fetched is empty. Check --project, MIXPANEL_HOST (the project's data residency) and that the --event names match Mixpanel's exactly (they are case-sensitive).\n`);
  else for (let e = 0; e < events.length; e++) {
    if (fresh.length >= 28 && fresh.every((r) => r.values[evCols[e]] === 0)) err(`Note: event "${events[e]}" has no count in ${fresh.length} days; check its exact name in Mixpanel's Lexicon.\n`);
  }
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { process.stderr.write(`${e.message}\n`); process.exit(2); });
}
