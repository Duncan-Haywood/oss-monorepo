// Select/radio/checkbox/keyboard sweep: loads every venture index.html offline in headless
// Chromium and, for each visible <select> (every option in turn), checkbox and radio (toggled),
// dispatches the change, and for each text/number input presses Enter, then reports any
// NaN/Infinity/undefined/[object Object] that newly appears in visible text or a new uncaught page error.
// Usage: node platform/ci/check_select_keys.js out.json [limit]
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
const root=process.cwd();
let files=require('child_process').execSync("find ventures -name index.html -not -path '*/node_modules/*' -maxdepth 3").toString().trim().split('\n').sort();
if(process.argv[3])files=files.slice(0,+process.argv[3]);
const BAD=/.{0,30}\b(NaN|Infinity|undefined|\[object Object\])\b.{0,30}/;
(async()=>{const b=await chromium.launch();const ctx=await b.newContext();
await ctx.route('**/*',r=>r.request().url().startsWith('file:')?r.continue():r.abort());
const hits=[];let withCtl=0,acts=0;const q=[...files];
async function w(){const p=await ctx.newPage();p.on('dialog',d=>d.dismiss().catch(()=>{}));
while(q.length){const f=q.shift();const errs=[];p.removeAllListeners('pageerror');p.on('pageerror',e=>errs.push(e.message));
const url='file://'+path.join(root,f);
try{await p.goto(url,{timeout:8000,waitUntil:'load'});await p.waitForTimeout(100);
const plan=await p.evaluate(()=>{const v=e=>!!(e.offsetWidth||e.offsetHeight)&&!e.disabled;const o=[];
document.querySelectorAll('select').forEach((s,i)=>{if(v(s))for(let k=0;k<s.options.length&&k<30;k++)o.push(['s',i,k]);});
document.querySelectorAll('input[type=checkbox],input[type=radio]').forEach((c,i)=>{if(v(c))o.push(['c',i,0])});
document.querySelectorAll('input').forEach((c,i)=>{if(v(c)&&['text','number','',undefined].includes(c.getAttribute('type')||''))o.push(['k',i,0])});
return o.slice(0,80)});
if(!plan.length)continue;withCtl++;
for(const [kind,i,k] of plan){
 if(p.url()!==url){await p.goto(url,{timeout:8000,waitUntil:'load'});await p.waitForTimeout(60);}
 errs.length=0;
 let base='';try{base=await p.evaluate(()=>document.body.innerText)}catch(e){continue}
 try{
  if(kind==='s'){await p.evaluate(([i,k])=>{const s=document.querySelectorAll('select')[i];s.selectedIndex=k;s.dispatchEvent(new Event('input',{bubbles:true}));s.dispatchEvent(new Event('change',{bubbles:true}));},[i,k]);}
  else if(kind==='c'){await p.locator('input[type=checkbox],input[type=radio]').nth(i).click({timeout:800,noWaitAfter:true,force:true});}
  else{const l=p.locator('input').nth(i);await l.focus({timeout:800});await p.keyboard.press('Enter');}
 }catch(e){continue}
 acts++;await p.waitForTimeout(80);
 let t='';try{t=await p.evaluate(()=>document.body?document.body.innerText:'')}catch(e){continue}
 const m=t.match(BAD);
 if((m&&!BAD.test(base))||errs.length)hits.push({f,kind,i,k,m:m&&!BAD.test(base)?m[0]:null,errs:errs.slice(0,1)});
}
}catch(e){}}
await p.close();}
await Promise.all(Array.from({length:8},w));
fs.writeFileSync(process.argv[2],JSON.stringify(hits,null,1));console.log('pages',files.length,'with controls',withCtl,'actions',acts,'hits',hits.length);await b.close();})();
