// For one page, the gzip bytes each direct import pulls in that nothing else
// in the page needs: what turning that import into import() would save.
// Usage: node platform/perf/module-exclusive.mjs ventures/<slug>/index.html
import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib';
const html = path.resolve(process.argv[2]); const dir = path.dirname(html);
const re = /(?:^|[;\n}])\s*import\s+(?:[\w*{}\s,$]+\s+from\s+)?['"]([^'"]+)['"]|export\s+(?:\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/g;
const deps = (f, s) => [...s.matchAll(re)].map(m => m[1]||m[2]).filter(d => d.startsWith('.')).map(d => path.resolve(path.dirname(f), d));
const g = new Map(), size = new Map();
function walk(f){ if (g.has(f)) return; const s = fs.readFileSync(f,'utf8'); size.set(f, zlib.gzipSync(s).length); g.set(f, deps(f,s)); g.get(f).forEach(walk); }
const h = fs.readFileSync(html,'utf8'); const inline = [...h.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
const roots = [...new Set(deps(html, inline))]; roots.forEach(walk);
const reach = (rs) => { const s = new Set(); const st=[...rs]; while(st.length){const f=st.pop(); if(s.has(f))continue; s.add(f); st.push(...g.get(f));} return s; };
const all = reach(roots); const tot=[...all].reduce((a,f)=>a+size.get(f),0);
console.log('total', Math.round(tot/1024),'kB gz', all.size,'files');
const rows = roots.map(r => { const rest = reach(roots.filter(x=>x!==r)); const ex=[...all].filter(f=>!rest.has(f)); return [ex.reduce((a,f)=>a+size.get(f),0), path.relative(dir,r), ex.map(f=>path.relative(dir,f)).join(',')]; }).sort((a,b)=>b[0]-a[0]);
for (const r of rows) console.log(Math.round(r[0]/1024)+'k', r[1], r[2]);
