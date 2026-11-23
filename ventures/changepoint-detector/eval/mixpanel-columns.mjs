// Which Mixpanel columns hear which faults? The Mixpanel source's `users` column differs from PostHog's: it is the daily
// unique users of the FIRST event named (Mixpanel's type=unique; the aggregated-counts API has no "any of these
// events" unique count), so with the default page-view event it is the people who viewed a page, and it falls too when
// the snippet drops off part of the site. Does it hear that fault, and does it add false dates? Simulated products
// (as in eval/posthog-columns.mjs: ~300 people a weekday, weekends at `wk`, page views per person Poisson(2.5), 3%
// sign up) over 242 days. Faults: page views falling to `share` on 2026-03-16 (each person's views thinned, so a person
// is a unique page viewer with probability 1 - exp(-2.5 share)) and sign-ups falling to 35% on 2026-01-12. Nulls: the
// same products with neither. Each column watched as the workflow does (name:poisson). Heard = dated within 7 days of
// the true date; any other date is false.
//
// Round 1 (seeds 1-40, the count default only) heard page views and sign-ups as PostHog's did but users on 0 of 40 in
// every cell: thinning page views to 0.6 or 0.5 thins unique viewers only to 0.85 or 0.78 of their level (people who
// view several pages are still seen), a 15-22% fall the count default misses beside a deep weekly cycle.
//
// Round 2, pre-registered 2026-11-23 before it ran, on fresh seeds (2001-2040 faulted, 3001-3040 no fault). Arms: the
// count default; --period 7; the middle setting (--detector pelt --overdispersion nb --trend gated). An arm becomes the
// Mixpanel workflow's default WATCH_OPTIONS if, at both weekend depths, (U1) it hears users on >= 36 of 40 at share
// 0.5, (U2) it hears page views and sign-ups on no fewer than the count default's count minus 2 in each faulted cell,
// and (U3) its false dates on the no-fault products, summed over the three columns, are at most the count default's
// plus 2. If both arms pass, the one with fewer U3 false dates; if neither, nothing changes and the README says which
// lever to set by hand.
//   node eval/mixpanel-columns.mjs [seeds=40] [round=2]    (output: eval/mixpanel-columns.out.txt)
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main as watchMain } from '../watch.mjs';
import { toCsv } from '../ga4-metrics.mjs';

const SEEDS = Number(process.argv[2] ?? 40);
const ROUND = Number(process.argv[3] ?? 2);
const ARMS = ROUND === 1 ? { default: [] } : { default: [], 'period 7': ['--period', '7'], middle: ['--detector', 'pelt', '--overdispersion', 'nb', '--trend', 'gated'] };
const FAULT_SEED = ROUND === 1 ? 0 : 2000, NULL_SEED = ROUND === 1 ? 1000 : 3000;
const addDays = (day, k) => new Date(Date.parse(`${day}T00:00:00Z`) + k * 86400000).toISOString().slice(0, 10);
const lcg = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; };
const poisson = (u, lam) => {
  if (lam > 300) return Math.max(0, Math.round(lam + Math.sqrt(lam) * Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u())));
  let k = 0, p = Math.exp(-lam), c = p; const x = u(); while (x > c) { k++; p *= lam / k; c += p; } return k;
};
const COLS = ['event_pageview', 'event_signed_up', 'users'];
const binom = (u, n, p) => { let k = 0; for (let i = 0; i < n; i++) if (u() < p) k++; return k; };
const PV_OFF = '2026-03-16', SU_OFF = '2026-01-12';

function product({ wk, share, fault, seed }) {
  const u = lcg(seed), rows = [];
  for (let d = '2025-09-01'; d <= '2026-04-30'; d = addDays(d, 1)) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    const people = poisson(u, 300 * (dow === 0 || dow === 6 ? wk : 1));
    const sh = fault && d >= PV_OFF ? share : 1;
    const pv = poisson(u, people * 2.5 * sh);
    const su = poisson(u, people * 0.03 * (fault && d >= SU_OFF ? 0.35 : 1));
    const viewers = binom(u, people, 1 - Math.exp(-2.5 * sh));
    rows.push({ date: d, values: { event_pageview: pv, event_signed_up: su, users: viewers } });
  }
  return rows;
}

const near = (d, t) => Math.abs(Date.parse(d) - Date.parse(t)) <= 7 * 86400000;
async function watched(rows, extra = []) {
  const dir = mkdtempSync(join(tmpdir(), 'mp-eval-'));
  writeFileSync(join(dir, 'p.csv'), toCsv(rows, COLS));
  let text = '';
  await watchMain([join(dir, 'p.csv'), '--state', join(dir, 's.json'), '--columns', COLS.map((c) => `${c}:poisson`).join(','), ...extra], { out: (t) => { text += t; }, err: () => {} });
  const by = {};
  for (const part of text.split(/^== /m).slice(1)) {
    const name = part.slice(0, part.indexOf(' =='));
    by[name] = [...part.matchAll(/\d{4}-\d{2}-\d{2}/g)].map((m) => m[0]);
  }
  return by;
}

const lines = [`round ${ROUND}; seeds ${SEEDS} per cell; heard = dated within 7 days; false = any other date (count, and products with one)`];
for (const [arm, extra] of Object.entries(ARMS)) {
  lines.push(`-- arm: ${arm}${extra.length ? ` (${extra.join(' ')})` : ''}`);
  for (const wk of [0.5, 0.4]) {
    for (const share of [0.6, 0.5]) {
      const heard = { event_pageview: 0, event_signed_up: 0, users: 0 }, falseN = Object.fromEntries(COLS.map((c) => [c, 0]));
      for (let s = 1; s <= SEEDS; s++) {
        const by = await watched(product({ wk, share, fault: true, seed: FAULT_SEED + s }), extra);
        if ((by.event_pageview ?? []).some((d) => near(d, PV_OFF))) heard.event_pageview++;
        if ((by.event_signed_up ?? []).some((d) => near(d, SU_OFF))) heard.event_signed_up++;
        if ((by.users ?? []).some((d) => near(d, PV_OFF))) heard.users++;
        falseN.event_pageview += (by.event_pageview ?? []).filter((d) => !near(d, PV_OFF)).length;
        falseN.event_signed_up += (by.event_signed_up ?? []).filter((d) => !near(d, SU_OFF)).length;
        falseN.users += (by.users ?? []).filter((d) => !near(d, PV_OFF)).length;
      }
      lines.push(`weekends ${wk}, page views to ${share}: heard page views ${heard.event_pageview}/${SEEDS}, sign-ups ${heard.event_signed_up}/${SEEDS}, users ${heard.users}/${SEEDS}; other dates: page views ${falseN.event_pageview}, sign-ups ${falseN.event_signed_up}, users ${falseN.users}`);
    }
    const nullFalse = Object.fromEntries(COLS.map((c) => [c, [0, 0]]));
    for (let s = 1; s <= SEEDS; s++) {
      const by = await watched(product({ wk, share: 1, fault: false, seed: NULL_SEED + s }), extra);
      for (const c of COLS) { const n = (by[c] ?? []).length; nullFalse[c][0] += n; if (n) nullFalse[c][1]++; }
    }
    lines.push(`weekends ${wk}, no fault: false dates ${COLS.map((c) => `${c} ${nullFalse[c][0]} on ${nullFalse[c][1]} products`).join(', ')}; total ${COLS.reduce((t, c) => t + nullFalse[c][0], 0)}`);
  }
}
const out = lines.join('\n') + '\n';
process.stdout.write(out);
writeFileSync(new URL('./mixpanel-columns.out.txt', import.meta.url), out);
