// Negative-input probe for one venture calculator (report tool, not a CI gate). Sibling of calc_extremes.mjs.
//
// Usage:  node platform/ci/calc_negatives.mjs <slug>
// Fleet:  ls ventures/*/calc.mjs | cut -d/ -f2 | xargs -P8 -I{} sh -c \
//           'timeout 15 node --max-old-space-size=512 platform/ci/calc_negatives.mjs {} 2>/dev/null'
//
// Sets each numeric DEFAULTS field to -1 and prints `PROPAGATES slug field` when the engine neither
// refuses it (throws, or returns error/warnings/result:null) nor treats it as 0 (same output as field=0).
// Why: the page clamps typed negatives, but agents call the engine directly (platform/agents/tools.mjs).
// Some hits are legitimate (capital losses, signed balances); read each before changing it.
import path from 'node:path'; import {pathToFileURL} from 'node:url';
const d=process.argv[2];
const m=await import(pathToFileURL(path.resolve('ventures',d,'calc.mjs')).href).catch(()=>null); if(!m) process.exit(0);
const D=m.DEFAULTS; if(!D||typeof D!=='object') process.exit(0);
const fn=['compute','calculate','calc','estimate','analyze','project'].map(n=>m[n]).find(x=>typeof x==='function'); if(!fn) process.exit(0);
try{fn({...D})}catch{process.exit(0)}
const rej=r=>r&&typeof r==='object'&&(r.error||(r.errors&&r.errors.length)||r.ok===false||r.valid===false||r.invalid||r.message||(r.warnings&&r.warnings.length)||r.result===null||r.reason||r.err||(r.issues&&r.issues.length));
const J=r=>JSON.stringify(r,(k,v)=>typeof v==='number'?Math.round(v*1e6)/1e6:v);
for(const k of Object.keys(D)){ if(typeof D[k]!=='number') continue;
  let a,b; try{a=fn({...D,[k]:-1})}catch{continue}
  if(rej(a)) continue;
  try{b=fn({...D,[k]:0})}catch{b=null}
  if(b!==null&&J(a)===J(b)) continue;
  console.log(`PROPAGATES ${d} ${k}`);
}
