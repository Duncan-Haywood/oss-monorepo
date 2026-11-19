// Textarea edge sweep: the pasted-data twin of check_input_edges.js.
//
// check_input_edges.js blanks every <input>; nothing blanked the <textarea>s,
// and that is where most of the catalogue's analyzers take their data (a CSV,
// a statement, a list of rows). An empty paste, or a header row with no data
// under it, is exactly what makes `rows.reduce((a, b) => ...)` with no seed
// throw "Reduce of empty array with no initial value", `rows[0].x` throw, or
// `Math.max(...[])` print -Infinity. A static scan on 2026-11-19 found 204
// seedless reduce calls in venture code; all the ones read were guarded by a
// length check upstream, so this checks the behaviour instead of the syntax.
//
// Pages are served over http:// by sweep_server.js (module scripts do not
// load from file://). For every venture index.html with a visible, editable textarea, in two
// passes (each on a freshly loaded page): set every textarea to "" ("blank"),
// then to its own first line plus a newline ("header": the header row with no
// rows), dispatch input+change, and click up to three visible buttons whose
// label starts with a run verb (Analyze, Check, Calculate, Run, ...; submits
// are prevented from navigating). A hit is a new uncaught page error, or
// NaN/Infinity/undefined/[object Object] that was not in the page before.
//
//   node platform/ci/check_textarea_edges.js out.json [limit]
//   SWEEP_ROOT=ventures/some-slug node platform/ci/check_textarea_edges.js out.json
//
// Prints pages, pages with textareas, pages where a run button was clicked,
// pages whose text changed after the edit (the page reacted), and hits; exit 1
// on any hit. A seeded page (an Analyze button over a seedless reduce) is
// caught in the "blank" pass; see docs/reports/2026-11-19-textarea-edge-sweep.md.
const {chromium}=require('playwright');const {serve}=require('./sweep_server.js');const fs=require('fs');const path=require('path');
const root=process.cwd();
let files=require('child_process').execSync(`find ${process.env.SWEEP_ROOT||'ventures'} -name index.html -not -path '*/node_modules/*' -maxdepth 3`).toString().trim().split('\n').filter(Boolean).sort();
if(process.argv[3])files=files.slice(0,+process.argv[3]);
const BAD=/.{0,40}\b(NaN|Infinity|undefined|\[object Object\])\b.{0,40}/;
// English prose, not a leaked value: "an undefined account" (quickbooks-iif-file-check's finding text).
const PROSE=/\b(an|the) undefined\b/gi;
const RUN=/^(analy[sz]e|check|calculate|run|compute|generate|plan|build|compare|score|read|parse|go|show|update|preview|reconcile|convert|validate|estimate|summari[sz]e|import|load|test|find|detect|fit|solve|price|sort|split|match|review|audit|process|create|make)\b/i;
(async()=>{const srv=await serve(root);const b=await chromium.launch();const ctx=await b.newContext({acceptDownloads:false});
await ctx.route('**/*',r=>r.request().url().startsWith(srv.base)?r.continue():r.abort());
const hits=[];let withTa=0,clickedPages=0,reacted=0;const q=[...files];
async function w(){const p=await ctx.newPage();p.on('dialog',d=>d.dismiss().catch(()=>{}));
while(q.length){const f=q.shift();const errs=[];p.removeAllListeners('pageerror');p.on('pageerror',e=>errs.push(e.message));
try{await p.goto(srv.url(f),{timeout:8000,waitUntil:'load'});await p.waitForTimeout(120);
const info=await p.evaluate(()=>{const tas=[...document.querySelectorAll('textarea')].filter(t=>!t.readOnly&&!t.disabled&&t.offsetParent!==null);return {n:tas.length,heads:tas.map(t=>(t.value||'').split(/\r?\n/)[0])};});
if(!info.n)continue;withTa++;let anyClick=false,anyReact=false;
for(const mode of ['blank','header']){
 await p.goto(srv.url(f),{timeout:8000,waitUntil:'load'});await p.waitForTimeout(120);errs.length=0;
 const base=await p.evaluate(()=>document.body?document.body.innerText:'');
 const clicked=await p.evaluate(([mode,heads,RUNs])=>{const RUN=new RegExp(RUNs,'i');const tas=[...document.querySelectorAll('textarea')].filter(t=>!t.readOnly&&!t.disabled&&t.offsetParent!==null);
  const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;
  tas.forEach((t,i)=>{set.call(t,mode==='blank'?'':(heads[i]||'')+'\n');t.dispatchEvent(new Event('input',{bubbles:true}));t.dispatchEvent(new Event('change',{bubbles:true}));});
  const btns=[...document.querySelectorAll('button,input[type=submit],input[type=button]')].filter(x=>x.offsetParent!==null&&!x.disabled&&RUN.test((x.textContent||x.value||'').trim()));
  const out=[];for(const x of btns.slice(0,3)){out.push((x.textContent||x.value).trim().slice(0,30));const form=x.closest('form');if(form)form.addEventListener('submit',e=>e.preventDefault(),{once:true});x.click();}return out;},[mode,info.heads,RUN.source]);
 await p.waitForTimeout(250);
 const t=await p.evaluate(()=>document.body?document.body.innerText:'');
 if(clicked.length)anyClick=true;if(t!==base)anyReact=true;
 const prose=x=>x.replace(PROSE,'');const m=prose(t).match(BAD);const newBad=m&&!BAD.test(prose(base))?m[0]:null;
 if(newBad||errs.length){hits.push({f,mode,clicked,bad:newBad,errs:errs.slice(0,2)});break;}}
if(anyClick)clickedPages++;if(anyReact)reacted++;
}catch(e){}}
await p.close();}
await Promise.all(Array.from({length:8},w));
fs.writeFileSync(process.argv[2],JSON.stringify(hits,null,1));
console.log('pages',files.length,'with textareas',withTa,'run button clicked',clickedPages,'reacted',reacted,'hits',hits.length);
await b.close();await srv.close();process.exit(hits.length?1:0);})();
