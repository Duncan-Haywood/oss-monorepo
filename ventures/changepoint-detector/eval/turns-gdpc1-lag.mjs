// Read after eval/turns-gdpc1.mjs ran (not pre-registered, no bar): how many quarters of data after a turn
// BBQ needs before it calls that turn and keeps calling it, on the final GDPC1 vintage cut off at each quarter
// (pseudo-real-time: real-time vintages would differ, as the 2001 history shows).
//
// For each NBER turn BBQ matched within 1 quarter on the full file, the call quarter is the first cut-off T
// such that BBQ on values[0..T] has a turn of the same kind within 1 quarter of the full-file turn, and so does
// every later cut-off. The delay is T minus the turn's quarter. BEA's advance estimate of a quarter comes about
// one month after it ends, so a delay of d quarters means about 3d + 1 months after the turn's quarter ends.
//
// usage: node eval/turns-gdpc1-lag.mjs > eval/turns-gdpc1-lag.out.txt
import { pathToFileURL } from 'node:url';
import { turningPoints } from '../turning-points.mjs';
import { loadSeries } from './turns-bbq.mjs';
import { MAIN } from './turns-gdpc1.mjs';

export function delays() {
  const { label, values, turns } = loadSeries(MAIN);
  const n = values.length;
  const full = turningPoints(values, { frequency: 'quarterly' }).turns;
  const byCut = [];
  for (let T = 0; T < n; T++) byCut[T] = T < 8 ? [] : turningPoints(values.slice(0, T + 1), { frequency: 'quarterly' }).turns;
  const out = [];
  for (const t of turns) {
    const f = full.find((x) => x.kind === t.kind && Math.abs(x.i - t.i) <= 1);
    if (!f) continue;
    const has = (T) => byCut[T].some((x) => x.kind === f.kind && Math.abs(x.i - f.i) <= 1);
    let call = null;
    for (let T = n - 1; T >= f.i; T--) { if (has(T)) call = T; else break; }
    out.push({ nber: label[t.i], kind: t.kind, bbq: label[f.i], call: call === null ? null : label[call], delay: call === null ? null : call - f.i });
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const d = delays();
  console.log('Quarters of data after the turn before BBQ calls it for good (final GDPC1 vintage, cut off each quarter)');
  for (const r of d) console.log(`  ${r.nber} ${r.kind.padEnd(6)} BBQ ${r.bbq}  called with data to ${r.call}  delay ${r.delay} q`);
  const ds = d.map((r) => r.delay).filter((x) => x !== null).sort((a, b) => a - b);
  const med = ds.length % 2 ? ds[(ds.length - 1) / 2] : (ds[ds.length / 2 - 1] + ds[ds.length / 2]) / 2;
  console.log(`\n${ds.length} turns; delay min ${ds[0]}, median ${med}, max ${ds[ds.length - 1]} quarters`);
  for (const k of ['peak', 'trough']) {
    const x = d.filter((r) => r.kind === k).map((r) => r.delay).sort((a, b) => a - b);
    console.log(`  ${k}s: ${x.join(' ')}`);
  }
}
