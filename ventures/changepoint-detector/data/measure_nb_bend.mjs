// Bend in the count trend on independent clumpy counts: --model poisson --trend bend, Poisson cost vs --overdispersion nb.
// Run: node data/measure_nb_bend.mjs   (about 2 minutes; README "Bends on clumpy counts")
import { analyze } from '../engine.mjs';
function rng(seed){let a=seed>>>0;return()=>{a=(a+0x6d2b79f5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
const norm=r=>Math.sqrt(-2*Math.log(Math.max(r(),1e-12)))*Math.cos(2*Math.PI*r());
function pois(r,l){if(l>50){return Math.max(0,Math.round(l+Math.sqrt(l)*norm(r)));}const L=Math.exp(-l);let k=0,p=1;do{k++;p*=r();}while(p>L);return k-1;}
const fac=[0.5,0.7,1.0,1.3,1.6,1.1,0.8];
function series(seed,{n=210,bend=true,period=0,clump=0.35,knot=105}){const r=rng(seed);const x=[];for(let t=0;t<n;t++){let lg=bend?(t<knot?0:4.0*(t-knot)/n):2.0*t/n;let rate=10*Math.exp(lg-1)*(period?fac[t%7]:1)*Math.exp(clump*norm(r)-clump*clump/2);x.push(pois(r,rate));}return x;}
for(const period of [0,7]) for(const bend of [true,false]) for(const od of [undefined,'nb']){
  let ch=0,kept=0,near=0;const N=40;
  for(let s=0;s<N;s++){const x=series(5000+s,{bend,period});
    const a=analyze({values:x,model:'poisson',trend:'bend',...(period?{period}:{}),...(od?{overdispersion:od}:{})});
    ch+=a.pelt.changepoints.length; if(a.trend?.growthChangesAt!==undefined){kept++; if(Math.abs(a.trend?.growthChangesAt-105)<=15)near++;}}
  console.log(`period=${period} bend=${bend} od=${od} changes/series=${(ch/N).toFixed(2)} kept=${kept}/${N} knot<=15=${near}`);
}
