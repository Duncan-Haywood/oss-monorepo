// How far down a venture tool page do the first tool card and the first form
// field start? fold-check.mjs answers that for audience pages and fails a
// build; this one measures venture pages and reports, so a polish run can
// pick a family, fold its hero and record before and after numbers.
//
//   node platform/pages/venture-fold.mjs --slugs a,b,c            # 390x844, serves dist itself
//   node platform/pages/venture-fold.mjs --match csv-check --widths 360,390,1280
//   node platform/pages/venture-fold.mjs --all --json > fold.json # every venture page
//   DIST=/tmp/preview node platform/pages/venture-fold.mjs --slugs a,b   # an --only preview
//
// WHY: on 2026-11-21 two polish runs in a row wrote the same throwaway
// Playwright probe in the session scratchpad to get these numbers (reports
// polish-2026-11-21-eyebrow-names.md, item 5, and polish-2026-11-21-csv-check-fold.md).
// Software for the routine: the probe lives here now.
//
// "On screen" means the element's top is at most height - 16 px (fold.mjs's
// PEEK_PX), the same rule fold-check uses. The first field is the first
// visible input (not type=hidden), select or textarea inside <main>; a file
// input styled out of sight counts by its label. Exits 0 after printing, 2
// when nothing could be measured. Not part of CI: Playwright is not a dependency of this repo.

import { requirePlaywright } from './load-playwright.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveDir } from './serve-dir.mjs';
import { FOLD, PEEK_PX, parseWidths } from './fold.mjs';

export const CARD_SELECTOR = 'main .card';
export const FIELD_SELECTOR = 'main input:not([type=hidden]), main select, main textarea';

/** Median of the non-null numbers, or null. */
export function median(xs) {
  const v = xs.filter((x) => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** One summary line per width: how many cards and fields are on the first screen, and the medians. */
export function summarise(rows, { width, height, peek = PEEK_PX }) {
  const limit = height - peek;
  const on = (k) => rows.filter((r) => r[k] != null && r[k] <= limit).length;
  const has = (k) => rows.filter((r) => r[k] != null).length;
  const med = (k) => {
    const m = median(rows.map((r) => r[k]));
    return m == null ? '-' : Math.round(m);
  };
  return `${width}x${height}: ${rows.length} pages; first card on screen ${on('card')}/${has('card')} (median top ${med('card')} px); first field on screen ${on('field')}/${has('field')} (median top ${med('field')} px)`;
}

async function main() {
  const HERE = path.dirname(fileURLToPath(import.meta.url));
  const argv = process.argv.slice(2);
  const flag = (name) => {
    const i = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
    if (i < 0) return undefined;
    return argv[i].includes('=') ? argv[i].split('=').slice(1).join('=') : argv[i + 1];
  };
  const DIST = path.resolve(process.env.DIST || path.join(HERE, 'dist'));
  const HEIGHT = Number(flag('height') || FOLD.height);
  const widths = parseWidths(flag('widths'), FOLD.width);
  const ventures = path.join(HERE, '..', '..', 'ventures');
  let slugs = (flag('slugs') || '').split(',').filter(Boolean);
  const match = flag('match');
  if (!slugs.length && (match || argv.includes('--all'))) {
    slugs = fs.readdirSync(ventures)
      .filter((s) => fs.existsSync(path.join(ventures, s, 'index.html')))
      .filter((s) => !match || s.includes(match));
  }
  slugs = slugs.filter((s) => fs.existsSync(path.join(DIST, s, 'index.html'))).sort();
  if (!slugs.length) {
    console.error(`No built venture pages to measure under ${DIST}. Pass --slugs, --match or --all, after node platform/pages/build.mjs.`);
    process.exit(2);
  }
  const playwright = await requirePlaywright();
  const server = await serveDir(DIST);
  const browser = await playwright.chromium.launch();
  const out = {};
  try {
    for (const width of widths) {
      const context = await browser.newContext({ viewport: { width, height: HEIGHT } });
      const page = await context.newPage();
      const rows = [];
      for (const slug of slugs) {
        try {
          await page.goto(`${server.base}/${slug}/`, { waitUntil: 'load', timeout: 30000 });
        } catch {
          rows.push({ slug, card: null, field: null, error: 'did not load' });
          continue;
        }
        const r = await page.evaluate(([cardSel, fieldSel]) => {
          const top = (el) => (el ? Math.round(el.getBoundingClientRect().top + scrollY) : null);
          const visible = (el) => {
            const b = el.getBoundingClientRect();
            return b.width > 0 && b.height > 0;
          };
          const field = [...document.querySelectorAll(fieldSel)].find(visible)
            // a file input styled away still has its label; take the label's top then
            || [...document.querySelectorAll('main label[for]')].find(visible);
          return {
            card: top(document.querySelector(cardSel)),
            field: top(field),
            sideways: document.documentElement.scrollWidth > innerWidth + 1,
          };
        }, [CARD_SELECTOR, FIELD_SELECTOR]);
        rows.push({ slug, ...r });
      }
      await context.close();
      out[width] = rows;
    }
  } finally {
    await browser.close();
    server.srv.close();
  }
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ height: HEIGHT, widths: out }, null, 1));
    return;
  }
  for (const width of widths) {
    const rows = out[width];
    console.log(summarise(rows, { width, height: HEIGHT }));
    const wide = rows.filter((r) => r.sideways).map((r) => r.slug);
    if (wide.length) console.log(`  scrolls sideways: ${wide.join(', ')}`);
    if (argv.includes('--rows')) for (const r of rows) console.log(`  ${r.slug}\tcard ${r.card ?? '-'}\tfield ${r.field ?? '-'}${r.error ? `\t${r.error}` : ''}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`venture-fold: ${e.message}`);
    process.exit(2);
  });
}
