// Button-click sweep: loads every venture index.html offline in headless Chromium and
// clicks each visible, enabled <button> (and input[type=button|submit]) once, with the
// page's default inputs, reloading after a click that navigates away. Reports any
// NaN/Infinity/undefined/[object Object] that newly appears in visible text, or a new
// uncaught page error. Dialogs are dismissed; network is blocked.
// With FILL=<value> (e.g. FILL=0, FILL=-1, FILL=1e308, FILL=blank) every visible text/number/range input is set to
// that value (input+change events) before each click, to reach the calculate-on-click paths.
// Usage: [FILL=0] node platform/ci/check_button_clicks.js out.json [limit]
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
const root=process.cwd();
let files=require('child_process').execSync("find ventures -name index.html -not -path '*/node_modules/*' -maxdepth 3").toString().trim().split('\n').sort();
if(process.argv[3])files=files.slice(0,+process.argv[3]);
const FILL=process.env.FILL===undefined?null:(process.env.FILL==='blank'?'':process.env.FILL);
const BAD=/.{0,30}\b(NaN|Infinity|undefined|\[object Object\])\b.{0,30}/;
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({acceptDownloads:false});
await ctx.route('**/*',r=>r.request().url().startsWith('file:')?r.continue():r.abort());
const hits=[];let withBtns=0,clicks=0;const q=[...files];
async function w(){const p=await ctx.newPage();p.on('dialog',d=>d.dismiss().catch(()=>{}));
while(q.length){const f=q.shift();const errs=[];p.removeAllListeners('pageerror');p.on('pageerror',e=>errs.push(e.message));
const url='file://'+path.join(root,f);
try{await p.goto(url,{timeout:8000,waitUntil:'load'});await p.waitForTimeout(100);
const n=await p.evaluate(()=>document.querySelectorAll('button,input[type=button],input[type=submit]').length);
if(!n)continue;withBtns++;
for(let i=0;i<Math.min(n,25);i++){
 if(p.url()!==url){await p.goto(url,{timeout:8000,waitUntil:'load'});await p.waitForTimeout(60);}
 const fill=async()=>{if(FILL===null)return;await p.evaluate(v=>{for(const i of document.querySelectorAll('input')){if(!['number','text','range',''].includes(i.type)||i.readOnly||i.disabled)continue;const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,v);i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));}},FILL);await p.waitForTimeout(40);};
 await fill();errs.length=0;
 const base=await p.evaluate(()=>document.body?document.body.innerText:'');
 const label=await p.evaluate(i=>{const e=document.querySelectorAll('button,input[type=button],input[type=submit]')[i];return e?(e.innerText||e.value||e.id||'').slice(0,40):null},i);
 if(label===null)break;
 try{await p.locator('button,input[type=button],input[type=submit]').nth(i).click({timeout:800,noWaitAfter:true});}catch(e){continue}
 clicks++;await p.waitForTimeout(80);
 let t='';try{t=await p.evaluate(()=>document.body?document.body.innerText:'')}catch(e){continue}
 const m=t.match(BAD);
 if((m&&!BAD.test(base))||errs.length){hits.push({f,i,label,m:m&&!BAD.test(base)?m[0]:null,errs:errs.slice(0,1)});}
}
}catch(e){}}
await p.close();}
await Promise.all(Array.from({length:8},w));
fs.writeFileSync(process.argv[2],JSON.stringify(hits,null,1));console.log('pages',files.length,'with buttons',withBtns,'clicks',clicks,'hits',hits.length);await b.close();})();
