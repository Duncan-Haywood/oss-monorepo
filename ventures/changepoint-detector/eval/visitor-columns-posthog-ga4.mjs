// PostHog's `users` (people who did any named event that day) and GA4's `activeUsers` and `sessions` were the two
// people-like columns left without a person-by-person simulation after README "Visitors under a partial snippet loss":
// eval/posthog-columns.mjs left `users` untouched by a snippet loss, and GA4 had no column eval at all. A person or a
// session still counts if any one of their page views is tracked, so these columns fall less than page views. This
// eval draws people, sessions and page views one by one, as eval/visitor-columns.mjs does, and asks which default each
// source's workflow should use.
//
// Simulated sites, 2025-09-01 to 2026-04-30: Poisson(400) people a weekday, weekends at `wk`; each person makes
// 1 + Poisson(0.2) sessions, each session 1 + Poisson(1.2) page views. Fault 1, 2026-03-16: the snippet lost from part
// of the site, each page view tracked with probability `share`; a session counts if at least one of its page views is
// tracked, a person if any of their sessions does. Fault 2, 2026-01-12: a sign-up form sending 35% of its events (2% of
// people sign up; the sign-up event is counted whatever happened to the page views, as a server-side capture would be).
// Nulls: the same sites with neither.
// PostHog columns as its workflow writes them (`--event '$pageview' --event signed_up`): event_pageview,
// event_signed_up, users (people with a tracked page view or a sign-up). GA4 (default metrics): sessions, activeUsers,
// screenPageViews, keyEvents (= sign-ups); its workflow watches sessions, activeUsers and keyEvents, not page views.
// Each watched column is name:poisson. Heard = dated within 7 days of the true date; any other date is false.
//
// Pre-registered 2026-11-23 before it first ran, on fresh seeds (8001-8040 faulted, 9001-9040 no fault). Arms: the
// count default; the middle setting (--detector pelt --overdispersion nb --trend gated). For each source separately,
// with "people" = PostHog `users` or GA4 `activeUsers`:
//   (V0) if the count default already hears people on >= 36 of 40 at share 0.5 at both weekend depths, nothing
//        changes for that source;
//   otherwise the middle setting becomes that source's workflow default WATCH_OPTIONS if, at both weekend depths,
//   (V1) it hears people on >= 36 of 40 at share 0.5 (GA4: and sessions on >= 36 of 40 too),
//   (V2) it hears every other watched column (PostHog page views and sign-ups; GA4 key events) on no fewer than the
//        count default's count minus 2 in each faulted cell, and
//   (V3) its false dates on the no-fault sites, summed over the three watched columns, are at most the count
//        default's plus 2.
// GA4 only, a third arm: the arm that wins V0-V3 (middle if it passes, else the count default) with screenPageViews
// added to the watched columns. (P1) page views join the GA4 default columns if, at both weekend depths, they are
// heard on >= 36 of 40 at share 0.6 and at share 0.5, and (P2) the page-view column adds at most 2 false dates on the
// 40 no-fault sites at each depth.
// If a source fails V1-V3 the default stays and the README says its people column hears a partial snippet loss poorly.
//   node eval/visitor-columns-posthog-ga4.mjs [seeds=40]    (output: eval/visitor-columns-posthog-ga4.out.txt)
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main as watchMain } from '../watch.mjs';
import { toCsv } from '../ga4-metrics.mjs';

const SEEDS = Number(process.argv[2] ?? 40);
export const MIDDLE = ['--detector', 'pelt', '--overdispersion', 'nb', '--trend', 'gated'];
const FAULT_SEED = 8000, NULL_SEED = 9000;
export const PV_OFF = '2026-03-16', SU_OFF = '2026-01-12';
export const SOURCES = {
  posthog: {
    all: ['event_pageview', 'event_signed_up', 'users'],
    watched: ['event_pageview', 'event_signed_up', 'users'],
    people: 'users', signup: 'event_signed_up', pv: 'event_pageview',
    values: (d) => ({ event_pageview: d.pageviews, event_signed_up: d.signup, users: d.phUsers }),
  },
  ga4: {
    all: ['sessions', 'activeUsers', 'screenPageViews', 'keyEvents'],
    watched: ['sessions', 'activeUsers', 'keyEvents'],
    people: 'activeUsers', signup: 'keyEvents', pv: 'screenPageViews',
    values: (d) => ({ sessions: d.sessions, activeUsers: d.people, screenPageViews: d.pageviews, keyEvents: d.signup }),
  },
};
const addDays = (day, k) => new Date(Date.parse(`${day}T00:00:00Z`) + k * 86400000).toISOString().slice(0, 10);
const lcg = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; };
const poisson = (u, lam) => {
  if (lam > 300) return Math.max(0, Math.round(lam + Math.sqrt(lam) * Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u())));
  let k = 0, p = Math.exp(-lam), c = p; const x = u(); while (x > c) { k++; p *= lam / k; c += p; } return k;
};

/** One site, day by day: people (any tracked page view), sessions, page views, sign-ups, PostHog users. */
export function site({ wk, share, fault, seed }) {
  const u = lcg(seed), days = [];
  for (let d = '2025-09-01'; d <= '2026-04-30'; d = addDays(d, 1)) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    const n = poisson(u, 400 * (dow === 0 || dow === 6 ? wk : 1));
    const sh = fault && d >= PV_OFF ? share : 1;
    const suRate = 0.02 * (fault && d >= SU_OFF ? 0.35 : 1);
    let people = 0, sessions = 0, pageviews = 0, signup = 0, phUsers = 0;
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
      const signed = u() < suRate;
      if (signed) signup++;
      if (seen) people++;
      if (seen || signed) phUsers++;
    }
    days.push({ date: d, people, sessions, pageviews, signup, phUsers });
  }
  return days;
}

const near = (d, t) => Math.abs(Date.parse(d) - Date.parse(t)) <= 7 * 86400000;
export async function watched(rows, all, cols, extra = []) {
  const dir = mkdtempSync(join(tmpdir(), 'visitor-ph-ga4-'));
  writeFileSync(join(dir, 'p.csv'), toCsv(rows, all));
  let text = '';
  await watchMain([join(dir, 'p.csv'), '--state', join(dir, 's.json'), '--columns', cols.map((c) => `${c}:poisson`).join(','), ...extra], { out: (t) => { text += t; }, err: () => {} });
  const by = {};
  for (const part of text.split(/^== /m).slice(1)) {
    const name = part.slice(0, part.indexOf(' =='));
    by[name] = [...part.matchAll(/\d{4}-\d{2}-\d{2}/g)].map((m) => m[0]);
  }
  return by;
}

const cache = new Map();
const siteOnce = (o) => { const k = JSON.stringify(o); if (!cache.has(k)) cache.set(k, site(o)); return cache.get(k); };

/** heard[wk][share][col], other[wk][share][col], nulls[wk][col] = false dates for one source and one arm. */
async function runArm(src, cols, extra) {
  const S = SOURCES[src], res = { heard: {}, other: {}, nulls: {} };
  for (const wk of [0.5, 0.4]) {
    res.heard[wk] = {}; res.other[wk] = {};
    for (const share of [0.6, 0.5]) {
      const heard = Object.fromEntries(cols.map((c) => [c, 0])), other = Object.fromEntries(cols.map((c) => [c, 0]));
      for (let s = 1; s <= SEEDS; s++) {
        const rows = siteOnce({ wk, share, fault: true, seed: FAULT_SEED + s }).map((d) => ({ date: d.date, values: S.values(d) }));
        const by = await watched(rows, S.all, cols, extra);
        for (const c of cols) {
          const when = c === S.signup ? SU_OFF : PV_OFF;
          if ((by[c] ?? []).some((d) => near(d, when))) heard[c]++;
          other[c] += (by[c] ?? []).filter((d) => !near(d, when)).length;
        }
      }
      res.heard[wk][share] = heard; res.other[wk][share] = other;
    }
    const nulls = Object.fromEntries(cols.map((c) => [c, 0]));
    for (let s = 1; s <= SEEDS; s++) {
      const rows = siteOnce({ wk, share: 1, fault: false, seed: NULL_SEED + s }).map((d) => ({ date: d.date, values: S.values(d) }));
      const by = await watched(rows, S.all, cols, extra);
      for (const c of cols) nulls[c] += (by[c] ?? []).length;
    }
    res.nulls[wk] = nulls;
  }
  return res;
}

function describe(lines, label, res, cols) {
  lines.push(`-- arm: ${label}`);
  for (const wk of [0.5, 0.4]) {
    for (const share of [0.6, 0.5]) {
      lines.push(`weekends ${wk}, page views to ${share}: heard ${cols.map((c) => `${c} ${res.heard[wk][share][c]}/${SEEDS}`).join(', ')}; other dates ${cols.map((c) => `${c} ${res.other[wk][share][c]}`).join(', ')}`);
    }
    const tot = cols.reduce((t, c) => t + res.nulls[wk][c], 0);
    lines.push(`weekends ${wk}, no fault: false dates ${cols.map((c) => `${c} ${res.nulls[wk][c]}`).join(', ')}; total ${tot}`);
  }
}

const WKS = [0.5, 0.4], SHARES = [0.6, 0.5];
const falseTotal = (res, cols, wk) => cols.reduce((t, c) => t + res.nulls[wk][c], 0);

async function main() {
  const lines = [`seeds ${SEEDS} per cell (faulted ${FAULT_SEED + 1}-${FAULT_SEED + SEEDS}, no fault ${NULL_SEED + 1}-${NULL_SEED + SEEDS}); heard = dated within 7 days; false = any date on a no-fault site`];
  lines.push('level after the snippet loss, 4 weeks after vs 4 weeks before, first 10 faulted sites:');
  for (const wk of WKS) for (const share of SHARES) {
    const sum = { pageviews: [0, 0], sessions: [0, 0], people: [0, 0], phUsers: [0, 0] };
    for (let s = 1; s <= 10; s++) for (const r of siteOnce({ wk, share, fault: true, seed: FAULT_SEED + s })) {
      if (r.date < '2026-02-16' || r.date >= '2026-04-13') continue;
      const i = r.date >= PV_OFF ? 1 : 0;
      for (const k of Object.keys(sum)) sum[k][i] += r[k];
    }
    lines.push(`  weekends ${wk}, share ${share}: page views to ${(sum.pageviews[1] / sum.pageviews[0]).toFixed(2)}, sessions to ${(sum.sessions[1] / sum.sessions[0]).toFixed(2)}, people (GA4 activeUsers) to ${(sum.people[1] / sum.people[0]).toFixed(2)}, PostHog users to ${(sum.phUsers[1] / sum.phUsers[0]).toFixed(2)}`);
  }
  const verdicts = [];
  for (const src of Object.keys(SOURCES)) {
    const S = SOURCES[src], cols = S.watched;
    lines.push(`==== source: ${src} (people = ${S.people}; watched ${cols.join(', ')})`);
    const def = await runArm(src, cols, []);
    describe(lines, 'count default', def, cols);
    const mid = await runArm(src, cols, MIDDLE);
    describe(lines, `middle (${MIDDLE.join(' ')})`, mid, cols);
    const peopleCols = src === 'ga4' ? [S.people, 'sessions'] : [S.people];
    const v0 = WKS.every((wk) => def.heard[wk][0.5][S.people] >= 36);
    const v1 = WKS.every((wk) => peopleCols.every((c) => mid.heard[wk][0.5][c] >= 36));
    const others = cols.filter((c) => !peopleCols.includes(c));
    const v2 = WKS.every((wk) => SHARES.every((sh) => others.every((c) => mid.heard[wk][sh][c] >= def.heard[wk][sh][c] - 2)));
    const v3 = WKS.every((wk) => falseTotal(mid, cols, wk) <= falseTotal(def, cols, wk) + 2);
    const ships = !v0 && v1 && v2 && v3;
    verdicts.push(`${src}: V0 ${v0 ? 'holds (nothing changes)' : 'fails'}; V1 ${v1 ? 'passes' : 'fails'}, V2 ${v2 ? 'passes' : 'fails'}, V3 ${v3 ? 'passes' : 'fails'} -> ${v0 ? 'default stays' : ships ? 'middle ships as the default' : 'default stays; people column reads a snippet loss poorly'}`);
    if (src === 'ga4') {
      const winner = ships ? MIDDLE : [];
      const withPv = [...cols, S.pv];
      const pv = await runArm(src, withPv, winner);
      describe(lines, `${ships ? 'middle' : 'count default'} with ${S.pv} watched`, pv, withPv);
      const p1 = WKS.every((wk) => SHARES.every((sh) => pv.heard[wk][sh][S.pv] >= 36));
      const p2 = WKS.every((wk) => pv.nulls[wk][S.pv] <= 2);
      verdicts.push(`ga4 page views: P1 ${p1 ? 'passes' : 'fails'}, P2 ${p2 ? 'passes' : 'fails'} -> ${p1 && p2 ? `${S.pv} joins the GA4 default columns` : 'page views stay out of the default'}`);
    }
  }
  lines.push('==== verdicts (pre-registered rule in the header)', ...verdicts);
  const out = lines.join('\n') + '\n';
  process.stdout.write(out);
  if (SEEDS === 40) writeFileSync(new URL('./visitor-columns-posthog-ga4.out.txt', import.meta.url), out);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
