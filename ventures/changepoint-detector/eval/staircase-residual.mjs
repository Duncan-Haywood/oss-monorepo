// Block-variance ratio of the raw series vs of its residuals about the default steps: does the residual ratio separate drift from real steps? (README 2026-10-30, staircase). Run: node eval/staircase-residual.mjs
const D=new URL('../',import.meta.url).pathname;
const { analyze, blockVarianceRatio } = await import(D+'engine.mjs');
const { staircase } = await import(D+'eval/staircase-warning.mjs');
import { readFileSync } from 'node:fs';
function rr(v, a){ const b=[0,...a.pelt.changepoints.map(c=>c.index),v.length]; const r=[]; for(let s=0;s+1<b.length;s++){const seg=v.slice(b[s],b[s+1]); const m=seg.reduce((x,y)=>x+y,0)/seg.length; seg.forEach(y=>r.push(y-m));} return r; }
const load=f=>readFileSync(D+'data/'+f+'.csv','utf8').trim().split('\n').slice(1).map(l=>+l.split(',')[1]);
for (const f of ['treering','us-inflation','nile','dax-returns','great-discoveries','nhtemp']) { const v=load(f); const a=analyze({values:v}); console.log(f,a.pelt.changepoints.length,blockVarianceRatio(v).toFixed(1),blockVarianceRatio(rr(v,a)).toFixed(1)); }
for (const [k,j] of [[5,2],[8,2],[12,3]]) { const o=[]; for(let s=1;s<=20;s++){const v=staircase(k,j,40,s*7919+k,false);o.push(blockVarianceRatio(rr(v,analyze({values:v}))));} o.sort((a,b)=>a-b); console.log('stair',k,j,'median',o[10].toFixed(2),'max',o[19].toFixed(2)); }
