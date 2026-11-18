#!/usr/bin/env python3
"""eval/odd-orbit-sym.py's pair constraints without the night's layout: is there a turn-fixed night at all?
  python3 eval/odd-orbit-sym-pairs.py 19 0     (n, twist; twist -1 = no turn symmetry)
Prints n, twist, SAT. Needs python-sat (MIT), for this eval script only."""
import sys, importlib.util, os
E=os.path.dirname(os.path.abspath(__file__))+'/'
spec=importlib.util.spec_from_file_location("s",E+"odd-orbit-sym.py"); s=importlib.util.module_from_spec(spec); spec.loader.exec_module(s)
from pysat.card import CardEnc, EncType
from pysat.formula import CNF, IDPool
from pysat.solvers import Solver
n=int(sys.argv[1]); tw=int(sys.argv[2]); N=n+1
full, short = s.oo.orbits(n)
pool=IDPool(); cnf=CNF()
pairs=[(i,j) for i in range(N) for j in range(i+1,N)]
x={(r,)+e:pool.id((r,)+e) for r in range(3) for e in pairs}
def card(l,b,kind):
    enc={"eq":CardEnc.equals,"le":CardEnc.atmost}[kind]
    for c in enc(lits=l,bound=b,vpool=pool,encoding=EncType.seqcounter).clauses: cnf.append(c)
for r in range(3):
    for v in range(N): card([x[r,min(u,v),max(u,v)] for u in range(N) if u!=v],1,"eq")
for e in short:
    for r in range(3): cnf.append([-x[(r,)+e]])
for o in full: card([x[(r,)+e] for r in range(3) for e in o],1,"eq")
cnf.nv=pool.top
if tw>=0: s.add_turn_symmetry(cnf,x,full,n,tw)
with Solver(name="cd19",bootstrap_with=cnf.clauses) as S: print(n,tw,S.solve())
