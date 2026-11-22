#!/usr/bin/env node
// Turn your own Google Search Console property into a daily metrics CSV the watch and the CLI can read: clicks,
// impressions, CTR and average position per day. Read-only, zero dependencies, runs wherever your credentials are
// (your laptop, your GitHub Actions); nothing passes through us.
//
//   GSC_SERVICE_ACCOUNT_JSON="$(cat key.json)" node search-console-metrics.mjs --site sc-domain:example.com --out data/gsc.csv
//   node search-console-metrics.mjs --from-export Dates.csv --out data/gsc.csv      # no API: the UI's export
//   node watch.mjs data/gsc.csv --state watch-state.json --columns clicks:poisson,impressions:poisson
//   node cli.mjs data/gsc.csv --column clicks --model poisson --period 7 --events google-updates.csv
//
// API set-up: Google Cloud console > a project > enable "Google Search Console API" > IAM > Service accounts > create
// one, add a JSON key. Then Search Console > Settings > Users and permissions > Add user: the service account's email,
// permission Restricted (read-only). Calls: searchanalytics.query with dimension date (developers.google.com/
// webmaster-tools/v1/searchanalytics/query), a token from Google's OAuth 2.0 server-to-server flow (RS256 JWT bearer
// assertion, scope webmasters.readonly).
//
// Statistical analysis of data you supply, not advice. MIT licence.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { createSign } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { csvCell } from './stripe-metrics.mjs';

const API = 'https://searchconsole.googleapis.com/webmasters/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const TYPES = new Set(['web', 'image', 'video', 'news', 'discover', 'googleNews']);

// GSC_API_BASE and GSC_TOKEN_URL point the tool at a local stand-in (tests, the workflow replay). Only a loopback http
// address is taken, so a mistyped or planted value can never send a token or a signed assertion to another host.
const LOOPBACK = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/[\w/.-]*)?$/;
export function endpoints(env = {}) {
  const pick = (name, dflt) => {
    const v = env[name];
    if (!v) return dflt;
    if (!LOOPBACK.test(v)) throw new Error(`${name} takes only a loopback address (http://127.0.0.1:port), for tests.`);
    return v.replace(/\/$/, '');
  };
  return { api: pick('GSC_API_BASE', API), tokenUrl: pick('GSC_TOKEN_URL', TOKEN_URL) };
}

const USAGE = `Make a daily metrics CSV from your own Google Search Console property, for the watch (node watch.mjs) or the
CLI (node cli.mjs).

Usage:
  GSC_SERVICE_ACCOUNT_JSON='{...}' node search-console-metrics.mjs --site <property> --out <file.csv> [options]
  GSC_ACCESS_TOKEN=ya29... node search-console-metrics.mjs --site <property> --out <file.csv> [options]
  node search-console-metrics.mjs --from-export <Dates.csv> --out <file.csv>

Options:
  --site <property>     the property as Search Console names it: sc-domain:example.com (a domain property) or
                        https://www.example.com/ (a URL-prefix property, with its trailing slash)
  --out <file>          the CSV to write (date,clicks,impressions,ctr,position); an existing one is extended: its last
                        --refetch days are fetched again (Search Console revises recent days), the rest kept
  --days <n>            how many days to fetch when there is no CSV yet (default: 480; Search Console keeps 16 months)
  --refetch <n>         days at the end of an existing CSV to fetch again (default: 4)
  --type <t>            search type: web (default), image, video, news, discover or googleNews
  --from-export <file>  no API: convert the Dates.csv of Search Console's Performance > Export (CSV or the zip's
                        Dates.csv) into the same file, oldest first, missing days filled
  -h, --help            this help

Days are Search Console's own (Pacific time). Only finished days are written: the days Search Console still marks as
incomplete are left out, so a half-collected day never reads as a fall. A day with no impressions is written with
clicks 0, impressions 0 and CTR and position blank (there was no position to average).

Credentials: GSC_SERVICE_ACCOUNT_JSON holds a service account's JSON key (add its email as a Restricted user of the
property); or GSC_ACCESS_TOKEN holds an OAuth access token with the webmasters.readonly scope (it expires in an hour).`;

const addDays = (day, k) => new Date(Date.parse(`${day}T00:00:00Z`) + k * 86400000).toISOString().slice(0, 10);
/** Today's date in Search Console's time zone (America/Los_Angeles). */
export function pacificToday(nowMs) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(nowMs)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/** The signed JWT a service account trades for an access token (RFC 7523; Google's server-to-server OAuth flow). */
export function serviceAccountAssertion(key, { nowSec, tokenUrl = TOKEN_URL, scope = SCOPE, envName = 'GSC_SERVICE_ACCOUNT_JSON' }) {
  if (!key || typeof key.client_email !== 'string' || typeof key.private_key !== 'string') throw new Error(`${envName} is not a service account key (it needs client_email and private_key).`);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', ...(key.private_key_id ? { kid: key.private_key_id } : {}) }));
  const claims = b64url(JSON.stringify({ iss: key.client_email, scope, aud: tokenUrl, iat: nowSec, exp: nowSec + 3600 }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${head}.${claims}`);
  return `${head}.${claims}.${b64url(signer.sign(key.private_key))}`;
}

export async function retrying(fetchImpl, sleep, url, init) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetchImpl(url, init);
    if ((r.status === 429 || r.status >= 500) && attempt < 5) { await sleep(1000 * 2 ** attempt); continue; }
    let body = null;
    try { body = await r.json(); } catch { body = null; }
    return { r, body };
  }
}

/** An access token: GSC_ACCESS_TOKEN as given, or one traded for a service account's signed assertion. */
export async function accessToken(env, { tokenUrl, fetchImpl, sleep, nowSec }) {
  if (env.GSC_ACCESS_TOKEN) return env.GSC_ACCESS_TOKEN;
  const raw = env.GSC_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('Set GSC_SERVICE_ACCOUNT_JSON (a service account JSON key) or GSC_ACCESS_TOKEN, or use --from-export with no credentials.');
  let key;
  try { key = JSON.parse(raw); } catch { throw new Error('GSC_SERVICE_ACCOUNT_JSON is not JSON: put the whole key file in it, e.g. "$(cat key.json)".'); }
  const assertion = serviceAccountAssertion(key, { nowSec, tokenUrl });
  const form = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion });
  const { r, body } = await retrying(fetchImpl, sleep, tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form.toString() });
  if (!r.ok || !body?.access_token) throw new Error(`Google refused the service account (${r.status}${body?.error ? `: ${body.error}${body.error_description ? `, ${body.error_description}` : ''}` : ''}). Check the key and that the Search Console API is enabled in its project.`);
  return body.access_token;
}

/**
 * Daily rows from searchanalytics.query, dimension date, for [startDate, endDate]. dataState "all" so the answer says
 * which day is the first still being collected (metadata.first_incomplete_date); rows from that day on are dropped.
 * Returns { rows: [{ date, clicks, impressions, ctr, position }], firstIncomplete }.
 */
export async function queryDays({ api, token, site, startDate, endDate, type = 'web', fetchImpl = globalThis.fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const url = `${api}/sites/${encodeURIComponent(site)}/searchAnalytics/query`;
  const rows = [];
  let firstIncomplete = null;
  for (let startRow = 0; ; startRow += 25000) {
    const body = { startDate, endDate, dimensions: ['date'], type, dataState: 'all', rowLimit: 25000, startRow };
    const { r, body: ans } = await retrying(fetchImpl, sleep, url, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) {
      const msg = ans?.error?.message ? `: ${ans.error.message}` : '';
      if (r.status === 401) throw new Error(`Search Console refused the token (401)${msg}.`);
      if (r.status === 403) throw new Error(`Search Console answered 403${msg}. Add the service account's email as a user of ${site} (Settings > Users and permissions), and check the property is written exactly (sc-domain:example.com, or the URL prefix with its trailing slash).`);
      throw new Error(`Search Console answered ${r.status}${msg}.`);
    }
    const fi = ans?.metadata?.first_incomplete_date ?? ans?.metadata?.firstIncompleteDate;
    if (fi && (!firstIncomplete || fi < firstIncomplete)) firstIncomplete = fi;
    const page = Array.isArray(ans?.rows) ? ans.rows : [];
    for (const x of page) {
      const date = x.keys?.[0];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) continue;
      rows.push({ date, clicks: Number(x.clicks) || 0, impressions: Number(x.impressions) || 0, ctr: x.ctr, position: x.position });
    }
    if (page.length < 25000) break;
  }
  return { rows: firstIncomplete ? rows.filter((x) => x.date < firstIncomplete) : rows, firstIncomplete };
}

/** One CSV row: CTR as a percentage, position to 2 decimals, both blank on a day with no impressions. */
function format(r) {
  const has = r.impressions > 0;
  const ctr = has ? (r.ctr != null && r.ctr !== '' ? Number(r.ctr) * 100 : (100 * r.clicks) / r.impressions).toFixed(2) : '';
  const position = has && r.position != null && r.position !== '' && Number.isFinite(Number(r.position)) ? Number(r.position).toFixed(2) : '';
  return { date: r.date, clicks: r.clicks, impressions: r.impressions, ctr, position };
}

/** Every day in [from, to], the rows given where there are some, zeros (and blanks) where Search Console had none. */
export function fillDays(rows, from, to) {
  const by = new Map(rows.map((r) => [r.date, r]));
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(format(by.get(d) ?? { date: d, clicks: 0, impressions: 0 }));
  return out;
}

// Every cell goes through csvCell (stripe-metrics.mjs), the spreadsheet formula-injection guard: the file is opened in
// spreadsheets, and a cell starting =, +, -, @, tab or CR that is not a plain number gets an apostrophe.
export const HEADER = 'date,clicks,impressions,ctr,position';
export const toCsv = (rows) => [HEADER, ...rows.map((r) => [r.date, r.clicks, r.impressions, r.ctr, r.position].map(csvCell).join(','))].join('\n') + '\n';

/** Rows of an earlier CSV this tool wrote, or null when its header differs (then fetch afresh). */
export function readExisting(text) {
  const lines = String(text).split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length || lines[0].trim() !== HEADER) return null;
  return lines.slice(1).map((l) => { const [date, clicks, impressions, ctr, position] = l.split(','); return { date, clicks: Number(clicks), impressions: Number(impressions), ctr: ctr ?? '', position: position ?? '' }; })
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date));
}

/**
 * Search Console's Performance > Export "Dates.csv": Date,Clicks,Impressions,CTR,Position with CTR as "3.45%", newest
 * first. Columns are found by their English header names, and by position (Date, Clicks, Impressions, CTR, Position)
 * when a name is not found. Returns rows oldest first, gaps filled.
 */
export function fromExport(text) {
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error('the export has no rows.');
  const head = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ''));
  const col = (name, dflt) => { const i = head.findIndex((h) => h === name || h.startsWith(name)); return i >= 0 ? i : dflt; };
  const iD = col('date', 0), iC = col('clicks', 1), iI = col('impressions', 2), iR = col('ctr', 3), iP = col('position', 4);
  const num = (s) => { const t = String(s ?? '').replace(/^"|"$/g, '').trim(); return t === '' ? NaN : Number(t.replace(/%$/, '')); };
  const rows = [];
  lines.slice(1).forEach((l, k) => {
    const f = l.split(',');
    const date = String(f[iD] ?? '').replace(/^"|"$/g, '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`export line ${k + 2}: the date "${date}" is not YYYY-MM-DD (export the Dates table, not Queries or Pages).`);
    const clicks = num(f[iC]), impressions = num(f[iI]);
    if (!Number.isFinite(clicks) || !Number.isFinite(impressions)) throw new Error(`export line ${k + 2}: clicks and impressions must be numbers.`);
    const ctr = num(f[iR]);
    rows.push({ date, clicks, impressions, ctr: Number.isFinite(ctr) ? ctr / 100 : null, position: num(f[iP]) });
  });
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (let i = 1; i < rows.length; i++) if (rows[i].date === rows[i - 1].date) throw new Error(`the export has ${rows[i].date} twice.`);
  return fillDays(rows, rows[0].date, rows[rows.length - 1].date);
}

export async function main(argv, { env = process.env, out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s), fetchImpl = globalThis.fetch, now = () => Date.now(), sleep } = {}) {
  let outPath = null, site = null, days = 480, refetch = 4, type = 'web', exportPath = null;
  const whole = (s, name, min) => { const v = Number(s); if (!Number.isInteger(v) || v < min) throw new Error(`${name} takes a whole number of ${min} or more.`); return v; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { out(USAGE + '\n'); return 0; }
    else if (a === '--out') outPath = argv[++i];
    else if (a === '--site') site = argv[++i];
    else if (a === '--days') days = whole(argv[++i], '--days', 1);
    else if (a === '--refetch') refetch = whole(argv[++i], '--refetch', 0);
    else if (a === '--type') { type = argv[++i]; if (!TYPES.has(type)) throw new Error(`--type takes one of ${[...TYPES].join(', ')}.`); }
    else if (a === '--from-export') exportPath = argv[++i];
    else throw new Error(`Unknown option ${a} (see --help).`);
  }
  if (!outPath) throw new Error('Give --out <file.csv> (see --help).');
  const write = async (rows) => { if (outPath.includes('/')) await mkdir(dirname(outPath), { recursive: true }); await writeFile(outPath, toCsv(rows)); };

  if (exportPath) {
    const rows = fromExport(await readFile(exportPath, 'utf8'));
    await write(rows);
    out(`${outPath}: ${rows.length} days, ${rows[0].date} to ${rows[rows.length - 1].date}, from the Search Console export.\n`);
    return 0;
  }
  if (!site) throw new Error('Give --site (sc-domain:example.com or https://www.example.com/), or --from-export <Dates.csv>.');
  if (!/^sc-domain:[^\s/]+$/.test(site) && !/^https?:\/\/[^\s]+\/$/.test(site)) throw new Error(`--site "${site}" is not a Search Console property: write sc-domain:example.com, or the URL prefix with its trailing slash (https://www.example.com/).`);

  const { api, tokenUrl } = endpoints(env);
  const today = pacificToday(now());
  const endDate = addDays(today, -1);
  let kept = [];
  let startDate = addDays(today, -days);
  if (existsSync(outPath)) {
    const prev = readExisting(await readFile(outPath, 'utf8'));
    if (prev && prev.length) {
      kept = prev.filter((r) => r.date < addDays(prev[prev.length - 1].date, 1 - refetch));
      startDate = kept.length ? addDays(kept[kept.length - 1].date, 1) : prev[0].date;
    } else if (prev === null) err(`${outPath} has other columns than this run writes; fetching ${days} days afresh.\n`);
  }
  if (startDate > endDate) { err(`${outPath} is already up to ${endDate}.\n`); return 0; }
  const token = await accessToken(env, { tokenUrl, fetchImpl, sleep: sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))), nowSec: Math.floor(now() / 1000) });
  const { rows, firstIncomplete } = await queryDays({ api, token, site, startDate, endDate, type, fetchImpl, ...(sleep ? { sleep } : {}) });
  // The last finished day: the day before the first incomplete one when Search Console names it; otherwise the latest
  // day it returned (it names none when every day asked for is final, and a trailing run of empty days then cannot be
  // told from days not yet published, so they wait for a later run).
  let to = firstIncomplete ? addDays(firstIncomplete, -1) : rows.reduce((m, r) => (r.date > m ? r.date : m), '');
  if (to > endDate) to = endDate;
  if (!to || to < startDate) { err(`Search Console has no finished day from ${startDate} yet; ${outPath} left as it was.\n`); return 0; }
  const fresh = fillDays(rows, startDate, to);
  const all = [...kept, ...fresh];
  await write(all);
  const clicks = fresh.reduce((s, r) => s + r.clicks, 0);
  out(`${outPath}: ${all.length} days to ${to} (${fresh.length} fetched, ${clicks} clicks), ${type} search for ${site}.\n`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { process.stderr.write(`${e.message}\n`); process.exit(2); });
}
