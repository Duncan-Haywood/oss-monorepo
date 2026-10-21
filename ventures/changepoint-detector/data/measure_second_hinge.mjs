// How well does the cost drop of the best second knot separate a real second bend from a straight series, under NB?
// Run: node data/measure_second_hinge.mjs [N] [rate]   (README "A sharper second-bend test?")
import { analyze } from '../engine.mjs';
function rng(seed){let a=seed>>>0;return()=>{a=(a+0x6d2b79f5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
const norm=r=>Math.sqrt(-2*Math.log(Math.max(r(),1e-12)))*Math.cos(2*Math.PI*r());
function pois(r,l){if(l>50){return Math.max(0,Math.round(l+Math.sqrt(l)*norm(r)));}const L=Math.exp(-l);let k=0,p=1;do{k++;p*=r();}while(p>L);return k-1;}
const N=Number(process.argv[2])||20, RATE=Number(process.argv[3])||40;
// two bends: growth 0.01 to 80, 0.03 to 160, -0.02 after; one bend: 0.01 then 0.03 from 80; straight: 0.01
const shapes={two:t=>t<80?0.01:t<160?0.03:-0.02, one:t=>t<120?0.01:0.03, straight:()=>0.01};
const series=(seed,g)=>{const r=rng(seed);let lg=0;const x=[];for(let t=0;t<240;t++){lg+=g(t);x.push(pois(r,RATE*Math.exp(lg-1)*Math.exp(0.35*norm(r)-0.06125)));}return x;};
const res={};
for(const [name,g] of Object.entries(shapes)){
  const second=[];
  for(let s=0;s<N;s++){const diag=[];
    analyze({values:series(6000+s,g),model:'poisson',trend:'bends',overdispersion:'nb',diagBends:diag});
    const d2=diag.find(d=>d.round===1); second.push(d2?d2.drop:0);}
  res[name]=second;
  second.sort((a,b)=>a-b);
  console.log(name.padEnd(9),'second-knot drop/log n: median',second[N>>1].toFixed(2),'p90',second[Math.floor(N*0.9)].toFixed(2),'max',second[N-1].toFixed(2));
}
const auc=(pos,neg)=>{let w=0;for(const p of pos)for(const q of neg)w+=p>q?1:p===q?0.5:0;return w/(pos.length*neg.length);};
console.log('AUC two-vs-one',auc(res.two,res.one).toFixed(2),' two-vs-straight',auc(res.two,res.straight).toFixed(2),' (3 = current threshold)');
