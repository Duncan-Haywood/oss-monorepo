// Calibration of the --suggest weekly-cycle line (weekdayBunching in watch-core.mjs). Synthetic daily count series,
// 300 days, Poisson-gamma (clumpy) counts on a level that wanders (so the watch alerts often, at no weekday in
// particular), with and without a closed day each week. Each series replayed at every "How eager" setting, as --suggest does.
//   node eval/weekday-bunching.mjs 30 20261118 0.01 none,closed     # the seeds the rule was set on
//   node eval/weekday-bunching.mjs 100 777 0.01 none,closed,dip     # fresh seeds, after the rule was fixed
// Output of both: eval/weekday-bunching.out.txt
import { eagernessReplay, weekdayBunching } from '../watch-core.mjs';

let seed = 20261118;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const poisson = (l) => { let k = 0, p = Math.exp(-l), s = p, u = rnd(); while (u > s && k < 1e4) { k++; p *= l / k; s += p; } return k; };
const gamma1 = (shape) => { // Marsaglia-Tsang, shape >= 1
  const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) { const x = gauss(), v = (1 + c * x) ** 3; if (v > 0 && Math.log(rnd()) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v; }
};
const N = 300, START = Date.parse('2024-01-01T00:00:00Z') / 864e5;
const labels = Array.from({ length: N }, (_, i) => new Date((START + i) * 864e5).toISOString().slice(0, 10));
function series(closedDay) {
  let lvl = Math.log(40 + 40 * rnd());
  return labels.map((l, i) => {
    lvl += 0.03 * gauss();
    if (rnd() < 0.01) lvl += (rnd() < 0.5 ? -1 : 1) * 0.3;
    const wd = ((START + i + 4) % 7);
    if (closedDay === 'closed' && wd === 6) return 0;
    const dip = closedDay === 'dip' && (wd === 6 || wd === 0) ? 0.7 : 1;
    return poisson(dip * Math.exp(lvl) * gamma1(8) / 8);
  });
}
const REPS = Number(process.argv[2] || 30);
if (process.argv[3]) seed = Number(process.argv[3]);
const ALPHA = Number(process.argv[4] || 0.01);
for (const closed of (process.argv[5] || 'none,closed').split(',')) {
  let fired = 0, firedAlerts = 0, withAlerts = 0, settings = 0, alerts = 0; const ps = [], shares = [];
  for (let r = 0; r < REPS; r++) {
    const x = series(closed);
    const res = eagernessReplay(x, labels, { model: 'poisson', keepAlerts: true });
    for (const s of res.settings) {
      settings++; alerts += s.alerts; if (s.alerts >= 6) withAlerts++;
      const w = weekdayBunching(s.alertLabels, labels, { alpha: 1 });
      ps.push(w ? w.p : 1); shares.push(w ? (w.onPair / w.alerts).toFixed(2) : '-');
      if (w && w.p < ALPHA) firedAlerts++;
      if (s.weekly) fired++;
    }
  }
  console.log(`${{ none: 'no weekly cycle', closed: 'closed every Saturday', dip: 'weekend 30% lower' }[closed]}: ${REPS} series x 2 settings = ${settings} replays, ${alerts} alerts, ${withAlerts} replays with >= 6 alerts; alert-date test alone at alpha ${ALPHA} on ${firedAlerts}; the shipped line (alert dates and the history's weekday effect) on ${fired} of ${settings}`);
  if (process.env.VERBOSE) console.log('  p:', ps.map((x) => x.toExponential(1)).sort((a, b) => a - b).slice(0, 12).join(' '), '| pair shares', shares.join(' '));
}
