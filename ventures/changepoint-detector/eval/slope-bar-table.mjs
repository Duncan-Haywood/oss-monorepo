// A bar for the slope-break sup-Wald by series length n and serial correlation rho (null 95th percentile, no break).
// slope-calibrate*.mjs showed 11 is right for n >= 100 only. This prints the grid that slope-breaks.mjs's `barFor(n, rho)`
// interpolates (BAR_N, BAR_RHO, BAR_TABLE). usage: node eval/slope-bar-table.mjs [seeds=600]
import { slopeBreaks } from '../slope-breaks.mjs';
function rng(seed){let s=seed>>>0;return()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
function norm(r){return Math.sqrt(-2*Math.log(1-r()))*Math.cos(2*Math.PI*r())}
function series(n,seed,rho){const r=rng(seed);let e=0;const x=[0];for(let i=0;i<n-1;i++){e=rho*e+norm(r)*Math.sqrt(1-rho*rho);x.push(x[x.length-1]+0.01+e*0.01)}return x}
const SEEDS = Number(process.argv[2] || 600);
const NS = [30, 44, 60, 80, 100, 150, 200, 400], RHOS = [0, 0.2, 0.4, 0.6];
console.log(`null 95th percentile of the largest W, ${SEEDS} seeded series per cell, 15% trimming, no break`);
console.log('n\\rho ' + RHOS.map(r => String(r).padStart(6)).join(''));
for (const n of NS) {
  const row = [];
  for (const rho of RHOS) {
    const ws = [];
    for (let s = 0; s < SEEDS; s++) { const r = slopeBreaks(series(n, s * 13 + 5, rho), { critical: 0, maxKnots: 1 }); ws.push(r.knots.length ? r.knots[0].wald : 0); }
    ws.sort((a, b) => a - b); row.push(ws[Math.floor(SEEDS * 0.95)].toFixed(1).padStart(6));
  }
  console.log(String(n).padEnd(6) + row.join(''));
}
