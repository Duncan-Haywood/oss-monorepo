// Merge eval/synth-sim.mjs shards: node eval/synth-merge.mjs part*.json
// Per cell: panels, share with p <= 0.05 (all, and among those without the fit warning), fit-warning share, mean effect.
import { readFileSync } from 'node:fs';
const rows = process.argv.slice(2).flatMap((f) => readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)));
const cells = [...new Set(rows.map((r) => r.cell))];
const pct = (a, b) => (b ? (100 * a / b).toFixed(1) : '-');
console.log('cell  panels  p<=0.05  p<=0.10  fit-warned  p<=0.05 unwarned  mean effect');
for (const c of cells) {
  const rs = rows.filter((r) => r.cell === c), un = rs.filter((r) => !r.fitWarning);
  const rej = rs.filter((r) => r.p <= 0.05 + 1e-12).length, rej10 = rs.filter((r) => r.p <= 0.10 + 1e-12).length;
  const unrej = un.filter((r) => r.p <= 0.05 + 1e-12).length;
  const eff = rs.reduce((s, r) => s + r.effect, 0) / rs.length;
  console.log(`${c.padEnd(5)} ${String(rs.length).padStart(6)}  ${pct(rej, rs.length).padStart(6)}%  ${pct(rej10, rs.length).padStart(6)}%  ${pct(rs.length - un.length, rs.length).padStart(9)}%  ${pct(unrej, un.length).padStart(8)}% of ${un.length}  ${eff.toFixed(3)}`);
}
