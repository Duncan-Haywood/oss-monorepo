"""Is P(n disjoint random pairs all avoid the bad set) <= (1-F)^n? Milestone 35. Runs no flow. Usage: python3 disjoint_check.py > disjoint_results.txt
Part A: exhaustive small N; part B: hill-climb at the claim threshold; part C: clique and hub families at N = 50."""
import random
import itertools
from functools import lru_cache
from math import comb, perm
from fractions import Fraction
def part_a():
    def matchings(pts,n):
        # all sets of n disjoint pairs from pts (unordered), as list of frozenset of edges
        out=[]
        def rec(avail,k,cur):
            if k==0: out.append(tuple(cur)); return
            if not avail: return
            a=avail[0]; rest=avail[1:]
            # either a unused
            if len(rest)>=2*k: rec(rest,k,cur)
            for i,b in enumerate(rest):
                rec(rest[:i]+rest[i+1:],k-1,cur+[(a,b)])
        rec(list(pts),n,[])
        return out
    for N,n in ((4,2),(5,2),(6,2),(6,3),(7,2),(7,3)):
        edges=list(itertools.combinations(range(N),2)); idx={e:i for i,e in enumerate(edges)}
        M=[[idx[tuple(sorted(p))] for p in m] for m in matchings(range(N),n)]
        masks=[sum(1<<i for i in m) for m in M]
        E=len(edges); worst=0;arg=None
        rng = range(1<<E) if E<=15 else None
        it = rng if rng else (random.getrandbits(E) for _ in range(300000))
        for g in it:
            e=bin(g).count("1")
            if e==0 or e==E: continue
            d=e/E
            p=sum(1 for m in masks if m&g==m)/len(masks)
            r=p/d**n
            if r>worst+1e-12: worst=r;arg=(g,d,p)
        print(N,n,"max P/d^n =",round(worst,4),"d=%.3f P=%.3f"%arg[1:])
def part_b():
    def count_nmatch(adj,N,n):
        # number of n-matchings in graph via DP over (first unprocessed vertex, used mask)
        @lru_cache(None)
        def f(v,mask,k):
            if k==0: return 1
            if v>=N or N-v<2*k: return 0
            if mask>>v&1: return f(v+1,mask,k)
            r=f(v+1,mask,k)  # v unused
            a=adj[v]&~mask&~((1<<(v+1))-1)
            while a:
                b=a&-a; a^=b
                r+=f(v+1,mask|b,k-1)
            return r
        return f(0,0,n)
    def p_all(adj,N,n,total):
        return count_nmatch(adj,N,n)/total
    def run(N,n,alpha,iters,seed):
        rng=random.Random(seed)
        E=[(i,j) for i in range(N) for j in range(i+1,N)]
        tot=count_nmatch(tuple((((1<<N)-1)&~(1<<i)) for i in range(N)),N,n)
        m=len(E); maxe=int((1-alpha)*m-1e-9)
        if (1-alpha)*m==int((1-alpha)*m): maxe-=0
        best=0
        for rs in range(iters):
            g=set(rng.sample(range(m),rng.randint(maxe//2,maxe)))
            def score(g):
                adj=[0]*N
                for i in g: a,b=E[i]; adj[a]|=1<<b; adj[b]|=1<<a
                return p_all(tuple(adj),N,n,tot)
            s=score(g)
            for _ in range(250):
                g2=set(g)
                if len(g2)>=maxe or rng.random()<.5:
                    if g2: g2.remove(rng.choice(list(g2)))
                else: pass
                if len(g2)<maxe: g2.add(rng.randrange(m))
                if len(g2)>maxe: continue
                s2=score(g2)
                if s2>=s: g,s=g2,s2
            best=max(best,s)
        return best,(1-alpha)**n
    for N,n in ((10,3),(10,4),(12,4),(12,5),(12,6)):
        b,bd=run(N,n,0.2,6,N*100+n)
        print(N,n,"max P(all pairs good) found %.4f vs (1-alpha)^n %.4f  %s"%(b,bd,"VIOLATES" if b>bd else "ok"))
def part_c_clique():
    def df(k):  # (2k-1)!!
        r=1
        for i in range(1,2*k,2): r*=i
        return r
    def p_clique(N,b,n):
        # bad clique of b points among N; pilot 2n distinct points, random matching; P(no pair inside clique)
        tot=0
        for k in range(0,min(b,2*n)+1):
            ph=Fraction(comb(b,k)*comb(N-b,2*n-k),comb(N,2*n))
            g=2*n-k
            if k>g: continue
            good=Fraction(perm(g,k)*df(n-k) if False else 0)
            # bad points each matched to distinct good partner: choose ordered partners perm(g,k), rest matched among remaining 2n-2k points
            m=perm(g,k)*df(n-k)
            tot+=ph*Fraction(m,df(n))
        return float(tot)
    for N in (50,):
      for n in (8,22):
        print("N",N,"n",n)
        for b in range(2,N):
            F=b*(b-1)/(N*(N-1))
            pc=p_clique(N,b,n)
            # event: F>alpha all pairs good; compare to (1-F)^n with alpha=F-
            if F>0.05 and F<0.4: print(f" b={b} F={F:.3f} P(all good)={pc:.4f} (1-F)^n={(1-F)**n:.4f} ratio={pc/(1-F)**n:.2f}")
def part_c_hub():
    for N,n in ((50,8),(50,22),(30,8),(20,8)):
        worst=0
        for h in range(1,N-2*n+1 if N-2*n>0 else 1):
            pa=comb(N-h,2*n)/comb(N,2*n)
            base=comb(N-h,2)/comb(N,2)
            r=pa/base**n
            worst=max(worst,r)
            if h in (1,2,3,5,8): print(N,n,"hubs",h,"F=%.3f"%(1-base),"P=%.4f bound=%.4f ratio=%.2f"%(pa,base**n,r))
        print(N,n,"max ratio",round(worst,2))

if __name__ == "__main__":
    print("A exhaustive/sampled graphs, max P/d^n"); part_a()
    print("B hill-climb, alpha=0.2"); part_b()
    print("C clique-bad"); part_c_clique()
    print("C hub-bad"); part_c_hub()
