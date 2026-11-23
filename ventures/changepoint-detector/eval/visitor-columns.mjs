// Umami's `visitors` (distinct sessions with a page view) and Plausible's `visitors` (distinct people with a page view)
// were simulated as if they fell by the whole lost share when the tracking snippet drops off part of a site
// (eval/umami-timezone.mjs, eval/plausible-columns.mjs). They do not: a session or person counts if any one of their
// page views is still tracked, so they fall less than page views, as Matomo's visits and Mixpanel's first-event users
// did (README "Matomo as a source": the count default heard that fall on 0-2 of 40, the middle setting on 35-40).
// This eval simulates people and their sessions one by one and asks which default each source's workflow should use.
//
// Simulated sites, 2025-09-01 to 2026-04-30: Poisson(400) people a weekday, weekends at `wk`; each person makes
// 1 + Poisson(0.2) sessions, each session 1 + Poisson(1.2) page views (2.2 a session). Fault 1, 2026-03-16: the
// snippet lost from part of the site, each page view tracked with probability `share`; a session counts if at least
// one of its page views is tracked, a person if any of their sessions does. Fault 2, 2026-01-12: a sign-up form
// sending 35% of its events (2% of people sign up). Nulls: the same sites with neither.
// Umami columns as its workflow writes them: pageviews, visitors (= sessions), event_signup. Plausible: visitors
// (= people), pageviews, goal_signup (visits are fetched, not watched). Each watched as name:poisson.
// Heard = dated within 7 days of the true date; any other date is false.
//
// Pre-registered 2026-11-23 before it ran, on fresh seeds (6001-6040 faulted, 7001-7040 no fault). Arms: the count
// default; the middle setting (--detector pelt --overdispersion nb --trend gated). For each source separately:
//   (V0) if the count default already hears visitors on >= 36 of 40 at share 0.5 at both weekend depths, nothing
//        changes for that source (the Matomo finding did not carry over at these volumes);
//   otherwise the middle setting becomes that source's workflow default WATCH_OPTIONS if, at both weekend depths,
//   (V1) it hears visitors on >= 36 of 40 at share 0.5,
//   (V2) it hears page views and sign-ups on no fewer than the count default's count minus 2 in each faulted cell, and
//   (V3) its false dates on the no-fault sites, summed over the three columns, are at most the count default's plus 2.
// If V0 fails and any of V1-V3 fails, the default stays and the README says that visitors hear a partial snippet loss
// poorly and that page views are the column to read for it.
//   node eval/visitor-columns.mjs [seeds=40]    (output: eval/visitor-columns.out.txt)
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main as watchMain } from '../watch.mjs';
import { toCsv } from '../ga4-metrics.mjs';

const SEEDS = Number(process.argv[2] ?? 40);
const ARMS = { default: [], middle: ['--detector', 'pelt', '--overdispersion', 'nb', '--trend', 'gated'] };
const FAULT_SEED = 6000, NULL_SEED = 7000;
const PV_OFF = '2026-03-16', SU_OFF = '2026-01-12';
const SOURCES = {
  umami: { cols: ['pageviews', 'visitors', 'event_signup'], visitors: 'sessions', signup: 'event_signup' },
  plausible: { cols: ['visitors', 'pageviews', 'goal_signup'], visitors: 'people', signup: 'goal_signup' },
};
const addDays = (day, k) => new Date(Date.parse(`${day}T00:00:00Z`) + k * 86400000).toISOString().slice(0, 10);
const lcg = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; };
const poisson = (u, lam) => {
  if (lam > 300) return Math.max(0, Math.round(lam + Math.sqrt(lam) * Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u())));
  let k = 0, p = Math.exp(-lam), c = p; const x = u(); while (x > c) { k++; p *= lam / k; c += p; } return k;
};

// One site, day by day: the counts both sources would report.
function site({ wk, share, fault, seed }) {
  const u = lcg(seed), days = [];
  for (let d = '2025-09-01'; d <= '2026-04-30'; d = addDays(d, 1)) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    const n = poisson(u, 400 * (dow === 0 || dow === 6 ? wk : 1));
    const sh = fault && d >= PV_OFF ? share : 1;
    let people = 0, sessions = 0, pageviews = 0;
    for (let i = 0; i < n; i++) {
      let seen = false;
      const k = 1 + poisson(u, 0.2);
      for (let s = 0; s < k; s++) {
        const pv = 1 + poisson(u, 1.2);
        let tracked = 0;
        for (let p = 0; p < pv; p++) if (sh === 1 || u() < sh) tracked++;
        pageviews += tracked;
        if (tracked) { sessions++; seen = true; }
      }
      if (seen) people++;
    }
    const signup = poisson(u, n * 0.02 * (fault && d >= SU_OFF ? 0.35 : 1));
    days.push({ date: d, people, sessions, pageviews, signup });
  }
  return days;
}
const rowsFor = (days, src) => days.map((d) => ({
  date: d.date,
  values: { visitors: d[SOURCES[src].visitors], pageviews: d.pageviews, [SOURCES[src].signup]: d.signup },
}));

const near = (d, t) => Math.abs(Date.parse(d) - Date.parse(t)) <= 7 * 86400000;
async function watched(rows, cols, extra = []) {
  const dir = mkdtempSync(join(tmpdir(), 'visitor-eval-'));
  writeFileSync(join(dir, 'p.csv'), toCsv(rows, cols));
  let text = '';
  await watchMain([join(dir, 'p.csv'), '--state', join(dir, 's.json'), '--columns', cols.map((c) => `${c}:poisson`).join(','), ...extra], { out: (t) => { text += t; }, err: () => {} });
  const by = {};
  for (const part of text.split(/^== /m).slice(1)) {
    const name = part.slice(0, part.indexOf(' =='));
    by[name] = [...part.matchAll(/\d{4}-\d{2}-\d{2}/g)].map((m) => m[0]);
  }
  return by;
}

// Generate each site once; both sources and both arms read the same days.
const cache = new Map();
const siteOnce = (o) => { const k = JSON.stringify(o); if (!cache.has(k)) cache.set(k, site(o)); return cache.get(k); };

const lines = [`seeds ${SEEDS} per cell; heard = dated within 7 days; false = any other date (count, and sites with one)`];
const meanFall = {};
for (const wk of [0.5, 0.4]) for (const share of [0.6, 0.5]) {
  let pv = [0, 0], se = [0, 0], pe = [0, 0];
  for (let s = 1; s <= 10; s++) {
    for (const r of siteOnce({ wk, share, fault: true, seed: FAULT_SEED + s })) {
      const i = r.date >= PV_OFF ? 1 : 0;
      if (r.date >= '2026-02-14' && r.date < '2026-04-14') { pv[i] += r.pageviews; se[i] += r.sessions; pe[i] += r.people; }
    }
  }
  meanFall[`${wk}/${share}`] = `page views to ${(pv[1] / pv[0]).toFixed(2)}, sessions to ${(se[1] / se[0]).toFixed(2)}, people to ${(pe[1] / pe[0]).toFixed(2)}`;
}
lines.push('level after the snippet loss, 4 weeks after vs 4 weeks before, first 10 faulted sites:');
for (const [k, v] of Object.entries(meanFall)) lines.push(`  weekends ${k.split('/')[0]}, share ${k.split('/')[1]}: ${v}`);

for (const src of Object.keys(SOURCES)) {
  const cols = SOURCES[src].cols, su = SOURCES[src].signup;
  lines.push(`==== source: ${src} (visitors = ${SOURCES[src].visitors})`);
  for (const [arm, extra] of Object.entries(ARMS)) {
    lines.push(`-- arm: ${arm}${extra.length ? ` (${extra.join(' ')})` : ''}`);
    for (const wk of [0.5, 0.4]) {
      for (const share of [0.6, 0.5]) {
        const heard = Object.fromEntries(cols.map((c) => [c, 0])), falseN = Object.fromEntries(cols.map((c) => [c, 0]));
        for (let s = 1; s <= SEEDS; s++) {
          const by = await watched(rowsFor(siteOnce({ wk, share, fault: true, seed: FAULT_SEED + s }), src), cols, extra);
          for (const c of cols) {
            const when = c === su ? SU_OFF : PV_OFF;
            if ((by[c] ?? []).some((d) => near(d, when))) heard[c]++;
            falseN[c] += (by[c] ?? []).filter((d) => !near(d, when)).length;
          }
        }
        lines.push(`weekends ${wk}, page views to ${share}: heard visitors ${heard.visitors}/${SEEDS}, page views ${heard.pageviews}/${SEEDS}, sign-ups ${heard[su]}/${SEEDS}; other dates: visitors ${falseN.visitors}, page views ${falseN.pageviews}, sign-ups ${falseN[su]}`);
      }
      const nullFalse = Object.fromEntries(cols.map((c) => [c, [0, 0]]));
      for (let s = 1; s <= SEEDS; s++) {
        const by = await watched(rowsFor(siteOnce({ wk, share: 1, fault: false, seed: NULL_SEED + s }), src), cols, extra);
        for (const c of cols) { const n = (by[c] ?? []).length; nullFalse[c][0] += n; if (n) nullFalse[c][1]++; }
      }
      lines.push(`weekends ${wk}, no fault: false dates ${cols.map((c) => `${c} ${nullFalse[c][0]} on ${nullFalse[c][1]} sites`).join(', ')}; total ${cols.reduce((t, c) => t + nullFalse[c][0], 0)}`);
    }
  }
}
const out = lines.join('\n') + '\n';
process.stdout.write(out);
writeFileSync(new URL('./visitor-columns.out.txt', import.meta.url), out);
