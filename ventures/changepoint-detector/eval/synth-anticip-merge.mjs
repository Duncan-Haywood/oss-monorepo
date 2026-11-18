// Merge eval/synth-anticip-sim.mjs shards. Per cell and per date (stated, backdated 2, backdated 4): the p <= 0.05
// share, how often Z's placebo warning fires, the p <= 0.05 share and mean |gap over the stated window| for panels
// Z warned vs not, and the mean gap over the stated window (signed; the true effect cells' truth is -1).
//   node eval/synth-anticip-merge.mjs part*.json > eval/synth-anticip-confirm.out.txt
import { readFileSync } from 'node:fs';
const rows = process.argv.slice(2).flatMap((f) => readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)));
const sig = (r) => r.p <= 0.05 + 1e-12;
const pct = (a, f) => (a.length ? (100 * a.filter(f).length / a.length).toFixed(1) : '-');
const mean = (a, f) => (a.length ? (a.reduce((s, r) => s + f(r), 0) / a.length).toFixed(3) : '-');
console.log('cell date n    p<=.05  Z warns | p<=.05: Z warned / not | mean |gap|: Z warned / not | mean gap (signed) | pre-RMSPE | W warns');
for (const c of [...new Set(rows.map((r) => r.cell))]) {
  for (const b of ['b0', 'b2', 'b4']) {
    const a = rows.filter((r) => r.cell === c).map((r) => r[b]);
    const zw = a.filter((r) => r.zWarn), zn = a.filter((r) => !r.zWarn);
    const ab = (r) => Math.abs(r.gapStated);
    console.log(`${c}   ${b.padEnd(4)} ${String(a.length).padEnd(4)} ${pct(a, sig).padStart(5)}%  ${pct(a, (r) => r.zWarn).padStart(6)}% | ${pct(zw, sig).padStart(5)} (${zw.length}) / ${pct(zn, sig).padStart(5)} (${zn.length}) | ${mean(zw, ab)} / ${mean(zn, ab)} | ${mean(a, (r) => r.gapStated)} | ${mean(a, (r) => r.pre)} | ${pct(a, (r) => r.wWarn)}%`);
  }
}
