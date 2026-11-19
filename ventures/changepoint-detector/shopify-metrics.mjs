#!/usr/bin/env node
// Turn your own Shopify store into a daily metrics CSV the watch can read: orders, revenue, cancelled orders and
// (optionally) new customers per day. Read-only, zero dependencies, runs wherever your token is (your laptop, your
// GitHub Actions); nothing passes through us.
//
//   SHOPIFY_SHOP=my-store SHOPIFY_ACCESS_TOKEN=shpat_... node shopify-metrics.mjs --out data/shopify.csv
//   node watch.mjs data/shopify.csv --state watch-state.json --columns orders:poisson,revenue,cancelled:poisson
//
// The token comes from a custom app in your own store: Shopify admin > Settings > Apps and sales channels > Develop
// apps > Create an app > Admin API scopes: read_orders (read_all_orders for history older than 60 days;
// read_customers for --customers) > Install > reveal the Admin API access token once.
//
// Statistical analysis of data you supply, not advice. MIT licence.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
// csvCell is the shared spreadsheet formula-injection guard (cells starting =, +, -, @, tab or CR get an apostrophe).
import { dayOf, dayStart, minorUnits, csvCell } from './stripe-metrics.mjs';

export const API_VERSION = '2025-01';

/** The store's Admin GraphQL endpoint. Only a *.myshopify.com host (or, for tests, a loopback address) is taken,
 * so a mistyped or planted value can never send the token to another host. */
export function endpoint(env = {}) {
  const b = env.SHOPIFY_API_BASE;
  if (b) {
    if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/[\w/.-]*)?$/.test(b)) throw new Error('SHOPIFY_API_BASE takes only a loopback address (http://127.0.0.1:port), for tests.');
    return `${b.replace(/\/$/, '')}/admin/api/${API_VERSION}/graphql.json`;
  }
  const raw = String(env.SHOPIFY_SHOP ?? '').trim().toLowerCase().replace(/^https:\/\//, '').replace(/\/.*$/, '');
  if (!raw) throw new Error('Set SHOPIFY_SHOP to your store\'s name (my-store, or my-store.myshopify.com).');
  const host = raw.endsWith('.myshopify.com') ? raw : `${raw}.myshopify.com`;
  if (!/^[a-z0-9][a-z0-9-]{0,62}\.myshopify\.com$/.test(host)) throw new Error(`SHOPIFY_SHOP must be the store's myshopify.com name (my-store or my-store.myshopify.com), not "${raw}". A custom domain will not work here.`);
  return `https://${host}/admin/api/${API_VERSION}/graphql.json`;
}

const USAGE = `Make a daily metrics CSV from your own Shopify store, for the watch (node watch.mjs).

Usage:
  SHOPIFY_SHOP=my-store SHOPIFY_ACCESS_TOKEN=shpat_... node shopify-metrics.mjs --out <file.csv> [options]

Options:
  --out <file>          the CSV to write (date,orders,revenue,cancelled[,new_customers]); an existing one is extended:
                        its last --refetch days are fetched again (late cancellations), the rest kept
  --days <n>            how many complete days to fetch when there is no CSV yet (default: 400; without the
                        read_all_orders scope Shopify returns only the last 60 days of orders)
  --refetch <n>         days at the end of an existing CSV to fetch again (default: 3)
  --utc-offset <hours>  where your day starts, e.g. -5 for New York in winter, 1 for Paris (default: 0, UTC)
  --customers           also count new customers per day (needs the read_customers scope)
  --include-test        count test orders too (left out by default)
  --token-env <NAME>    the environment variable holding the token (default: SHOPIFY_ACCESS_TOKEN)
  -h, --help            this help

Only complete days are written: today (in your --utc-offset) is left out, so a half day never reads as a fall.
Days with no orders are written as 0. orders and revenue count orders placed that day and not cancelled since;
revenue is their total price (after discounts, with tax and shipping) in the store's own currency; refunds are not
subtracted. cancelled counts orders placed that day that have been cancelled.

Keep the CSV and watch-state.json in a private repository: they show your revenue.`;

const addDays = (day, k) => new Date(Date.parse(`${day}T00:00:00Z`) + k * 86400000).toISOString().slice(0, 10);
const iso = (unix) => new Date(unix * 1000).toISOString().replace(/\.000Z$/, 'Z');

const QUERIES = {
  orders: `query Orders($first: Int!, $after: String, $q: String!) {
  orders(first: $first, after: $after, query: $q, sortKey: CREATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes { id createdAt cancelledAt test totalPriceSet { shopMoney { amount currencyCode } } }
  }
}`,
  customers: `query Customers($first: Int!, $after: String, $q: String!) {
  customers(first: $first, after: $after, query: $q, sortKey: CREATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes { id createdAt }
  }
}`,
};
const SCOPE = { orders: 'read_orders', customers: 'read_customers' };

/**
 * Every order (or customer) created in [gte, lt) unix seconds, following pageInfo cursors. Retries HTTP 429/5xx and
 * GraphQL THROTTLED answers (Shopify's cost-based rate limit answers 200 with that error code) with backoff.
 */
export async function listAll(kind, { token, url, gte, lt, fetchImpl = globalThis.fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), maxPages = 10000, onPage = null } = {}) {
  const out = [];
  let after = null;
  const q = `created_at:>='${iso(gte)}' AND created_at:<'${iso(lt)}'`;
  for (let page = 0; page < maxPages; page++) {
    const payload = JSON.stringify({ query: QUERIES[kind], variables: { first: 250, after, q } });
    let r, body;
    for (let attempt = 0; ; attempt++) {
      r = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-shopify-access-token': token }, body: payload });
      try { body = await r.json(); } catch { body = null; }
      const throttled = r.ok && Array.isArray(body?.errors) && body.errors.some((e) => e?.extensions?.code === 'THROTTLED');
      if ((r.status === 429 || r.status >= 500 || throttled) && attempt < 6) { await sleep(1000 * 2 ** attempt); continue; }
      break;
    }
    if (!r.ok) {
      const msg = typeof body?.errors === 'string' ? `: ${body.errors}` : '';
      if (r.status === 401) throw new Error(`Shopify refused the access token (401)${msg}. Check the token in the environment variable.`);
      if (r.status === 403) throw new Error(`Shopify answered 403${msg}. The app needs the ${SCOPE[kind]} scope.`);
      if (r.status === 404) throw new Error('Shopify answered 404: check SHOPIFY_SHOP is the store\'s myshopify.com name.');
      throw new Error(`Shopify answered ${r.status} for ${kind}${msg}.`);
    }
    if (Array.isArray(body?.errors) && body.errors.length) {
      const e = body.errors[0];
      if (e?.extensions?.code === 'ACCESS_DENIED') throw new Error(`Shopify denied access to ${kind}: the app needs the ${SCOPE[kind]} scope.`);
      throw new Error(`Shopify answered an error for ${kind}: ${e?.message ?? 'unknown'}.`);
    }
    const conn = body?.data?.[kind];
    if (!conn || !Array.isArray(conn.nodes)) throw new Error(`Shopify's answer for ${kind} had no list.`);
    out.push(...conn.nodes);
    if (onPage) onPage(out.length);
    if (!conn.pageInfo?.hasNextPage || !conn.nodes.length) return out;
    after = conn.pageInfo.endCursor;
  }
  throw new Error(`Stopped after ${maxPages} pages of ${kind}; narrow --days.`);
}

/** A decimal money string ("12.5", "1999.00") as an integer number of thousandths, exactly. */
export function thousandths(amount) {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(amount).trim());
  if (!m) throw new Error(`Not an amount: ${amount}`);
  const frac = (m[3] ?? '').padEnd(4, '0');
  const v = Number(m[2]) * 1000 + Number(frac.slice(0, 3)) + (Number(frac[3]) >= 5 ? 1 : 0);
  return m[1] ? -v : v;
}

const unixOf = (isoTime) => Math.floor(Date.parse(isoTime) / 1000);

/**
 * Daily rows from orders (and customers) for every day in [from, to], zeros where nothing happened.
 * orders: placed that day, not cancelled, not test orders; revenue: their total in the store's currency, major units;
 * cancelled: placed that day and since cancelled.
 */
export function dailyRows({ orders, customers = null, from, to, offsetHours = 0, includeTest = false }) {
  const rows = new Map();
  for (let d = from; d <= to; d = addDays(d, 1)) rows.set(d, { date: d, orders: 0, revenue: 0, cancelled: 0, ...(customers ? { new_customers: 0 } : {}) });
  const currencies = new Map();
  let tests = 0;
  for (const o of orders) {
    if (o.test && !includeTest) { tests++; continue; }
    const row = rows.get(dayOf(unixOf(o.createdAt), offsetHours));
    if (!row) continue;
    if (o.cancelledAt) { row.cancelled++; continue; }
    row.orders++;
    const money = o.totalPriceSet?.shopMoney;
    if (money) {
      row.revenue += thousandths(money.amount);
      currencies.set(money.currencyCode, (currencies.get(money.currencyCode) || 0) + 1);
    }
  }
  if (customers) for (const k of customers) { const row = rows.get(dayOf(unixOf(k.createdAt), offsetHours)); if (row) row.new_customers++; }
  // shopMoney is always the store's own currency, so there is one; if the store changed currency mid-window, the
  // most common one names the column and the caller says so.
  const currency = [...currencies].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? null;
  const dec = Math.round(Math.log10(minorUnits(String(currency ?? 'usd').toLowerCase())));
  const list = [...rows.values()].map((r) => ({ ...r, revenue: (r.revenue / 1000).toFixed(dec) }));
  return { rows: list, currency, currencies: currencies.size, tests };
}

export const header = (customers) => ['date', 'orders', 'revenue', 'cancelled', ...(customers ? ['new_customers'] : [])].join(',');
export const toCsv = (rows, customers) => [header(customers), ...rows.map((r) => [r.date, r.orders, r.revenue, r.cancelled, ...(customers ? [r.new_customers] : [])].map(csvCell).join(','))].join('\n') + '\n';

/** The rows of an earlier CSV this tool wrote, or null when its header is not the one wanted (then fetch afresh). */
export function readExisting(text, customers) {
  const lines = String(text).split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length || lines[0].trim() !== header(customers)) return null;
  return lines.slice(1).map((l) => {
    const [date, orders, revenue, cancelled, nc] = l.split(',');
    return { date, orders: Number(orders), revenue, cancelled: Number(cancelled), ...(customers ? { new_customers: Number(nc) } : {}) };
  }).filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date));
}

export async function main(argv, { env = process.env, out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s), fetchImpl = globalThis.fetch, now = () => Date.now(), sleep } = {}) {
  let outPath = null, days = 400, refetch = 3, offset = 0, customers = false, includeTest = false, tokenEnv = 'SHOPIFY_ACCESS_TOKEN';
  const whole = (s, name, min) => { const v = Number(s); if (!Number.isInteger(v) || v < min) throw new Error(`${name} takes a whole number of ${min} or more.`); return v; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { out(USAGE + '\n'); return 0; }
    else if (a === '--out') outPath = argv[++i];
    else if (a === '--days') days = whole(argv[++i], '--days', 1);
    else if (a === '--refetch') refetch = whole(argv[++i], '--refetch', 0);
    else if (a === '--utc-offset') { offset = Number(argv[++i]); if (!Number.isFinite(offset) || offset < -12 || offset > 14 || (offset * 4) % 1) throw new Error('--utc-offset takes hours from -12 to 14 (quarter hours allowed, e.g. 5.5).'); }
    else if (a === '--customers') customers = true;
    else if (a === '--include-test') includeTest = true;
    else if (a === '--token-env') tokenEnv = argv[++i];
    else throw new Error(`Unknown option ${a} (see --help).`);
  }
  if (!outPath) throw new Error('Give --out <file.csv> (see --help).');
  const token = env[tokenEnv];
  if (!token) throw new Error(`Set ${tokenEnv} to the Admin API access token of a custom app in your store (scope read_orders).`);
  if (/^shpss_/.test(token)) throw new Error(`${tokenEnv} holds an app's shared secret (shpss_...); the API needs the Admin API access token (shpat_...).`);
  const url = endpoint(env);

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
  const orders = await listAll('orders', { token, url, gte, lt, fetchImpl, sleep, onPage: progress('orders') });
  const custs = customers ? await listAll('customers', { token, url, gte, lt, fetchImpl, sleep, onPage: progress('customers') }) : null;
  const { rows, currency, currencies, tests } = dailyRows({ orders, customers: custs, from, to, offsetHours: offset, includeTest });
  const all = [...kept, ...rows];
  if (outPath.includes('/')) await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, toCsv(all, customers));
  out(`${outPath}: ${all.length} days to ${to} (${rows.length} fetched: ${orders.length} orders${custs ? `, ${custs.length} customers` : ''})${currency ? `, revenue in ${currency}` : ''}.\n`);
  if (tests) out(`${tests} test order${tests === 1 ? '' : 's'} left out (--include-test counts them).\n`);
  if (currencies > 1) out('The store\'s currency changed inside this window: revenue before and after the change is in different units.\n');
  // Without read_all_orders Shopify silently returns only the last 60 days. Say so when a long first fetch came
  // back with nothing older, so a short history is not mistaken for a new store.
  const sixty = dayStart(addDays(today, -60), offset);
  if (!kept.length && days > 61 && orders.length && orders.every((o) => unixOf(o.createdAt) >= sixty)) {
    out('No order older than 60 days came back. If the store is older than that, add the read_all_orders scope to the app (Shopify returns only the last 60 days without it).\n');
  }
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { process.stderr.write(`${e.message}\n`); process.exit(2); });
}
