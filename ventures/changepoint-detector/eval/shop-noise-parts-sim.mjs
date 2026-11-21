// Round 5: which part of the real shop's noise makes Quiet quieter (eval/shop-noise-parts.prereg.md).
// Output: eval/shop-noise-parts-sim.out.txt
//   for p in 0 1 2 3; do node eval/shop-noise-parts-sim.mjs $p > eval/shop-noise-parts-sim.$p.part & done; wait
//   node eval/shop-noise-parts-sim.mjs --combine > eval/shop-noise-parts-sim.out.txt
// Every process draws all 1,000 shops from the one seed in the pre-registered order and replays every 4th (index mod 4).
import { readFileSync } from 'node:fs';
import { replayWatch } from '../watch-core.mjs';
import { shopResiduals } from './shop-tails.mjs';
const arg = process.argv[2];

let s = 20261122 >>> 0;
const rand = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = () => { let u = 0; while (!u) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); };
const N = 371, FACT = [0.6, 1.2, 1, 1, 1, 1, 0]; // Sun..Sat; 2024-01-01 is a Monday
const labels = Array.from({ length: N }, (_, i) => new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10));
const RES = shopResiduals();
const FAM = ['sim', 'real5', 'real1', 'mirror', 'gauss'];
function shop(size, fam) {
  const a = size ? 200 + Math.floor(rand() * 101) : null;
  const L = size ? 28 + Math.floor(rand() * 29) : null;
  const shut = new Set();
  while (shut.size < 5) { const d = 7 + Math.floor(rand() * (N - 7)); if ((d + 1) % 7 !== 6) shut.add(d); }
  const B = fam === 'real1' ? 1 : 5;
  let e = 0, blk = B, at = 0;
  const v = labels.map((_, i) => {
    e = 0.5 * e + 0.05 * gauss();
    let z;
    if (fam === 'sim') { const g = gauss(), w4 = rand() < 0.03; z = 0.35 * g + (w4 ? Math.log(4) : 0); }
    else if (fam === 'gauss') z = 0.356 * gauss();
    else { if (blk >= B) { at = Math.floor(rand() * (RES.length - B + 1)); blk = 0; } z = RES[at + blk++] * (fam === 'mirror' ? -1 : 1); }
    const w = (i + 1) % 7;
    if (w === 6 || shut.has(i)) return 0;
    const ramp = a === null || i < a ? 0 : Math.min(1, (i - a) / L) * Math.log(size);
    return Math.round(30000 * Math.exp(e + ramp) * FACT[w] * Math.exp(z) * 100) / 100;
  });
  return { v, a, L };
}
const day = (l) => Date.parse(l + 'T00:00:00Z') / 864e5;
const median = (x) => { if (!x.length) return null; const y = [...x].sort((p, q) => p - q); return y[Math.floor((y.length - 1) / 2)]; };
const groups = FAM.flatMap((f) => [[`${f} N`, null, f], [`${f} R90`, 1.9, f]]);
const tot = Object.fromEntries(groups.map(([g]) => [g, { a: 0, c: 0, caught: 0, delays: [] }]));
if (arg === '--combine') {
  for (let p = 0; p < 4; p++) {
    const lines = readFileSync(new URL(`./shop-noise-parts-sim.${p}.part`, import.meta.url), 'utf8').trimEnd().split('\n');
    const t = JSON.parse(lines.pop());
    for (const g in t) { tot[g].a += t[g].a; tot[g].c += t[g].c; tot[g].caught += t[g].caught; tot[g].delays.push(...t[g].delays); }
    console.log(lines.join('\n'));
  }
} else {
  const part = Number(arg);
  let idx = 0;
  for (const [g, size, fam] of groups) {
    const shops = [...Array(100)].map(() => shop(size, fam));
    for (const [k, { v, a, L }] of shops.entries()) {
      if (idx++ % 4 !== part) continue;
      const r = replayWatch(v, labels, { model: 'mean', period: 7, from: 74 }), T0 = tot[g];
      if (a === null) { T0.a += r.alerts.length; T0.c += r.n - r.from; console.log(`${g} shop ${k + 1}: ${r.alerts.length} alerts`); continue; }
      const A = day(labels[a]);
      const hit = r.alerts.find((y) => { const d = day(y.label) - A, sent = day(y.reportedAtLabel); return d >= -7 && d <= L && sent >= A && sent - day(y.label) <= 14; });
      if (hit) { T0.caught++; T0.delays.push(day(hit.reportedAtLabel) - A); }
      console.log(`${g} shop ${k + 1}: ramp ${labels[a]} over ${L} days: ${hit ? `caught (dated ${hit.label}, sent ${hit.reportedAtLabel})` : 'missed'}`);
    }
  }
  console.log(JSON.stringify(tot));
  process.exit(0);
}
console.log('\n######## Summary ########');
for (const f of FAM) { const n = tot[`${f} N`], r = tot[`${f} R90`]; console.log(`${f}: N ${n.a} alerts in ${n.c} checks (${(100 * n.a / n.c).toFixed(2)} per 100); R90 caught ${r.caught} (median ${median(r.delays) ?? '-'} days)`); }
const c = (f) => tot[`${f} R90`].caught;
console.log('\n######## Bars ########');
console.log(`E1 (real5 <= sim - 15): ${c('real5')} vs ${c('sim')} -> ${c('real5') <= c('sim') - 15 ? 'PASS' : 'FAIL'}`);
console.log(`E2 (real1 >= real5 + 10): ${c('real1')} vs ${c('real5')} -> ${c('real1') >= c('real5') + 10 ? 'PASS' : 'FAIL'}`);
console.log(`E3 (mirror >= real5 + 10): ${c('mirror')} vs ${c('real5')} -> ${c('mirror') >= c('real5') + 10 ? 'PASS' : 'FAIL'}`);
console.log(`E4 (gauss >= real5 + 10): ${c('gauss')} vs ${c('real5')} -> ${c('gauss') >= c('real5') + 10 ? 'PASS' : 'FAIL'}`);
