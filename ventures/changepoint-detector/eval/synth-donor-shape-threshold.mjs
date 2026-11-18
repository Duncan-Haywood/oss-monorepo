// Reads GAP_SHAPE_RATIO candidates off eval/synth-donor-shape-sim.mjs shards (the exploratory run): for each ratio T on
// mean squares, the share of clean units listed above the treated one that get a shape (false), and the share of
// shocked donors listed above whose shape is named right, by the shock's shape and size.
//   node eval/synth-donor-shape-threshold.mjs part*.json
import { readFileSync } from 'node:fs';
const rows = process.argv.slice(2).flatMap((f) => readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l)));
for (const T of [3, 4, 6, 9, 16]) { // T on mean squares; LR is on RMS so compare LR^2
  const lab = (lr) => (lr * lr >= T ? 'grew' : 1 / (lr * lr) >= T ? 'faded' : 'held');
  const cl = rows.flatMap((r) => r.cleanAboveLR); const fs = cl.filter((x) => lab(x) !== 'held').length / cl.length;
  const by = (re, want) => { const a = rows.filter((r) => re.test(r.cell) && r.shockedAbove); return (100 * a.filter((r) => lab(r.shockedLR) === want).length / a.length).toFixed(1); };
  console.log(`T ${T}: clean shaped ${(100 * fs).toFixed(1)}% | step held ${by(/^P[DB]\d/, 'held')} | slope1 grew ${by(/^(PS|NS|PBS)\d/, 'grew')} slope2 ${by(/^PSE/, 'grew')} | pulse1 faded ${by(/^(PP|NP|PBP)\d/, 'faded')} pulse2 ${by(/^PPE/, 'faded')}`);
}
