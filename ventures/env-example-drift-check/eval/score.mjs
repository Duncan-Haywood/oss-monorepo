// consensus score: a key counts when >=3 of the 4 loaders agree on whether it is declared
import {genFile} from './gen.mjs';import {parseEnv} from 'node:util';import {createRequire} from 'node:module';import {readFileSync,writeFileSync} from 'node:fs';import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url);const [S,engPath,N,base]=process.argv.slice(2);const e=await import(engPath);
const d16=require(S+'/npmdotenv/dotenv-16.4.7/package/lib/main.js');const d17=require(S+'/npmdotenv/dotenv-17.2.3/package/lib/main.js');
const files=[];for(let i=0;i<+N;i++)files.push(genFile(+base+i));writeFileSync(S+'/sf.json',JSON.stringify(files));
execFileSync('python3',['-I',new URL('./py.py',import.meta.url).pathname,S,S+'/sf.json',S+'/spy.json']);const py=JSON.parse(readFileSync(S+'/spy.json'));
let keys=0,agree=0,tie=0,phantom=0,missed=0;const ex={phantom:[],missed:[]};let nodeAgree=0;
files.forEach((t,i)=>{const L=[new Set(Object.keys(parseEnv(t))),new Set(Object.keys(d16.parse(t))),new Set(Object.keys(d17.parse(t))),new Set(py[i].all)];
 const ours=new Set(e.parseExampleFile(t).keys());const all=new Set([...ours,...L.flatMap(s=>[...s])]);
 for(const k of all){const votes=L.filter(s=>s.has(k)).length; if(votes===2){tie++;continue;} keys++; const cons=votes>=3; if(cons===ours.has(k))agree++; else if(ours.has(k)){phantom++;ex.phantom.length<3&&ex.phantom.push([t,k]);} else {missed++;ex.missed.length<3&&ex.missed.push([t,k]);}}});
console.log(`files ${N} seeds ${base}..${+base+ +N-1}: scored keys ${keys}, agree ${agree} (${(100*agree/keys).toFixed(2)}%), phantom ${phantom}, missed ${missed}, 2-2 ties skipped ${tie}`);
console.log(JSON.stringify(ex,null,0).slice(0,1500));
