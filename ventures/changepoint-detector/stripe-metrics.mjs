#!/usr/bin/env node
// Turn your own Stripe account into a daily metrics CSV the watch can read: payments, revenue, failed payments and
// (optionally) new customers per day. Read-only, zero dependencies, runs wherever your key is (your laptop, your
// GitHub Actions); nothing passes through us.
//
//   STRIPE_API_KEY=rk_live_... node stripe-metrics.mjs --out data/stripe.csv --days 400
//   node watch.mjs data/stripe.csv --state watch-state.json --columns payments:poisson,revenue,failed:poisson
//
// Use a restricted key with read access to Charges (and Customers for --customers) only:
// Stripe Dashboard > Developers > API keys > Create restricted key.
//
// Statistical analysis of data you supply, not advice. FSL-1.1-MIT licence.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const API = 'https://api.stripe.com/v1';
// STRIPE_API_BASE points the tool at a local stand-in for Stripe (tests, the workflow replay). Only a loopback
// http address is taken, so a mistyped or planted value can never send the key to another host.
export function apiBase(env = {}) {
  const b = env.STRIPE_API_BASE;
  if (!b) return API;
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/[\w/-]*)?$/.test(b)) throw new Error('STRIPE_API_BASE takes only a loopback address (http://127.0.0.1:port), for tests.');
  return b.replace(/\/$/, '');
}

// Stripe amounts are integers in the currency's smallest unit. Zero-decimal and three-decimal currencies, from
// Stripe's "Supported currencies" documentation (docs.stripe.com/currencies).
const ZERO_DECIMAL = new Set(['bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf']);
const THREE_DECIMAL = new Set(['bhd', 'jod', 'kwd', 'omr', 'tnd']);
export const minorUnits = (cur) => (ZERO_DECIMAL.has(cur) ? 1 : THREE_DECIMAL.has(cur) ? 1000 : 100);

const USAGE = `Make a daily metrics CSV from your own Stripe account, for the watch (node watch.mjs).

Usage:
  STRIPE_API_KEY=rk_live_... node stripe-metrics.mjs --out <file.csv> [options]

Options:
  --out <file>          the CSV to write (date,payments,revenue,failed[,new_customers]); an existing one is extended:
                        its last --refetch days are fetched again (late captures and failures), the rest kept
  --days <n>            how many complete days to fetch when there is no CSV yet (default: 400)
  --refetch <n>         days at the end of an existing CSV to fetch again (default: 3)
  --currency <code>     the currency summed into revenue (default: the one most payments use); payments in others
                        are still counted in payments and failed, and their number is printed
  --time-zone <name>    where your day starts, as a time zone name, e.g. America/New_York (follows daylight saving)
  --utc-offset <hours>  or as a fixed offset, e.g. 5.5 for India (default: UTC)
  --customers           also count new customers per day (needs read access to Customers)
  --key-env <NAME>      the environment variable holding the key (default: STRIPE_API_KEY)
  -h, --help            this help

Only complete days are written: today (in your time zone) is left out, so a half-day never reads as a fall.
Days with no payments are written as 0, so a quiet day counts. Revenue is the gross amount of succeeded payments by
the day they were made, in major units (dollars, not cents); refunds are not subtracted.

Keep the CSV and watch-state.json in a private repository: they show your revenue.`;

// A "zone" is either a fixed UTC offset in hours (-5, 5.5) or an IANA time zone name ("America/New_York"). A name
// follows daylight saving, so a store in New York gets its days from its own midnight all year, not an hour off for
// half of it (a fixed -5 is right in winter only).
const zoneFormat = new Map();
function localDay(unix, name) {
  let f = zoneFormat.get(name);
  if (!f) { f = new Intl.DateTimeFormat('en-CA', { timeZone: name, year: 'numeric', month: '2-digit', day: '2-digit' }); zoneFormat.set(name, f); }
  const p = Object.fromEntries(f.formatToParts(new Date(unix * 1000)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

/** An IANA time zone name as given, or an error naming the option; Intl is the arbiter of what exists. */
export function checkZone(name, option = '--time-zone') {
  const z = String(name ?? '').trim();
  try { if (!z) throw 0; new Intl.DateTimeFormat('en', { timeZone: z }); } catch { throw new Error(`${option} takes a time zone name such as America/New_York or Europe/Paris, not "${z}".`); }
  return z;
}

/** One day as YYYY-MM-DD, for a unix time and a zone (UTC offset in hours, or an IANA name). */
export function dayOf(unix, zone = 0) {
  if (typeof zone === 'string') return localDay(unix, zone);
  return new Date((unix + zone * 3600) * 1000).toISOString().slice(0, 10);
}
/** The unix time a day starts at, for a YYYY-MM-DD and a zone: the first second whose local date is that day (so a
 * zone whose clocks skip midnight starts the day at 01:00). */
export function dayStart(day, zone = 0) {
  const utc = Date.parse(`${day}T00:00:00Z`) / 1000;
  if (typeof zone !== 'string') return utc - zone * 3600;
  // Local dates only move forward with time, and every zone sits within UTC-12..UTC+14: search that window.
  let lo = utc - 15 * 3600, hi = utc + 13 * 3600;
  while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (localDay(mid, zone) >= day) hi = mid; else lo = mid; }
  return hi;
}
const addDays = (day, k) => new Date(Date.parse(`${day}T00:00:00Z`) + k * 86400000).toISOString().slice(0, 10);

/**
 * Every object of a Stripe list endpoint created in [gte, lt), following has_more / starting_after.
 * Retries 429 and 5xx with backoff (Stripe's documented advice for rate limits).
 */
export async function listAll(path, { key, api = API, gte, lt, fetchImpl = globalThis.fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), maxPages = 10000, onPage = null } = {}) {
  const out = [];
  let after = null;
  for (let page = 0; page < maxPages; page++) {
    const q = new URLSearchParams({ limit: '100', 'created[gte]': String(gte), 'created[lt]': String(lt) });
    if (after) q.set('starting_after', after);
    // A GET to Stripe's list API from the deployer's runner: Stripe takes these filters only as a query string. Not a
    // share link (platform/privacy/share-location.mjs guards those), and nothing of the visitor's is in it.
    const url = [api + path, q.toString()].join('?');
    let r, body;
    for (let attempt = 0; ; attempt++) {
      r = await fetchImpl(url, { headers: { authorization: `Bearer ${key}`, 'stripe-version': '2024-06-20' } });
      if ((r.status === 429 || r.status >= 500) && attempt < 5) { await sleep(1000 * 2 ** attempt); continue; }
      break;
    }
    try { body = await r.json(); } catch { body = null; }
    if (!r.ok) {
      const msg = body?.error?.message ? `: ${body.error.message}` : '';
      if (r.status === 401) throw new Error(`Stripe refused the key (401)${msg}. Check the key in the environment variable.`);
      if (r.status === 403) throw new Error(`Stripe answered 403${msg}. A restricted key needs read access to ${path.slice(1)}.`);
      throw new Error(`Stripe answered ${r.status} for ${path}${msg}.`);
    }
    if (!body || !Array.isArray(body.data)) throw new Error(`Stripe's answer for ${path} had no data list.`);
    out.push(...body.data);
    if (onPage) onPage(out.length);
    if (!body.has_more || !body.data.length) return out;
    after = body.data[body.data.length - 1].id;
  }
  throw new Error(`Stopped after ${maxPages} pages of ${path}; narrow --days.`);
}

/** The currency most charges use (ties: alphabetical, so the answer does not depend on order). */
export function mainCurrency(charges) {
  const n = new Map();
  for (const c of charges) n.set(c.currency, (n.get(c.currency) || 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? null;
}

/**
 * Daily rows from charges (and customers) for every day in [from, to], zeros where nothing happened.
 * payments: succeeded charges (any currency); revenue: their gross amount in `currency`, major units;
 * failed: charges with status failed (a declined card, a failed bank debit).
 */
export function dailyRows({ charges, customers = null, from, to, offsetHours = 0, currency }) {
  const rows = new Map();
  for (let d = from; d <= to; d = addDays(d, 1)) rows.set(d, { date: d, payments: 0, revenue: 0, failed: 0, ...(customers ? { new_customers: 0 } : {}) });
  let otherCurrency = 0;
  for (const c of charges) {
    const row = rows.get(dayOf(c.created, offsetHours));
    if (!row) continue;
    if (c.status === 'failed') { row.failed++; continue; }
    if (c.status !== 'succeeded') continue; // pending: counted once it settles, on a later run's refetch
    row.payments++;
    if (c.currency === currency) row.revenue += c.amount; // minor units until the end, so sums stay exact
    else otherCurrency++;
  }
  if (customers) for (const k of customers) { const row = rows.get(dayOf(k.created, offsetHours)); if (row) row.new_customers++; }
  const unit = minorUnits(currency);
  const dec = Math.round(Math.log10(unit));
  const list = [...rows.values()].map((r) => ({ ...r, revenue: (r.revenue / unit).toFixed(dec) }));
  return { rows: list, otherCurrency };
}

// Every cell is a date or a number we computed, but the file is opened in spreadsheets, so guard against formula
// injection anyway: a cell starting =, +, -, @, tab or CR that is not a plain number gets an apostrophe.
export const csvCell = (v) => { const t = String(v); return /^[=+\-@\t\r]/.test(t) && !/^-?\d+(\.\d+)?$/.test(t) ? `'${t}` : t; };
export const header = (customers) => ['date', 'payments', 'revenue', 'failed', ...(customers ? ['new_customers'] : [])].join(',');
export const toCsv = (rows, customers) => [header(customers), ...rows.map((r) => [r.date, r.payments, r.revenue, r.failed, ...(customers ? [r.new_customers] : [])].map(csvCell).join(','))].join('\n') + '\n';

/** The rows of an earlier CSV this tool wrote, or null when its header is not the one wanted (then fetch afresh). */
export function readExisting(text, customers) {
  const lines = String(text).split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length || lines[0].trim() !== header(customers)) return null;
  return lines.slice(1).map((l) => {
    const [date, payments, revenue, failed, nc] = l.split(',');
    return { date, payments: Number(payments), revenue, failed: Number(failed), ...(customers ? { new_customers: Number(nc) } : {}) };
  }).filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date));
}

export async function main(argv, { env = process.env, out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s), fetchImpl = globalThis.fetch, now = () => Date.now(), sleep } = {}) {
  let outPath = null, days = 400, refetch = 3, currency = null, offset = 0, customers = false, keyEnv = 'STRIPE_API_KEY';
  const whole = (s, name, min) => { const v = Number(s); if (!Number.isInteger(v) || v < min) throw new Error(`${name} takes a whole number of ${min} or more.`); return v; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { out(USAGE + '\n'); return 0; }
    else if (a === '--out') outPath = argv[++i];
    else if (a === '--days') days = whole(argv[++i], '--days', 1);
    else if (a === '--refetch') refetch = whole(argv[++i], '--refetch', 0);
    else if (a === '--currency') { currency = String(argv[++i] ?? '').toLowerCase(); if (!/^[a-z]{3}$/.test(currency)) throw new Error('--currency takes a three-letter code, e.g. usd.'); }
    else if (a === '--utc-offset') { offset = Number(argv[++i]); if (!Number.isFinite(offset) || offset < -12 || offset > 14 || (offset * 4) % 1) throw new Error('--utc-offset takes hours from -12 to 14 (quarter hours allowed, e.g. 5.5).'); }
    else if (a === '--time-zone') offset = checkZone(argv[++i]);
    else if (a === '--customers') customers = true;
    else if (a === '--key-env') keyEnv = argv[++i];
    else throw new Error(`Unknown option ${a} (see --help).`);
  }
  if (!outPath) throw new Error('Give --out <file.csv> (see --help).');
  const key = env[keyEnv];
  if (!key) throw new Error(`Set ${keyEnv} to a Stripe key (a restricted key with read access to Charges is enough).`);
  if (/^pk_/.test(key)) throw new Error(`${keyEnv} holds a publishable key (pk_...); the API needs a secret or restricted key (sk_ or rk_).`);

  const api = apiBase(env);
  const today = dayOf(Math.floor(now() / 1000), offset);
  const to = addDays(today, -1); // the last complete day
  let kept = [];
  let from = addDays(today, -days);
  if (existsSync(outPath)) {
    const prev = readExisting(await readFile(outPath, 'utf8'), customers);
    if (prev && prev.length) {
      kept = prev.filter((r) => r.date < addDays(prev[prev.length - 1].date, 1 - refetch));
      from = kept.length ? addDays(kept[kept.length - 1].date, 1) : prev[0].date;
    } else if (prev === null) err(`${outPath} has other columns than this run writes; fetching ${days} days afresh.\n`);
  }
  if (from > to) { err(`${outPath} is already up to ${to}.\n`); return 0; }
  const gte = dayStart(from, offset), lt = dayStart(today, offset);
  const progress = (what) => (n) => { if (n % 1000 === 0) err(`  ${n} ${what} so far\n`); };
  const charges = await listAll('/charges', { key, api, gte, lt, fetchImpl, sleep, onPage: progress('charges') });
  const custs = customers ? await listAll('/customers', { key, api, gte, lt, fetchImpl, sleep, onPage: progress('customers') }) : null;
  let earlier = null;
  if (kept.length && existsSync(`${outPath}.currency`)) { const t = (await readFile(`${outPath}.currency`, 'utf8')).trim(); if (/^[a-z]{3}$/.test(t)) earlier = t; }
  if (currency && earlier && currency !== earlier) throw new Error(`${outPath} sums ${earlier.toUpperCase()}; delete it (and ${outPath}.currency) to switch to ${currency.toUpperCase()}.`);
  const cur = currency || earlier || mainCurrency(charges) || 'usd';
  const { rows, otherCurrency } = dailyRows({ charges, customers: custs, from, to, offsetHours: offset, currency: cur });
  const all = [...kept, ...rows];
  if (outPath.includes('/')) await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, toCsv(all, customers));
  await writeFile(`${outPath}.currency`, `${cur}\n`);
  out(`${outPath}: ${all.length} days to ${to} (${rows.length} fetched: ${charges.length} charges${custs ? `, ${custs.length} customers` : ''}), revenue in ${cur.toUpperCase()}.\n`);
  if (otherCurrency) out(`${otherCurrency} succeeded payment${otherCurrency === 1 ? '' : 's'} in other currencies counted in payments, not in revenue (--currency picks which one is summed).\n`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { process.stderr.write(`${e.message}\n`); process.exit(2); });
}
