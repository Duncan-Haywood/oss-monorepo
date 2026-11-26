// Page-load timing in a real browser, for the before and after of a perf change: what
// a visitor on a phone waits for, not what the main thread does (longtask.mjs) or how
// smoothly it draws (framerate.mjs).
//
// It serves a built site the way the live one answers (platform/perf/revalidate-serve.mjs:
// max-age=0 + ETag, gzip, a fixed delay per request for the round trip), loads each page
// N times in Chromium with the CPU slowed, interleaving the pages run by run (A, B, A, B)
// so drift hits each alike, and prints the medians of: first byte, first contentful
// paint, DOMContentLoaded, load, largest contentful paint, blocking time (long tasks over
// 50 ms), and the requests and bytes the load made.
//
//   node platform/pages/build.mjs --out=platform/pages/dist      # or --only=<slug>
//   node platform/pages/page-bench.mjs --pages=shed-designer/,shed-designer/index-b.html
//   ... --runs=7 --cpu=4 --delay=60 --width=412 --height=915 --wait=1500
//   ... --delay=0 --latency=150 --down=1600   CDP network emulation instead (ms, kbit/s):
//       the method of docs/history/shift-roster-page-perf-2026-11-24.md and its successors
//   ... --repeat      a returning visitor: load once, then time the second load (304s)
//   ... --json        one JSON object per load instead of the table
//   DIST=<dir> picks the built site; BASE_URL=https://marisstella.app times the live
//   site instead (no local server, so --delay does not apply). Served locally, requests to
//   any other host are aborted, so analytics and fonts do not add noise.
//
// To A/B without rebuilding, copy the page next to itself in dist (index-b.html) and
// edit the copy: relative module paths stay valid.
//
// Why (2026-11-26): every page-perf run since 2026-11-24 wrote its own Playwright + CDP
// throttle script before it could take a before number (run records for PRs #19461 and
// the shift-roster, wall-framing-takeoff and ai-bookkeeper page passes in docs/history/;
// doc_friction on prompts/perf/prompt-0.md, item 4). This is that script, once.
//
// Exit codes: 0 measured, 2 nothing measured (bad arguments, no Playwright, a page that
// did not answer 200).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { median, blocking } from './longtask.mjs';
import { revalidateServer } from '../perf/revalidate-serve.mjs';
import { requirePlaywright } from './load-playwright.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

export const DEFAULTS = { runs: 7, cpu: 4, delay: 60, latency: 0, down: 0, width: 412, height: 915, wait: 1500, repeat: false, json: false };
export const METRICS = [
  ['ttfb', 'first byte'], ['fcp', 'FCP'], ['dcl', 'DOMContentLoaded'], ['load', 'load'],
  ['lcp', 'LCP'], ['block', 'blocking'], ['requests', 'requests'], ['kb', 'KB transferred'],
];

/** `--a=1 --flag` arguments over DEFAULTS; throws on an unknown or malformed one. */
export function parseArgs(argv) {
  const out = { ...DEFAULTS, pages: [] };
  for (const a of argv) {
    const m = /^--([a-z]+)(?:=(.*))?$/.exec(a);
    if (!m) throw new Error(`not an option: ${a}`);
    const [, k, v] = m;
    if (k === 'pages') out.pages = (v || '').split(',').filter(Boolean).map((p) => p.replace(/^\//, ''));
    else if (k === 'dist') out.dist = v;
    else if (typeof DEFAULTS[k] === 'boolean') out[k] = v === undefined || v === 'true' || v === '1';
    else if (typeof DEFAULTS[k] === 'number') {
      const n = Number(v);
      if (v === undefined || v === '' || !Number.isFinite(n) || n < 0) throw new Error(`--${k} needs a number, got ${v}`);
      out[k] = n;
    } else throw new Error(`unknown option --${k}`);
  }
  if (!out.pages.length) throw new Error('--pages=<page>[,<page>...] is required');
  if (out.runs < 1) throw new Error('--runs must be at least 1');
  return out;
}

/** Per-page medians of every metric, keeping each run's DCL so the spread is visible. */
export function summarise(rows, pages) {
  return pages.map((p) => {
    const r = rows.filter((x) => x.page === p);
    const s = { page: p, n: r.length, dclRuns: r.map((x) => Math.round(x.dcl)) };
    for (const [k] of METRICS) {
      const vals = r.map((x) => x[k]).filter((v) => typeof v === 'number' && Number.isFinite(v));
      s[k] = vals.length ? Math.round(median(vals)) : null;
    }
    return s;
  });
}

/** A Markdown table of summarise()'s output, ready for a docs/history note. */
export function table(summary, o) {
  const net = [o.base ? 'live site' : `${o.delay} ms/request`];
  if (o.latency || o.down) net.push(`network ${o.latency} ms${o.down ? `, ${o.down} kbit/s` : ''}`);
  const how = `cpu ${o.cpu}x, ${o.width}x${o.height}, ${net.join(', ')}, ${o.repeat ? 'repeat visit' : 'first visit'}, median of ${o.runs}`;
  const head = `| page (${how}) | ${METRICS.map(([k, l]) => (k === 'requests' || k === 'kb' ? l : `${l} ms`)).join(' | ')} | DOMContentLoaded, every run |`;
  const rule = `|${'---|'.repeat(METRICS.length + 2)}`;
  const body = summary.map((s) => `| /${s.page} | ${METRICS.map(([k]) => (s[k] === null ? 'n/a' : s[k])).join(' | ')} | ${s.dclRuns.join(', ')} |`);
  return [head, rule, ...body].join('\n');
}

// Runs in the page before any of its scripts: collect LCP and long tasks as they happen.
function observe() {
  window.__bench = { lcp: null, lt: [] };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__bench.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__bench.lt.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true }); } catch {}
}

function collect() {
  const nav = performance.getEntriesByType('navigation')[0];
  const fcp = performance.getEntriesByName('first-contentful-paint')[0];
  const res = performance.getEntriesByType('resource');
  const bytes = [nav, ...res].reduce((s, e) => s + (e?.transferSize || 0), 0);
  return {
    status: nav?.responseStatus ?? null,
    ttfb: nav?.responseStart, dcl: nav?.domContentLoadedEventEnd, load: nav?.loadEventEnd,
    fcp: fcp ? fcp.startTime : null, lcp: window.__bench.lcp, lt: window.__bench.lt,
    requests: 1 + res.length, kb: bytes / 1024,
  };
}

/** One timed load of `url`; with `repeat`, a warm-up load in the same context first. */
export async function timeLoad(browser, url, o) {
  const ctx = await browser.newContext({ viewport: { width: o.width, height: o.height } });
  try {
    const pg = await ctx.newPage();
    await pg.addInitScript(observe);
    const cdp = await ctx.newCDPSession(pg);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: o.cpu });
    if (o.latency || o.down) {
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: o.latency, downloadThroughput: o.down ? (o.down * 1024) / 8 : -1, uploadThroughput: -1 });
    }
    if (o.repeat) await pg.goto(url, { waitUntil: 'load' });
    const resp = await pg.goto(url, { waitUntil: 'load' });
    await pg.waitForTimeout(o.wait);
    const m = await pg.evaluate(collect);
    const status = m.status ?? resp?.status() ?? null;
    if (status !== null && status !== 200 && status !== 304) throw new Error(`${url} answered ${status}`);
    return { ttfb: m.ttfb, fcp: m.fcp, dcl: m.dcl, load: m.load, lcp: m.lcp, block: blocking(m.lt), requests: m.requests, kb: m.kb };
  } finally {
    await ctx.close();
  }
}

/** Every load, interleaved run by run. `base` set means time that host; else serve `dist`. */
export async function bench(o, { playwright, log = () => {} } = {}) {
  let server = null;
  let base = o.base;
  if (!base) {
    const dist = path.resolve(o.dist);
    if (!fs.existsSync(dist)) throw new Error(`${dist} does not exist: build the site first (node platform/pages/build.mjs --out=...)`);
    server = revalidateServer(dist, o.delay);
    await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
    base = `http://127.0.0.1:${server.address().port}`;
  }
  // Served locally, every other host fails to resolve. Not page.route(): Playwright turns
  // the HTTP cache off for a routed page, and --repeat would then never see a 304.
  const browser = await playwright.chromium.launch(server ? { args: ['--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1'] } : {});
  const rows = [];
  try {
    for (let i = 0; i < o.runs; i++) for (const page of o.pages) {
      const r = await timeLoad(browser, `${base.replace(/\/$/, '')}/${page}`, o);
      rows.push({ page, run: i + 1, ...r });
      log(`run ${i + 1}/${o.runs} /${page}: DOMContentLoaded ${Math.round(r.dcl)} ms`);
    }
  } finally {
    await browser.close();
    if (server) server.close();
  }
  return rows;
}

async function main() {
  let o;
  try {
    o = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`page-bench: ${err.message}\nusage: page-bench.mjs --pages=a/,a/index-b.html [--runs=7 --cpu=4 --delay=60 --repeat --json]`);
    process.exit(2);
  }
  o.dist = o.dist || process.env.DIST || path.join(here, 'dist');
  o.base = process.env.BASE_URL || null;
  const playwright = await requirePlaywright();
  let rows;
  try {
    rows = await bench(o, { playwright, log: (s) => console.error(s) });
  } catch (err) {
    console.error(`page-bench: ${err.message}`);
    process.exit(2);
  }
  if (o.json) for (const r of rows) console.log(JSON.stringify(r));
  else console.log(table(summarise(rows, o.pages), o));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
