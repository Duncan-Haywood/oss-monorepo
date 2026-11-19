// HTML-injection sweep: does text a visitor types come back out as markup?
//
// Every venture page is static and has no server, so the only cross-site
// scripting route is DOM-based: a value the page reads (a text input, a pasted
// CSV, a share link's hash) written into innerHTML / insertAdjacentHTML without
// escaping. 85 venture pages both read location.hash/search and build HTML
// from template strings, and every one has an escape helper or textContent
// somewhere, so the syntax says nothing about whether each path is escaped.
// This checks the behaviour instead.
//
// For every venture index.html with a visible, editable text field (input
// type text/search/email/url/tel or none, or a textarea), on a freshly loaded
// page: put a probe string into every field (textareas keep their own first
// line, then get the probe as a second line, so CSV parsers see a row), dispatch
// input+change, and click up to three visible buttons whose label starts with
// a run verb (submits are prevented from navigating). The probe is
//
//   "'><b data-xss-probe="1">probe</b>
//
// which is inert (no script, no handler). A hit is a [data-xss-probe] element
// in the live document: the page parsed visitor text as HTML. For each hit the
// sweep then asks how far it reaches:
//
//   * reflected: the page's own URL changed (it keeps state in the hash or
//     query); a fresh browser context opening that URL also renders the probe,
//     so a crafted link would run markup in a victim's page.
//   * stored: a reload in the same context (localStorage restore) renders it.
//   * self: only on the visitor's own typing.
//
//   node platform/ci/check_html_injection.js out.json [limit]
//   SWEEP_ROOT=ventures/some-slug node platform/ci/check_html_injection.js out.json
//
// Exit 1 on any hit. Pages are served over http:// by sweep_server.js (module
// scripts do not load from file://). External requests are aborted. See
// docs/reports/2026-11-19-html-injection-sweep.md.
const {chromium}=require('playwright');const {serve}=require('./sweep_server.js');const fs=require('fs');
const root=process.cwd();
let files=require('child_process').execSync(`find ${process.env.SWEEP_ROOT||'ventures'} -maxdepth 3 -name index.html -not -path '*/node_modules/*'`).toString().trim().split('\n').filter(Boolean).sort();
if(process.argv[3])files=files.slice(0,+process.argv[3]);
const PROBE=`"'><b data-xss-probe="1">probe</b>`;
const RUN=/^(analy[sz]e|check|calculate|run|compute|generate|plan|build|compare|score|read|parse|go|show|update|preview|reconcile|convert|validate|estimate|summari[sz]e|import|load|test|find|detect|fit|solve|price|sort|split|match|review|audit|process|create|make|add|save|draft|format|write|copy)\b/i;
const FIELD='textarea, input:not([type]), input[type=text], input[type=search], input[type=email], input[type=url], input[type=tel]';

async function fill(p){
  return p.evaluate(([PROBE,RUNs,FIELD])=>{const RUN=new RegExp(RUNs,'i');
    const vis=x=>!x.readOnly&&!x.disabled&&x.offsetParent!==null;
    const fields=[...document.querySelectorAll(FIELD)].filter(vis);
    const ta=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;
    const inp=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
    for(const f of fields){
      if(f.tagName==='TEXTAREA'){const head=(f.value||'').split(/\r?\n/)[0];ta.call(f,head?head+'\n'+PROBE:PROBE);}
      else inp.call(f,PROBE);
      f.dispatchEvent(new Event('input',{bubbles:true}));f.dispatchEvent(new Event('change',{bubbles:true}));
    }
    const btns=[...document.querySelectorAll('button,input[type=submit],input[type=button]')].filter(x=>x.offsetParent!==null&&!x.disabled&&RUN.test((x.textContent||x.value||'').trim()));
    const clicked=[];for(const x of btns.slice(0,3)){clicked.push((x.textContent||x.value).trim().slice(0,30));const form=x.closest('form');if(form)form.addEventListener('submit',e=>e.preventDefault(),{once:true});try{x.click();}catch{}}
    return {n:fields.length,clicked};
  },[PROBE,RUN.source,FIELD]);
}
const probed=p=>p.evaluate(()=>{const e=document.querySelector('[data-xss-probe]');if(!e)return null;const h=e.parentElement;return (h?h.outerHTML:e.outerHTML).slice(0,160);});

(async()=>{const srv=await serve(root);const b=await chromium.launch();
  const mk=async()=>{const c=await b.newContext({acceptDownloads:false});await c.route('**/*',r=>r.request().url().startsWith(srv.base)?r.continue():r.abort());return c;};
  const hits=[];let withFields=0,clickedPages=0;const q=[...files];
  async function w(){
    while(q.length){const f=q.shift();const ctx=await mk();const p=await ctx.newPage();p.on('dialog',d=>d.dismiss().catch(()=>{}));
      try{
        const start=srv.url(f);
        await p.goto(start,{timeout:8000,waitUntil:'load'});await p.waitForTimeout(120);
        if(await probed(p)){hits.push({f,reach:'baseline',where:'probe present before input'});continue;}
        const r=await fill(p);if(!r.n)continue;withFields++;if(r.clicked.length)clickedPages++;
        await p.waitForTimeout(300);
        const where=await probed(p);if(!where)continue;
        const hit={f,reach:'self',clicked:r.clicked,where};
        const now=p.url();
        if(now!==start&&now.split('#')[0].split('?')[0]===start.split('#')[0].split('?')[0]){
          const c2=await mk();const p2=await c2.newPage();
          try{await p2.goto(now,{timeout:8000,waitUntil:'load'});await p2.waitForTimeout(300);if(await probed(p2)){hit.reach='reflected';hit.url=now.slice(srv.base.length,srv.base.length+200);}}catch{}
          await c2.close();
        }
        if(hit.reach==='self'){try{await p.goto(start,{timeout:8000,waitUntil:'load'});await p.waitForTimeout(300);if(await probed(p))hit.reach='stored';}catch{}}
        hits.push(hit);
      }catch(e){}finally{await ctx.close();}
    }
  }
  await Promise.all(Array.from({length:6},w));
  await b.close();await srv.close();
  const order={reflected:0,stored:1,self:2,baseline:3};hits.sort((a,b)=>order[a.reach]-order[b.reach]||a.f.localeCompare(b.f));
  const out={pages:files.length,withFields,clickedPages,hits};
  fs.writeFileSync(process.argv[2]||'html-injection.json',JSON.stringify(out,null,1));
  const by={};hits.forEach(h=>by[h.reach]=(by[h.reach]||0)+1);
  console.log(`pages ${files.length}, with text fields ${withFields}, run button clicked ${clickedPages}, hits ${hits.length}`,JSON.stringify(by));
  for(const h of hits)console.log(`${h.reach.padEnd(9)} ${h.f}  ${h.where||''}`);
  process.exit(hits.length?1:0);
})();
