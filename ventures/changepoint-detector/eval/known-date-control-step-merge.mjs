// Merge the KD_JSON shard lines of known-date-control-step-sim.mjs (on stdin) into its table.
// cat shard*.jsonl | node eval/known-date-control-step-merge.mjs
import { readFileSync } from 'node:fs';
const cells = new Map();
for (const line of readFileSync(0, 'utf8').split('\n')) {
  if (!line.startsWith('{')) continue;
  const c = JSON.parse(line), m = cells.get(c.id);
  if (!m) { cells.set(c.id, c); continue; }
  for (const key of Object.keys(c.t)) m.t[key] += c.t[key];
}
const pc = (v, d) => (100 * v / Math.max(1, d)).toFixed(1).padStart(5);
for (const { id, label, n, k, t } of cells.values()) {
  console.log(`${(id + ' ' + label).padEnd(44)} n ${String(n).padStart(3)} k ${String(k).padStart(3)}  step ${pc(t.rejStep, t.tested)}% of ${String(t.tested).padStart(3)} tested (${pc(t.rejStep, t.pairs)}% of all) | joint ${pc(t.rejJoint, t.tested)}% (${pc(t.rejJoint, t.pairs)}% of all) | refused ${t.refused}, cut ${t.cut}${t.warn + t.rejStepWarn + t.rejStepClean ? ` | placebos warn ${pc(t.warn, t.tested)}%; step rejections warned ${t.rejStepWarn} of ${t.rejStep}` : ''}`);
}
