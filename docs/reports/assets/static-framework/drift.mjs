// Design drift in a built Pages artifact: distinct --accent values, :root
// token blocks and service-worker snippets. Run from a directory holding
// the build as ./dist (static-framework-rd-2026-10-29.md).
import {readFileSync} from 'node:fs';import {execSync} from 'node:child_process';
const files=execSync('find dist -name "*.html"',{maxBuffer:1e8}).toString().trim().split('\n');
const accents=new Map(), roots=new Set(), sw=new Set(); let gens=new Map();
for(const f of files){const t=readFileSync(f,'utf8');
 for(const m of t.matchAll(/--accent\s*:\s*([^;}\s]+)/g)) accents.set(m[1].toLowerCase(),(accents.get(m[1].toLowerCase())||0)+1);
 for(const m of t.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) if(/:root\s*\{/.test(m[1])) roots.add(m[1].match(/:root\s*\{[^}]*\}/)[0]);
 for(const m of t.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) if(m[1].includes("serviceWorker' in navigator")) sw.add(m[1]);
 const g=(t.match(/<meta name="generator" content="([^"]+)"/)||[])[1]; if(g) gens.set(g,(gens.get(g)||0)+1);
}
console.log('distinct --accent values',accents.size,'top',[...accents].sort((a,b)=>b[1]-a[1]).slice(0,8));
console.log('distinct :root token blocks',roots.size);
console.log('distinct SW registration snippets',sw.size);
console.log('generators',gens);
