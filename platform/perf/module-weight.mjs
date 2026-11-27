// Module weight sweep: for each ventures/<slug>/index.html, walk the static ES
// import graph of its module scripts and print the gzip total, largest first.
// Usage: node platform/perf/module-weight.mjs [.]               (repo root: every venture)
//        node platform/perf/module-weight.mjs ventures/<slug>    (one venture)
//        node platform/perf/module-weight.mjs ventures/<v>/apps/<app>   (one app page)
//        node platform/perf/module-weight.mjs ventures/<v>       (each apps/*/index.html)
// A page over ~200 kB gzip makes its buttons wait for all of it; follow up
// with module-exclusive.mjs to see what a dynamic import would save.
// A Vite app (vite.config.* next to its index.html: the paid bets payapps, cmmc,
// jobshop-quote, seller-books) is measured from its built dist/index.html (or dist/client/), since
// its source page loads /src/*.tsx, which the browser never sees; with no dist/
// the row says to build first. Until 2026-11-27 an app or multi-app venture dir
// exited 2 ("neither the repo root nor a venture dir"), so perf runs aimed at a
// bet's front door had no weight reading.
import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib';
const arg = path.resolve(process.argv[2] || '.');
const isRoot = fs.existsSync(path.join(arg,'ventures'));
const viteCfg = (d) => fs.readdirSync(d).some(f => /^vite\.config\.[cm]?[jt]s$/.test(f));
// The pages to sweep: [label, dir holding index.html].
let pages;
if (isRoot) pages = fs.readdirSync(path.join(arg,'ventures')).map(v => [v, path.join(arg,'ventures',v)]);
else if (fs.existsSync(path.join(arg,'index.html'))) pages = [[path.basename(arg), arg]];
else if (fs.existsSync(path.join(arg,'apps'))) pages = fs.readdirSync(path.join(arg,'apps')).map(a => [path.basename(arg)+'/apps/'+a, path.join(arg,'apps',a)]);
else {
  console.error(`module-weight: ${arg} is not the repo root (no ventures/), a page dir (no index.html) or a multi-app venture (no apps/)`);
  process.exit(2);
}
// \s* (not \s+) around the clause so minified `import{a}from'./a.mjs'` counts too.
const staticRe = /(?:^|[;\n}])\s*import\s*(?:[\w*{}\s,$]+?\s*from\s*)?['"]([^'"]+)['"]/g;
const exportFromRe = /export\s*(?:\*(?:\s*as\s+[\w$]+)?|\{[^}]*\})\s*from\s*['"]([^'"]+)['"]/g;
function deps(src){ const out=[]; for (const re of [staticRe, exportFromRe]) { re.lastIndex=0; let m; while((m=re.exec(src))) out.push(m[1]); } return out; }
const rows=[], unbuilt=[];
for (const [label, dir] of pages) {
  if (!fs.existsSync(path.join(dir,'index.html'))) continue;
  let site = dir;
  if (viteCfg(dir)) {
    // dist/client/ is the Cloudflare Vite plugin's layout (payapps), dist/ plain Vite's.
    const built = ['dist/client','dist'].map(s => path.join(dir,s)).find(s => fs.existsSync(path.join(s,'index.html')));
    if (!built) { unbuilt.push(label); continue; }
    site = built;
  }
  const html = path.join(site,'index.html');
  const h = fs.readFileSync(html,'utf8');
  // A leading / is the site root: the page's own dir (a built dist/ is served from there).
  const at = (base, d) => path.resolve(d.startsWith('/') ? site : path.dirname(base), d.replace(/^\//,'').split(/[?#]/)[0]);
  const seen = new Map(); const stack=[];
  const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script\b[^>]*>/gi; let m;
  while ((m=scriptRe.exec(h))) {
    if (!/type=["']?module/.test(m[1])) continue;
    const srcm = /src=["']([^"']+)["']/.exec(m[1]);
    if (srcm) { if(!/^https?:|^\/\//.test(srcm[1])) stack.push(at(html, srcm[1])); }
    else for (const d of deps(m[2])) if (d.startsWith('.')||d.startsWith('/')) stack.push(at(html, d));
  }
  while (stack.length) { const f=stack.pop(); if (seen.has(f)||!fs.existsSync(f)||fs.statSync(f).isDirectory()) continue;
    const s=fs.readFileSync(f); seen.set(f, zlib.gzipSync(s).length);
    for (const d of deps(s.toString())) if (d.startsWith('.')||d.startsWith('/')) stack.push(at(f, d)); }
  const tot=[...seen.values()].reduce((a,b)=>a+b,0);
  if (seen.size) rows.push([tot, seen.size, label, [...seen.entries()].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([f,n])=>path.relative(dir,f)+':'+Math.round(n/1024)+'k').join(' ')]);
}
rows.sort((a,b)=>b[0]-a[0]);
for (const r of rows.slice(0,30)) console.log(Math.round(r[0]/1024)+'kB gz', r[1]+' files', r[2], r[3]);
for (const u of unbuilt) console.log(`not built: ${u} is a Vite app with no dist/; run its \`vite build\` (package.json "build") and sweep again`);
console.log('pages with module graphs:', rows.length, ' over 200kB:', rows.filter(r=>r[0]>200*1024).length);
