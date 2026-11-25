"""Is there a lane deal of the form pair = sigma(match) + tau(round) (mod P)? SAT over that family only.

    python3 eval/bowling-cyclic-family.py <teams> <weeks>
sigma a permutation of the circle method's match index k (match {r+k, r-k}, k = 0 holds the fixed
team), tau free per round. UNSAT proves only that no deal of this shape is at the lane-pair bound.
2026-11-24: 22x10 UNSAT in under 400 s; 22x21, 24x23, 26x38 no verdict in 400 s.
"""
# p(r,k) = sigma(k) + tau(r) mod P, sigma a permutation, tau free. SAT via pysat.
import sys, json, subprocess
from pysat.card import CardEnc, EncType
from pysat.formula import CNF, IDPool
from pysat.solvers import Cadical153
n, W = int(sys.argv[1]), int(sys.argv[2])
here = str(__import__("pathlib").Path(__file__).resolve().parent)
rounds = json.loads(subprocess.check_output(["node", here + "/bowling-rounds.mjs", str(n), str(W)]))["rounds"]
P = n//2; M = n-1
pool = IDPool(); cnf = CNF()
S = lambda k, s: pool.id(("s", k, s))
T = lambda r, v: pool.id(("t", r, v))
Y = lambda r, k, v: pool.id(("y", r, k, v))
for k in range(P):
    cnf.extend(CardEnc.equals([S(k, s) for s in range(P)], 1, vpool=pool, encoding=EncType.seqcounter).clauses)
for s in range(P):
    cnf.extend(CardEnc.equals([S(k, s) for k in range(P)], 1, vpool=pool, encoding=EncType.seqcounter).clauses)
for r in range(W):
    cnf.extend(CardEnc.equals([T(r, v) for v in range(P)], 1, vpool=pool, encoding=EncType.seqcounter).clauses)
cnf.append([T(0, 0)])
# match k of circle round r%M: identify by the pair of teams
def kof(a, b, r):
    rr = r % M
    if n-1 in (a, b): return 0
    d = (a - rr) % M
    return min(d, M-d)
for r in range(W):
    for k in range(P):
        for s in range(P):
            for v in range(P):
                cnf.append([-S(k, s), -T(r, v), Y(r, k, (s+v) % P)])
        cnf.extend(CardEnc.atmost([Y(r, k, v) for v in range(P)], 1, vpool=pool, encoding=EncType.pairwise).clauses)
lo, hi = W//P, -(-W//P)
for t in range(n):
    for p in range(P):
        lits = []
        for r, wk in enumerate(rounds):
            for a, b in wk:
                if t in (a, b): lits.append(Y(r, kof(a, b, r), p))
        if hi < len(lits): cnf.extend(CardEnc.atmost(lits, hi, vpool=pool, encoding=EncType.seqcounter).clauses)
        if lo > 0: cnf.extend(CardEnc.atleast(lits, lo, vpool=pool, encoding=EncType.seqcounter).clauses)
with Cadical153(bootstrap_with=cnf.clauses) as sv:
    r = sv.solve()
    print(n, W, "SAT" if r else "UNSAT (in this family)", flush=True)
    if r:
        m = set(l for l in sv.get_model() if l > 0)
        sig = [next(s for s in range(P) if S(k, s) in m) for k in range(P)]
        tau = [next(v for v in range(P) if T(r_, v) in m) for r_ in range(W)]
        print(json.dumps({"sigma": sig, "tau": tau}))
