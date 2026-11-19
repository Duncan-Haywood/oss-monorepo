// Round 3 diagnosis for eval/closed-recent.mjs (decides nothing): node eval/closed-recent-diag.mjs f0.jsonl ... f7.jsonl
import { readFileSync } from 'node:fs';
const rows = process.argv.slice(2).flatMap((f) => readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l)));
const arms = ['clean', 'off', 'fill1', 'rec3'];
const near = (i, pts, d = 1) => pts.some((c) => Math.abs(i - c) <= d);
for (const [name, set] of [['no-step', rows.filter((x) => x.step == null)], ['step', rows.filter((x) => x.step != null)]]) {
  console.log(name, arms.map((a) => `${a} ${set.reduce((t, x) => t + x[a].length, 0)} (at closure ${set.reduce((t, x) => t + x[a].filter(([i]) => near(i, x.closed)).length, 0)}, placebo ${set.reduce((t, x) => t + x[a].filter(([i]) => near(i, x.placebo)).length, 0)})`).join('; '));
}
const stp = rows.filter((x) => x.step != null);
const caught = (x, a) => x[a].some(([i]) => Math.abs(i - x.step) <= 7);
for (const a of ['clean', 'fill1', 'rec3']) {
  const c = stp.filter((x) => caught(x, a));
  const viaClos = c.filter((x) => x[a].filter(([i]) => Math.abs(i - x.step) <= 7).every(([i]) => near(i, x.closed)));
  const datedBefore = c.filter((x) => x[a].filter(([i]) => Math.abs(i - x.step) <= 7).every(([i]) => i < x.step));
  console.log(a, 'caught', c.length, 'only via an alert within 1 day of a closure', viaClos.length, 'only via alerts dated before the step', datedBefore.length);
}
// alerts in step series by offset to step
for (const a of ['clean', 'fill1', 'rec3']) {
  const h = {}; for (const x of stp) for (const [i] of x[a]) { const d = i - x.step; if (Math.abs(d) <= 10) h[d] = (h[d] ?? 0) + 1; }
  console.log(a, 'alert dates relative to step (-10..10):', Object.entries(h).sort((p, q) => p[0] - q[0]).map(([d, n]) => `${d}:${n}`).join(' '));
}
