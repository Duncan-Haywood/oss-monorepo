// Same simulated histories through two builds of the pairer; counts rounds whose boards differ.
// node eval/swiss-stage-b-radix-diff.mjs <old swiss.mjs> <players> <rounds> <seeds> [draw half-width]
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import * as NEW from "../swiss.mjs";
const OLD = await import(pathToFileURL(resolve(process.argv[2])).href);
function rng(seed){let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/2**32;};}
const key=(r)=>r.pairs.map(p=>[p.white,p.black].sort((a,b)=>a-b).join("-")).sort().join(",")+"|"+r.bye;
const col=(r)=>r.pairs.map(p=>p.white+">"+p.black).sort().join(",");
const [n,rounds,seeds,W0]=process.argv.slice(3).map(Number);const W=W0||0.2;
let diff=0,cdiff=0,tot=0,ex=[];
for(let s=0;s<seeds;s++){const r=rng(9000*n+s);const players=Array.from({length:n},(_,i)=>`P${i+1}`);
const rating=players.map((_,i)=>2400-i*(800/n)+(r()-0.5)*120);const games=[],byes=[];
for(let k=0;k<rounds;k++){const o={repeatFloats:true,pairing:"bracket"};const a=NEW.swissPairings(players,games,byes,[],o);
if(k>=2){const b=OLD.swissPairings(players,games,byes,[],o);tot++;if(key(a)!==key(b)){diff++;ex.push(`seed ${s} round ${k+1}`);}else if(col(a)!==col(b))cdiff++;}
for(const p of a.pairs){const e=1/(1+10**((rating[p.black]-rating[p.white]-35)/400));const u=r();const res=u<e-W?[1,0]:u<e+W?[1,1]:[0,1];games.push({a:p.white,b:p.black,ga:res[0],gb:res[1]});}
if(a.bye!==null)byes.push(a.bye);}}
console.log(`${n} players x ${rounds} rounds x ${seeds} seeds: rounds 3+ compared ${tot}, boards differ ${diff}, colours only ${cdiff}`, ex.slice(0,5).join("; "));
