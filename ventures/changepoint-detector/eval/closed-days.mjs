// Closed days filled as missing (--closed), on a real shop's fresh year, its design year and a simulation.
// Pre-registered in eval/closed-days.prereg.md before any run. Output: eval/closed-days.out.txt
//   node eval/closed-days.mjs real > real.txt
//   node eval/closed-days.mjs sim 4 0 > sim0.txt  (... sim 4 3: four shards, run side by side; each draws all 200 series
//   from the one seed and replays every 4th, so the shards together are the pre-registered 200)
//   node eval/closed-days.mjs simsum sim0.txt sim1.txt sim2.txt sim3.txt
//   eval/closed-days.out.txt is real.txt followed by the simsum output.
import { readFileSync } from 'node:fs';
import { parseSeries } from '../engine.mjs';
import { replayWatch, eagerSettings, suggestFor, HINT_BUDGET, fillClosed } from '../watch-core.mjs';

const part = process.argv[2] ?? 'all';
const day = (s) => Date.parse(s + 'T00:00:00Z') / 86400000;
const iso = (d) => new Date(d * 864e5).toISOString().slice(0, 10);
const COLS = [['orders', 'poisson'], ['revenue', 'mean'], ['cancellations', 'poisson'], ['new_customers', 'poisson']];
const MONTHLY = 100 * 12 / 365;
const BUDGETS = [['2/100', HINT_BUDGET], ['1/month', MONTHLY]];

function closedList(csv) {
  const rows = csv.trim().split('\n').slice(1).map((r) => r.split(','));
  return rows.filter(([d, o, , c, nc]) => new Date(d + 'T00:00:00Z').getUTCDay() !== 6 && +o === 0 && +c === 0 && +nc === 0).map(([d]) => d);
}

function runYear(name, file) {
  const csv = readFileSync(new URL(`../data/${file}`, import.meta.url), 'utf8');
  const closed = closedList(csv);
  const near = (lab, k) => closed.some((h) => Math.abs(day(h) - day(lab)) <= k);
  console.log(`\n================ ${name} (${file}) ================`);
  console.log(`closed list (${closed.length}): ${closed.join(' ')}`);
  const T = { atClosure: { off: 0, on: 0 }, quiet: { off: 0, on: 0 }, kept: 0, far: 0 };
  for (const [col, model] of COLS) {
    const { labels, values } = parseSeries(csv, col, null);
    const res = {};
    for (const arm of ['off', 'on']) {
      const vals = arm === 'on' ? fillClosed(values, labels, closed, { period: 7, round: model === 'poisson' }).values : values;
      const settings = eagerSettings(model).map(({ key, detector }) => {
        const r = replayWatch(vals, labels, { model, period: 7, detector });
        return { key, detector, r, per100: (100 * r.alerts.length) / (r.n - r.from) };
      });
      res[arm] = settings;
      T.quiet[arm] += settings[0].r.alerts.length;
      console.log(`\n== ${col} (${model}), --period 7, ${arm === 'on' ? 'WITH --closed' : 'without --closed'}; watch starts ${labels[settings[0].r.from]}`);
      for (const s of settings) {
        console.log(`  ${s.key} (${s.detector}): ${s.r.alerts.length} alerts, ${s.per100.toFixed(1)} per 100 checks`);
        for (const a of s.r.alerts) console.log(`    dated ${a.label}, sent ${a.reportedAtLabel}${near(String(a.label), 1) ? '  <- within 1 day of a closed day' : ''}`);
      }
    }
    for (const [bname, b] of BUDGETS) {
      const pick = (arm) => res[arm].find((s) => s.key === suggestFor(res[arm], b, values.length));
      const off = pick('off'), on = pick('on');
      const cOff = off.r.alerts.filter((a) => near(String(a.label), 1)).length, cOn = on.r.alerts.filter((a) => near(String(a.label), 1)).length;
      T.atClosure.off += cOff; T.atClosure.on += cOn;
      const far = off.r.alerts.filter((a) => !near(String(a.label), 3));
      const kept = far.filter((a) => on.r.alerts.some((x) => Math.abs(day(String(x.label)) - day(String(a.label))) <= 3));
      T.far += far.length; T.kept += kept.length;
      console.log(`  ${col} at ${bname}: suggested ${off.key} without, ${on.key} with; at a closure ${cOff} -> ${cOn}; away from closures ${far.length}, kept ${kept.length}`);
    }
  }
  console.log(`\n-- ${name} summary --`);
  const k1 = T.atClosure.off === 0 ? 'UNTESTED' : T.atClosure.on === 0 ? 'PASS' : 'FAIL';
  console.log(`K1 (alerts at a closure, suggested settings, 4 columns x 2 budgets): ${T.atClosure.off} without -> ${T.atClosure.on} with: ${k1}`);
  console.log(`K2 (Quiet's alerts, 4 columns): ${T.quiet.off} without -> ${T.quiet.on} with: ${T.quiet.on <= T.quiet.off ? 'PASS' : 'FAIL'}`);
  const k3 = T.far < 3 ? 'UNTESTED' : T.kept >= 0.8 * T.far ? 'PASS' : 'FAIL';
  console.log(`K3 (alerts away from closures kept within 3 days): ${T.kept} of ${T.far}: ${k3}`);
  return { k1, k2: T.quiet.on <= T.quiet.off ? 'PASS' : 'FAIL', k3 };
}

// Simulation (K4): seeded generator, Gamma-Poisson counts.
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function normal(r) { return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); }
function gamma(r, k) { // Marsaglia-Tsang, k >= 1; mean k
  const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) { let x, v; do { x = normal(r); v = 1 + c * x; } while (v <= 0); v = v * v * v; const u = r(); if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v; }
}
function poisson(r, lam) { if (lam > 30) return Math.max(0, Math.round(lam + Math.sqrt(lam) * normal(r))); const L = Math.exp(-lam); let k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; }

function runSim(K = 1, k = 0) {
  const r = rng(20261119);
  const N = 371, d0 = day('2024-01-01'); // a Monday
  const labels = Array.from({ length: N }, (_, i) => iso(d0 + i));
  for (let s = 0; s < 200; s++) {
    const step = s >= 100 ? 150 + Math.floor(r() * 181) : null;
    const closed = new Set();
    while (closed.size < 6) { const i = 84 + Math.floor(r() * 277); if ((i + 1) % 7 !== 6 && !closed.has(i)) closed.add(i); } // i=0 is Monday; Saturday is i%7==5
    const values = labels.map((_, i) => {
      if (i % 7 === 5 || closed.has(i)) return 0;
      const mu = (i % 7 === 6 ? 24 : 40) * (step != null && i >= step ? 1.4 : 1);
      return poisson(r, mu * gamma(r, 20) / 20);
    });
    const cl = [...closed].map((i) => labels[i]);
    if (s % K !== k) continue;
    const row = { s, step };
    for (const arm of ['off', 'on']) {
      const vals = arm === 'on' ? fillClosed(values, labels, cl, { period: 7, round: true }).values : values;
      const rep = replayWatch(vals, labels, { model: 'poisson', period: 7, detector: 'bocpd' });
      const near = rep.alerts.some((a) => [...closed].some((i) => Math.abs(i - labels.indexOf(String(a.label))) <= 1));
      row[arm] = { near, caught: step != null && rep.alerts.some((a) => Math.abs(labels.indexOf(String(a.label)) - step) <= 7), alerts: rep.alerts.length };
    }
    console.log(JSON.stringify(row));
  }
}

function simSum(files) {
  const T = { nullNear: { off: 0, on: 0 }, caught: { off: 0, on: 0 }, stepNear: { off: 0, on: 0 }, alerts: { off: 0, on: 0 } };
  const rows = files.flatMap((f) => readFileSync(f, 'utf8').trim().split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l)));
  if (rows.length !== 200 || new Set(rows.map((r) => r.s)).size !== 200) throw new Error(`expected 200 series, got ${rows.length}`);
  console.log('\n================ K4 simulation (seeds 20261119, 200 series) ================');
  for (const r of rows) for (const arm of ['off', 'on']) {
    T.alerts[arm] += r[arm].alerts;
    if (r.step == null) { if (r[arm].near) T.nullNear[arm]++; }
    else { if (r[arm].near) T.stepNear[arm]++; if (r[arm].caught) T.caught[arm]++; }
  }
  console.log(`alerts over all 200 series: ${T.alerts.off} without -> ${T.alerts.on} with`);
  console.log(`no-step series with an alert at a closure: ${T.nullNear.off} of 100 without -> ${T.nullNear.on} with`);
  console.log(`step series with an alert at a closure: ${T.stepNear.off} of 100 without -> ${T.stepNear.on} with`);
  console.log(`steps caught (alert within 7 days): ${T.caught.off} of 100 without -> ${T.caught.on} with`);
  const a = T.nullNear.on <= 2 ? 'PASS' : 'FAIL', b = T.caught.on >= T.caught.off - 3 ? 'PASS' : 'FAIL';
  console.log(`K4a (<= 2 of 100 with --closed): ${a}; K4b (caught with >= without - 3): ${b}`);
  return { a, b };
}

if (part === 'real') {
  runYear('DESIGN YEAR 2010-12 to 2011-12 (seen; reported, not barred)', 'online-retail-daily.csv');
  const f = runYear('FRESH YEAR 2009-12 to 2010-12 (the bars)', 'online-retail-2009-daily.csv');
  console.log(`\nFRESH-YEAR BARS: K1 ${f.k1}, K2 ${f.k2}, K3 ${f.k3}`);
}
if (part === 'sim') runSim(Number(process.argv[3] ?? 1), Number(process.argv[4] ?? 0));
if (part === 'simsum') simSum(process.argv.slice(3));
