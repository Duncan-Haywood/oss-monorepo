// Merge eval/synth-bias-sim.mjs shards: per cell, the share of panels with p <= 0.05, split by the balance flag
// (|stdGap| > 0.25) and by placeboShare >= 0.8 (the treated unit matched worse on Z than at least 80% of placebos are),
// and the mean |gap after the date - true effect| in each group.
//   node eval/synth-bias-merge.mjs part0.json part1.json ... > eval/synth-bias-confirm.out.txt
import { readFileSync } from 'node:fs';
const rows = process.argv.slice(2).flatMap((f) => readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)));
const cells = [...new Set(rows.map((r) => r.cell))];
const sig = (r) => r.p <= 0.05 + 1e-12;
const pct = (a, f) => (a.length ? (100 * a.filter(f).length / a.length).toFixed(1) : '-');
const mabs = (a) => (a.length ? (a.reduce((s, r) => s + Math.abs(r.bias), 0) / a.length).toFixed(3) : '-');
const grp = (a, f, label) => { const y = a.filter(f), n = a.filter((r) => !f(r)); return `${label} ${String(y.length).padStart(3)}/${String(n.length).padEnd(3)} p<=.05 ${pct(y, sig).padStart(5)} vs ${pct(n, sig).padStart(5)}  |bias| ${mabs(y)} vs ${mabs(n)}`; };
console.log('cell  n    p<=.05  mean|bias|  corr(bias, zPart) | flag |std|>0.25: in/out, p<=.05 in vs out, |bias| in vs out | placeboShare>=0.8: same');
for (const c of cells) {
  const a = rows.filter((r) => r.cell === c);
  const mean = (k) => a.reduce((s, r) => s + r[k], 0) / a.length;
  const mb = mean('bias'), mz = mean('zPart');
  const cov = a.reduce((s, r) => s + (r.bias - mb) * (r.zPart - mz), 0);
  const vb = a.reduce((s, r) => s + (r.bias - mb) ** 2, 0), vz = a.reduce((s, r) => s + (r.zPart - mz) ** 2, 0);
  const corr = vz > 0 ? (cov / Math.sqrt(vb * vz)).toFixed(2) : '-';
  console.log(`${c.padEnd(5)} ${String(a.length).padEnd(4)} ${pct(a, sig).padStart(6)}  ${mabs(a).padStart(9)}  ${corr.padStart(6)} | ${grp(a, (r) => Math.abs(r.stdGap) > 0.25, 'flag')} | ${grp(a, (r) => r.placeboShare >= 0.8, 'share')}`);
}
