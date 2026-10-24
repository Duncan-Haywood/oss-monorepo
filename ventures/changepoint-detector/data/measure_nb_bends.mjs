// Two bends in the count trend on independent clumpy counts: --model poisson --trend bends, Poisson cost vs --overdispersion nb.
// Run: node data/measure_nb_bends.mjs [N] [rate]   (README "Two bends on clumpy counts")
import { analyze } from '../engine.mjs';
function rng(seed){let a=seed>>>0;return()=>{a=(a+0x6d2b79f5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
const norm=r=>Math.sqrt(-2*Math.log(Math.max(r(),1e-12)))*Math.cos(2*Math.PI*r());
function pois(r,l){if(l>50){return Math.max(0,Math.round(l+Math.sqrt(l)*norm(r)));}const L=Math.exp(-l);let k=0,p=1;do{k++;p*=r();}while(p>L);return k-1;}
let RATE=10;
const fac=[0.5,0.7,1.0,1.3,1.6,1.1,0.8];
// log growth per point: 0.01 to 80, 0.03 to 160, -0.02 after (as README "Two bends in the count trend"); flat-slope control keeps one line
function series(seed,{n=240,bends=true,period=0,clump=0.35}){const r=rng(seed);const x=[];let lg=0;for(let t=0;t<n;t++){lg+=bends?(t<80?0.01:t<160?0.03:-0.02):0.01;const rate=RATE*Math.exp(lg-1)*(period?fac[t%7]:1)*Math.exp(clump*norm(r)-clump*clump/2);x.push(pois(r,rate));}return x;}
const N=Number(process.argv[2])||20; RATE=Number(process.argv[3])||10;
for(const period of [0,7]) for(const bends of [true,false]) for(const od of [undefined,'nb']){
  let ch=0,two=0,both=0,any=0;const t0=Date.now();
  for(let s=0;s<N;s++){const x=series(6000+s,{bends,period});
    const a=analyze({values:x,model:'poisson',trend:'bends',...(period?{period}:{}),...(od?{overdispersion:od}:{})});
    ch+=a.pelt.changepoints.length; const ks=a.trend?.growthChangesAtAll||(a.trend?.growthChangesAt!==undefined?[a.trend.growthChangesAt]:[]); if(ks.length)any++; if(ks.length>=2)two++;
    if(ks.some(k=>Math.abs(k-80)<=15)&&ks.some(k=>Math.abs(k-160)<=15))both++;}
  console.log(`period=${period} bends=${bends} od=${od||'poisson'} changes/series=${(ch/N).toFixed(2)} anyBend=${any}/${N} twoBends=${two}/${N} bothKnots<=15=${both}/${N} ${((Date.now()-t0)/N/1000).toFixed(1)}s/series`);
}
