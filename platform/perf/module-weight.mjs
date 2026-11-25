// Module weight sweep: for each ventures/<slug>/index.html, walk the static ES
// import graph of its module scripts and print the gzip total, largest first.
// Usage: node platform/perf/module-weight.mjs .   (repo root)
// A page over ~200 kB gzip makes its buttons wait for all of it; follow up
// with module-exclusive.mjs to see what a dynamic import would save.
import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib';
const root = process.argv[2];
// \s* (not \s+) around the clause so minified `import{a}from'./a.mjs'` counts too.
const staticRe = /(?:^|[;\n}])\s*import\s*(?:[\w*{}\s,$]+?\s*from\s*)?['"]([^'"]+)['"]/g;
const exportFromRe = /export\s*(?:\*(?:\s*as\s+[\w$]+)?|\{[^}]*\})\s*from\s*['"]([^'"]+)['"]/g;
function deps(src){ const out=[]; for (const re of [staticRe, exportFromRe]) { re.lastIndex=0; let m; while((m=re.exec(src))) out.push(m[1]); } return out; }
const rows=[];
for (const v of fs.readdirSync(path.join(root,'ventures'))) {
  const html = path.join(root,'ventures',v,'index.html');
  if (!fs.existsSync(html)) continue;
  const h = fs.readFileSync(html,'utf8');
  const seen = new Map(); const stack=[];
  const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script\b[^>]*>/gi; let m;
  while ((m=scriptRe.exec(h))) {
    if (!/type=["']?module/.test(m[1])) continue;
    const srcm = /src=["']([^"']+)["']/.exec(m[1]);
    if (srcm) { if(!/^https?:|^\/\//.test(srcm[1])) stack.push(path.resolve(path.dirname(html), srcm[1].split('?')[0])); }
    else for (const d of deps(m[2])) if (d.startsWith('.')||d.startsWith('/')) stack.push(path.resolve(path.dirname(html), d.split('?')[0]));
  }
  while (stack.length) { const f=stack.pop(); if (seen.has(f)||!fs.existsSync(f)||fs.statSync(f).isDirectory()) continue;
    const s=fs.readFileSync(f); seen.set(f, zlib.gzipSync(s).length);
    for (const d of deps(s.toString())) if (d.startsWith('.')) stack.push(path.resolve(path.dirname(f), d.split('?')[0])); }
  const tot=[...seen.values()].reduce((a,b)=>a+b,0);
  if (seen.size) rows.push([tot, seen.size, v, [...seen.entries()].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([f,n])=>path.relative(path.join(root,'ventures',v),f)+':'+Math.round(n/1024)+'k').join(' ')]);
}
rows.sort((a,b)=>b[0]-a[0]);
for (const r of rows.slice(0,30)) console.log(Math.round(r[0]/1024)+'kB gz', r[1]+' files', r[2], r[3]);
console.log('pages with module graphs:', rows.length, ' over 200kB:', rows.filter(r=>r[0]>200*1024).length);
