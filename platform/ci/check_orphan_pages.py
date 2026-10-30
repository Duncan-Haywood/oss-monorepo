#!/usr/bin/env python3
"""Report built pages with no inbound internal link (orphans). Build first:
python3 platform/ci/build_pages_site.py --out _site. Exits 1 if any (app pages
like error-keeper/dashboard.html are allowed)."""
import re,os,collections
from urllib.parse import urlparse,unquote
root='_site';inb=collections.Counter();pages=[]
for d,_,fs in os.walk(root):
    for f in fs:
        if f.endswith('.html'): pages.append(os.path.join(d,f))
for p in pages:
    s=open(p,errors='ignore').read()
    for m in re.finditer(r'\bhref="([^"]+)"',s):
        u=m.group(1)
        if re.match(r'(https?:|//|mailto:|#|javascript:)',u):
            if u.startswith('https://duncan-haywood.github.io/oss-monorepo/'): u=u[len('https://duncan-haywood.github.io/oss-monorepo'):]
            else: continue
        path=unquote(urlparse(u).path)
        t=os.path.normpath(os.path.join(root,path.lstrip('/')) if path.startswith('/') else os.path.join(os.path.dirname(p),path))
        if t.endswith('/') or os.path.isdir(t): t=os.path.join(t,'index.html')
        if t!=p: inb[t]+=1
orph=[p for p in pages if inb[os.path.normpath(p)]==0 and not p.endswith('index.html')]
orph=[p for p in orph if not p.endswith("dashboard.html")]
print(len(pages),"pages;",len(orph),"orphans")
for p in orph: print(p)
raise SystemExit(1 if orph else 0)
