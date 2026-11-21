// Byte-identity check for a refactor of engine.mjs: runs analyze() on 216 seeded series across 36 option sets (every
// model, season, trend, AR(1), noise floor, log, spikes, spells, slope tests, counts with dispersion, holidays, bursts,
// bootstrap, GARCH) and prints the SHA-256 of the JSON outputs. Run it on a checkout before the change and after:
//   node eval/split-identity-check.mjs [dir]      (dir defaults to this venture; pass an old checkout's copy to compare)
// 2026-11-21, the presteps.mjs / segmentation.mjs split: the same hash before and after (eval/split-identity-check.out.txt).
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const dir = resolve(process.argv[2] || new URL('..', import.meta.url).pathname);
const E = await import(pathToFileURL(dir + '/engine.mjs').href);
let s = 1; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const out = [];
const cfgs = [
  {}, { model: 'meanvar' }, { model: 'meanvar', robust: true }, { model: 'meanvar', dispersion: true }, { model: 'meanvar', bootstrap: true },
  { model: 'meanvar', garch: true }, { model: 'trend' }, { trend: true }, { trend: 'bend' }, { trend: 'bends', jointKnots: true }, { trend: 'quad' },
  { ar1: true }, { ar1: 'joint' }, { period: 12 }, { period: 12, drift: true }, { period: 12, seasonMode: 'multiplicative' },
  { noiseFloor: 2, noiseFloorOrder: 'local', noiseFloorWindow: 25 }, { noiseFloor: 1, noiseFloorOrder: 2 }, { noiseFloor: 1, noiseFloorOrder: 3 },
  { log: true, pos: true }, { log: true, trend: 'bend', pos: true }, { spikes: true }, { spells: true }, { slopeBreaks: true }, { hingeTest: true }, { knownDate: '60' },
  { model: 'poisson', counts: true }, { model: 'poisson', counts: true, period: 7 }, { model: 'poisson', counts: true, overdispersion: true }, { model: 'poisson', counts: true, overdispersion: 'nb' },
  { model: 'poisson', counts: true, overdispersion: 'nb1' }, { model: 'poisson', counts: true, trend: 'bend' }, { model: 'poisson', counts: true, trend: true, period: 7, overdispersion: 'nb' },
  { model: 'poisson', counts: true, bursts: true, episodes: true }, { model: 'poisson', counts: true, holidays: ['10', '11', '50=x', '51=x', '90=y', '97=y'], period: 7 }, { model: 'poisson', counts: true, bootstrap: true },
];
for (const c of cfgs) for (let k = 0; k < 6; k++) {
  const n = 120 + Math.floor(rnd() * 80), cut = Math.floor(n / 2), sh = k % 3;
  let v = Array.from({ length: n }, (_, t) => 10 + (t >= cut ? sh : 0) + 0.02 * t * (k % 2) + Math.sin(2 * Math.PI * t / 12) + gauss());
  if (c.counts) v = v.map((x) => Math.max(0, Math.round(x * (1 + rnd()))));
  if (c.pos) v = v.map((x) => Math.abs(x) + 1);
  if (c.spells) v = v.map((x, t) => (t % 3 && t > 40 && t < 80 ? 0 : x));
  const { counts, pos, ...opt } = c;
  try { out.push(JSON.stringify(E.analyze({ ...opt, values: v }))); } catch (e) { out.push('ERR ' + e.message); }
}
const errs = out.filter((l) => l.startsWith('ERR')).length;
console.log(`${out.length} calls, ${errs} errors, sha256 ${createHash('sha256').update(out.join('\n')).digest('hex')}`);
