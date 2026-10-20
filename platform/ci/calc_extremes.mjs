// Extreme-input probe for one venture calculator (report tool, not a CI gate).
//
// Usage:  node platform/ci/calc_extremes.mjs <slug>
// Fleet:  ls ventures/*/calc.mjs | cut -d/ -f2 | xargs -P8 -I{} sh -c \
//           'timeout 15 node --max-old-space-size=512 platform/ci/calc_extremes.mjs {} 2>/dev/null \
//            || echo "HANG/OOM rc=$? {}"'
//
// Takes the calculator's DEFAULTS, sets each numeric field to 0 and to 1e12, and prints
//   NONFINITE slug: field=value   the result holds NaN/Infinity
//   THROW ...                     an error that is not a validation message
// A hang or out-of-memory exit (what an unbounded term/month loop does) shows up as a
// non-zero exit from the driver. Measured 2026-10-17: five calculators hung or exhausted
// memory on a typed-in 1e12 and were fixed; zero-input NONFINITE hits remain for review.
import path from 'node:path'; import {pathToFileURL} from 'node:url';
const d=process.argv[2];
const hasBad=(v,seen=new Set())=>{ if(typeof v==='number') return !Number.isFinite(v); if(v&&typeof v==='object'){ if(seen.has(v))return false; seen.add(v); return Object.values(v).some(x=>hasBad(x,seen)); } return false;};
const m=await import(pathToFileURL(path.resolve('ventures',d,'calc.mjs')).href).catch(()=>null); if(!m) process.exit(0);
const D=m.DEFAULTS; if(!D||typeof D!=='object') process.exit(0);
const fn=['compute','calculate','calc','estimate','analyze'].map(n=>m[n]).find(x=>typeof x==='function'); if(!fn) process.exit(0);
try{ if(hasBad(fn({...D}))) process.exit(0);}catch{process.exit(0)}
for(const k of Object.keys(D)){ if(typeof D[k]!=='number') continue;
  for(const val of [0,1e12]){ 
    try{ const r=fn({...D,[k]:val}); if(hasBad(r)) console.log(`NONFINITE ${d}: ${k}=${val}`);}
    catch(e){ if(!/must|enter|valid|greater|least|less|between|required|invalid|exceed|more than|too|range|limit|zero|positive|number|percent|maximum|minimum/i.test(e.message)) console.log(`THROW ${d}: ${k}=${val} ${e.message.slice(0,70)}`);} } }
