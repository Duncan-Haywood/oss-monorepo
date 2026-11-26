// Loads every page of the paid bets' front doors on a phone, works the
// example out where the page has one, and fails on the four defects the
// 2026-11-26 polish runs kept measuring by hand: the page scrolls sideways, a
// table hides columns behind a sideways swipe, a form field iOS zooms into,
// a stacked table row taller than the screen. Rules and reasons: phone-probe.mjs.
//
//   node platform/pages/build.mjs --only=$(node platform/pages/phone-probe-check.mjs --list) --out=/tmp/pp
//   DIST=/tmp/pp node platform/pages/phone-probe-check.mjs
//   DIST=/tmp/pp node platform/pages/phone-probe-check.mjs --widths 320,390 --all
//   DIST=/tmp/pp node platform/pages/phone-probe-check.mjs --slugs retainage-cashflow-calculator
//   DIST=/tmp/pp node platform/pages/phone-probe-check.mjs --industry all
//
// It reads a built site (shared chrome included: the input-zoom floor lives
// there, so a raw venture folder would report fields the site fixes) and
// serves DIST on a free port itself; BASE_URL points it at a server you run.
// Slugs not in DIST are listed as skipped, not passed. Exits 1 listing each
// failure, 2 on a usage problem. Not in CI (Playwright), like sideways.mjs.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveDir } from './serve-dir.mjs';
import { parseWidths } from './fold.mjs';
import {
  PHONE, EXAMPLE_RE, SUBMIT_RE, SCROLL_OK_ATTR, PRODUCT_PAGES,
  measurePhone, phoneFailures, probeSlugs, probeRow,
} from './phone-probe.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i < 0) return undefined;
  return argv[i].includes('=') ? argv[i].split('=').slice(1).join('=') : argv[i + 1];
};

const industry = flag('industry') || 'construction';
const doors = JSON.parse(fs.readFileSync(path.join(HERE, 'front-doors.json'), 'utf8'));
if (industry !== 'all' && !doors.industries?.[industry]) {
  console.error(`phone-probe: no industry ${JSON.stringify(industry)} in front-doors.json (have: ${Object.keys(doors.industries || {}).join(', ')}, all)`);
  process.exit(2);
}
const extra = industry === 'all' ? Object.values(PRODUCT_PAGES).flat() : (PRODUCT_PAGES[industry] || []);
let slugs = flag('slugs') ? flag('slugs').split(',').map((s) => s.trim()).filter(Boolean) : probeSlugs(doors, { industry, extra });

if (argv.includes('--list')) {
  console.log(slugs.join(','));
  process.exit(0);
}

const DIST = path.resolve(process.env.DIST || path.join(HERE, 'dist'));
const HEIGHT = Number(flag('height') || process.env.HEIGHT || PHONE.height);
const SHOW_ALL = argv.includes('--all') || process.env.ALL === '1';
const NO_EXAMPLE = argv.includes('--no-example');
let widths;
try {
  widths = parseWidths(flag('widths') ?? process.env.WIDTHS, process.env.WIDTH || PHONE.width);
} catch (e) {
  console.error(`phone-probe: ${e.message}`);
  process.exit(2);
}
if (!fs.existsSync(DIST)) {
  console.error(`phone-probe: no built site at ${DIST}. Run: node platform/pages/build.mjs --only=$(node platform/pages/phone-probe-check.mjs --list) --out=${DIST}`);
  process.exit(2);
}

function htmlUnder(dir, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.isDirectory()) out.push(...htmlUnder(path.join(dir, e.name), `${rel}${e.name}/`));
    else if (e.name.endsWith('.html')) out.push(rel + e.name);
  }
  return out;
}
const skipped = slugs.filter((s) => !fs.existsSync(path.join(DIST, s)));
slugs = slugs.filter((s) => !skipped.includes(s));
const pages = slugs.flatMap((s) => htmlUnder(path.join(DIST, s)).map((rel) => `${s}/${rel.replace(/(^|\/)index\.html$/, '$1')}`));
if (!pages.length) {
  console.error(`phone-probe: none of ${skipped.length} slug(s) is built in ${DIST}. Build them with --only (see --list).`);
  process.exit(2);
}

const { requirePlaywright } = await import('./load-playwright.mjs');
const playwright = await requirePlaywright();
let server = null;
let BASE = (process.env.BASE_URL || '').replace(/\/$/, '');
if (!BASE) {
  server = await serveDir(DIST);
  BASE = server.base;
}
const chromePath = process.env.CHROME_PATH || process.env.CHROMIUM_PATH;
const browser = await playwright.chromium.launch(chromePath ? { executablePath: chromePath } : {});

/** Clicks the first visible button whose text matches `re`; returns its text or null. */
async function clickButton(page, re) {
  const found = await page.evaluate((src) => {
    const rx = new RegExp(src.source, src.flags);
    const els = [...document.querySelectorAll('main button, main input[type=submit], main input[type=button], main a[role=button]')];
    const el = els.find((b) => {
      const t = (b.textContent || b.value || '').trim();
      const r = b.getBoundingClientRect();
      return rx.test(t) && r.width > 0 && r.height > 0 && !b.disabled;
    });
    if (!el) return null;
    el.setAttribute('data-phone-probe-click', '1');
    return (el.textContent || el.value || '').trim().slice(0, 40);
  }, { source: re.source, flags: re.flags });
  if (!found) return null;
  try {
    await page.click('[data-phone-probe-click]', { timeout: 3000 });
  } catch {
    return null;
  } finally {
    await page.evaluate(() => document.querySelector('[data-phone-probe-click]')?.removeAttribute('data-phone-probe-click')).catch(() => {});
  }
  await page.waitForTimeout(400);
  return found;
}

const failures = [];
const rows = [];
let worked = 0;
try {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: HEIGHT }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    for (const rel of pages) {
      try {
        await page.goto(`${BASE}/${rel}`, { waitUntil: 'load', timeout: 30000 });
      } catch (e) {
        failures.push(`${rel} at ${width}px: did not load (${String(e.message || e).split('\n')[0]})`);
        continue;
      }
      const opts = { scrollOkAttr: SCROLL_OK_ATTR };
      const first = await page.evaluate(measurePhone, opts);
      const seen = new Set();
      const add = (list) => { for (const f of list) { const key = f.replace(/ at \d+px (at load|with the example worked out):/, ':'); if (!seen.has(key)) { seen.add(key); failures.push(f); } } };
      add(phoneFailures(first, { page: rel, state: 'at load' }));
      rows.push(probeRow(first, { page: rel, state: 'load' }));
      if (NO_EXAMPLE) continue;
      const ex = await clickButton(page, EXAMPLE_RE);
      const sub = await clickButton(page, SUBMIT_RE);
      if (!ex && !sub) continue;
      worked++;
      const after = await page.evaluate(measurePhone, opts);
      add(phoneFailures(after, { page: rel, state: 'with the example worked out' }));
      rows.push(probeRow(after, { page: rel, state: 'worked' }));
    }
    await context.close();
  }
} finally {
  await browser.close();
  server?.srv.close();
}

console.log(`${pages.length} page(s) from ${slugs.length} slug(s) (${industry}) at ${widths.join(', ')}x${HEIGHT}; example worked out on ${worked} page load(s).`);
if (skipped.length) console.log(`Skipped, not built in ${DIST}: ${skipped.length} slug(s)${skipped.length <= 12 ? ` (${skipped.join(', ')})` : ''}.`);
if (SHOW_ALL) console.log(rows.join('\n'));
if (failures.length) {
  console.log(`${failures.length} failure(s):`);
  console.log(failures.join('\n'));
  process.exit(1);
}
console.log('No page scrolls sideways, hides a table behind a swipe, has a field iOS zooms into, or a stacked row taller than the screen.');
