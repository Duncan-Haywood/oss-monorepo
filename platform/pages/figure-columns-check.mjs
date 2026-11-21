// Figure-column alignment over the built site, in Chromium (figure-columns.mjs).
//
//   node platform/pages/figure-columns-check.mjs pages.json out.json   # W=390 for a phone
//
// pages.json: a JSON list of dist paths ("sod-install-bid-calculator/"), e.g. every page
// with a <table> outside /writing/. For each table it finds the columns after the first
// whose every non-blank body cell is one figure (the blog's test) and counts them by the
// computed text-align of their first figure; it also records whether the page scrolls
// sideways. Prints totals: l(eft), r(ight), c(enter), t(ables), pl (pages with a left
// one), e(rrors), side (pages wider than the viewport). It does not skip columns holding
// a form control, which the pass does, so a small "left" remainder can be those.
// Measured 2026-11-21: docs/reports/polish-2026-11-21-figure-columns.md.
import pw from '/opt/node-tools/node_modules/playwright/index.js';
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
const root=path.resolve('platform/pages/dist'); const pages=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);let f=path.join(root,p);if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.html');if(!fs.existsSync(f)){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(r);}).listen(0);
const port=srv.address().port; const b=await pw.chromium.launch(); const W=+(process.env.W||1280); const ctx=await b.newContext({viewport:{width:W,height:900}});
await ctx.route(u=>!u.href.startsWith(`http://localhost:${port}`),r=>r.abort());
const out=[]; let i=0;
async function worker(){const pg=await ctx.newPage(); while(i<pages.length){const p=pages[i++];
 try{await pg.goto(`http://localhost:${port}/${p}`,{waitUntil:'load',timeout:20000}); await pg.waitForTimeout(300);
 const r=await pg.evaluate(()=>{const NUM=/^[~≈<>≤≥±]?\s*[+\-−]?\s*[$€£]?\s*\d[\d,]*(\.\d+)?\s*(%|x|×|k|K|M|B|ms|s|px|h|pp|GB|MB|kB)?$/;const BL=/^(|—|–|-|n\/a|N\/A)$/;
  let left=0,right=0,center=0,tables=0; const ex=[];
  for(const t of document.querySelectorAll('table')){ if(!t.offsetParent && getComputedStyle(t).display!=='table')continue;
   const rows=[...t.tBodies].flatMap(b=>[...b.rows]).filter(r=>![...r.cells].some(c=>c.colSpan>1));
   if(rows.length<2)continue; const cols=Math.max(...rows.map(r=>r.cells.length)); let hit=false;
   for(let j=1;j<cols;j++){const cs=rows.map(r=>r.cells[j]).filter(Boolean);const v=cs.filter(c=>!BL.test(c.textContent.trim()));
    if(!v.length||!v.every(c=>NUM.test(c.textContent.trim().replace(/\s+/g,' '))))continue; hit=true;
    const a=getComputedStyle(v[0]).textAlign; if(a==='right'||a==='end')right++; else if(a==='center')center++; else {left++; if(ex.length<3)ex.push((t.tHead?.rows[0]?.cells[j]?.textContent||'').trim().slice(0,30)+': '+v[0].textContent.trim());}}
   if(hit)tables++;}
  return {tables,left,right,center,ex,side:document.documentElement.scrollWidth>innerWidth};});
 out.push({p,...r});}catch(e){out.push({p,err:String(e).slice(0,80)});}}}
await Promise.all([1,2,3,4,5,6].map(worker)); await b.close(); srv.close();
fs.writeFileSync(process.argv[3],JSON.stringify(out,null,1));
const s=out.reduce((a,o)=>{a.l+=o.left||0;a.r+=o.right||0;a.c+=o.center||0;a.t+=o.tables||0;if(o.left)a.pl++;if(o.err)a.e++;if(o.side)a.side++;return a},{l:0,r:0,c:0,t:0,pl:0,e:0,side:0});
console.log(JSON.stringify(s));
