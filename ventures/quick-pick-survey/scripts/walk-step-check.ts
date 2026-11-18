/**
 * Bare-sequence check for stepOverWalk (flagship item d6, 2026-11-14): 2,000 sequences per row of N(0, 0.35) log noise
 * with a random-walk pace, a straight line, or a 0.51 step, at 30, 60 and 120 answers. For the sequences the earlier
 * rule flags (t >= 4, gap >= 0.45, step-over-line >= 1, net step >= 0.45) it prints the quantiles of stepOverWalk and
 * the share still flagged at several fixed bars. Run: npx tsx scripts/walk-step-check.ts (a few seconds).
 */
import { bestFastSplit, stepOverWalk, stepNetOfTrend, stepOverTrend } from "../src/lib/groupRanking";
let s = 12345; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
const nrm = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const q = (a: number[], p: number) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(p * (b.length - 1))]; };
function run(name: string, gen: () => number[]) {
  const st: number[] = []; let old = 0;
  for (let i = 0; i < 2000; i++) { const x = gen(); const b = bestFastSplit(x)!; const ok = b.t >= 4 && b.gap >= 0.45 && stepOverTrend(x, b.at) >= 1 && stepNetOfTrend(x, b.at) >= 0.45; if (!ok) continue; old++; st.push(stepOverWalk(x, b.at)); }
  const frac = (c: number) => (st.filter((v) => v >= c).length / 2000 * 100).toFixed(1);
  console.log(name, "old-rule flagged", (old / 20).toFixed(1) + "%", "LR q10/50/90", [0.1, 0.5, 0.9].map((p) => st.length ? q(st, p).toFixed(1) : "-").join("/"), "kept at c=6,9,12,16:", [6, 9, 12, 16].map(frac).join(", "));
}
for (const n of [30, 60, 120]) {
  for (const w of [0.04, 0.08]) run(`n${n} walk ${w}`, () => { let l = 0; const d = 0.6 * nrm(); return Array.from({ length: n }, (_, i) => { if (i) l += w * nrm(); return l - d * i / n + 0.35 * nrm(); }); });
  run(`n${n} line 0.6`, () => { const d = 0.6 * nrm(); return Array.from({ length: n }, (_, i) => -d * i / n + 0.35 * nrm()); });
  for (const at of [0.25, 0.5, 0.75]) run(`n${n} step 0.51 at ${at}`, () => Array.from({ length: n }, (_, i) => (i >= at * n ? -0.51 : 0) + 0.35 * nrm()));
  run(`n${n} step 0.51 at 0.5 + walk 0.04`, () => { let l = 0; return Array.from({ length: n }, (_, i) => { if (i) l += 0.04 * nrm(); return l + (i >= n / 2 ? -0.51 : 0) + 0.35 * nrm(); }); });
}
