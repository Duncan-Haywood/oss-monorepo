// A template-shaped tracking loss: one page type (every page built from one template) loses the GA4 tag for
// everyone. README "Visitors under a partial snippet loss" and "PostHog users and GA4 activeUsers under a snippet loss"
// both simulated the loss as each page view dropped at random and listed this as not checked. A real loss is usually
// by template: a theme update drops the tag from the blog layout, a help centre moves to a hosted tool, a checkout
// page is served by a payment provider's domain. Visitors who only see those pages vanish; a key event fired on
// that template vanishes with them.
//
// Simulated GA4 properties, 2025-09-01 to 2026-04-30: Poisson(400) people a weekday, weekends at `wk`; each person
// 1 + Poisson(0.2) sessions, each session 1 + Poisson(1.2) page views. Templates (section = first path segment, GA4's
// pagePathLevel1): the landing page of a session is drawn from home 0.20, category 0.12, product 0.28, blog 0.32,
// help 0.08; each later page view from home 0.12, category 0.25, product 0.33, blog 0.12, help 0.06, checkout 0.12.
// A session that views checkout sends the key event with probability 0.25, on the checkout page (same tag).
// Healthy sites are not flat: about once in 45 days a blog post takes off (blog landings that day x(1.5 to 5),
// falling by half a day for three more days), so a section column has the content swings a real one has.
// Faults from 2026-03-16, each on its own 40 sites: (T1) help dark (~5% of page views, no key event), (T2) blog
// dark (~25% of page views, the most-landed template), (T3) checkout dark (~8% of page views, the key event goes
// too). Nulls: the same sites with no fault, viral days included.
//
// Arms, each with the middle setting the GA4 workflow already ships (--detector pelt --overdispersion nb
// --trend gated): (A) the shipped GA4 default columns, sessions, activeUsers, screenPageViews, keyEvents; (B) A plus
// one page-view column per section for the five sections with the most views (views_home, views_product, ...).
// Heard = any watched column dated within 7 days of 2026-03-16. False = any date on a no-fault site.
//
// Pre-registered 2026-11-24 before it first ran, on fresh seeds (faulted 12001-12040, 13001-13040, 14001-14040 for
// T1-T3; no fault 15001-15040), at weekend depths 0.5 and 0.4:
//   (H) no bar: how often A hears each fault, and how far activeUsers falls under a template loss against a random
//       loss of the same page-view share (the README's "visitors fall further" claim). Reported either way.
//   (S1) B hears T1 on >= 36 of 40 at both depths;
//   (S2) B hears T2 and T3 on no fewer than A's count minus 2 at each depth;
//   (S3) B's false dates on the no-fault sites, summed over all its columns, are at most A's plus 4 at each depth.
// If S1-S3 pass, ga4-metrics.mjs gains --sections N (a second runReport by date and pagePathLevel1) and the GA4
// workflow's default fetch adds --sections 5 and watches the views_ columns. If S1 and S2 pass and S3 fails,
// --sections ships as an option only, with the false-date count in the README. If S1 fails, nothing is offered.
//   node eval/template-loss.mjs [seeds=40]    (output: eval/template-loss.out.txt)
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { main as watchMain } from '../watch.mjs';
import { toCsv } from '../ga4-metrics.mjs';

const SEEDS = Number(process.argv[2] ?? 40);
export const MIDDLE = ['--detector', 'pelt', '--overdispersion', 'nb', '--trend', 'gated'];
export const OFF = '2026-03-16';
export const SECTIONS = ['home', 'category', 'product', 'blog', 'help', 'checkout'];
const LAND = [0.20, 0.12, 0.28, 0.32, 0.08, 0];
const NEXT = [0.12, 0.25, 0.33, 0.12, 0.06, 0.12];
const FAULTS = { T1: { dark: 'help', seed: 12000 }, T2: { dark: 'blog', seed: 13000 }, T3: { dark: 'checkout', seed: 14000 } };
const NULL_SEED = 15000;
export const BASE = ['sessions', 'activeUsers', 'screenPageViews', 'keyEvents'];

const addDays = (day, k) => new Date(Date.parse(`${day}T00:00:00Z`) + k * 86400000).toISOString().slice(0, 10);
const lcg = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; };
const poisson = (u, lam) => {
  if (lam > 300) return Math.max(0, Math.round(lam + Math.sqrt(lam) * Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u())));
  let k = 0, p = Math.exp(-lam), c = p; const x = u(); while (x > c) { k++; p *= lam / k; c += p; } return k;
};
const pick = (u, w) => { let x = u() * w.reduce((a, b) => a + b, 0); for (let i = 0; i < w.length; i++) { x -= w[i]; if (x < 0) return i; } return w.length - 1; };

/**
 * One property, day by day. `dark` is a section whose pages send nothing from OFF on; `share` instead tracks every page
 * view with that probability from OFF on (the earlier evals' random loss, for the H comparison). Returns
 * [{ date, sessions, activeUsers, screenPageViews, keyEvents, views: {section: n} }].
 */
export function site({ wk, dark = null, share = 1, seed }) {
  const u = lcg(seed), days = [];
  let viral = 0;
  for (let d = '2025-09-01'; d <= '2026-04-30'; d = addDays(d, 1)) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (u() < 1 / 45) viral = 1.5 + 3.5 * u(); else viral = viral > 1 ? 1 + (viral - 1) / 2 : 0;
    const boost = viral > 1.05 ? viral : 1;
    const land = LAND.slice(); land[3] *= boost;
    const scale = land.reduce((a, b) => a + b, 0);
    const n = poisson(u, 400 * (dow === 0 || dow === 6 ? wk : 1) * scale);
    const on = d >= OFF;
    const views = Object.fromEntries(SECTIONS.map((s) => [s, 0]));
    let people = 0, sessions = 0, pageviews = 0, key = 0;
    for (let i = 0; i < n; i++) {
      let seen = false;
      const k = 1 + poisson(u, 0.2);
      for (let s = 0; s < k; s++) {
        const pv = 1 + poisson(u, 1.2);
        let tracked = 0, checkout = false;
        for (let p = 0; p < pv; p++) {
          const sec = SECTIONS[p === 0 ? pick(u, land) : pick(u, NEXT)];
          const sent = on ? (dark ? sec !== dark : share === 1 || u() < share) : true;
          if (sec === 'checkout') checkout = checkout || sent;
          if (sent) { tracked++; views[sec]++; }
        }
        pageviews += tracked;
        if (tracked) { sessions++; seen = true; }
        if (checkout && u() < 0.25) key++;
      }
      if (seen) people++;
    }
    days.push({ date: d, sessions, activeUsers: people, screenPageViews: pageviews, keyEvents: key, views });
  }
  return days;
}

/** The five sections with the most views over the whole series, as GA4 --sections 5 would pick them. */
export function topSections(days, n = 5) {
  const tot = Object.fromEntries(SECTIONS.map((s) => [s, 0]));
  for (const d of days) for (const s of SECTIONS) tot[s] += d.views[s];
  return SECTIONS.slice().sort((a, b) => tot[b] - tot[a]).slice(0, n);
}

const near = (d, t) => Math.abs(Date.parse(d) - Date.parse(t)) <= 7 * 86400000;
async function watched(days, cols, extra) {
  const dir = mkdtempSync(join(tmpdir(), 'template-loss-'));
  const rows = days.map((d) => ({ date: d.date, values: { ...Object.fromEntries(BASE.map((c) => [c, d[c]])), ...Object.fromEntries(SECTIONS.map((s) => [`views_${s}`, d.views[s]])) } }));
  writeFileSync(join(dir, 'p.csv'), toCsv(rows, [...BASE, ...SECTIONS.map((s) => `views_${s}`)]));
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
const colsFor = (arm, days) => (arm === 'A' ? BASE : [...BASE, ...topSections(days).map((s) => `views_${s}`)]);

async function main() {
  const WKS = [0.5, 0.4];
  const lines = [`seeds ${SEEDS} per cell; heard = any watched column dated within 7 days of ${OFF}; false = any date on a no-fault site; every arm runs ${MIDDLE.join(' ')}`];
  lines.push('levels, 4 weeks after vs 4 weeks before, first 10 sites of each fault (weekends 0.5):');
  const ratio = (days, k) => {
    let a = 0, b = 0;
    for (const r of days) { if (r.date < '2026-02-16' || r.date >= '2026-04-13') continue; const v = typeof k === 'function' ? k(r) : r[k]; if (r.date >= OFF) b += v; else a += v; }
    return b / a;
  };
  for (const [name, f] of Object.entries(FAULTS)) {
    const acc = { pv: 0, users: 0, sess: 0, key: 0 };
    const rnd = { users: 0, sess: 0 };
    for (let s = 1; s <= 10; s++) {
      const days = siteOnce({ wk: 0.5, dark: f.dark, seed: f.seed + s });
      const pv = ratio(days, 'screenPageViews');
      acc.pv += pv / 10; acc.users += ratio(days, 'activeUsers') / 10; acc.sess += ratio(days, 'sessions') / 10; acc.key += ratio(days, 'keyEvents') / 10;
      // A random loss with the same page-view share on the same seed: the earlier evals' model.
      const r = site({ wk: 0.5, share: Math.min(1, pv), seed: f.seed + s });
      rnd.users += ratio(r, 'activeUsers') / 10; rnd.sess += ratio(r, 'sessions') / 10;
    }
    lines.push(`  ${name} (${f.dark} dark): page views to ${acc.pv.toFixed(3)}, sessions to ${acc.sess.toFixed(3)}, activeUsers to ${acc.users.toFixed(3)}, keyEvents to ${acc.key.toFixed(3)}; a random loss of the same page-view share: sessions to ${rnd.sess.toFixed(3)}, activeUsers to ${rnd.users.toFixed(3)}`);
  }
  const res = { A: {}, B: {} };
  for (const arm of ['A', 'B']) {
    for (const wk of WKS) {
      const cell = { heard: {}, byCol: {}, other: {}, nulls: 0, nullByCol: {} };
      for (const [name, f] of Object.entries(FAULTS)) {
        let heard = 0, other = 0; const byCol = {};
        for (let s = 1; s <= SEEDS; s++) {
          const days = siteOnce({ wk, dark: f.dark, seed: f.seed + s });
          const cols = colsFor(arm, days);
          const by = await watched(days, cols, MIDDLE);
          let hit = false;
          for (const c of cols) {
            const ds = by[c] ?? [];
            if (ds.some((d) => near(d, OFF))) { hit = true; byCol[c] = (byCol[c] ?? 0) + 1; }
            other += ds.filter((d) => !near(d, OFF)).length;
          }
          if (hit) heard++;
        }
        cell.heard[name] = heard; cell.byCol[name] = byCol; cell.other[name] = other;
      }
      for (let s = 1; s <= SEEDS; s++) {
        const days = siteOnce({ wk, seed: NULL_SEED + s });
        const cols = colsFor(arm, days);
        const by = await watched(days, cols, MIDDLE);
        for (const c of cols) { const k = (by[c] ?? []).length; cell.nulls += k; if (k) cell.nullByCol[c] = (cell.nullByCol[c] ?? 0) + k; }
      }
      res[arm][wk] = cell;
      const fmt = (o) => Object.entries(o).map(([c, k]) => `${c} ${k}`).join(', ') || 'none';
      lines.push(`-- arm ${arm}, weekends ${wk}`);
      for (const name of Object.keys(FAULTS)) lines.push(`   ${name}: heard ${cell.heard[name]}/${SEEDS} (by column: ${fmt(cell.byCol[name])}); other dates on faulted sites ${cell.other[name]}`);
      lines.push(`   no fault: false dates ${cell.nulls} (${fmt(cell.nullByCol)})`);
    }
  }
  const s1 = WKS.every((wk) => res.B[wk].heard.T1 >= 36);
  const s2 = WKS.every((wk) => ['T2', 'T3'].every((t) => res.B[wk].heard[t] >= res.A[wk].heard[t] - 2));
  const s3 = WKS.every((wk) => res.B[wk].nulls <= res.A[wk].nulls + 4);
  const verdict = s1 && s2 && s3 ? '--sections 5 joins the GA4 workflow default' : s1 && s2 ? '--sections ships as an option only' : 'nothing offered';
  lines.push('==== verdict (pre-registered rule in the header)', `S1 ${s1 ? 'passes' : 'fails'}, S2 ${s2 ? 'passes' : 'fails'}, S3 ${s3 ? 'passes' : 'fails'} -> ${verdict}`);
  const out = lines.join('\n') + '\n';
  process.stdout.write(out);
  if (SEEDS === 40) writeFileSync(new URL('./template-loss.out.txt', import.meta.url), out);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
