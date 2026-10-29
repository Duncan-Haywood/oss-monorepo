// `driftWarning` on a same-length null: 195 months (the euro factory-orders length) of a fixed seasonal shape plus
// noise, with no shock and no drifting shape. Reports how often the warning fires by noise level, scale and trend setting.
// This variant adds --ar1 (raw scale, trend bend only). usage: node eval/drift-warning-null195-ar1.mjs  (about 3 min)
import { analyze } from '../engine.mjs';
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
const N = 195, SEEDS = 40;
const shape = [0.06, -0.05, 0.02, 0.0, 0.03, 0.05, -0.04, -0.09, 0.04, 0.03, -0.01, -0.0];
const labels = Array.from({ length: N }, (_, i) => `${2000 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`);
for (const sd of [0.01, 0.02, 0.04]) for (const rho of [0, 0.5]) {
  const cells = {};
  for (let s = 1; s <= SEEDS; s++) {
    const r = mulberry32(s * 7919 + Math.round(sd * 1000) + rho * 10);
    let e = 0;
    const logv = Array.from({ length: N }, (_, i) => { e = rho * e + gauss(r) * sd; return Math.log(100) + 0.002 * i + shape[i % 12] + e; });
    for (const [scale, v] of [['raw', logv.map(Math.exp)]]) for (const [trend, ar1] of [['bend', false], ['bend', true]]) {
      const k = `${scale} ${trend}${ar1 ? ' ar1' : ''}`;
      const res = analyze({ values: v, labels, period: 12, drift: true, trend, ar1 });
      (cells[k] ||= { warn: 0, steps: 0 });
      cells[k].warn += res.driftWarning ? 1 : 0; cells[k].steps += res.pelt.changepoints.length;
    }
  }
  for (const [k, c] of Object.entries(cells)) console.log(`sd ${sd} rho ${rho}  ${k.padEnd(14)} warned ${String(c.warn).padStart(2)}/${SEEDS}  mean steps ${(c.steps / SEEDS).toFixed(1)}`);
}
