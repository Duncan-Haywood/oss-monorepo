// Does the n-and-rho-dependent bar (slopeBreakPValue) hold its size where the fixed bar of 11 fails?
// 300 seeded null series per cell (no break); rejection rate at p<0.05 with reps=199, against the fixed bar of 11.
// Then power on a 1.0 -> 0.2 slope change and the two US productivity series. usage: node eval/slope-pvalue.mjs
import { slopeBreaks, slopeBreakPValue } from '../slope-breaks.mjs';
import fs from 'node:fs';
function rng(seed){let s=seed>>>0;return()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
function norm(r){return Math.sqrt(-2*Math.log(1-r()))*Math.cos(2*Math.PI*r())}
function series(n,seed,rho,brk=null){const r=rng(seed);let e=0;const x=[0];for(let i=0;i<n-1;i++){e=rho*e+norm(r)*Math.sqrt(1-rho*rho);const g=brk&&i>=brk.at?brk.to:1;x.push(x[x.length-1]+g*0.01+e*0.01)}return x}
const N=+process.env.SERIES||300;
for (const n of [44,79,200]) for (const rho of [0,0.3,0.5]) {
  let fixed=0, adaptive=0;
  for(let s=0;s<N;s++){const x=series(n,s*13+5,rho);
    if(slopeBreaks(x,{maxKnots:1}).knots.length) fixed++;
    if(slopeBreakPValue(x,{reps:199,seed:s+1}).p<0.05) adaptive++;}
  console.log(`null n=${n} rho=${rho}: fixed bar 11 rejects ${(100*fixed/N).toFixed(1)}%, n-rho bar ${(100*adaptive/N).toFixed(1)}%`);
}
for (const n of [79,200]) {
  let fixed=0, adaptive=0;
  for(let s=0;s<N;s++){const x=series(n,s*17+3,0.3,{at:Math.floor(n/2),to:0.2});
    if(slopeBreaks(x,{maxKnots:1}).knots.length) fixed++;
    if(slopeBreakPValue(x,{reps:199,seed:s+1}).p<0.05) adaptive++;}
  console.log(`power 1.0->0.2 at midpoint, n=${n}, rho=0.3: fixed ${(100*fixed/N).toFixed(1)}%, n-rho bar ${(100*adaptive/N).toFixed(1)}%`);
}
for (const f of ['data/us-labor-productivity.csv']) {
  const rows=fs.readFileSync(new URL('../'+f,import.meta.url),'utf8').trim().split('\n').slice(1).map(l=>l.split(','));
  const lv=rows.map(r=>Math.log(+r[r.length-1])).filter(Number.isFinite);
  const q=slopeBreakPValue(lv,{reps:999});
  console.log(`US productivity quarterly n=${q.n}: W ${q.w.toFixed(1)}, rho ${q.rho.toFixed(2)}, 95% bar ${q.bar95.toFixed(1)}, p ${q.p.toFixed(3)}`);
  const by={}; rows.forEach((r,i)=>{(by[r[0].slice(0,4)]??=[]).push(lv[i])});
  const yrs=Object.values(by).filter(a=>a.length===4).map(a=>a.reduce((s,v)=>s+v,0)/4);
  const a=slopeBreakPValue(yrs,{reps:999});
  console.log(`US productivity annual means n=${a.n}: W ${a.w.toFixed(1)}, rho ${a.rho.toFixed(2)}, 95% bar ${a.bar95.toFixed(1)}, p ${a.p.toFixed(3)}`);
}
