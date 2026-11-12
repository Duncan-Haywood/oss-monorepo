// Pre-registered: should the sticky-series warning suggest a doubled penalty (4 log n) for
// `--model drift`? README "Why the step goes missing" (2026-11-12) left this as a lead, not a finding:
// on a synthetic sticky walk (40% exact repeats) the shipped model at twice its penalty had the
// false-cut rate of repeats 'missing' at its default (1.35 a series) and found a 5-sd step 82 times
// in 120 against 77. That was seen after its rule was written, so it needs its own test on real data.
//
// Written 2026-11-12 and committed before it was run on any series at 4 log n. Seen before writing:
// the shipped drift on these series (bank 63 cuts, scanline_42049 27, frozen juice 67 cuts with 8 of
// 8 freezes found), and the repeat counts. Not seen: any result at a penalty other than 2 log n on
// the real series.
//
// Data. The series where the shipped sticky check fires (at least 20% of steps repeat exactly):
//   TCPD (eval/tcpd-fetch.sh): bank, children_per_woman, ratner_stock, scanline_42049, scored with
//   TCPD's own F1 (margin 5) and cover against every annotator, as in eval/tcpd.mjs;
//   Florida frozen orange juice (data/frozen-juice.csv, 612 months, 41% repeats): truth the eight
//   months with 19 or more Orlando freezing degree days, found if a change lies within 2 months
//   (eval/frozen-juice-sticky.mjs).
// Settings: shipped `--model drift` (ML noise, global scale, penalty 2 log n) against the same model
// at 4 log n (primary). 3 log n is printed as a description only and decides nothing.
//
// Decision rule (all must hold for the warning to suggest 4 log n):
//   R1. mean F1 over the four TCPD sticky series at 4 log n >= shipped;
//   R2. mean cover over the same four at 4 log n >= shipped - 0.02;
//   R3. frozen juice: at least 7 of the 8 freezes found at 4 log n (shipped finds 8);
//   R4. frozen juice: at most half the shipped cuts (shipped 67).
// If any fails, the warning text is not changed and the result goes in the README as measured.
// Also printed, deciding nothing: the TCPD series where the check does not fire, at both penalties,
// so a reader can see what the doubled penalty would cost if someone applied it everywhere.
//
// usage: sh eval/tcpd-fetch.sh tcpd-data && node eval/drift-sticky-penalty.mjs tcpd-data > eval/drift-sticky-penalty.out.txt
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { driftLevelChanges, stickyCheck } from '../drift-level.mjs';
import { fMeasure, covering } from './tcpd-metrics.mjs';

export const STICKY_TCPD = ['bank', 'children_per_woman', 'ratner_stock', 'scanline_42049'];
export const MULTS = [2, 3, 4];

export function cutsAt(values, mult) {
  return driftLevelChanges(values, { noise: 'ml', penalty: mult * Math.log(values.length) }).changepoints;
}

function loadTcpd(DIR) {
  const ann = JSON.parse(readFileSync(join(DIR, 'annotations.json'), 'utf8'));
  const out = [];
  for (const sub of ['ds', 'heldout']) {
    const dir = join(DIR, sub);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
      const name = f.replace(/\.json$/, '');
      if (!ann[name]) continue;
      const j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      if (j.n_dim !== 1) continue;
      let last = null;
      const values = j.series[0].raw.map((v) => (v == null || !Number.isFinite(Number(v)) ? last : (last = Number(v))));
      out.push({ name, values, n: values.length, set: sub, ann: ann[name] });
    }
  }
  return out;
}

export function frozenJuice() {
  const rows = readFileSync(new URL('../data/frozen-juice.csv', import.meta.url), 'utf8').trim().split(/\r?\n/).slice(1).map((l) => l.split(','));
  const labels = rows.map((r) => r[0]), price = rows.map((r) => Number(r[1])), fdd = rows.map((r) => Number(r[3]));
  const month = (l) => { const [y, m] = l.split('-').map(Number); return y * 12 + m; };
  const freezes = labels.filter((_, i) => fdd[i] >= 19);
  const score = (cps) => {
    const at = cps.map((i) => labels[i]);
    const found = freezes.filter((f) => at.some((c) => Math.abs(month(c) - month(f)) <= 2));
    return { cuts: cps.length, found, near: at.filter((c) => freezes.some((f) => Math.abs(month(c) - month(f)) <= 2)).length };
  };
  return { price, freezes, score };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const DIR = process.argv[2] || 'tcpd-data';
  const clean = (cps, n) => [...new Set(cps)].filter((c) => c >= 1 && c < n - 1).sort((a, b) => a - b);
  const r3 = (v) => v.toFixed(3);
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const series = loadTcpd(DIR);
  const res = {};
  for (const s of series) {
    res[s.name] = { sticky: stickyCheck(s.values) };
    for (const m of MULTS) {
      const cps = clean(cutsAt(s.values, m), s.n);
      res[s.name][m] = { cuts: cps.length, f1: fMeasure(s.ann, cps, 5).F, cover: covering(s.ann, cps, s.n) };
    }
  }
  const fired = series.filter((s) => res[s.name].sticky.sticky).map((s) => s.name);
  console.log(`TCPD series where the sticky check fires: ${fired.join(', ')} (pre-registered: ${STICKY_TCPD.join(', ')})`);
  const sticky = series.filter((s) => STICKY_TCPD.includes(s.name));
  if (sticky.length !== STICKY_TCPD.length) throw new Error(`missing sticky series: run sh eval/tcpd-fetch.sh ${DIR}`);

  console.log('\nTCPD sticky series: cuts / F1 / cover at 2, 3 and 4 log n (3 log n descriptive only)');
  for (const s of sticky) {
    const counts = Object.values(s.ann).map((a) => a.length).sort((x, y) => x - y);
    const cell = (m) => `${String(res[s.name][m].cuts).padStart(3)} ${r3(res[s.name][m].f1)} ${r3(res[s.name][m].cover)}`;
    console.log(`  ${s.name.padEnd(20)} n ${String(s.n).padStart(4)}  repeats ${(100 * res[s.name].sticky.repeatShare).toFixed(0)}%  2: ${cell(2)}   3: ${cell(3)}   4: ${cell(4)}   annotators' median ${counts[Math.floor(counts.length / 2)]}`);
  }
  const mF = (m, set) => mean(set.map((s) => res[s.name][m].f1));
  const mC = (m, set) => mean(set.map((s) => res[s.name][m].cover));
  for (const m of MULTS) console.log(`  mean at ${m} log n: F1 ${r3(mF(m, sticky))}  cover ${r3(mC(m, sticky))}  cuts ${sticky.reduce((a, s) => a + res[s.name][m].cuts, 0)}`);

  const fj = frozenJuice();
  console.log(`\nFrozen orange juice (${fj.price.length} months; freezes ${fj.freezes.join(' ')})`);
  const fjr = {};
  for (const m of MULTS) {
    fjr[m] = fj.score(cutsAt(fj.price, m));
    console.log(`  ${m} log n: ${String(fjr[m].cuts).padStart(3)} cuts, ${fjr[m].found.length} of ${fj.freezes.length} freezes found (${fjr[m].found.join(' ')}), ${fjr[m].near} cuts near a freeze`);
  }

  const R = {
    R1: [mF(4, sticky) >= mF(2, sticky), `mean F1 ${r3(mF(4, sticky))} at 4 log n vs ${r3(mF(2, sticky))} shipped`],
    R2: [mC(4, sticky) >= mC(2, sticky) - 0.02, `mean cover ${r3(mC(4, sticky))} vs ${r3(mC(2, sticky))} shipped (allowed 0.02 lower)`],
    R3: [fjr[4].found.length >= 7, `${fjr[4].found.length} of 8 freezes found (need 7)`],
    R4: [fjr[4].cuts <= fjr[2].cuts / 2, `${fjr[4].cuts} cuts vs ${fjr[2].cuts} shipped (need at most half)`],
  };
  console.log('\nDecision rule:');
  for (const [k, [ok, why]] of Object.entries(R)) console.log(`  ${k} ${ok ? 'PASS' : 'FAIL'}: ${why}`);
  console.log(`  verdict: ${Object.values(R).every(([ok]) => ok) ? 'PASS, the sticky warning may suggest 4 log n' : 'FAIL, the warning text is not changed'}`);

  const rest = series.filter((s) => !res[s.name].sticky.sticky);
  console.log(`\nDescriptive only: the ${rest.length} TCPD series where the check does not fire (what 4 log n would cost if applied everywhere)`);
  for (const m of MULTS) console.log(`  ${m} log n: mean F1 ${r3(mF(m, rest))}  cover ${r3(mC(m, rest))}  cuts ${rest.reduce((a, s) => a + res[s.name][m].cuts, 0)}`);
}
