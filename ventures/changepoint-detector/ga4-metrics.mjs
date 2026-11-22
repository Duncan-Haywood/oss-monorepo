#!/usr/bin/env node
// Turn your own Google Analytics 4 property into a daily metrics CSV the watch and the CLI can read: sessions, active
// users, page views and key events per day (or the metrics you name). Read-only, zero dependencies, runs wherever your
// credentials are (your laptop, your GitHub Actions); nothing passes through us.
//
//   GA4_SERVICE_ACCOUNT_JSON="$(cat key.json)" node ga4-metrics.mjs --property 123456789 --out data/ga4.csv
//   node ga4-metrics.mjs --from-export report.csv --out data/ga4.csv      # no API: a report's CSV download
//   node watch.mjs data/ga4.csv --state watch-state.json --columns sessions:poisson,keyEvents:poisson
//   node cli.mjs data/ga4.csv --column sessions --model poisson --period 7 --events releases.csv
//
// API set-up: Google Cloud console > a project > enable "Google Analytics Data API" > IAM > Service accounts > create
// one, add a JSON key. Then Google Analytics > Admin > Property access management > add the service account's email
// with the Viewer role. Calls: properties.runReport with dimension date (developers.google.com/analytics/devguides/
// reporting/data/v1/rest/v1beta/properties/runReport), a token from Google's OAuth 2.0 server-to-server flow (RS256
// JWT bearer assertion, scope analytics.readonly; the signing is shared with search-console-metrics.mjs).
//
// Statistical analysis of data you supply, not advice. MIT licence.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { csvCell } from './stripe-metrics.mjs';
import { serviceAccountAssertion, retrying } from './search-console-metrics.mjs';

const API = 'https://analyticsdata.googleapis.com/v1beta';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
export const DEFAULT_METRICS = ['sessions', 'activeUsers', 'screenPageViews', 'keyEvents'];
const PAGE = 10000;

// GA4_API_BASE and GA4_TOKEN_URL point the tool at a local stand-in (tests, the workflow replay). Only a loopback http
// address is taken, so a mistyped or planted value can never send a token or a signed assertion to another host.
const LOOPBACK = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/[\w/.-]*)?$/;
export function endpoints(env = {}) {
  const pick = (name, dflt) => {
    const v = env[name];
    if (!v) return dflt;
    if (!LOOPBACK.test(v)) throw new Error(`${name} takes only a loopback address (http://127.0.0.1:port), for tests.`);
    return v.replace(/\/$/, '');
  };
  return { api: pick('GA4_API_BASE', API), tokenUrl: pick('GA4_TOKEN_URL', TOKEN_URL) };
}

const USAGE = `Make a daily metrics CSV from your own Google Analytics 4 property, for the watch (node watch.mjs) or the
CLI (node cli.mjs).

Usage:
  GA4_SERVICE_ACCOUNT_JSON='{...}' node ga4-metrics.mjs --property <id> --out <file.csv> [options]
  GA4_ACCESS_TOKEN=ya29... node ga4-metrics.mjs --property <id> --out <file.csv> [options]
  node ga4-metrics.mjs --from-export <report.csv> --out <file.csv>

Options:
  --property <id>       the property's numeric ID (Admin > Property details), or properties/<id>
  --out <file>          the CSV to write (date, then one column per metric); an existing one is extended: its last
                        --refetch days are fetched again (Analytics keeps processing recent days), the rest kept
  --metrics <a,b,...>   Data API metric names, 1 to 10 (default: ${DEFAULT_METRICS.join(',')}); e.g. add
                        totalRevenue, newUsers, engagedSessions or eventCount
  --days <n>            how many days to fetch when there is no CSV yet (default: 480)
  --refetch <n>         days at the end of an existing CSV to fetch again (default: 4)
  --lag <n>             leave out the last n days before today, still being processed (default: 1, so yesterday is
                        the last day written; 2 is safer on a busy property, where yesterday can still grow)
  --from-export <file>  no API: convert a report's Share > Download file > CSV (a Date or Nth day column, then
                        metrics) into the same layout, oldest first, missing days filled with zeros
  -h, --help            this help

Days are the property's own (its reporting time zone): the Data API is asked for "NdaysAgo", which it reads in that
zone. A day with no row is written as zeros, since GA4 leaves out days with no traffic; a run of empty days at the very
end waits for a later run, because it cannot be told from days not yet processed.

Credentials: GA4_SERVICE_ACCOUNT_JSON holds a service account's JSON key (add its email as a Viewer of the property);
or GA4_ACCESS_TOKEN holds an OAuth access token with the analytics.readonly scope (it expires in an hour).`;

const addDays = (day, k) => new Date(Date.parse(`${day}T00:00:00Z`) + k * 86400000).toISOString().slice(0, 10);
const isoOf = (yyyymmdd) => `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;

/** The numeric property ID from "123", "properties/123" or a pasted "p123" (the ID in an Analytics URL). */
export function propertyId(s) {
  const m = /^(?:properties\/|p)?(\d{4,15})$/.exec(String(s ?? '').trim());
  if (!m) throw new Error(`--property "${s}" is not a GA4 property ID: give the number from Admin > Property details (e.g. 123456789). A "G-..." code is a measurement ID, not the property.`);
  return m[1];
}

/** Metric names for --metrics: Data API names (letters, digits, underscores, a custom "customEvent:x"), 1 to 10. */
export function parseMetrics(s) {
  const list = String(s ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!list.length || list.length > 10) throw new Error('--metrics takes 1 to 10 Data API metric names, comma-separated.');
  for (const m of list) if (!/^[A-Za-z][\w]*(:[\w]+)?$/.test(m)) throw new Error(`--metrics: "${m}" is not a Data API metric name (e.g. sessions, activeUsers, keyEvents).`);
  if (new Set(list).size !== list.length) throw new Error('--metrics names a metric twice.');
  return list;
}

/** An access token: GA4_ACCESS_TOKEN as given, or one traded for a service account's signed assertion. */
export async function accessToken(env, { tokenUrl, fetchImpl, sleep, nowSec }) {
  if (env.GA4_ACCESS_TOKEN) return env.GA4_ACCESS_TOKEN;
  const raw = env.GA4_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('Set GA4_SERVICE_ACCOUNT_JSON (a service account JSON key) or GA4_ACCESS_TOKEN, or use --from-export with no credentials.');
  let key;
  try { key = JSON.parse(raw); } catch { throw new Error('GA4_SERVICE_ACCOUNT_JSON is not JSON: put the whole key file in it, e.g. "$(cat key.json)".'); }
  const assertion = serviceAccountAssertion(key, { nowSec, tokenUrl, scope: SCOPE, envName: 'GA4_SERVICE_ACCOUNT_JSON' });
  const form = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion });
  const { r, body } = await retrying(fetchImpl, sleep, tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form.toString() });
  if (!r.ok || !body?.access_token) throw new Error(`Google refused the service account (${r.status}${body?.error ? `: ${body.error}${body.error_description ? `, ${body.error_description}` : ''}` : ''}). Check the key and that the Google Analytics Data API is enabled in its project.`);
  return body.access_token;
}

/**
 * Daily rows from properties.runReport, dimension date, from startDate (YYYY-MM-DD) to endDate ("NdaysAgo", read in the
 * property's zone). Pages with offset, stepping by the rows returned, until rowCount is reached. Returns [{ date, values: {metric: number} }] and the
 * thresholding/sampling flags the answer carries, so the caller can warn.
 */
export async function runReport({ api, token, property, metrics, startDate, endDate, fetchImpl = globalThis.fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const url = `${api}/properties/${property}:runReport`;
  const rows = [];
  const flags = { thresholded: false, sampled: false };
  for (let offset = 0; ; ) {
    const body = { dateRanges: [{ startDate, endDate }], dimensions: [{ name: 'date' }], metrics: metrics.map((name) => ({ name })), limit: String(PAGE), offset: String(offset), keepEmptyRows: true, orderBys: [{ dimension: { dimensionName: 'date' } }] };
    const { r, body: ans } = await retrying(fetchImpl, sleep, url, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) {
      const msg = ans?.error?.message ? `: ${ans.error.message}` : '';
      if (r.status === 401) throw new Error(`Google Analytics refused the token (401)${msg}.`);
      if (r.status === 403) throw new Error(`Google Analytics answered 403${msg}. Add the service account's email as a Viewer of property ${property} (Admin > Property access management), and check the Google Analytics Data API is enabled in the key's project.`);
      if (r.status === 400) throw new Error(`Google Analytics refused the request (400)${msg}. Check the metric names (--metrics) against the Data API's list.`);
      throw new Error(`Google Analytics answered ${r.status}${msg}.`);
    }
    const heads = (ans?.metricHeaders ?? []).map((h) => h?.name);
    if (ans?.metadata?.subjectToThresholding) flags.thresholded = true;
    if (Array.isArray(ans?.metadata?.samplingMetadatas) && ans.metadata.samplingMetadatas.length) flags.sampled = true;
    const page = Array.isArray(ans?.rows) ? ans.rows : [];
    for (const x of page) {
      const d = x?.dimensionValues?.[0]?.value ?? '';
      if (!/^\d{8}$/.test(d)) continue;
      const values = {};
      metrics.forEach((m, i) => {
        const j = heads.indexOf(m);
        const v = Number(x?.metricValues?.[j >= 0 ? j : i]?.value);
        values[m] = Number.isFinite(v) ? v : 0;
      });
      rows.push({ date: isoOf(d), values });
    }
    // Step by the rows actually returned: the API may answer fewer than the limit asked for.
    const total = Number(ans?.rowCount ?? 0);
    offset += page.length;
    if (!page.length || offset >= total) break;
  }
  return { rows, ...flags };
}

/** Every day in [from, to]: the rows given where there are some, zeros where GA4 had none. */
export function fillDays(rows, metrics, from, to) {
  const by = new Map(rows.map((r) => [r.date, r]));
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const r = by.get(d);
    out.push({ date: d, values: Object.fromEntries(metrics.map((m) => [m, r?.values?.[m] ?? 0])) });
  }
  return out;
}

// Every cell goes through csvCell (stripe-metrics.mjs), the spreadsheet formula-injection guard.
const fmt = (v) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100));
export const header = (metrics) => ['date', ...metrics].join(',');
export const toCsv = (rows, metrics) => [header(metrics), ...rows.map((r) => [r.date, ...metrics.map((m) => fmt(r.values[m]))].map(csvCell).join(','))].join('\n') + '\n';

/** Rows of an earlier CSV this tool wrote with the same metrics, or null when its header differs (then fetch afresh). */
export function readExisting(text, metrics) {
  const lines = String(text).split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length || lines[0].trim() !== header(metrics)) return null;
  return lines.slice(1).map((l) => { const f = splitCsvLine(l); return { date: f[0], values: Object.fromEntries(metrics.map((m, i) => [m, Number(f[i + 1]) || 0])) }; })
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date));
}

// The UI's column titles for the common metrics, so an export's columns get the same names the API run writes and a
// watch set up on one keeps working on the other.
const TITLES = {
  sessions: 'sessions', 'active users': 'activeUsers', users: 'activeUsers', 'total users': 'totalUsers', 'new users': 'newUsers',
  views: 'screenPageViews', 'key events': 'keyEvents', conversions: 'keyEvents', 'event count': 'eventCount',
  'total revenue': 'totalRevenue', 'engaged sessions': 'engagedSessions', purchases: 'ecommercePurchases', transactions: 'transactions',
};
const camel = (t) => t.toLowerCase().replace(/[^a-z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : '')).replace(/^[^a-z]+/, '');
/** One CSV line split on commas outside double quotes ("" inside quotes is a quote). */
export function splitCsvLine(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/**
 * A GA4 report's CSV download: "#" comment lines (one of them "# Start date: YYYYMMDD"), then a table whose first column
 * is Date (YYYYMMDD) or "Nth day" (0000, 0001, ... counted from the start date), then metric columns. Several tables
 * may follow one another, separated by blank lines; the first with a date column is read, up to the next blank line.
 * A "Grand total" row is skipped. Returns { metrics, rows } oldest first, missing days filled with zeros.
 */
export function fromExport(text) {
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/);
  let start = null;
  for (const l of lines) { const m = /^#\s*Start date:\s*(\d{8})/i.exec(l); if (m) { start = isoOf(m[1]); break; } }
  let i = lines.findIndex((l) => !l.startsWith('#') && /^"?(date|nth day)"?\s*,/i.test(l.trim()));
  if (i < 0) throw new Error('the export has no table with a Date or Nth day first column (in the report, pick Date as the dimension, or export the over-time chart).');
  const head = splitCsvLine(lines[i]);
  const nth = /^nth day$/i.test(head[0]);
  if (nth && !start) throw new Error('the export counts days ("Nth day") but has no "# Start date:" line to count from.');
  const metrics = head.slice(1).map((h) => TITLES[h.toLowerCase()] ?? camel(h));
  if (!metrics.length || metrics.some((m) => !m)) throw new Error('the export has a column with no usable name.');
  if (new Set(metrics).size !== metrics.length) throw new Error('the export has two columns for the same metric.');
  const rows = [];
  for (i++; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) { if (rows.length) break; continue; }
    if (l.startsWith('#')) continue;
    const f = splitCsvLine(l);
    if (/total/i.test(f[0])) continue;
    if (f.length !== head.length) throw new Error(`export line ${i + 1}: ${f.length} fields for ${head.length} columns (an unquoted thousands comma such as 1,200 splits a number; export again, or quote it).`);
    let date;
    if (nth) { if (!/^\d{1,5}$/.test(f[0])) throw new Error(`export line ${i + 1}: "${f[0]}" is not a day number.`); date = addDays(start, Number(f[0])); }
    else { if (!/^\d{8}$/.test(f[0])) throw new Error(`export line ${i + 1}: the date "${f[0]}" is not YYYYMMDD.`); date = isoOf(f[0]); }
    const values = {};
    metrics.forEach((m, k) => {
      const v = Number(String(f[k + 1] ?? '').replace(/,/g, ''));
      if (!Number.isFinite(v)) throw new Error(`export line ${i + 1}: ${head[k + 1]} "${f[k + 1]}" is not a number.`);
      values[m] = v;
    });
    rows.push({ date, values });
  }
  if (!rows.length) throw new Error('the export has no rows.');
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (let k = 1; k < rows.length; k++) if (rows[k].date === rows[k - 1].date) throw new Error(`the export has ${rows[k].date} twice (export one date range, not a comparison).`);
  return { metrics, rows: fillDays(rows, metrics, rows[0].date, rows[rows.length - 1].date) };
}

export async function main(argv, { env = process.env, out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s), fetchImpl = globalThis.fetch, now = () => Date.now(), sleep } = {}) {
  let outPath = null, property = null, days = 480, refetch = 4, lag = 1, exportPath = null, metrics = DEFAULT_METRICS;
  const whole = (s, name, min) => { const v = Number(s); if (!Number.isInteger(v) || v < min) throw new Error(`${name} takes a whole number of ${min} or more.`); return v; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { out(USAGE + '\n'); return 0; }
    else if (a === '--out') outPath = argv[++i];
    else if (a === '--property') property = propertyId(argv[++i]);
    else if (a === '--metrics') metrics = parseMetrics(argv[++i]);
    else if (a === '--days') days = whole(argv[++i], '--days', 1);
    else if (a === '--refetch') refetch = whole(argv[++i], '--refetch', 0);
    else if (a === '--lag') lag = whole(argv[++i], '--lag', 0);
    else if (a === '--from-export') exportPath = argv[++i];
    else throw new Error(`Unknown option ${a} (see --help).`);
  }
  if (!outPath) throw new Error('Give --out <file.csv> (see --help).');
  const write = async (rows, ms) => { if (outPath.includes('/')) await mkdir(dirname(outPath), { recursive: true }); await writeFile(outPath, toCsv(rows, ms)); };

  if (exportPath) {
    const { metrics: ms, rows } = fromExport(await readFile(exportPath, 'utf8'));
    await write(rows, ms);
    out(`${outPath}: ${rows.length} days, ${rows[0].date} to ${rows[rows.length - 1].date}, columns ${ms.join(', ')}, from the Analytics export.\n`);
    return 0;
  }
  if (!property) throw new Error('Give --property <numeric ID> (Admin > Property details), or --from-export <report.csv>.');

  const { api, tokenUrl } = endpoints(env);
  // The newest day asked for is "lagdaysAgo" in the property's zone. Our own clock (UTC) only bounds the oldest day
  // asked for; a day or so either way is harmless, since the rows carry their dates.
  const todayUtc = new Date(now()).toISOString().slice(0, 10);
  let kept = [];
  let startDate = addDays(todayUtc, -days);
  if (existsSync(outPath)) {
    const prev = readExisting(await readFile(outPath, 'utf8'), metrics);
    if (prev && prev.length) {
      kept = prev.filter((r) => r.date < addDays(prev[prev.length - 1].date, 1 - refetch));
      startDate = kept.length ? addDays(kept[kept.length - 1].date, 1) : prev[0].date;
    } else if (prev === null) err(`${outPath} has other columns than this run writes; fetching ${days} days afresh.\n`);
  }
  if (startDate > addDays(todayUtc, 1 - lag)) { err(`${outPath} is already up to date.\n`); return 0; }
  const sl = sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const token = await accessToken(env, { tokenUrl, fetchImpl, sleep: sl, nowSec: Math.floor(now() / 1000) });
  const { rows, thresholded, sampled } = await runReport({ api, token, property, metrics, startDate, endDate: lag === 0 ? 'today' : `${lag}daysAgo`, fetchImpl, sleep: sl });
  const to = rows.reduce((m, r) => (r.date > m ? r.date : m), '');
  if (!to || to < startDate) { err(`Google Analytics has no day from ${startDate} yet; ${outPath} left as it was.\n`); return 0; }
  const fresh = fillDays(rows, metrics, startDate, to);
  const all = [...kept, ...fresh];
  await write(all, metrics);
  const first = metrics[0];
  out(`${outPath}: ${all.length} days to ${to} (${fresh.length} fetched, ${fresh.reduce((s, r) => s + r.values[first], 0)} ${first}), property ${property}.\n`);
  if (thresholded) err('Note: Google Analytics applied thresholding to this report (Google signals is on), so small daily counts may be withheld; a watch on them can mistake withheld days for a fall.\n');
  if (sampled) err('Note: Google Analytics sampled this report; daily values are estimates.\n');
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { process.stderr.write(`${e.message}\n`); process.exit(2); });
}
