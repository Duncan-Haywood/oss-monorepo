// Reads eval/gsc-middle-out/<stage>-<key>-cv<cv>.jsonl (from eval/gsc-middle-sweep.mjs) and applies the rules of
// eval/gsc-middle.prereg.md.   node eval/gsc-middle-summary.mjs A|B
import { readFileSync, readdirSync } from 'node:fs';

const stage = process.argv[2] ?? 'A';
const dir = new URL('./gsc-middle-out/', import.meta.url);
const runs = {};
for (const f of readdirSync(dir).filter((x) => x.startsWith(`${stage}-`) && x.endsWith('.jsonl')).sort()) {
  const [head, ...rows] = readFileSync(new URL(f, dir), 'utf8').trim().split('\n');
  const [key, cvw] = head.split(' ');
  (runs[key] ??= {})[cvw.slice(2)] = { opts: head.slice(key.length + cvw.length + 2), cells: rows.map((r) => JSON.parse(r)) };
}
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const sum = (cells, f) => cells.reduce((t, c) => t + f(c), 0);
const stat = (cells) => ({
  false1000: (1000 * sum(cells, (c) => c.falseA)) / sum(cells, (c) => c.watched),
  heard: Object.fromEntries([0.1, 0.2, 0.4].map((f) => [f, sum(cells.filter((c) => c.fall === f), (c) => c.heard)])),
  of: Object.fromEntries([0.1, 0.2, 0.4].map((f) => [f, sum(cells.filter((c) => c.fall === f), (c) => c.seeds)])),
  delay: Object.fromEntries([0.1, 0.2, 0.4].map((f) => [f, med(cells.filter((c) => c.fall === f).flatMap((c) => c.delays))])),
});
const cvs = [...new Set(Object.values(runs).flatMap((r) => Object.keys(r)))].sort();
console.log(`stage ${stage}`);
for (const cv of cvs) {
  console.log(`\ncv ${cv}: setting | false alerts per 1,000 days | 10% heard (median days) | 20% heard | 40% heard`);
  for (const [k, r] of Object.entries(runs)) {
    if (!r[cv]) continue;
    const s = stat(r[cv].cells);
    console.log(`${k} ${r[cv].opts} | ${s.false1000.toFixed(2)} | ${s.heard[0.1]}/${s.of[0.1]} (${s.delay[0.1] ?? '-'}) | ${s.heard[0.2]}/${s.of[0.2]} (${s.delay[0.2] ?? '-'}) | ${s.heard[0.4]}/${s.of[0.4]} (${s.delay[0.4] ?? '-'})`);
    for (const c of r[cv].cells) console.log(`    base ${c.base} fall ${Math.round(c.fall * 100)}%: ${c.fall ? `${c.heard}/${c.seeds} heard, median ${med(c.delays) ?? '-'} d, ` : ''}false ${(1000 * c.falseA / c.watched).toFixed(2)}/1,000${c.fall ? '' : `, null alerts in the fall window ${c.chance}/${c.seeds}`}`);
  }
}
if (stage === 'A') {
  const elig = Object.entries(runs).filter(([k, r]) => cvs.every((cv) => r[cv] && stat(r[cv].cells).false1000 <= 2.0));
  console.log(`\nEligible (pooled false alerts <= 2.0 per 1,000 days at each cv): ${elig.map(([k]) => k).join(', ') || 'none'}`);
  const score = ([, r]) => sum(cvs, (cv) => { const s = stat(r[cv].cells); return s.heard[0.1] + s.heard[0.2]; });
  const tie = ([, r]) => med(cvs.flatMap((cv) => r[cv].cells.filter((c) => c.fall === 0.2).flatMap((c) => c.delays))) ?? Infinity;
  elig.sort((a, b) => score(b) - score(a) || tie(a) - tie(b));
  for (const e of elig) console.log(`  ${e[0]}: 10% + 20% falls heard over both cvs ${score(e)}, median delay on 20% ${tie(e)}`);
  console.log(`Pick: ${elig[0]?.[0] ?? 'none (the item fails at stage A)'}`);
}
if (stage === 'B') {
  const q = runs.Q, p = Object.entries(runs).find(([k]) => k !== 'Q');
  if (q && p) {
    const [pk, pr] = p; let pass = true;
    for (const cv of cvs) {
      const sp = stat(pr[cv].cells), sq = stat(q[cv].cells);
      const g1 = sp.false1000 <= 2.0, g3 = (sp.delay[0.4] ?? Infinity) <= (sq.delay[0.4] ?? Infinity) + 1;
      console.log(`\ncv ${cv}: G1 ${pk} false ${sp.false1000.toFixed(2)} <= 2.0: ${g1 ? 'pass' : 'FAIL'}; G3 40% delay ${sp.delay[0.4]} <= Quiet ${sq.delay[0.4]} + 1: ${g3 ? 'pass' : 'FAIL'}`);
      if (cv === '0.15') { const g2 = sp.heard[0.2] - sq.heard[0.2] >= 30; console.log(`cv ${cv}: G2 20% falls heard ${sp.heard[0.2]} vs Quiet ${sq.heard[0.2]} (+${sp.heard[0.2] - sq.heard[0.2]}, bar +30): ${g2 ? 'pass' : 'FAIL'}`); pass &&= g2; }
      pass &&= g1 && g3;
    }
    console.log(`\nStage B: ${pass ? 'PASS' : 'FAIL'}`);
  }
}
