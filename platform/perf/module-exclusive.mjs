// For one page, the gzip bytes each direct import pulls in that nothing else
// in the page needs: what turning that import into import() would save.
// Usage: node platform/perf/module-exclusive.mjs ventures/<slug>/index.html
//        node platform/perf/module-exclusive.mjs ventures/<slug>/<entry>.mjs
// Roots are the page's module scripts: imports of inline <script type="module">
// and the src of <script type="module" src="...">. A page with one src entry
// has one root, so its row is the whole graph; pass that entry (or a
// dynamic-import entry such as einvoice-preflight's page-engine.mjs) to split
// further: a .mjs/.js argument's own static imports are the roots, and the
// entry's own bytes are counted in the total, not in any row (until 2026-11-27
// a .mjs argument was read as HTML and exited 1, so a perf run wrote a scratch
// walker). Exits 1 when the page or entry has no local module graph.
import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib';
const html = path.resolve(process.argv[2]); const dir = path.dirname(html);
// \s* (not \s+) so minified `import{a}from'./a.mjs'` counts; `export * as ns from` too.
const re = /(?:^|[;\n}])\s*import\s*(?:[\w*{}\s,$]+?\s*from\s*)?['"]([^'"]+)['"]|export\s*(?:\*(?:\s*as\s+[\w$]+)?|\{[^}]*\})\s*from\s*['"]([^'"]+)['"]/g;
const local = (base, d) => path.resolve(path.dirname(base), d.split(/[?#]/)[0]);
const deps = (f, s) => [...s.matchAll(re)].map(m => m[1]||m[2]).filter(d => d.startsWith('.')).map(d => local(f, d));
const g = new Map(), size = new Map(), missing = [];
function walk(f){ if (g.has(f)) return; if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { missing.push(f); g.set(f, []); size.set(f, 0); return; }
  const s = fs.readFileSync(f,'utf8'); size.set(f, zlib.gzipSync(s).length); g.set(f, deps(f,s)); g.get(f).forEach(walk); }
const h = fs.readFileSync(html,'utf8'); const roots = [];
const isModule = /\.[cm]?js$/i.test(html);
if (isModule) { walk(html); roots.push(...g.get(html)); }
for (const m of isModule ? [] : h.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
  if (!/type=["']?module/.test(m[1])) continue;
  const src = /src=["']([^"']+)["']/.exec(m[1]);
  if (src) { if (!/^(?:[a-z]+:|\/)/i.test(src[1])) roots.push(local(html, src[1])); }
  else roots.push(...deps(html, m[2]));
}
const uniq = [...new Set(roots)]; uniq.forEach(walk);
for (const f of missing) console.error('missing:', path.relative(dir, f));
if (!uniq.length) { console.error('no local module scripts in', path.relative(process.cwd(), html)); process.exit(1); }
const reach = (rs) => { const s = new Set(); const st=[...rs]; while(st.length){const f=st.pop(); if(s.has(f))continue; s.add(f); st.push(...g.get(f));} return s; };
const all = reach(uniq); if (isModule) all.add(html); const tot=[...all].reduce((a,f)=>a+size.get(f),0);
console.log('total', Math.round(tot/1024),'kB gz', all.size - missing.length,'files');
const rows = uniq.map(r => { const rest = reach(uniq.filter(x=>x!==r)); if (isModule) rest.add(html); const ex=[...all].filter(f=>!rest.has(f)); return [ex.reduce((a,f)=>a+size.get(f),0), path.relative(dir,r), ex.map(f=>path.relative(dir,f)).join(',')]; }).sort((a,b)=>b[0]-a[0]);
for (const r of rows) console.log(Math.round(r[0]/1024)+'k', r[1], r[2]);
