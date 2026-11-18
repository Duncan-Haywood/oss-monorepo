// Null calibration of the slope-break sup-Wald at annual lengths (n = 40 to 80), 400 seeded series per cell, no break.
// The bar of 11 was set for n >= 100; this asks whether a short series needs a different bar. usage: node eval/slope-calibrate-short.mjs
import { slopeBreaks } from '../slope-breaks.mjs';
function rng(seed){let s=seed>>>0;return()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
function norm(r){return Math.sqrt(-2*Math.log(1-r()))*Math.cos(2*Math.PI*r())}
function series(n,seed,rho){const r=rng(seed);let e=0;const x=[0];for(let i=0;i<n-1;i++){e=rho*e+norm(r)*Math.sqrt(1-rho*rho);x.push(x[x.length-1]+0.01+e*0.01)}return x}
for (const n of [44,54,79]) for (const rho of [0,0.3,0.5]) {
  const ws=[]; for(let s=0;s<400;s++){const r=slopeBreaks(series(n,s*7+1,rho),{critical:0,maxKnots:1});ws.push(r.knots.length?r.knots[0].wald:0)}
  ws.sort((a,b)=>a-b); console.log('n',n,'rho',rho,'95%',ws[380].toFixed(1),'90%',ws[360].toFixed(1));
}
