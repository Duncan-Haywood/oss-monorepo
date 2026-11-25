// Funnel report: which free pages send people toward a paid product, per
// industry, from the `fn:` counts the daily pull already writes
// (platform/counter/FUNNEL.md says what is counted and how pages opt in).
//
//   node platform/counter/funnel-report.mjs [--data portfolio/usage/site-visits.json]
//        [--days 28] [--today YYYY-MM-DD] [--out portfolio/usage/reports/funnel.md] [--json]
//
// The window is the `--days` UTC days ending on `--today` (default: the last
// day in the file). Without --out the Markdown goes to stdout; --json prints
// the numbers instead, for scripts.
//
// Software for the routine (CLAUDE.md): this is arithmetic over a committed
// file. It adds no data and calls nothing over the network.
//
// Read docs/reports/2026-11-24-funnel-events.md before quoting a number: these
// are counts of events on page loads, not people, and an impression is "the
// CTA was at least half on screen once during a load", not "someone read it".

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFunnelKey, FUNNEL_EVENTS } from './core.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const NO_INDUSTRY = '(none)';

const blank = () => Object.fromEntries(FUNNEL_EVENTS.map((e) => [e, 0]));

/** Days in [today - days + 1, today], present in `visits`, sorted. */
export function windowDays(visits, { days = 28, today } = {}) {
  const all = Object.keys(visits).filter((d) => DAY.test(d)).sort();
  const end = today || all.at(-1) || '';
  if (!end) return [];
  const start = new Date(`${end}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const from = start.toISOString().slice(0, 10);
  return all.filter((d) => d >= from && d <= end);
}

/** Ratio as a percentage string, or '–' when the denominator is zero. */
export function pct(n, d) {
  return d ? `${((100 * n) / d).toFixed(1)}%` : '–';
}

/**
 * Folds the `fn:` keys of `days` into per-industry, per-page and per-product
 * totals. Every other key (pages, ref:, src:, ...) is ignored.
 */
export function summarise(visits, days) {
  const out = { days: days.length, from: days[0] || null, to: days.at(-1) || null, totals: blank(), industries: {}, pages: {}, products: {} };
  const bump = (bucket, key, event, n) => { (bucket[key] ||= blank())[event] += n; };
  for (const day of days) {
    for (const [key, n] of Object.entries(visits[day] || {})) {
      if (!Number.isInteger(n) || n < 0) continue;
      const f = parseFunnelKey(key);
      if (!f) continue;
      out.totals[f.event] += n;
      bump(out.industries, f.industry || NO_INDUSTRY, f.event, n);
      bump(out.pages, f.page, f.event, n);
      if (f.product) bump(out.products, f.product, f.event, n);
    }
  }
  return out;
}

const ranked = (o, by) => Object.entries(o).sort((a, b) => by(b[1]) - by(a[1]) || (a[0] < b[0] ? -1 : 1));
const toward = (r) => r.cta_click + r.outbound_click;

function row(name, r) {
  return `| ${name} | ${r.industry_view} | ${r.products_view} | ${r.cta_view} | ${r.cta_click} | ${pct(r.cta_click, r.cta_view)} | ${r.outbound_click} | ${pct(r.outbound_click, r.industry_view)} |`;
}

/** The Markdown report for one summary. */
export function renderMarkdown(s, { top = 15 } = {}) {
  const head = '| | Industry page views | /products/ views | CTA impressions | CTA clicks | CTA click rate | Outbound clicks | Outbound per industry view |\n|---|---:|---:|---:|---:|---:|---:|---:|';
  const lines = [
    '# Product funnel',
    '',
    s.days
      ? `${s.days} day(s) with data, ${s.from} to ${s.to} (UTC). Source: \`fn:\` keys in \`portfolio/usage/site-visits.json\`. Built by \`node platform/counter/funnel-report.mjs\`; how to read it: \`docs/reports/2026-11-24-funnel-events.md\`.`
      : 'No days in the window. Nothing has been pulled yet.',
    '',
    'Counts are events on page loads by browsers that did not opt out, not people. An impression is a product CTA at least half on screen once in a load. "CTA click rate" is CTA clicks over CTA impressions; "outbound per industry view" is outbound clicks over industry page views in the same industry.',
    '',
  ];
  const any = FUNNEL_EVENTS.some((e) => s.totals[e]);
  if (!any) {
    lines.push('**No funnel events in this window.** Either no page carries `data-funnel` markup yet, or the pull has not run since it did (`platform/counter/FUNNEL.md`). That is unmeasured, not zero interest.', '');
    return `${lines.join('\n')}\n`;
  }
  lines.push('## By industry', '', head, row('**All**', s.totals));
  for (const [name, r] of ranked(s.industries, toward)) lines.push(row(name, r));
  lines.push('', `## Front doors: pages that send people toward a product (top ${top})`, '', 'Ranked by CTA clicks plus outbound clicks. A page with impressions and no clicks is a CTA nobody wanted; a page with no impressions has no CTA or one below the fold.', '', head.replace('| |', '| Page |'));
  for (const [name, r] of ranked(s.pages, toward).slice(0, top)) lines.push(row(`\`${name}\``, r));
  if (Object.keys(s.products).length) {
    lines.push('', '## By product', '', head.replace('| |', '| Product |'));
    for (const [name, r] of ranked(s.products, toward)) lines.push(row(name, r));
  }
  return `${lines.join('\n')}\n`;
}

function arg(argv, name, fallback) {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
}

export function main(argv = process.argv.slice(2)) {
  const data = path.resolve(arg(argv, 'data', path.join(ROOT, 'portfolio/usage/site-visits.json')));
  const days = Number.parseInt(arg(argv, 'days', '28'), 10);
  const today = arg(argv, 'today', '');
  if (!Number.isInteger(days) || days < 1) throw new Error('--days must be a positive integer');
  if (today && !DAY.test(today)) throw new Error('--today must be YYYY-MM-DD');
  const visits = fs.existsSync(data) ? JSON.parse(fs.readFileSync(data, 'utf8')).days || {} : {};
  const s = summarise(visits, windowDays(visits, { days, today }));
  if (argv.includes('--json')) return `${JSON.stringify(s, null, 2)}\n`;
  const md = renderMarkdown(s);
  const out = arg(argv, 'out', '');
  if (out) {
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, md);
    return `wrote ${out}\n`;
  }
  return md;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(main());
}
