// Which PostHog columns hear which faults, and how small a page-view drop the default watch hears on a product with a
// deep weekday cycle? Simulated products (the generator in posthog-metrics.test.mjs: ~300 people a weekday, weekends
// at `wk` of that, 2.5 page views a person, 3% sign up) over 242 days. Faults: page views falling to `share` of their
// level on 2026-03-16 (the snippet dropped from part of a new layout; people are still counted from other events), and
// sign-ups falling to 35% on 2026-01-12 (a release that stopped calling capture on one sign-up path). Nulls: the same
// products with neither. Each column watched as the workflow does (name:poisson, the count default). A change is heard
// when the watch dates one within 7 days of the true date; any other date is false.
//   node eval/posthog-columns.mjs [seeds=40]    (output: eval/posthog-columns.out.txt)
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main as watchMain } from '../watch.mjs';
import { toCsv } from '../ga4-metrics.mjs';

const SEEDS = Number(process.argv[2] ?? 40);
const addDays = (day, k) => new Date(Date.parse(`${day}T00:00:00Z`) + k * 86400000).toISOString().slice(0, 10);
const lcg = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; };
const poisson = (u, lam) => {
  if (lam > 300) return Math.max(0, Math.round(lam + Math.sqrt(lam) * Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u())));
  let k = 0, p = Math.exp(-lam), c = p; const x = u(); while (x > c) { k++; p *= lam / k; c += p; } return k;
};
const COLS = ['event_pageview', 'event_signed_up', 'users'];
const PV_OFF = '2026-03-16', SU_OFF = '2026-01-12';

function product({ wk, share, fault, seed }) {
  const u = lcg(seed), rows = [];
  for (let d = '2025-09-01'; d <= '2026-04-30'; d = addDays(d, 1)) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    const people = poisson(u, 300 * (dow === 0 || dow === 6 ? wk : 1));
    const pv = poisson(u, people * 2.5 * (fault && d >= PV_OFF ? share : 1));
    const su = poisson(u, people * 0.03 * (fault && d >= SU_OFF ? 0.35 : 1));
    rows.push({ date: d, values: { event_pageview: pv, event_signed_up: su, users: people } });
  }
  return rows;
}

const near = (d, t) => Math.abs(Date.parse(d) - Date.parse(t)) <= 7 * 86400000;
async function watched(rows) {
  const dir = mkdtempSync(join(tmpdir(), 'ph-eval-'));
  writeFileSync(join(dir, 'p.csv'), toCsv(rows, COLS));
  let text = '';
  await watchMain([join(dir, 'p.csv'), '--state', join(dir, 's.json'), '--columns', COLS.map((c) => `${c}:poisson`).join(',')], { out: (t) => { text += t; }, err: () => {} });
  const by = {};
  for (const part of text.split(/^== /m).slice(1)) {
    const name = part.slice(0, part.indexOf(' =='));
    by[name] = [...part.matchAll(/\d{4}-\d{2}-\d{2}/g)].map((m) => m[0]);
  }
  return by;
}

const lines = [`seeds ${SEEDS} per cell; heard = dated within 7 days; false = any other date (count, and products with one)`];
for (const wk of [0.5, 0.4]) {
  for (const share of [0.6, 0.5]) {
    const heard = { event_pageview: 0, event_signed_up: 0 }, falseN = Object.fromEntries(COLS.map((c) => [c, 0]));
    for (let s = 1; s <= SEEDS; s++) {
      const by = await watched(product({ wk, share, fault: true, seed: s }));
      if ((by.event_pageview ?? []).some((d) => near(d, PV_OFF))) heard.event_pageview++;
      if ((by.event_signed_up ?? []).some((d) => near(d, SU_OFF))) heard.event_signed_up++;
      falseN.event_pageview += (by.event_pageview ?? []).filter((d) => !near(d, PV_OFF)).length;
      falseN.event_signed_up += (by.event_signed_up ?? []).filter((d) => !near(d, SU_OFF)).length;
      falseN.users += (by.users ?? []).length;
    }
    lines.push(`weekends ${wk}, page views to ${share}: heard page views ${heard.event_pageview}/${SEEDS}, sign-ups ${heard.event_signed_up}/${SEEDS}; other dates: page views ${falseN.event_pageview}, sign-ups ${falseN.event_signed_up}, users ${falseN.users}`);
  }
  const nullFalse = Object.fromEntries(COLS.map((c) => [c, [0, 0]]));
  for (let s = 1; s <= SEEDS; s++) {
    const by = await watched(product({ wk, share: 1, fault: false, seed: 1000 + s }));
    for (const c of COLS) { const n = (by[c] ?? []).length; nullFalse[c][0] += n; if (n) nullFalse[c][1]++; }
  }
  lines.push(`weekends ${wk}, no fault: false dates ${COLS.map((c) => `${c} ${nullFalse[c][0]} on ${nullFalse[c][1]} products`).join(', ')}`);
}
const out = lines.join('\n') + '\n';
process.stdout.write(out);
writeFileSync(new URL('./posthog-columns.out.txt', import.meta.url), out);
