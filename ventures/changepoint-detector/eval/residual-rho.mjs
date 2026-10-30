// Residual lag-1 autocorrelation after the default mean fit, for every data/*.csv series: is it a rho-free cycle test? (README 2026-10-30, residual rho)
import { analyze, ar1Rho } from '../engine.mjs';
import { readFileSync, readdirSync } from 'node:fs';
const dir=new URL('../data/',import.meta.url).pathname;
for (const f of readdirSync(dir).filter(f=>f.endsWith('.csv'))) {
  const rows=readFileSync(dir+f,'utf8').trim().split('\n').slice(1).map(l=>l.split(','));
  const values=rows.map(r=>+r[1]); if(values.length<20||values.some(v=>!isFinite(v))) continue;
  let a; try{a=analyze({labels:rows.map(r=>r[0]),values});}catch(e){continue}
  const cps=a.pelt.changepoints; const b=[0,...cps,values.length]; const res=[];
  for(let s=0;s<b.length-1;s++){const seg=values.slice(b[s],b[s+1]);const m=seg.reduce((x,y)=>x+y,0)/seg.length;seg.forEach(v=>res.push(v-m));}
  let num=0,den=0;for(let i=0;i<res.length;i++){den+=res[i]**2;if(i)num+=res[i]*res[i-1];}
  console.log(f.padEnd(28), values.length, 'k='+cps.length, 'rawRho='+ar1Rho(values).toFixed(2), 'resRho='+(num/den).toFixed(2));
}
