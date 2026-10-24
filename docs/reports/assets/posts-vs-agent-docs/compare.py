# Compare docs/reports (agent docs), docs/posts (blog) and docs/agent-posts. Stdlib only.
# Run: python3 docs/reports/assets/posts-vs-agent-docs/compare.py
import re,glob,statistics as st,collections,os,sys
def load(d):
    out=[]
    for f in sorted(glob.glob(d+'/*.md')):
        t=open(f).read()
        fm=t.startswith('---\n')
        body=t.split('\n---\n',1)[1] if fm else t
        out.append((os.path.basename(f),t,body,fm))
    return out
def m(docs,name):
    W=[];S=[];H=[];P=[];N=[];L=[];T=[];C=[];B=[];first=[]
    tags=collections.Counter(); fmc=0; ans=0; ilinks=0; xlinks=0; we=0;
    for fn,t,b,fm in docs:
        fmc+=fm
        if fm:
            mt=re.search(r'^tags:\s*\[(.*?)\]',t,re.M)
            if mt: tags.update(x.strip() for x in mt.group(1).split(','))
        prose=re.sub(r'```.*?```','',b,flags=re.S)
        words=re.findall(r"[A-Za-z0-9'’.,%-]+",prose); w=len(words); W.append(w)
        sents=[s for s in re.split(r'(?<=[.!?])\s+',re.sub(r'\s+',' ',re.sub(r'^[#|>-].*$','',prose,flags=re.M))) if len(s.split())>2]
        S.append(st.mean(len(s.split()) for s in sents) if sents else 0)
        H.append(len(re.findall(r'^#{2,}\s',b,re.M)))
        P.append(1000*len(re.findall(r'`[^`]*/[^`]*`|\]\((?!http)[^)]*\)',b))/max(w,1))
        N.append(1000*len(re.findall(r'\b\d[\d,.]*%?',prose))/max(w,1))
        T.append(len(re.findall(r'^\|',b,re.M))>0)
        C.append(1000*len(re.findall(r'`[^`]+`',b))/max(w,1))
        B.append(1000*len(re.findall(r'^\s*[-*] ',b,re.M))/max(w,1))
        we+=bool(re.search(r'\b(I|we|We)\b',prose))
        ans+=bool(re.search(r'^## (Answer|Facts|TL;DR|Summary|What to do|Bottom line)',b,re.M|re.I))
        xlinks+=len(re.findall(r'\]\(https?://',b)); ilinks+=len(re.findall(r'\]\((?!http)',b))
        h1=[l for l in b.splitlines() if l.strip()][:1]
    n=len(docs); md=lambda x: round(st.median(x),1)
    print(f'## {name}: n={n}')
    print(f' words median {md(W)} mean {round(st.mean(W))} p10/p90 {sorted(W)[n//10]}/{sorted(W)[9*n//10]}')
    print(f' sentence len median {md(S)}; ##headings median {md(H)}')
    print(f' per 1k words: repo paths/links {md(P)}, numbers {md(N)}, inline code {md(C)}, bullets {md(B)}')
    print(f' has table {sum(T)}/{n}; front matter {fmc}/{n}; first-person I/we {we}/{n}; answer-first heading {ans}/{n}')
    print(f' links internal {ilinks} external {xlinks}')
    print(' top tags', tags.most_common(12))
ROOT=os.path.join(os.path.dirname(os.path.abspath(__file__)),"../../../..")
os.chdir(ROOT)
r=load('docs/reports'); p=load('docs/posts'); a=load('docs/agent-posts')
m(r,'reports'); m(p,'posts'); m(a,'agent-posts')
# cross-links
rp=sum(1 for _,t,_,_ in r if 'posts/' in t); pr=sum(1 for _,t,_,_ in p if 'reports/' in t)
print('reports linking a post',rp,'/',len(r),'; posts linking a report',pr,'/',len(p))
# reader lines
print('reports with **Reader:**', sum('Reader:' in t for _,t,_,_ in r))
print('reports with human/public version link', sum(bool(re.search(r'(Human version|Public write-up|Public version|blog post)',t,re.I)) for _,t,_,_ in r))
# posts dated after the newest commit date (writing.mjs publishes them as-is)
import subprocess
today=subprocess.run(['git','log','-1','--format=%cs'],capture_output=True,text=True).stdout.strip()
fut=[f for f,_,_,_ in p if f[:10]>today]
print('posts dated after', today+':', len(fut))
by=collections.Counter(f[:10] for f,_,_,_ in p); print('posts per date', sorted(by.items()))
byr=collections.Counter(f[:10] for f,_,_,_ in r); print('agent docs per date', sorted(byr.items()))
