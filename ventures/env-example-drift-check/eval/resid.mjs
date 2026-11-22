import {genFile} from './gen.mjs';import {parseEnv} from 'node:util';import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);const [S,engPath]=process.argv.slice(2);const e=await import(engPath);
const d16=require(S+'/npmdotenv/dotenv-16.4.7/package/lib/main.js');const d17=require(S+'/npmdotenv/dotenv-17.2.3/package/lib/main.js');
const files=JSON.parse(readFileSync(S+'/sf.json'));const py=JSON.parse(readFileSync(S+'/spy.json'));const c={trailing:0,escSingle:0,escDouble:0,other:0};const oth=[];
files.forEach((t,i)=>{const L=[new Set(Object.keys(parseEnv(t))),new Set(Object.keys(d16.parse(t))),new Set(Object.keys(d17.parse(t))),new Set(py[i].all)];const ours=new Set(e.parseExampleFile(t).keys());
 for(const k of new Set([...ours,...L.flatMap(s=>[...s])])){const v=L.filter(s=>s.has(k)).length;if(v===2)continue;if((v>=3)!==ours.has(k)){
  if(/["'`] trailing/.test(t))c.trailing++;else if(t.includes("\\'"))c.escSingle++;else if(t.includes('\\"'))c.escDouble++;else{c.other++;oth.push([t,k]);}}}});
console.log(c);console.log(JSON.stringify(oth.slice(0,2)));
