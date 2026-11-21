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
//
// The ratchet (2026-11-21, item 3 of polish-2026-11-21-csv-check-fold.md):
//
//   node platform/pages/venture-fold.mjs --check                  # every venture page, 390x844
//   node platform/pages/venture-fold.mjs --check --match csv-check   # just a family, same baseline
//   node platform/pages/venture-fold.mjs --write-baseline         # after a fold run lands
//
// venture-fold-baseline.json lists the pages whose first field starts below
// the first 390x844 screen, with that field's top. --check exits 1 when a page
// not in the list now puts its field below the screen, or a listed page's
// field sits more than BASELINE_SLACK_PX deeper than recorded; it prints the
// listed pages that now pass, so the run that fixed them can shrink the file
// with --write-baseline (which refuses a partial --slugs/--match measurement).

import { requirePlaywright } from './load-playwright.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveDir } from './serve-dir.mjs';
import { FOLD, PEEK_PX, parseWidths } from './fold.mjs';

export const CARD_SELECTOR = 'main .card';
export const FIELD_SELECTOR = 'main input:not([type=hidden]), main select, main textarea';

export const BASELINE_PATH = fileURLToPath(new URL('./venture-fold-baseline.json', import.meta.url));
// Fonts and wrapping move a field by a line or two between machines; a hero
// that grows by a whole paragraph is the regression this is after.
export const BASELINE_SLACK_PX = 48;

/** { slug: fieldTop } for rows whose first field starts below the first screen. */
export function belowFold(rows, { height = FOLD.height, peek = PEEK_PX } = {}) {
  const limit = height - peek;
  const out = {};
  for (const r of [...rows].sort((a, b) => a.slug.localeCompare(b.slug))) {
    if (r.field != null && r.field > limit) out[r.slug] = r.field;
  }
  return out;
}

/**
 * Compare a measurement with the baseline's `below` map. Only the measured
 * slugs are judged, so a --match run checks its family against the same file.
 * Returns { regressions: [text], fixed: [slug] }.
 */
export function compareBaseline(rows, below, { height = FOLD.height, peek = PEEK_PX, slack = BASELINE_SLACK_PX } = {}) {
  const now = belowFold(rows, { height, peek });
  const regressions = [];
  const fixed = [];
  for (const r of rows) {
    const was = below[r.slug];
    const is = now[r.slug];
    if (is != null && was == null) {
      regressions.push(`${r.slug}: first field now starts at ${is} px, below the ${height} px screen (not in the baseline)`);
    } else if (is != null && is > was + slack) {
      regressions.push(`${r.slug}: first field at ${is} px, ${is - was} px deeper than the baseline's ${was} px`);
    } else if (is == null && was != null && r.field != null) {
      fixed.push(r.slug);
    }
  }
  return { regressions, fixed };
}

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
  const CHECK = argv.includes('--check');
  const WRITE = argv.includes('--write-baseline');
  const HEIGHT = Number(flag('height') || FOLD.height);
  const widths = parseWidths(flag('widths'), FOLD.width);
  if ((CHECK || WRITE) && (HEIGHT !== FOLD.height || widths.length !== 1 || widths[0] !== FOLD.width)) {
    console.error(`--check and --write-baseline measure the ${FOLD.width}x${FOLD.height} screen the baseline records; drop --widths/--height.`);
    process.exit(2);
  }
  if (WRITE && (flag('slugs') || flag('match'))) {
    console.error('--write-baseline needs every venture page; drop --slugs/--match.');
    process.exit(2);
  }
  const ventures = path.join(HERE, '..', '..', 'ventures');
  let slugs = (flag('slugs') || '').split(',').filter(Boolean);
  const match = flag('match');
  if (!slugs.length && (match || argv.includes('--all') || CHECK || WRITE)) {
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
  if (WRITE) {
    const below = belowFold(out[FOLD.width], { height: HEIGHT });
    const doc = { width: FOLD.width, height: HEIGHT, measured: out[FOLD.width].length, below };
    fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(doc, null, 1)}\n`);
    console.log(`${summarise(out[FOLD.width], { width: FOLD.width, height: HEIGHT })}\nWrote ${Object.keys(below).length} below-the-screen pages to ${path.relative(process.cwd(), BASELINE_PATH)}.`);
    return;
  }
  if (CHECK) {
    const base = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
    const rows = out[FOLD.width];
    const { regressions, fixed } = compareBaseline(rows, base.below || {}, { height: HEIGHT });
    console.log(summarise(rows, { width: FOLD.width, height: HEIGHT }));
    if (fixed.length) console.log(`Now on the first screen, drop with --write-baseline: ${fixed.join(', ')}`);
    if (regressions.length) {
      console.log(regressions.join('\n'));
      process.exit(1);
    }
    console.log(`No venture page put its first field further down than ${path.basename(BASELINE_PATH)} allows.`);
    return;
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
