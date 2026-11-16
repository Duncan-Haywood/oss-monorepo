// How the Stripe source + the default three-column watch behaves on synthetic shops (stripe-metrics.test.mjs's
// generator): 20 seeds with card declines jumping from 2% to a new rate 12 days before the end, and 20 seeds with
// no change, each watched daily over the last 30 days. Prints the delay to the first decline alert and every alert
// on any column. Synthetic only: no real Stripe account was used.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main, dayStart } from '../stripe-metrics.mjs';
import { main as watchMain } from '../watch.mjs';

const lcg = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; };
const poisson = (u, lam) => { let k = 0, p = Math.exp(-lam), c = p; const x = u(); while (x > c) { k++; p *= lam / k; c += p; } return k; };
function shop(today, shiftAt, rate2, seed) {
  const u = lcg(seed), out = []; let id = 0;
  for (let d = 120; d >= 1; d--) {
    const start = dayStart(today) - d * 86400, n = poisson(u, 40), f = shiftAt != null && d <= shiftAt ? rate2 : 0.02;
    for (let k = 0; k < n; k++) out.push({ id: `ch_${++id}`, created: start + Math.floor(u() * 86400), amount: 1000 + Math.floor(u() * 4000), currency: 'usd', status: u() < f ? 'failed' : 'succeeded' });
  }
  return out.sort((a, b) => b.created - a.created);
}
function fetchFor(objs) {
  return async (url) => {
    const q = new URL(url).searchParams, gte = +q.get('created[gte]'), lt = +q.get('created[lt]'), after = q.get('starting_after');
    let l = objs.filter((o) => o.created >= gte && o.created < lt);
    if (after) l = l.slice(l.findIndex((o) => o.id === after) + 1);
    return { ok: true, status: 200, json: async () => ({ object: 'list', has_more: l.length > 100, data: l.slice(0, 100) }) };
  };
}
const last = '2026-05-01', dayN = (b) => new Date(Date.parse(`${last}T00:00:00Z`) - b * 864e5).toISOString().slice(0, 10);
async function one(seed, shiftAt, rate2) {
  const dir = mkdtempSync(join(tmpdir(), 'sd-')), out = join(dir, 's.csv'), state = join(dir, 'st.json');
  const f = fetchFor(shop(last, shiftAt, rate2, seed)), alerts = [];
  for (let b = 30; b >= 0; b--) {
    await main(['--out', out, '--days', '90'], { env: { STRIPE_API_KEY: 'rk' }, fetchImpl: f, now: () => Date.parse(`${dayN(b)}T15:00:00Z`), out: () => {}, err: () => {} });
    let t = ''; await watchMain([out, '--state', state, '--columns', 'payments:poisson,revenue,failed:poisson', '--json'], { out: (x) => { t += x; } });
    for (const c of JSON.parse(t).columns) for (const a of c.alerts) alerts.push({ b, column: c.column, label: a.label });
  }
  return alerts;
}
for (const [name, shiftAt, rate2] of [['declines 2% -> 25%', 12, 0.25], ['declines 2% -> 10%', 12, 0.10], ['no change', null, 0]]) {
  let heard = 0, delays = [], falseLines = 0, early = 0, consequences = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const a = await one(seed * 7919, shiftAt, rate2);
    const fd = a.filter((x) => x.column === 'failed' && shiftAt != null && x.b < shiftAt);
    if (fd.length) { heard++; delays.push(shiftAt - fd[0].b); }
    const other = a.filter((x) => !(x.column === 'failed' && shiftAt != null && x.b < shiftAt));
    // succeeded payments and revenue really fall when a quarter of attempts are declined: an alert on them dated
    // after the jump is a true consequence, counted apart from lines with no change behind them
    const follow = other.filter((x) => shiftAt != null && x.b < shiftAt && x.column !== 'failed' && Math.abs(Date.parse(x.label) - Date.parse(dayN(shiftAt))) <= 3 * 864e5);
    consequences += follow.length;
    falseLines += other.length - follow.length;
    early += a.filter((x) => x.column === 'failed' && shiftAt != null && x.b >= shiftAt).length;
  }
  delays.sort((x, y) => x - y);
  console.log(`${name}: decline jump heard in ${heard}/20 shops${delays.length ? `, days after the jump: median ${delays[delays.length >> 1]}, range ${delays[0]}-${delays.at(-1)}` : ''}; payments/revenue alerts dated at the jump ${consequences}; other alert lines ${falseLines} in ${20 * 31} checks (${(100 * falseLines / (20 * 31)).toFixed(1)} per 100)`);
}
