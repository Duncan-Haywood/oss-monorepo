// Reproduces the README "Negative binomial with a trend in the Bayesian pass" numbers: node data/measure_nb_trend.mjs nb|q|p
import { analyze } from '../engine.mjs';
function rng(seed){let a=seed>>>0;return()=>{a=(a+0x6d2b79f5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
function normals(r,n){const o=[];for(let i=0;i<n;i++){const u=Math.max(r(),1e-12);o.push(Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*r()));}return o;}
function poissons(r,n,l){const o=[];for(let i=0;i<n;i++){const L=Math.exp(-l);let k=0,p=1;do{k++;p*=r();}while(p>L);o.push(k-1);}return o;}
const N=210, mode=process.argv[2]||'nb';
const mult=[0,1.8,2.5,3.5]; const res={};
for(const m of mult){ let hit=0,fl=0; for(let seed=1800;seed<1840;seed++){
  const r=rng(seed);
  const x=Array.from({length:N},(_,i)=>poissons(r,1,10*Math.exp(0.004*i)*(m&&i>=105?m:1)*Math.exp(0.35*normals(r,1)[0]-0.06))[0]);
  const od= mode==='nb'?'nb':mode==='q'?true:undefined;
  const a=analyze({values:x,model:'poisson',trend:true,...(od?{overdispersion:od}:{})});
  const d=a.bocpd.detections; if(m===0) fl+=d.length; else if(d.some(e=>Math.abs(e.index-105)<=8)) hit++;
}
res[m]=m===0?`false/series ${(fl/40).toFixed(2)}`:`hit ${hit}/40`;}
console.log(mode,JSON.stringify(res));
