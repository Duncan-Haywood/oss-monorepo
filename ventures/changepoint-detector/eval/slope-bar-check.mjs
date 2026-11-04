// Does the interpolated bar (critical: 'auto') hold 5% false reports on fresh null series, against the fixed bar of 11?
// Fresh seeds (not the table's), rho values between and beyond the grid. usage: node eval/slope-bar-check.mjs
import { slopeBreaks } from '../slope-breaks.mjs';
function rng(seed){let s=seed>>>0;return()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
function norm(r){return Math.sqrt(-2*Math.log(1-r()))*Math.cos(2*Math.PI*r())}
function series(n,seed,rho){const r=rng(seed);let e=0;const x=[0];for(let i=0;i<n-1;i++){e=rho*e+norm(r)*Math.sqrt(1-rho*rho);x.push(x[x.length-1]+0.01+e*0.01)}return x}
const S = 1000;
console.log(`false reports per ${S} null series (target 50): fixed bar 11 / auto bar`);
console.log('n    rho   fixed11   auto');
for (const n of [36, 50, 70, 120, 300]) for (const rho of [0, 0.1, 0.3, 0.5]) {
  let f = 0, a = 0;
  for (let s = 0; s < S; s++) { const x = series(n, s * 17 + 90001, rho); f += slopeBreaks(x, { maxKnots: 1 }).knots.length; a += slopeBreaks(x, { maxKnots: 1, critical: 'auto' }).knots.length; }
  console.log(String(n).padEnd(5) + String(rho).padEnd(6) + String(f).padStart(7) + String(a).padStart(8));
}
