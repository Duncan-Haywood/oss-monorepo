// Umami's API counts days in whatever time zone the caller names (umami-metrics.mjs --timezone, default UTC), where
// Plausible and PostHog use the site's own. What does fetching UTC days for an audience in another zone cost the watch?
// Simulated sites, hour by hour in the audience's local time: ~400 visitors a weekday (weekends at half), a daily
// curve peaking mid-afternoon and near zero at 4 a.m., 2.2 page views a visitor, 2% sign up. Faults at local
// midnight: the tracker lost from 40% of pages on 2026-03-16 (page views and visitors to 60%), and a form that stops
// sending 65% of its sign-ups on 2026-01-12. Nulls: the same sites with neither. Each site is cut into days twice:
// the audience's own days, and UTC days (shifted by the zone's offset, fixed here: -5 h New York in winter, +9 h
// Tokyo). Columns watched as the workflow does (name:poisson). Heard = dated within 7 days; any other date is false.
//   node eval/umami-timezone.mjs [seeds=40]    (output: eval/umami-timezone.out.txt)
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main as watchMain } from '../watch.mjs';
import { toCsv } from '../ga4-metrics.mjs';

const SEEDS = Number(process.argv[2] ?? 40);
const lcg = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; };
const poisson = (u, lam) => {
  if (lam > 300) return Math.max(0, Math.round(lam + Math.sqrt(lam) * Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u())));
  let k = 0, p = Math.exp(-lam), c = p; const x = u(); while (x > c) { k++; p *= lam / k; c += p; } return k;
};
const COLS = ['pageviews', 'visitors', 'event_signup'];
const PV_OFF = '2026-03-16', SU_OFF = '2026-01-12';
const START = Date.parse('2025-09-01T00:00:00Z'), END = Date.parse('2026-05-01T00:00:00Z');
// Share of a day's visitors arriving in each local hour: a raised cosine peaking at 15:00, lowest at 03:00.
const CURVE = (() => { const w = Array.from({ length: 24 }, (_, h) => 1.05 + Math.cos(((h - 15) / 24) * 2 * Math.PI)); const s = w.reduce((a, b) => a + b, 0); return w.map((x) => x / s); })();

// Hourly counts in local time; `local` hour index 0 is 2025-09-01 00:00 local.
function hours({ fault, seed }) {
  const u = lcg(seed), out = [];
  for (let t = START; t < END; t += 3600000) {
    const d = new Date(t), day = d.toISOString().slice(0, 10), dow = d.getUTCDay();
    const lam = 400 * (dow === 0 || dow === 6 ? 0.5 : 1) * CURVE[d.getUTCHours()];
    const all = poisson(u, lam);
    const visitors = poisson(u, all * (fault && day >= PV_OFF ? 0.6 : 1));
    out.push({ t, pageviews: poisson(u, visitors * 2.2), visitors, event_signup: poisson(u, all * 0.02 * (fault && day >= SU_OFF ? 0.35 : 1)) });
  }
  return out;
}

// Daily rows, with each local hour placed on the day it falls in for a clock `shiftH` hours ahead of local time
// (shiftH = -offset: UTC is 5 h ahead of New York, 9 h behind Tokyo). The first and last part-days are dropped.
function days(hs, shiftH) {
  const by = new Map();
  for (const h of hs) {
    const day = new Date(h.t + shiftH * 3600000).toISOString().slice(0, 10);
    const r = by.get(day) ?? { date: day, values: { pageviews: 0, visitors: 0, event_signup: 0 }, n: 0 };
    for (const c of COLS) r.values[c] += h[c];
    r.n++;
    by.set(day, r);
  }
  return [...by.values()].filter((r) => r.n === 24).map(({ date, values }) => ({ date, values }));
}

const near = (d, t) => Math.abs(Date.parse(d) - Date.parse(t)) <= 7 * 86400000;
async function watched(rows) {
  const dir = mkdtempSync(join(tmpdir(), 'um-eval-'));
  writeFileSync(join(dir, 'u.csv'), toCsv(rows, COLS));
  let text = '';
  await watchMain([join(dir, 'u.csv'), '--state', join(dir, 's.json'), '--columns', COLS.map((c) => `${c}:poisson`).join(',')], { out: (t) => { text += t; }, err: () => {} });
  const by = {};
  for (const part of text.split(/^== /m).slice(1)) {
    const name = part.slice(0, part.indexOf(' =='));
    by[name] = [...part.matchAll(/\d{4}-\d{2}-\d{2}/g)].map((m) => m[0]);
  }
  return by;
}

const lines = [`seeds ${SEEDS} per cell; heard = dated within 7 days; false = any other date (count, and sites with one)`];
for (const [zone, offset] of [['New York (UTC-5)', -5], ['Tokyo (UTC+9)', 9]]) {
  for (const [label, shift] of [['own days', 0], ['UTC days', -offset]]) {
    const heard = { pageviews: 0, visitors: 0, event_signup: 0 }, other = { pageviews: 0, visitors: 0, event_signup: 0 };
    const nul = Object.fromEntries(COLS.map((c) => [c, [0, 0]]));
    for (let s = 1; s <= SEEDS; s++) {
      const by = await watched(days(hours({ fault: true, seed: s }), shift));
      for (const c of COLS) {
        const at = c === 'event_signup' ? SU_OFF : PV_OFF;
        if ((by[c] ?? []).some((d) => near(d, at))) heard[c]++;
        other[c] += (by[c] ?? []).filter((d) => !near(d, at)).length;
      }
      const n0 = await watched(days(hours({ fault: false, seed: 1000 + s }), shift));
      for (const c of COLS) { const n = (n0[c] ?? []).length; nul[c][0] += n; if (n) nul[c][1]++; }
    }
    lines.push(`${zone}, ${label}: heard ${COLS.map((c) => `${c} ${heard[c]}/${SEEDS}`).join(', ')}; other dates on faulted sites ${COLS.map((c) => `${c} ${other[c]}`).join(', ')}; no fault: ${COLS.map((c) => `${c} ${nul[c][0]} on ${nul[c][1]}`).join(', ')}`);
  }
}
const out = lines.join('\n') + '\n';
process.stdout.write(out);
writeFileSync(new URL('./umami-timezone.out.txt', import.meta.url), out);
