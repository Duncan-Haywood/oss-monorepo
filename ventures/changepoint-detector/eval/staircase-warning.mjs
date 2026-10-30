// How often the block-variance rangeWarning fires on a series whose steps are all real: a staircase of k true
// level changes in white noise (sd 1), seeded. Run: node eval/staircase-warning.mjs
import { analyze } from '../engine.mjs';

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function gauss(r) { return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); }

export function staircase(k, jump, segLen, seed, alternate) {
  const r = rng(seed), v = [];
  for (let s = 0; s <= k; s++) {
    const level = alternate ? (s % 2) * jump : s * jump;
    for (let i = 0; i < segLen; i++) v.push(level + gauss(r));
  }
  return v;
}

export function table(seeds = 20) {
  const rows = [];
  for (const alternate of [false, true]) for (const k of [5, 8, 12]) for (const jump of [2, 3]) {
    let fired = 0, found = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const a = analyze({ values: staircase(k, jump, 40, seed * 7919 + k, alternate) });
      found += a.pelt.changepoints.length;
      if (a.rangeWarning && /wanders more than independent noise/.test(a.rangeWarning)) fired++;
    }
    rows.push({ shape: alternate ? 'alternating' : 'staircase', k, jump, fired, seeds, meanFound: +(found / seeds).toFixed(1) });
  }
  return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('shape        true steps  jump(sd)  warning fired  mean steps found');
  for (const r of table()) console.log(`${r.shape.padEnd(12)} ${String(r.k).padStart(10)}  ${String(r.jump).padStart(8)}  ${String(r.fired).padStart(6)}/${r.seeds}      ${r.meanFound}`);
}
