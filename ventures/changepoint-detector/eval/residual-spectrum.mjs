// Spectral peak test on the residuals after the default mean fit, for every data/*.csv series: a rho-free cycle test? (README 2026-10-30, spectral peak)
// Fisher's g = largest periodogram ordinate / sum of ordinates; p from Fisher's exact series. Peak period in observations.
import { analyze } from '../engine.mjs';
import { readFileSync, readdirSync } from 'node:fs';
const dir=new URL('../data/',import.meta.url).pathname;
function periodogram(r){const n=r.length,m=Math.floor((n-1)/2),I=[];
  for(let j=1;j<=m;j++){let c=0,s=0;for(let t=0;t<n;t++){const a=2*Math.PI*j*t/n;c+=r[t]*Math.cos(a);s+=r[t]*Math.sin(a);}I.push((c*c+s*s)/n);}
  return I;}
function fisherP(g,m){let p=0;for(let k=1;k<=Math.floor(1/g)&&k<=m;k++){let lc=0;for(let i=1;i<=k;i++)lc+=Math.log(m-i+1)-Math.log(i);p+=(k%2?1:-1)*Math.exp(lc+(m-1)*Math.log(1-k*g));if(p>1)break;}return Math.min(1,Math.max(0,p));}
for (const f of readdirSync(dir).filter(f=>f.endsWith('.csv'))) {
  const rows=readFileSync(dir+f,'utf8').trim().split('\n').slice(1).map(l=>l.split(','));
  const values=rows.map(r=>+r[1]); if(values.length<20||values.some(v=>!isFinite(v))) continue;
  let a; try{a=analyze({labels:rows.map(r=>r[0]),values});}catch(e){continue}
  const cps=a.pelt.changepoints; const b=[0,...cps,values.length]; const res=[];
  for(let s=0;s<b.length-1;s++){const seg=values.slice(b[s],b[s+1]);const m=seg.reduce((x,y)=>x+y,0)/seg.length;seg.forEach(v=>res.push(v-m));}
  const I=periodogram(res),tot=I.reduce((x,y)=>x+y,0),mx=Math.max(...I),j=I.indexOf(mx)+1,g=mx/tot;
  console.log(f.padEnd(28),String(values.length).padStart(5),'k='+String(cps.length).padEnd(3),'g='+g.toFixed(3),'p='+fisherP(g,I.length).toExponential(1),'period='+(res.length/j).toFixed(1));
}
