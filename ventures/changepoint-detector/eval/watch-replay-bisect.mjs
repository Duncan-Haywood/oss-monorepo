#!/usr/bin/env node
// Does the page's coarse replay (check every `step` points, bisect back to the first point that sends
// an alert) give the same alerts as a replay run after every point? watch.mjs replayWatch, default
// watch settings (level model), on every real series in data/ with 40 to 800 points (one numeric
// column: the last). For each series: the step-1 replay, then steps 5 and 15; an alert matches when
// the same change index is alerted at the same point. Output: eval/watch-replay-bisect.out.txt.
//   node eval/watch-replay-bisect.mjs > eval/watch-replay-bisect.out.txt
import { readdirSync, readFileSync } from 'node:fs';
import { parseSeries } from '../engine.mjs';
import { replayWatch } from '../watch.mjs';

const dir = new URL('../data/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.csv')).sort();
const key = (r) => r.alerts.map((a) => `${a.index}@${a.reportedAt}`).sort();
let series = 0, exactAlerts = 0, perStep = { 5: { same: 0, missed: 0, extra: 0, moved: 0, checks: 0, ms: 0 }, 15: { same: 0, missed: 0, extra: 0, moved: 0, checks: 0, ms: 0 } };
let exactChecks = 0, exactMs = 0;
console.log('series                         n   alerts(step 1)  step 5        step 15');
for (const f of files) {
  let p;
  try { p = parseSeries(readFileSync(new URL(f, dir), 'utf8'), null, null); } catch { continue; }
  const { values, labels } = p;
  if (values.length < 40 || values.length > 800) continue;
  series++;
  let t = Date.now();
  const exact = replayWatch(values, labels, { budget: Infinity });
  exactMs += Date.now() - t; exactChecks += exact.checks;
  const ek = key(exact); exactAlerts += ek.length;
  const cells = [];
  for (const step of [5, 15]) {
    t = Date.now();
    const r = replayWatch(values, labels, { step, budget: Infinity });
    const s = perStep[step]; s.ms += Date.now() - t; s.checks += r.checks;
    const rk = key(r);
    const same = rk.filter((k) => ek.includes(k)).length;
    const eIdx = exact.alerts.map((a) => a.index), rIdx = r.alerts.map((a) => a.index);
    const moved = r.alerts.filter((a) => eIdx.includes(a.index) && !ek.includes(`${a.index}@${a.reportedAt}`)).length;
    const missed = exact.alerts.filter((a) => !rIdx.includes(a.index)).length;
    const extra = r.alerts.filter((a) => !eIdx.includes(a.index)).length;
    s.same += same; s.moved += moved; s.missed += missed; s.extra += extra;
    cells.push(`${same}/${ek.length}${missed ? ` -${missed}` : ''}${extra ? ` +${extra}` : ''}${moved ? ` ~${moved}` : ''}`.padEnd(14));
  }
  console.log(`${f.replace('.csv', '').padEnd(28)} ${String(values.length).padStart(4)}   ${String(ek.length).padStart(6)}          ${cells.join('')}`);
}
console.log(`\n${series} series, ${exactAlerts} alerts in the every-point replay (${exactChecks} checks, ${(exactMs / 1000).toFixed(1)} s).`);
for (const [step, s] of Object.entries(perStep)) {
  console.log(`step ${step}: ${s.same} of ${exactAlerts} alerts identical (same change, same point); ${s.moved} re-dated, ${s.missed} missed, ${s.extra} extra; ${s.checks} checks, ${(s.ms / 1000).toFixed(1)} s.`);
}
console.log('Cell key: identical/all, -missed (a change the every-point replay alerted and this one did not), +extra, ~same change sent at a different point.');
