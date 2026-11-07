// Edge-input sweep: loads every venture index.html offline in headless Chromium,
// then for each page sets every visible number/text input (and range) to a blank,
// "0" and "-1" in turn (dispatching input+change, clicking nothing else) and reports
// any NaN/Infinity/undefined/[object Object] that newly appears in visible text, or a
// new uncaught page error. Only text that was absent before the edit is reported.
// Usage: node platform/ci/check_input_edges.js out.json [limit]
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
const root=process.cwd();
let files=require('child_process').execSync("find ventures -name index.html -not -path '*/node_modules/*' -maxdepth 3").toString().trim().split('\n').sort();
if(process.argv[3])files=files.slice(0,+process.argv[3]);
const BAD=/.{0,30}\b(NaN|Infinity|undefined|\[object Object\])\b.{0,30}/;
(async()=>{const b=await chromium.launch();const ctx=await b.newContext();
await ctx.route('**/*',r=>r.request().url().startsWith('file:')?r.continue():r.abort());
const hits=[];let withInputs=0;const q=[...files];
async function w(){const p=await ctx.newPage();while(q.length){const f=q.shift();const errs=[];p.removeAllListeners('pageerror');p.on('pageerror',e=>errs.push(e.message));
try{await p.goto('file://'+path.join(root,f),{timeout:8000,waitUntil:'load'});await p.waitForTimeout(100);
const base=await p.evaluate(()=>document.body?document.body.innerText:'');
const n=await p.evaluate(()=>[...document.querySelectorAll('input')].filter(i=>['number','text','range',''].includes(i.type)&&!i.readOnly&&!i.disabled).length);
if(!n)continue;withInputs++;errs.length=0;
for(const v of ['','0','-1']){
 await p.evaluate(v=>{for(const i of document.querySelectorAll('input')){if(!['number','text','range',''].includes(i.type)||i.readOnly||i.disabled)continue;
  const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,v);i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));}},v);
 await p.waitForTimeout(60);
 const t=await p.evaluate(()=>document.body.innerText);const m=t.match(BAD);
 if((m&&!BAD.test(base))||errs.length){hits.push({f,v,m:m&&!BAD.test(base)?m[0]:null,errs:errs.slice(0,1)});break;}}
}catch(e){}}
await p.close();}
await Promise.all(Array.from({length:8},w));
fs.writeFileSync(process.argv[2],JSON.stringify(hits,null,1));console.log('pages',files.length,'with inputs',withInputs,'hits',hits.length);await b.close();})();
