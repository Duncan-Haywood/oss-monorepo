// Power on a known step inside a real cycle: add a level shift of k series-sd to lynx or yearly sunspots from a chosen
// year on, then ask each setup whether it puts a change within a tolerance of that year, and how many other changes
// it reports. Complements cyclic-series.mjs (false alarms only). Run: node eval/cyclic-power.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
import { SETUPS } from './cyclic-series.mjs';

export const load = (f) => {
  const rows = readFileSync(new URL(`../data/${f}.csv`, import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
  return { labels: rows.map((r) => r[0]), values: rows.map((r) => +r[1]) };
};
export const sdOf = (v) => {
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
};
export const KS = [0.5, 1, 2];
export const FRACS = [0.3, 0.5, 0.7];
export const TOL = 3;

// One cell: did the setup place a change within TOL indices of the step, and how many others did it add?
export function cell(d, opts, k, frac) {
  const at = Math.round(d.values.length * frac);
  const s = sdOf(d.values) * k;
  const values = d.values.map((v, i) => (i >= at ? v + s : v));
  const cps = analyze({ labels: d.labels, values, ...opts }).pelt.changepoints.map((c) => c.index);
  const hit = cps.some((i) => Math.abs(i - at) <= TOL);
  return { hit, other: cps.length - (hit ? 1 : 0) };
}

export function table(f) {
  const d = load(f);
  const out = {};
  for (const [name, o] of Object.entries(SETUPS)) {
    out[name] = {};
    for (const k of KS) {
      const cells = FRACS.map((fr) => cell(d, o, k, fr));
      out[name][k] = { hits: cells.filter((c) => c.hit).length, other: cells.map((c) => c.other) };
    }
  }
  return out;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  for (const f of ['lynx', 'sunspot-year']) {
    console.log(`${f}: step of k series-sd at 30%, 50%, 70% of the series; hit = a change within ${TOL} points`);
    const t = table(f);
    for (const [name, byK] of Object.entries(t)) {
      console.log(`  ${name.padEnd(22)} ` + KS.map((k) => `${k}sd ${byK[k].hits}/3 (other ${byK[k].other.join('/')})`).join('   '));
    }
  }
}
