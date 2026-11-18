// Merge eval/synth-floor-sim.mjs shards: node eval/synth-floor-merge.mjs part*.json
// Per cell and statistic: share of panels with p <= 0.05 and p <= 0.10; fit-warned share; treated before-gap over the floor.
import { readFileSync } from 'node:fs';
const rows = process.argv.slice(2).flatMap((f) => readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)));
const cells = [...new Set(rows.map((r) => r.cell))];
const pct = (a, b) => (b ? (100 * a / b).toFixed(1) : '-');
const share = (rs, key, a) => pct(rs.filter((r) => r[key] <= a + 1e-12).length, rs.length).padStart(5);
console.log('cell  panels | ratio p<=.05 p<=.10 | floored p<=.05 p<=.10 | post p<=.05 p<=.10 | fit-warned  pre/floor median  mean effect');
for (const c of cells) {
  const rs = rows.filter((r) => r.cell === c);
  const pf = rs.map((r) => r.pre / r.floor).sort((a, b) => a - b)[rs.length >> 1];
  const eff = rs.reduce((s, r) => s + r.effect, 0) / rs.length;
  console.log(`${c.padEnd(5)} ${String(rs.length).padStart(6)} | ${share(rs, 'pRatio', 0.05)}% ${share(rs, 'pRatio', 0.10)}% | ${share(rs, 'pFloored', 0.05)}% ${share(rs, 'pFloored', 0.10)}% | ${share(rs, 'pPost', 0.05)}% ${share(rs, 'pPost', 0.10)}% | ${pct(rs.filter((r) => r.fitWarning).length, rs.length).padStart(6)}%  ${pf.toFixed(2).padStart(6)}  ${eff.toFixed(3)}`);
}
