// Which Plausible columns should the self-deploy watch follow by default? Simulated sites (the generator in
// plausible-metrics.test.mjs: ~400 visitors a weekday, weekends 50%, 1.2 visits a visitor, 2.2 page views a visit, 2% sign
// up) over 242 days, with a tag lost from 40% of pages on 2026-03-16 and a sign-up form losing 65% of its goals on
// 2026-01-12, and the same sites with neither (nulls). Each column watched as the workflow does (name:poisson, the
// count default). A change is heard when the watch dates one within 7 days of the true date; any other date is false.
//   node eval/plausible-columns.mjs [seeds=40]    (output: eval/plausible-columns.out.txt)
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main as watchMain } from '../watch.mjs';
import { toCsv, fillDays } from '../ga4-metrics.mjs';

const addDays = (day, k) => new Date(Date.parse(`${day}T00:00:00Z`) + k * 86400000).toISOString().slice(0, 10);
const lcg = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; };
const poisson = (u, lam) => {
  if (lam > 300) return Math.max(0, Math.round(lam + Math.sqrt(lam) * Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u())));
  let k = 0, p = Math.exp(-lam), c = p; const x = u(); while (x > c) { k++; p *= lam / k; c += p; } return k;
};
function site({ from, to, tagOff, tagShare, formOff, formShare, seed }) {
  const u = lcg(seed), days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    const visitors = poisson(u, 400 * (dow === 0 || dow === 6 ? 0.5 : 1) * (tagOff && d >= tagOff ? tagShare : 1));
    const visits = poisson(u, visitors * 1.2), pageviews = poisson(u, visits * 2.2);
    const signup = poisson(u, visitors * 0.02 * (formOff && d >= formOff ? formShare : 1));
    days.push({ date: d, values: { visitors, visits, pageviews, goal_signup: signup } });
  }
  return days;
}
const COLS = ['visitors', 'visits', 'pageviews', 'goal_signup'];
const TRUE = { visitors: '2026-03-16', visits: '2026-03-16', pageviews: '2026-03-16', goal_signup: '2026-01-12' };
const near = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) <= 7 * 86400000;

async function watched(rows) {
  const dir = mkdtempSync(join(tmpdir(), 'pl-eval-'));
  const csv = join(dir, 'p.csv');
  writeFileSync(csv, toCsv(fillDays(rows, COLS, rows[0].date, rows.at(-1).date), COLS));
  let text = '';
  await watchMain([csv, '--state', join(dir, 's.json'), '--columns', COLS.map((c) => `${c}:poisson`).join(',')], { out: (t) => { text += t; } });
  const by = {};
  for (const part of text.split(/^== /m).slice(1)) {
    const name = part.split(' ==')[0];
    const m = /already in the history, recorded as the baseline, not alerted \(([^)]*)\)/.exec(part);
    by[name] = m ? m[1].split(', ') : [];
  }
  return by;
}

const n = Number(process.argv[2] ?? 40);
const tally = Object.fromEntries(COLS.map((c) => [c, { heard: 0, falseInShifted: 0, falseInNull: 0, nullSitesWithFalse: 0 }]));
for (let seed = 1; seed <= n; seed++) {
  const shifted = await watched(site({ from: '2025-09-01', to: '2026-04-30', tagOff: '2026-03-16', tagShare: 0.6, formOff: '2026-01-12', formShare: 0.35, seed }));
  const nul = await watched(site({ from: '2025-09-01', to: '2026-04-30', seed: seed + 1000 }));
  for (const c of COLS) {
    const d = shifted[c] ?? [];
    if (d.some((x) => near(x, TRUE[c]))) tally[c].heard++;
    tally[c].falseInShifted += d.filter((x) => !near(x, TRUE[c])).length;
    const f = (nul[c] ?? []).length;
    tally[c].falseInNull += f;
    if (f) tally[c].nullSitesWithFalse++;
  }
}
const lines = [`${n} simulated sites with the two faults, ${n} without; 242 days each; every column watched as name:poisson.`, '', 'column        heard   false dates (faulted sites)   null sites with any false date (false dates)'];
for (const c of COLS) {
  const t = tally[c];
  lines.push(`${c.padEnd(13)} ${String(t.heard).padStart(2)}/${n}   ${String(t.falseInShifted).padStart(4)}                          ${String(t.nullSitesWithFalse).padStart(2)}/${n} (${t.falseInNull})`);
}
const report = lines.join('\n') + '\n';
process.stdout.write(report);
writeFileSync(new URL('./plausible-columns.out.txt', import.meta.url), report);
