#!/usr/bin/env node
// Turn your own Plausible Analytics site into a daily metrics CSV the watch and the CLI can read: visitors, visits and
// page views per day, plus a column per goal you name (a sign-up, a purchase), so a tag dropped from some pages or a
// form that stops sending its goal is heard. Read-only, zero dependencies, runs wherever your key is (your laptop, your
// GitHub Actions); nothing passes through us. Works with plausible.io and with a self-hosted Plausible (PLAUSIBLE_URL).
//
//   PLAUSIBLE_API_KEY=... node plausible-metrics.mjs --site example.com --goal Signup --out data/plausible.csv
//   node watch.mjs data/plausible.csv --state watch-state.json --columns visitors:poisson,goal_signup:poisson
//
// API set-up: in Plausible, Account settings > API keys > New API key (a Stats API key). Calls: the Stats API v2,
// POST /api/v2/query with { site_id, metrics, date_range: [from, to], dimensions: ["time:day"] }, answering
// { results: [{ dimensions: ["YYYY-MM-DD"], metrics: [...] }] } (plausible.io/docs/stats-api). A goal's column is the
// same query filtered to [["is", "event:goal", [name]]] with the metric "events" (total conversions).
//
// Statistical analysis of data you supply, not advice. All rights reserved.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { retrying } from './search-console-metrics.mjs';
import { fillDays, readExisting, toCsv } from './ga4-metrics.mjs';

const CLOUD = 'https://plausible.io';
export const DEFAULT_METRICS = ['visitors', 'visits', 'pageviews'];
// Metrics the Stats API v2 answers per day without a goal filter, and that are counts or plain numbers a watch can
// read. conversion_rate and group_conversion_rate need a goal filter, so goals go through --goal instead.
const KNOWN = new Set(['visitors', 'visits', 'pageviews', 'events', 'views_per_visit', 'bounce_rate', 'visit_duration', 'scroll_depth', 'time_on_page']);
const MAX_GOALS = 5;
const PAGE = 10000;

/**
 * The API's base: plausible.io, or PLAUSIBLE_URL for a self-hosted instance. The key is sent there, so only https is
 * taken, apart from a loopback http address (tests, a Plausible on the same machine).
 */
export function baseUrl(env = {}) {
  const v = String(env.PLAUSIBLE_URL ?? '').trim();
  if (!v) return CLOUD;
  let u;
  try { u = new URL(v); } catch { throw new Error(`PLAUSIBLE_URL "${v}" is not a URL: give your Plausible's address, e.g. https://plausible.example.com`); }
  const loop = u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost');
  if (u.protocol !== 'https:' && !loop) throw new Error('PLAUSIBLE_URL must be an https:// address (the API key is sent to it).');
  if (u.username || u.password || u.search || u.hash) throw new Error('PLAUSIBLE_URL takes the address only, with no user, query or fragment.');
  return `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
}

/** The site_id Plausible wants: the domain as added in Plausible, from "example.com" or a pasted URL. */
export function siteId(s) {
  let t = String(s ?? '').trim();
  if (/^https?:\/\//i.test(t)) { try { t = new URL(t).host; } catch { /* fall through to the check */ } }
  t = t.replace(/\/+$/, '');
  if (!/^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+(\/[\w.-]+)*$/.test(t)) {
    throw new Error(`--site "${s}" is not a Plausible site: give the domain as it is named in Plausible (e.g. example.com).`);
  }
  return t.toLowerCase();
}

/** --metrics: Stats API v2 metric names, 1 to 8, from the list a watch can use. */
export function parseMetrics(s) {
  const list = String(s ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!list.length || list.length > 8) throw new Error('--metrics takes 1 to 8 Plausible metric names, comma-separated.');
  for (const m of list) {
    if (m === 'conversion_rate' || m === 'group_conversion_rate') throw new Error(`--metrics: ${m} needs a goal; use --goal <name>, which writes the goal's daily conversions.`);
    if (!KNOWN.has(m)) throw new Error(`--metrics: "${m}" is not one of ${[...KNOWN].join(', ')}.`);
  }
  if (new Set(list).size !== list.length) throw new Error('--metrics names a metric twice.');
  return list;
}

/** A goal's column name: goal_ and its name in lower case, letters and digits joined by underscores. */
export function goalColumn(name) {
  // Fold accents into their base letter (Réservation -> reservation): NFKD splits é into e and a combining mark, which
  // must be dropped, not turned into an underscore. Columns stay ASCII, so a name in another script needs a Latin alias.
  const slug = String(name).toLowerCase().normalize('NFKD').replace(/\p{M}+/gu, '').replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '');
  if (!slug) throw new Error(`--goal "${name}" has no Latin letters or digits to name its column: add a goal with a Latin name in Plausible (Site settings > Goals) and give that.`);
  return `goal_${slug}`;
}

/**
 * Daily rows from POST /api/v2/query, dimension time:day, for [from, to] (YYYY-MM-DD, the site's own days). Pages with
 * pagination.offset until a page comes back short. Returns [{ date, values: {name: number} }], keyed by `names`
 * (the CSV columns, in the order of `metrics`).
 */
export async function query({ base, key, site, metrics, names = metrics, from, to, filters, imports = false, fetchImpl = globalThis.fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const url = `${base}/api/v2/query`;
  const rows = [];
  for (let offset = 0, prev = 0; ; ) {
    const body = { site_id: site, metrics, date_range: [from, to], dimensions: ['time:day'], order_by: [['time:day', 'asc']], pagination: { limit: PAGE, offset } };
    if (filters) body.filters = filters;
    if (imports) body.include = { imports: true };
    const { r, body: ans } = await retrying(fetchImpl, sleep, url, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) {
      const msg = typeof ans?.error === 'string' ? `: ${ans.error}` : '';
      if (r.status === 401) throw new Error(`Plausible refused the API key (401)${msg}. Make a Stats API key in Account settings > API keys and put it in PLAUSIBLE_API_KEY.`);
      if (r.status === 402) throw new Error(`Plausible answered 402${msg}: the Stats API is not on this account's plan.`);
      if (r.status === 400 && filters && /goal/i.test(msg)) throw new Error(`Plausible refused the goal (400)${msg}. Name the goal exactly as it is listed in Site settings > Goals.`);
      if (r.status === 400) throw new Error(`Plausible refused the query (400)${msg}. Check --site (the domain as named in Plausible) and --metrics.`);
      if (r.status === 404) throw new Error(`Plausible answered 404${msg}. Check PLAUSIBLE_URL (it should be the address you log in at) and --site.`);
      throw new Error(`Plausible answered ${r.status}${msg}.`);
    }
    const page = Array.isArray(ans?.results) ? ans.results : [];
    for (const x of page) {
      const d = String(x?.dimensions?.[0] ?? '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
      const values = {};
      metrics.forEach((m, i) => { const v = Number(x?.metrics?.[i]); values[names[i]] = Number.isFinite(v) ? v : 0; });
      rows.push({ date: d, values });
    }
    // Step by the rows returned, and stop at an empty page or one shorter than the page before it: a server may
    // answer fewer rows than the limit asked for.
    offset += page.length;
    if (!page.length || page.length < prev) break;
    prev = page.length;
  }
  return rows;
}

const USAGE = `Make a daily metrics CSV from your own Plausible Analytics site, for the watch (node watch.mjs) or the CLI
(node cli.mjs).

Usage:
  PLAUSIBLE_API_KEY=... node plausible-metrics.mjs --site <domain> --out <file.csv> [options]

Options:
  --site <domain>       the site as named in Plausible (example.com)
  --out <file>          the CSV to write (date, then one column per metric and goal); an existing one is extended:
                        its last --refetch days are fetched again, the rest kept
  --metrics <a,b,...>   Stats API metrics, 1 to 8 (default: ${DEFAULT_METRICS.join(',')}); also events, bounce_rate,
                        visit_duration, views_per_visit, scroll_depth, time_on_page
  --goal <name>         also write the goal's conversions per day as goal_<name> (repeat for up to ${MAX_GOALS} goals;
                        the name exactly as in Site settings > Goals, e.g. --goal Signup --goal "Visit /thanks")
  --days <n>            how many days to fetch when there is no CSV yet (default: 480)
  --refetch <n>         days at the end of an existing CSV to fetch again (default: 2)
  --lag <n>             leave out the last n days before today (default: 1, so yesterday, a whole day, is the last)
  --imports             count data imported into Plausible (from Universal Analytics, GA4 or a CSV) too, for a
                        longer history than the site has had Plausible
  -h, --help            this help

Environment: PLAUSIBLE_API_KEY (required, a Stats API key); PLAUSIBLE_URL for a self-hosted Plausible (https only).

Days are the site's own (its time zone in Plausible); our clock (UTC) only picks the range, and the rows carry their
dates. A day with no row is written as zeros: Plausible counts live, so an empty day is a real one, which is the point
when a tag falls off the site.`;

const addDays = (day, k) => new Date(Date.parse(`${day}T00:00:00Z`) + k * 86400000).toISOString().slice(0, 10);

export async function main(argv, { env = process.env, out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s), fetchImpl = globalThis.fetch, now = () => Date.now(), sleep } = {}) {
  let outPath = null, site = null, days = 480, refetch = 2, lag = 1, metrics = DEFAULT_METRICS, imports = false;
  const goals = [];
  const whole = (s, name, min) => { const v = Number(s); if (!Number.isInteger(v) || v < min) throw new Error(`${name} takes a whole number of ${min} or more.`); return v; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { out(USAGE + '\n'); return 0; }
    else if (a === '--out') outPath = argv[++i];
    else if (a === '--site') site = siteId(argv[++i]);
    else if (a === '--metrics') metrics = parseMetrics(argv[++i]);
    else if (a === '--goal') { const g = String(argv[++i] ?? '').trim(); if (!g) throw new Error('--goal takes a goal name.'); goals.push(g); }
    else if (a === '--days') days = whole(argv[++i], '--days', 1);
    else if (a === '--refetch') refetch = whole(argv[++i], '--refetch', 0);
    else if (a === '--lag') lag = whole(argv[++i], '--lag', 0);
    else if (a === '--imports') imports = true;
    else throw new Error(`Unknown option ${a} (see --help).`);
  }
  if (!outPath) throw new Error('Give --out <file.csv> (see --help).');
  if (!site) throw new Error('Give --site <domain>, the site as named in Plausible.');
  if (goals.length > MAX_GOALS) throw new Error(`--goal: at most ${MAX_GOALS} goals (one query each).`);
  const goalCols = goals.map(goalColumn);
  if (new Set(goalCols).size !== goalCols.length) throw new Error('--goal names the same goal twice.');
  const key = env.PLAUSIBLE_API_KEY;
  if (!key) throw new Error('Set PLAUSIBLE_API_KEY (Account settings > API keys > New API key, a Stats API key).');
  const base = baseUrl(env);
  const columns = [...metrics, ...goalCols];

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

  const sl = sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const common = { base, key, site, from, to, imports, fetchImpl, sleep: sl };
  const merged = new Map();
  const add = (rows) => { for (const r of rows) merged.set(r.date, { date: r.date, values: { ...(merged.get(r.date)?.values ?? {}), ...r.values } }); };
  add(await query({ ...common, metrics }));
  for (let g = 0; g < goals.length; g++) {
    add(await query({ ...common, metrics: ['events'], names: [goalCols[g]], filters: [['is', 'event:goal', [goals[g]]]] }));
  }
  const fresh = fillDays([...merged.values()], columns, from, to);
  const all = [...kept, ...fresh];
  if (outPath.includes('/')) await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, toCsv(all, columns));
  const first = columns[0];
  const empty = fresh.filter((r) => columns.every((c) => r.values[c] === 0)).length;
  out(`${outPath}: ${all.length} days to ${to} (${fresh.length} fetched, ${fresh.reduce((s, r) => s + r.values[first], 0)} ${first}), site ${site}.\n`);
  if (fresh.length >= 7 && empty === fresh.length) err(`Note: every day fetched is empty. Check that --site is the domain as named in Plausible${goals.length ? ' and the goal names' : ''}.\n`);
  for (let g = 0; g < goals.length; g++) {
    if (fresh.length >= 28 && fresh.every((r) => r.values[goalCols[g]] === 0)) err(`Note: goal "${goals[g]}" has no conversions in ${fresh.length} days; check its name in Site settings > Goals.\n`);
  }
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { process.stderr.write(`${e.message}\n`); process.exit(2); });
}
