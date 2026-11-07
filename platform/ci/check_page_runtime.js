// Loads every venture index.html offline in headless Chromium and reports
// NaN/Infinity/undefined/[object Object] in visible text and uncaught page errors.
// Usage: node platform/ci/check_page_runtime.js out.json   (prose mentions are listed, review by eye)
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
const root=process.cwd();
const files=require('child_process').execSync("find ventures -name index.html -not -path '*/node_modules/*' -maxdepth 3").toString().trim().split('\n');
(async()=>{const b=await chromium.launch();const ctx=await b.newContext();
await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file:'))r.continue();else r.abort();});
const hits=[];let i=0;
const pool=8;const q=[...files];
async function w(){const p=await ctx.newPage();while(q.length){const f=q.shift();const errs=[];p.removeAllListeners('pageerror');p.on('pageerror',e=>errs.push(e.message));
try{await p.goto('file://'+path.join(root,f),{timeout:8000,waitUntil:'load'});await p.waitForTimeout(150);
const t=await p.evaluate(()=>document.body?document.body.innerText:'');
const m=t.match(/.{0,30}\b(NaN|Infinity|undefined|\[object Object\])\b.{0,30}/);
if(m||errs.length)hits.push({f,m:m&&m[0],errs:errs.slice(0,1)});}catch(e){}}
await p.close();}
await Promise.all(Array.from({length:pool},w));
fs.writeFileSync(process.argv[2],JSON.stringify(hits,null,1));console.log(files.length,hits.length);await b.close();})();
