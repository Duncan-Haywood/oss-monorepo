// Does the 95% range on a change date hold the planted date for counts?
// Seeded series with one planted rate step; usage: node eval/change-interval-counts.mjs
// Poisson data fitted with model "poisson"; overdispersed data (negative binomial,
// size 5) fitted with the plain Poisson cost and with overdispersion "nb".
import { analyze } from '../engine.mjs';
let seed = 2026;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed + 0.5) / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
const pois = (m) => { // Knuth for small means, normal approximation beyond
  if (m > 40) return Math.max(0, Math.round(m + Math.sqrt(m) * gauss()));
  const L = Math.exp(-m); let k = 0, p = 1;
  do { k++; p *= rnd(); } while (p > L);
  return k - 1;
};
const gammaDraw = (a) => { // Marsaglia-Tsang, a >= 1
  const d = a - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do { x = gauss(); v = 1 + c * x; } while (v <= 0);
    v = v * v * v; const u = rnd();
    if (Math.log(u) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v;
  }
};
const nbin = (m, size) => pois(gammaDraw(size) * m / size);
const N = 200, RUNS = 200, SIZE = 5;
console.log('data        fit      base->step  found  covered  median width');
for (const [data, fit] of [['poisson', 'poisson'], ['nb', 'poisson'], ['nb', 'nb']]) {
  for (const [base, mult] of [[10, 1.5], [10, 2], [30, 1.5]]) {
    let found = 0, covered = 0; const widths = [];
    for (let r = 0; r < RUNS; r++) {
      const at = 60 + Math.floor(rnd() * 80);
      const x = Array.from({ length: N }, (_, t) => {
        const m = t >= at ? base * mult : base;
        return data === 'nb' ? nbin(m, SIZE) : pois(m);
      });
      const res = analyze({ values: x, model: 'poisson', ...(fit === 'nb' ? { overdispersion: 'nb' } : {}) });
      const cps = res.pelt.changepoints.filter((c) => Math.abs(c.index - at) <= 15);
      if (!cps.length) continue;
      found++;
      const c = cps[0].range95;
      if (c.fromIndex <= at && at <= c.toIndex) covered++;
      widths.push(c.toIndex - c.fromIndex + 1);
    }
    widths.sort((a, b) => a - b);
    console.log(`${data.padEnd(10)}  ${fit.padEnd(7)}  ${base}->${base * mult}`.padEnd(40) + `  ${found}/${RUNS}  ${covered}/${found} (${(100 * covered / found).toFixed(0)}%)  ${widths[widths.length >> 1]}`);
  }
}

// How often does the warning fire? 200 series each, one step 10 -> 20.
console.log('\nrangeWarning fires (plain Poisson fit, 10 -> 20 step):');
for (const data of ['poisson', 'nb']) {
  let fired = 0;
  for (let r = 0; r < RUNS; r++) {
    const at = 60 + Math.floor(rnd() * 80);
    const x = Array.from({ length: N }, (_, t) => { const m = t >= at ? 20 : 10; return data === 'nb' ? nbin(m, SIZE) : pois(m); });
    if (analyze({ values: x, model: 'poisson' }).rangeWarning) fired++;
  }
  console.log(`${data}: ${fired}/${RUNS}`);
}
