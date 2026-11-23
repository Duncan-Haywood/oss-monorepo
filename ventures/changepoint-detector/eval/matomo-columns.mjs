// Which default should the Matomo source's workflow use? Matomo's `visits` is a count of visits with at least one
// tracked action, so when the tracking code drops off part of the site visits fall less than page views (a visit
// that touches any tracked page is still counted), as Mixpanel's first-event unique users did
// (eval/mixpanel-columns.out.txt: the count default heard that fall on 0-1 of 40, the middle setting on 38-40).
// Simulated sites: ~300 visits a weekday, weekends at `wk`, page views per visit Poisson(2.5), a goal converting 3% of
// visits, over 242 days. Faults: tracking dropped from part of the site on 2026-03-16 (page views thinned to `share`,
// a visit counted with probability 1 - exp(-2.5 share)) and the goal falling to 35% on 2026-01-12 (a broken form).
// Nulls: the same sites with neither. Columns as the workflow writes them (visits, pageviews, goal_1), each name:poisson.
// Heard = dated within 7 days of the true date; any other date is false.
//
// Pre-registered 2026-11-23 before it ran, on fresh seeds (4001-4040 faulted, 5001-5040 no fault). Arms: the count
// default; the middle setting (--detector pelt --overdispersion nb --trend gated). The middle setting becomes the
// Matomo workflow's default WATCH_OPTIONS if, at both weekend depths, (V1) it hears visits on >= 36 of 40 at share
// 0.5, (V2) it hears page views and the goal on no fewer than the count default's count minus 2 in each faulted cell,
// and (V3) its false dates on the no-fault sites, summed over the three columns, are at most the count default's plus
// 2. Otherwise the count default stays, and the README says to set the middle setting by hand if visits matter most.
//   node eval/matomo-columns.mjs [seeds=40]    (output: eval/matomo-columns.out.txt)
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main as watchMain } from '../watch.mjs';
import { toCsv } from '../ga4-metrics.mjs';

const SEEDS = Number(process.argv[2] ?? 40);
const ARMS = { default: [], middle: ['--detector', 'pelt', '--overdispersion', 'nb', '--trend', 'gated'] };
const FAULT_SEED = 4000, NULL_SEED = 5000;
const addDays = (day, k) => new Date(Date.parse(`${day}T00:00:00Z`) + k * 86400000).toISOString().slice(0, 10);
const lcg = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; };
const poisson = (u, lam) => {
  if (lam > 300) return Math.max(0, Math.round(lam + Math.sqrt(lam) * Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u())));
  let k = 0, p = Math.exp(-lam), c = p; const x = u(); while (x > c) { k++; p *= lam / k; c += p; } return k;
};
const COLS = ['visits', 'pageviews', 'goal_1'];
const binom = (u, n, p) => { let k = 0; for (let i = 0; i < n; i++) if (u() < p) k++; return k; };
const PV_OFF = '2026-03-16', SU_OFF = '2026-01-12';

function site({ wk, share, fault, seed }) {
  const u = lcg(seed), rows = [];
  for (let d = '2025-09-01'; d <= '2026-04-30'; d = addDays(d, 1)) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    const all = poisson(u, 300 * (dow === 0 || dow === 6 ? wk : 1));
    const sh = fault && d >= PV_OFF ? share : 1;
    const pageviews = poisson(u, all * 2.5 * sh);
    const visits = binom(u, all, 1 - Math.exp(-2.5 * sh));
    const goal = poisson(u, all * 0.03 * (fault && d >= SU_OFF ? 0.35 : 1));
    rows.push({ date: d, values: { visits, pageviews, goal_1: goal } });
  }
  return rows;
}

const near = (d, t) => Math.abs(Date.parse(d) - Date.parse(t)) <= 7 * 86400000;
async function watched(rows, extra = []) {
  const dir = mkdtempSync(join(tmpdir(), 'matomo-eval-'));
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

const lines = [`seeds ${SEEDS} per cell; heard = dated within 7 days; false = any other date (count, and sites with one)`];
for (const [arm, extra] of Object.entries(ARMS)) {
  lines.push(`-- arm: ${arm}${extra.length ? ` (${extra.join(' ')})` : ''}`);
  for (const wk of [0.5, 0.4]) {
    for (const share of [0.6, 0.5]) {
      const heard = { visits: 0, pageviews: 0, goal_1: 0 }, falseN = Object.fromEntries(COLS.map((c) => [c, 0]));
      for (let s = 1; s <= SEEDS; s++) {
        const by = await watched(site({ wk, share, fault: true, seed: FAULT_SEED + s }), extra);
        for (const c of COLS) {
          const when = c === 'goal_1' ? SU_OFF : PV_OFF;
          if ((by[c] ?? []).some((d) => near(d, when))) heard[c]++;
          falseN[c] += (by[c] ?? []).filter((d) => !near(d, when)).length;
        }
      }
      lines.push(`weekends ${wk}, page views to ${share}: heard visits ${heard.visits}/${SEEDS}, page views ${heard.pageviews}/${SEEDS}, goal ${heard.goal_1}/${SEEDS}; other dates: visits ${falseN.visits}, page views ${falseN.pageviews}, goal ${falseN.goal_1}`);
    }
    const nullFalse = Object.fromEntries(COLS.map((c) => [c, [0, 0]]));
    for (let s = 1; s <= SEEDS; s++) {
      const by = await watched(site({ wk, share: 1, fault: false, seed: NULL_SEED + s }), extra);
      for (const c of COLS) { const n = (by[c] ?? []).length; nullFalse[c][0] += n; if (n) nullFalse[c][1]++; }
    }
    lines.push(`weekends ${wk}, no fault: false dates ${COLS.map((c) => `${c} ${nullFalse[c][0]} on ${nullFalse[c][1]} sites`).join(', ')}; total ${COLS.reduce((t, c) => t + nullFalse[c][0], 0)}`);
  }
}
const out = lines.join('\n') + '\n';
process.stdout.write(out);
writeFileSync(new URL('./matomo-columns.out.txt', import.meta.url), out);
