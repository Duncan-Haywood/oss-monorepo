// Purity probe for one venture calculator (report tool, not a CI gate). Sibling of calc_extremes.mjs.
//
// Usage:  node platform/ci/calc_purity.mjs <slug> [module]
// Fleet:  ls ventures/*/calc.mjs | cut -d/ -f2 | xargs -P8 -I{} sh -c \
//           'timeout 15 node --max-old-space-size=512 platform/ci/calc_purity.mjs {} 2>/dev/null'
//
// Calls the engine the way the agent server does (platform/agents/tools.mjs buildArgs:
// `{...DEFAULTS, ...input}`, a SHALLOW copy, so nested arrays and objects are the module's own)
// and prints
//   MUTATES_DEFAULTS slug fn: path   the call changed the exported DEFAULTS (every later call in the
//                                    same process, the MCP server's or the page's, now starts from
//                                    different defaults)
//   MUTATES_INPUT slug fn: path      the call changed a deep copy it was handed (a caller that reuses
//                                    its input object sees it change)
//   NONDETERMINISTIC slug fn: path   two identical calls returned different results (clock or random)
// Why: the page builds a fresh object per click, but an agent calls the engine repeatedly in one
// long-lived process, so a sort() or push() on a nested default leaks between calls.
// Measured 2026-11-11: 103 of the 993 calc.mjs engines export DEFAULTS and a known entry point and
// run on them (5 have nested defaults); 0 hits of any kind. The agent server spawns a fresh process per
// call_tool, so a leak there would be per-call; pages keep module state across clicks.
import path from 'node:path'; import {pathToFileURL} from 'node:url';
const [d, modName='calc.mjs']=process.argv.slice(2);
const m=await import(pathToFileURL(path.resolve('ventures',d,modName)).href).catch(()=>null); if(!m) process.exit(0);
const D=m.DEFAULTS; if(!D||typeof D!=='object'||Array.isArray(D)) process.exit(0);
const names=['compute','calculate','calc','estimate','analyze','project','run','evaluate','check','score'];
const fname=names.find(n=>typeof m[n]==='function'); if(!fname) process.exit(0);
const fn=m[fname];
const clone=v=>{ try{return structuredClone(v)}catch{return JSON.parse(JSON.stringify(v))} };
// First differing path between two JSON-ish values, or null when equal.
const diff=(a,b,p='$',seen=new Set())=>{
  if(Object.is(a,b)) return null;
  if(typeof a==='number'&&typeof b==='number') return Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(a))?null:p;
  if(typeof a!=='object'||typeof b!=='object'||!a||!b) return typeof a==='function'&&typeof b==='function'?null:p;
  if(seen.has(a)) return null; seen.add(a);
  if(Array.isArray(a)!==Array.isArray(b)) return p;
  if(a instanceof Date||b instanceof Date) return +a===+b?null:p;
  const ka=Object.keys(a), kb=Object.keys(b);
  if(Array.isArray(a)&&a.length!==b.length) return `${p}.length`;
  for(const k of new Set([...ka,...kb])){ if(!(k in a)||!(k in b)) return `${p}.${k}`; const r=diff(a[k],b[k],`${p}.${k}`,seen); if(r) return r; }
  return null;
};
const before=clone(D);
let r1;
try{ r1=await fn({...D}); }catch{ process.exit(0); }
const dm=diff(before,D,'DEFAULTS'); if(dm) console.log(`MUTATES_DEFAULTS ${d} ${fname}: ${dm}`);
const fresh=clone(before), held=clone(before);
let r2; try{ r2=await fn(fresh); }catch{ process.exit(0); }
const im=diff(held,fresh,'input'); if(im&&!dm) console.log(`MUTATES_INPUT ${d} ${fname}: ${im}`);
let r3; try{ r3=await fn(clone(before)); }catch{ process.exit(0); }
const nd=diff(clone(r2),clone(r3),'result'); if(nd) console.log(`NONDETERMINISTIC ${d} ${fname}: ${nd}`);
