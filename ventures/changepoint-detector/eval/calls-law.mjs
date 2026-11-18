// The clumping-law check on real call-centre counts (eval/calls-law-preregistration.md).
// usage: node eval/calls-law.mjs [weeks]   (weeks: how many whole weeks get the analyze runs; default 5)
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { clumpingLaw, nb1Dispersion, negbinSize, analyze } from '../engine.mjs';

export function loadCalls(path = new URL('../data/bank-calls-5min.csv', import.meta.url)) {
  return readFileSync(path, 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => {
    const [date, ...v] = l.split(',');
    return { date, weekday: new Date(date + 'T12:00:00Z').getUTCDay(), counts: v.map(Number) };
  });
}

// Two-way multiplicative fit E_sd = a_(s,w) b_d (Poisson ML: alternate the margins).
export function referenceFit(days, iters = 200) {
  const S = days[0].counts.length, a = {}, b = days.map(() => 1);
  for (const d of days) a[d.weekday] ??= new Array(S).fill(1);
  for (let it = 0; it < iters; it++) {
    for (const w of Object.keys(a)) {
      const ds = days.map((d, i) => [d, i]).filter(([d]) => d.weekday === Number(w));
      for (let s = 0; s < S; s++) a[w][s] = ds.reduce((t, [d]) => t + d.counts[s], 0) / ds.reduce((t, [, i]) => t + b[i], 0);
    }
    days.forEach((d, i) => { const aw = a[d.weekday]; b[i] = d.counts.reduce((t, v) => t + v, 0) / aw.reduce((t, v) => t + v, 0); });
  }
  return days.map((d, i) => d.counts.map((_, s) => a[d.weekday][s] * b[i]));
}

export function referenceLaw(days, E, { boot = 1000, seed = 1 } = {}) {
  const cells = [];
  days.forEach((d, i) => d.counts.forEach((y, s) => cells.push({ day: i, e: E[i][s], z: (y - E[i][s]) ** 2 / E[i][s] })));
  const sorted = [...cells].sort((p, q) => p.e - q.e), dec = [];
  for (let k = 0; k < 10; k++) {
    const part = sorted.slice(Math.floor(k * sorted.length / 10), Math.floor((k + 1) * sorted.length / 10));
    dec.push({ e: part.reduce((t, c) => t + c.e, 0) / part.length, z: part.reduce((t, c) => t + c.z, 0) / part.length });
  }
  const slope = (cs) => {
    const me = cs.reduce((t, c) => t + c.e, 0) / cs.length, mz = cs.reduce((t, c) => t + c.z, 0) / cs.length;
    let sxy = 0, sxx = 0;
    for (const c of cs) { sxy += (c.e - me) * (c.z - mz); sxx += (c.e - me) ** 2; }
    return { slope: sxy / sxx, intercept: mz - (sxy / sxx) * me };
  };
  const byDay = days.map(() => []);
  for (const c of cells) byDay[c.day].push(c);
  let st = seed >>> 0;
  const rnd = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
  const bs = [];
  for (let r = 0; r < boot; r++) {
    const cs = [];
    for (let k = 0; k < days.length; k++) cs.push(...byDay[Math.floor(rnd() * days.length)]);
    bs.push(slope(cs).slope);
  }
  bs.sort((p, q) => p - q);
  const fit = slope(cells), ci = [bs[Math.floor(0.025 * boot)], bs[Math.floor(0.975 * boot) - 1]];
  const ratio = dec[9].z / dec[0].z;
  const law = ratio >= 1.5 && ci[0] > 0 ? 'nb2' : ratio >= 0.8 && ratio <= 1.25 && dec[0].z > 1.2 ? 'nb1' : 'unclear';
  return { law, ratio, deciles: dec, ...fit, ci };
}

const med = (a) => { const s = [...a].sort((p, q) => p - q); return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const weeks = Number(process.argv[2] ?? 5);
  const days = loadCalls();
  const E = referenceFit(days);
  const ref = referenceLaw(days, E);
  console.log(`fpp2 calls: ${days.length} weekdays x ${days[0].counts.length} five-minute slots`);
  console.log('Reference (across days, weekday x slot profile times a day level), mean (y - E)^2 / E by decile of E:');
  for (const d of ref.deciles) console.log(`  E ${d.e.toFixed(1).padStart(6)}  z ${d.z.toFixed(2)}`);
  console.log(`  top / bottom ${ref.ratio.toFixed(2)}; z = ${ref.intercept.toFixed(3)} + ${ref.slope.toFixed(5)} E, slope 95% day-block bootstrap [${ref.ci[0].toFixed(5)}, ${ref.ci[1].toFixed(5)}]`);
  console.log(`  reference law: ${ref.law}${ref.slope > 0 ? ` (NB2 reading: r about ${(1 / ref.slope).toFixed(0)})` : ''}`);
  const verdicts = { nb1: 0, nb2: 0, either: 0 }, phis = [], sizes = [], spans = [], g1 = [], g2 = [];
  for (const d of days) {
    const c = clumpingLaw(d.counts);
    verdicts[c.law]++; spans.push(c.levelSpan); g1.push(c.gapNb1); g2.push(c.gapNb2);
    phis.push(nb1Dispersion(d.counts)); sizes.push(negbinSize(d.counts));
  }
  console.log(`clumpingLaw per day (169 raw counts each): nb2 ${verdicts.nb2}, nb1 ${verdicts.nb1}, either ${verdicts.either} of ${days.length}`);
  console.log(`  median level span ${med(spans).toFixed(2)}, gap under NB1 ${med(g1).toFixed(2)}, under NB2 ${med(g2).toFixed(2)} (standard errors, upper half minus lower)`);
  console.log(`  median phi ${med(phis).toFixed(2)} (range ${Math.min(...phis).toFixed(2)} to ${Math.max(...phis).toFixed(2)}); median size r ${med(sizes.filter(Number.isFinite)).toFixed(1)} (${sizes.filter((s) => !Number.isFinite(s)).length} days read Poisson)`);
  const want = ref.law;
  if (want === 'unclear') console.log('L1/L2: reference unclear, no bar (description only)');
  else {
    const other = want === 'nb2' ? 'nb1' : 'nb2';
    const l1 = verdicts[want] >= Math.ceil(0.6 * days.length) && verdicts[other] <= Math.floor(0.1 * days.length);
    console.log(`L1: says ${want} on ${verdicts[want]} (need >= ${Math.ceil(0.6 * days.length)}), ${other} on ${verdicts[other]} (need <= ${Math.floor(0.1 * days.length)}): ${l1 ? 'PASS' : 'FAIL'}`);
  }
  // Whole weeks (Mon..Fri in a row), --period 169, both NB costs (no bars).
  const runs = [];
  for (let i = 0; i + 4 < days.length && runs.length < weeks; i++) {
    if (days[i].weekday !== 1 || !days.slice(i, i + 5).every((d, k) => d.weekday === k + 1)) continue;
    runs.push(days.slice(i, i + 5)); i += 4;
  }
  for (const wk of runs) {
    const values = wk.flatMap((d) => d.counts);
    const row = [];
    for (const od of ['nb', 'nb1']) {
      const t0 = Date.now();
      const r = analyze({ values, model: 'poisson', period: 169, overdispersion: od });
      row.push(`${od}: ${r.pelt.changepoints.length} changes, fits ${r.clumping?.fits}${r.clumpingWarning ? ' (warns)' : ''}, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    }
    console.log(`week of ${wk[0].date}: ${row.join('; ')}`);
  }
}
