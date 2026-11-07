// Loads every venture index.html offline in headless Chromium, then blanks and zeroes
// every number/text input (input+change events) and reports NaN/Infinity/undefined/
// [object Object] that appears in visible text, or uncaught page errors raised by it.
// Usage: node platform/ci/check_blank_inputs.js out.json [limit]
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
const root=process.cwd();
let files=require('child_process').execSync("find ventures -name index.html -not -path '*/node_modules/*' -maxdepth 3").toString().trim().split('\n').sort();
if(process.argv[3])files=files.slice(0,+process.argv[3]);
const BAD=/.{0,30}\b(NaN|Infinity|undefined|\[object Object\])\b.{0,30}/;
(async()=>{const b=await chromium.launch();const ctx=await b.newContext();
await ctx.route('**/*',r=>r.request().url().startsWith('file:')?r.continue():r.abort());
const hits=[];const q=[...files];let withInputs=0;
async function w(){const p=await ctx.newPage();
while(q.length){const f=q.shift();let errs=[];p.removeAllListeners('pageerror');p.on('pageerror',e=>errs.push(e.message));
try{await p.goto('file://'+path.join(root,f),{timeout:8000,waitUntil:'load'});await p.waitForTimeout(100);
const base=await p.evaluate(()=>document.body?document.body.innerText:'');
const baseBad=(base.match(BAD)||[])[0];const baseErrs=errs.length;errs=[];
const n=await p.evaluate(()=>document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]):not([type=range]),textarea').length);
if(!n)continue;withInputs++;
for(const mode of ['blank','zero']){
 await p.evaluate(m=>{for(const e of document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]):not([type=range]),textarea')){
  if(e.type==='date'||e.type==='time'||e.type==='color'||e.type==='month'||e.type==='week'||e.type==='datetime-local')continue;
  e.value=m==='blank'?'':'0';
  for(const t of ['input','change','keyup'])try{e.dispatchEvent(new Event(t,{bubbles:true}))}catch(x){}}},mode);
 await p.waitForTimeout(60);
 const t=await p.evaluate(()=>document.body?document.body.innerText:'');
 const m=(t.match(BAD)||[])[0];
 if((m&&m!==baseBad)||errs.length){hits.push({f,mode,m:m&&m!==baseBad?m:null,errs:errs.slice(0,1)});errs=[];break;}
}}catch(e){}}
await p.close();}
await Promise.all(Array.from({length:8},w));
fs.writeFileSync(process.argv[2],JSON.stringify(hits,null,1));console.log(files.length,'pages',withInputs,'with inputs',hits.length,'hits');await b.close();})();
