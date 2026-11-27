#!/usr/bin/env node
// Walk the live sign-up funnel of each paid product that is open to the public, the way a
// visitor would: from a free front-door page, through its "Start free" link, to the app's
// sign-up form, at desktop and phone width. It creates no account and submits nothing.
//
//   node platform/ci/live_funnel_check.mjs            # every product in FUNNELS
//   node platform/ci/live_funnel_check.mjs --only payapps --json
//
// Exit 0 when every check passes, 1 when one fails, 2 when the browser could not start, 3 when
// nothing failed but a host could not be reached from this machine at all (a proxy refusing the
// CONNECT, DNS that does not resolve: cloud sessions' allowlists block marisstella.app). An
// unreachable host says nothing about the site, so it is reported as SKIP, never as FAIL.
// Needs Playwright (pre-installed in cloud sessions). Read-only: GET requests only.
//
// Why: the deploy workflows check /api/health, which stays green when the page a visitor sees is
// broken (a JS error, a sign-up form that never opens, a stale "in development" title, a front
// door whose link points at the wrong place). This checks what a customer gets.

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

/** The paid products whose sign-up is open, with the free pages that send visitors to them. */
export const FUNNELS = [
  {
    app: 'payapps',
    base: 'https://payapps.marisstella.app',
    signupPath: '/?signup',
    frontDoors: [
      'https://marisstella.app/pay-app-guides/',
      'https://marisstella.app/industries/construction/',
    ],
  },
  {
    app: 'seller-books',
    base: 'https://seller-books.marisstella.app',
    signupPath: '/signup',
    frontDoors: [],
  },
  {
    // Live since jobshop-quote-deploy run 46013246899 (2026-11-27), free Early access plan.
    app: 'jobshop-quote',
    base: 'https://jobshop-quote.marisstella.app',
    signupPath: '/sign-up',
    frontDoors: ['https://marisstella.app/industries/manufacturing/'],
  },
];

/** Responses a signed-out visitor is expected to get: the session probe answers 401. */
export const EXPECTED_FAILURES = [/\/api\/me$/, /\/api\/auth\/get-session$/];

/** Browser and Node errors that mean this machine never reached the host, not that the site is broken. */
export const UNREACHABLE = /ERR_TUNNEL_CONNECTION_FAILED|ERR_PROXY_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|ERR_NETWORK_ACCESS_DENIED|ENOTFOUND|EAI_AGAIN/;

/** True when an error message says the host was never reached. */
export function isUnreachable(message) {
  return UNREACHABLE.test(String(message ?? ''));
}

/**
 * Sort one funnel's problems: FAIL when any is a real finding, SKIP when every one is an
 * unreachable host, ok when there are none.
 * @param {{text: string, unreachable?: boolean}[]} found
 */
export function verdict(found) {
  if (!found.length) return 'ok';
  return found.every((p) => p.unreachable) ? 'skip' : 'fail';
}

const STALE_TITLE = /in development|coming soon|untitled|vite \+|react app/i;

/**
 * Judge one page visit. Pure, so it is unit-tested without a browser.
 * @param {object} v what the browser saw
 * @returns {string[]} problems, empty when the page passed
 */
export function judgeAppPage(v) {
  const out = [];
  if (v.status !== 200) out.push(`answered ${v.status}`);
  if (!v.title?.trim()) out.push('no <title>');
  else if (STALE_TITLE.test(v.title)) out.push(`title reads "${v.title}"`);
  if (!v.description?.trim()) out.push('no meta description');
  if (!v.hasEmail) out.push('no visible email field');
  if (!v.hasPassword) out.push('no visible password field');
  if (!/sign ?up|create|start/i.test(v.submitText ?? '')) {
    out.push(`the form opens on "${v.submitText ?? 'no submit button'}", not sign-up`);
  }
  if (v.scrollWidth > v.viewportWidth + 1) {
    out.push(`scrolls sideways at ${v.viewportWidth}px (${v.scrollWidth}px wide)`);
  }
  for (const e of v.pageErrors ?? []) out.push(`script error: ${e}`);
  for (const r of v.badResponses ?? []) {
    if (!EXPECTED_FAILURES.some((re) => re.test(r.url.split('?')[0]))) out.push(`${r.status} ${r.url}`);
  }
  for (const l of v.legal ?? []) if (l.status !== 200) out.push(`legal page ${l.href} answered ${l.status}`);
  if ((v.legal ?? []).length < 2) out.push('fewer than two legal links (terms, privacy) on the sign-up page');
  return out;
}

/**
 * Judge a front-door page: it answers 200 and links to the app's sign-up.
 * @returns {string[]}
 */
export function judgeFrontDoor(fd, funnel) {
  if (fd.status !== 200) return [`front door ${fd.url} answered ${fd.status}`];
  const host = new URL(funnel.base).host;
  const toApp = fd.links.filter((h) => {
    try { return new URL(h, fd.url).host === host; } catch { return false; }
  });
  if (!toApp.length) return [`front door ${fd.url} has no link to ${host}`];
  const key = funnel.signupPath.includes('?') ? funnel.signupPath.split('?')[1].split('=')[0] : null;
  const ok = toApp.some((h) => {
    const u = new URL(h, fd.url);
    return key ? u.searchParams.has(key) : u.pathname === funnel.signupPath;
  });
  return ok ? [] : [`front door ${fd.url} links to ${host} but not to its sign-up (${funnel.signupPath})`];
}

async function visitApp(browser, funnel, viewport) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const pageErrors = [];
  const badResponses = [];
  page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 160)));
  page.on('response', (r) => { if (r.status() >= 400) badResponses.push({ status: r.status(), url: r.url() }); });
  const resp = await page.goto(funnel.base + funnel.signupPath, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('input[type=password]', { timeout: 10000 }).catch(() => {});
  const seen = await page.evaluate(() => {
    const vis = (el) => !!el && el.getClientRects().length > 0;
    const form = document.querySelector('form');
    const submit = form?.querySelector('button[type=submit], button:not([type])');
    const legal = [...document.querySelectorAll('a[href]')]
      .map((a) => a.href)
      .filter((h) => /\/legal\/(terms|privacy)/.test(h));
    return {
      title: document.title,
      description: document.querySelector('meta[name=description]')?.content ?? '',
      hasEmail: vis(document.querySelector('input[type=email], input[name=email], input[autocomplete=email]')),
      hasPassword: vis(document.querySelector('input[type=password]')),
      submitText: submit?.textContent?.trim() ?? null,
      scrollWidth: document.documentElement.scrollWidth,
      legalHrefs: [...new Set(legal)],
    };
  });
  const legal = [];
  for (const href of seen.legalHrefs) {
    const r = await ctx.request.get(href).catch(() => null);
    legal.push({ href, status: r ? r.status() : 0 });
  }
  await ctx.close();
  return { ...seen, status: resp?.status() ?? 0, viewportWidth: viewport.width, pageErrors, badResponses, legal };
}

async function visitFrontDoor(browser, url) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  let error = null;
  const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch((e) => {
    error = String(e.message).split('\n')[0];
    return null;
  });
  const links = resp ? await page.$$eval('a[href]', (as) => as.map((a) => a.href)) : [];
  await ctx.close();
  return { url, status: resp?.status() ?? 0, links, error };
}

export async function run(funnels, chromium) {
  const browser = await chromium.launch();
  const results = [];
  try {
    for (const f of funnels) {
      const found = [];
      for (const [label, vp] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
        try {
          const v = await visitApp(browser, f, vp);
          for (const p of judgeAppPage(v)) found.push({ text: `${label}: ${p}` });
        } catch (e) {
          const msg = String(e.message).split('\n')[0];
          found.push(isUnreachable(msg)
            ? { text: `${label}: unreachable from this machine (${msg})`, unreachable: true }
            : { text: `${label}: could not load (${msg})` });
        }
      }
      for (const url of f.frontDoors) {
        const fd = await visitFrontDoor(browser, url);
        if (fd.error && isUnreachable(fd.error)) {
          found.push({ text: `front door ${url} unreachable from this machine (${fd.error})`, unreachable: true });
        } else {
          for (const p of judgeFrontDoor(fd, f)) found.push({ text: p });
        }
      }
      results.push({ app: f.app, url: f.base + f.signupPath, verdict: verdict(found), problems: found.map((p) => p.text) });
    }
  } finally {
    await browser.close();
  }
  return results;
}

async function main() {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--only');
  const only = i >= 0 ? argv[i + 1].split(',') : null;
  const funnels = only ? FUNNELS.filter((f) => only.includes(f.app)) : FUNNELS;
  let chromium;
  try {
    ({ chromium } = createRequire(import.meta.url)('playwright'));
  } catch (e) {
    console.error(`playwright is not installed: ${e.message}`);
    process.exit(2);
  }
  const results = await run(funnels, chromium);
  if (argv.includes('--json')) console.log(JSON.stringify(results, null, 2));
  else {
    for (const r of results) {
      console.log(`${{ ok: 'ok  ', skip: 'SKIP', fail: 'FAIL' }[r.verdict]} ${r.app}  ${r.url}`);
      for (const p of r.problems) console.log(`       ${p}`);
    }
    if (results.some((r) => r.verdict === 'skip')) {
      console.log('SKIP: the host was never reached (proxy or DNS); this says nothing about the site. Run it where the host is reachable.');
    }
  }
  if (results.some((r) => r.verdict === 'fail')) process.exit(1);
  process.exit(results.some((r) => r.verdict === 'skip') ? 3 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
