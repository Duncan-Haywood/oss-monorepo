// Checks the range-test divider (singers.mjs assignSections) against brute force, and times it.
// Run: node eval/singers-check.mjs > eval/singers-check-report.md
// The choirs are random (seeded), not real range tests: this measures the algorithm, not singers.
import { assignSections, overlap } from '../singers.mjs';

let seed = 20261113;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const choir = (n) => Array.from({ length: n }, (_, i) => {
  const low = 40 + Math.floor(rnd() * 14); // E2..Eb3
  return { row: i + 2, name: `s${i}`, low, high: low + 8 + Math.floor(rnd() * 12) };
});
const ORDERS = { 2: ['bass', 'tenor'], 3: ['bass', 'baritone', 'tenor'], 4: ['bass', 'baritone', 'tenor2', 'tenor'] };

function brute(singers, k) {
  let best = null;
  const n = singers.length;
  const lab = new Array(n);
  for (let x = 0; x < k ** n; x++) {
    let y = x;
    for (let i = 0; i < n; i++) { lab[i] = y % k; y = Math.floor(y / k); }
    let min = Infinity, sum = 0, okk = true;
    for (let q = 0; q < k && okk; q++) {
      const g = singers.filter((_, i) => lab[i] === q);
      if (!g.length) { okk = false; break; }
      const w = overlap(g).width;
      if (w <= 0) okk = false;
      min = Math.min(min, w); sum += w;
    }
    if (okk && (!best || min > best.min || (min === best.min && sum > best.sum))) best = { min, sum };
  }
  return best;
}

const rows = [];
for (const [k, sizes, trials] of [[2, [6, 8, 10, 12], 40], [3, [6, 8, 10], 30], [4, [6, 8], 20]]) {
  for (const n of sizes) {
    let both = 0, minEq = 0, sumEq = 0, none = 0, sumGap = 0;
    for (let t = 0; t < trials; t++) {
      const s = choir(n);
      const a = assignSections(s, ORDERS[k]);
      const b = brute(s, k);
      if (!b) { none++; if (a) throw new Error('divider found a cut brute force did not'); continue; }
      if (!a) throw new Error(`k=${k} n=${n}: brute force fits, divider does not`);
      both++;
      const w = ORDERS[k].map((x) => overlap(a.groups[x]).width);
      const min = Math.min(...w), sum = w.reduce((p, q) => p + q, 0);
      if (min === b.min) minEq++;
      if (min === b.min && sum === b.sum) sumEq++;
      if (min === b.min) sumGap += b.sum - sum;
    }
    rows.push(`| ${k} | ${n} | ${trials} | ${none} | ${minEq} of ${both} | ${sumEq} of ${both} | ${(sumGap / Math.max(1, minEq)).toFixed(2)} |`);
  }
}

const timing = [];
for (const [n, k] of [[40, 4], [100, 4], [200, 3], [200, 4]]) {
  const s = choir(n);
  const t0 = performance.now();
  assignSections(s, ORDERS[k]);
  timing.push(`| ${n} | ${k} | ${(performance.now() - t0).toFixed(0)} ms |`);
}

console.log(`# Range-test divider against brute force

\`node eval/singers-check.mjs\` (seed 20261113). Random choirs: each singer's low E2-Eb3, range 8-19
semitones. **Synthetic, not real range tests.** Brute force tries every assignment of singers to k labelled
sections; the divider tries every contiguous cut of the singers sorted by mid-range. Both score the same rule:
widest narrowest section, then widest total.

| sections | singers | choirs | no division fits | narrowest section equal | total also equal | mean total lost (semitones) |
|---|---|---|---|---|---|---|
${rows.join('\n')}

Time for the divider alone (this machine):

| singers | sections | time |
|---|---|---|
${timing.join('\n')}
`);
