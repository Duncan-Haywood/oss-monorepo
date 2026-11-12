#!/usr/bin/env node
// How far do the lot-sizing rules of thumb land from the exact Wagner-Whitin plan?
//
//   node lotsize-bench.mjs            # 2,000 seeded random 12-period cases per demand spread
//
// Demand: mean 100 a period plus uniform noise whose standard deviation is `spread` x 100, rounded
// and clipped at zero (so the realised spread at 1.2 is a little lower). Order cost is set so the
// economic order covers 1 to 4 periods of mean demand (setup = tbo^2 x mean x hold / 2, tbo uniform
// on 1..4), hold = 1. These are invented cases for comparing methods, not anyone's sales.

import { wagnerWhitin, silverMeal, periodOrderQuantity, lotForLot } from "./lotsize.mjs";

export function bench({ cases = 2000, periods = 12, spreads = [0.2, 0.6, 1.2], seed = 0x2026 } = {}) {
  let a = seed;
  const r = () => { a = (a * 1103515245 + 12345) % 2147483648; return a / 2147483648; };
  const rows = [];
  for (const spread of spreads) {
    const gaps = { sm: [], poq: [], l4l: [] };
    for (let k = 0; k < cases; k++) {
      const mu = 100, hold = 1;
      const d = Array.from({ length: periods }, () => Math.max(0, Math.round(mu * (1 + spread * (r() * 2 - 1) * Math.sqrt(3)))));
      const tbo = 1 + r() * 3;
      const setup = (tbo * tbo * mu * hold) / 2;
      const w = wagnerWhitin(d, setup, hold).cost;
      gaps.sm.push(silverMeal(d, setup, hold).cost / w - 1);
      gaps.poq.push(periodOrderQuantity(d, setup, hold).cost / w - 1);
      gaps.l4l.push(lotForLot(d, setup, hold).cost / w - 1);
    }
    for (const [id, xs] of Object.entries(gaps)) {
      xs.sort((p, q) => p - q);
      rows.push({ spread, method: id, mean: xs.reduce((s, v) => s + v, 0) / xs.length, p90: xs[Math.floor(0.9 * xs.length)], max: xs[xs.length - 1], optimal: xs.filter((v) => v < 1e-9).length / xs.length });
    }
  }
  return rows;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file://").href) {
  const p = (x) => (x * 100).toFixed(1).padStart(6) + "%";
  console.log("spread  method  mean extra cost   90th pct      worst   cases optimal");
  for (const r of bench()) console.log(`${r.spread.toFixed(1).padStart(6)}  ${r.method.padEnd(6)}  ${p(r.mean).padStart(15)}  ${p(r.p90).padStart(9)}  ${p(r.max).padStart(9)}  ${p(r.optimal).padStart(14)}`);
}
