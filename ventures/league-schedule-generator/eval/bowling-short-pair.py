"""Lane-pair bound model with the implied "short pair" counts written out, and an optional guess for them.

    python3 eval/bowling-short-pair.py <teams> <weeks> <solver> [--fix-short K] > answer.json

Same model as eval/bowling-encoding.py: each week a permutation of matches onto the P = teams/2 lane
pairs, every team on every pair lo = floor(W/P) to hi = ceil(W/P) times. Write W = q*P + r (0 < r < P).
Counting forces two facts the plain model leaves for the solver to discover:

  * each team is on exactly r pairs hi times and on P - r pairs lo times;
  * each pair has exactly 2r teams on it hi times (its 2W visits = 2P*q + 2r), so 2(P - r) teams lo times.

CDCL solvers are weak at counting arguments, so this script names short(t, p) = "team t on pair p only lo
times" (a full-equivalence sequential counter over the weeks gives it exactly) and adds both cardinality
facts. Week 1 is fixed (match m on pair m), as in the other scripts.

--fix-short K (only when P - r = 1, so every team is short on one pair and every pair on two teams):
instead of fixing week 1, guess that the two teams short on pair m are the two teams of match m in
round-robin round K (a round the season does not play). Pairs are then named by that guess, so week 1
is left free. A SAT answer is a real answer; UNSAT only rules out the guess.

Prints {"n", "W", "status", "plan"}; plan[w][m] = pair of match m of week w (roundRobin order), the
format of eval/bowling-encoding.py. Needs python-sat.
"""
import sys, json, subprocess
from pysat.card import CardEnc, EncType
from pysat.formula import CNF, IDPool
from pysat.solvers import Solver

args = sys.argv[1:]
fix = None
if "--fix-short" in args:
    i = args.index("--fix-short"); fix = int(args[i + 1]); del args[i:i + 2]
n, W, solver = int(args[0]), int(args[1]), args[2]
here = __import__("pathlib").Path(__file__).resolve().parent
need = W if fix is None else max(W, fix + 1)
rounds = json.loads(subprocess.check_output(["node", str(here / "bowling-rounds.mjs"), str(n), str(need)]))["rounds"]
extra = rounds[fix] if fix is not None else None
rounds = rounds[:W]
P = n // 2
q, r = divmod(W, P)
assert 0 < r < P, "an even split (r = 0) needs no short pairs"
lo, hi = q, q + 1
pool = IDPool(); cnf = CNF()
x = lambda w, m, p: pool.id(("x", w, m, p))
for w in range(W):
    for m in range(P):
        cnf.extend(CardEnc.equals([x(w, m, p) for p in range(P)], 1, vpool=pool, encoding=EncType.pairwise).clauses)
    for p in range(P):
        cnf.extend(CardEnc.equals([x(w, m, p) for m in range(P)], 1, vpool=pool, encoding=EncType.pairwise).clauses)

def counter(lits, tag):
    """s[k] <=> at least k of lits (k = 0..hi+1), by a full-equivalence sequential counter."""
    K = hi + 1
    prev = [True] + [False] * K  # a literal or a True/False constant per k
    for j, l in enumerate(lits):
        cur = [True] + [pool.id((tag, j, k)) for k in range(1, K + 1)]
        for k in range(1, K + 1):
            s, a, b = cur[k], prev[k], prev[k - 1]
            # s <=> a or (b and l): s -> a v b, s -> a v l, a -> s, (b and l) -> s
            if a is True:
                cnf.append([s]); continue
            if b is False and a is False:
                cnf.append([-s]); continue
            if a is False:
                # s <=> b and l
                if b is True: cnf.extend([[-s, l], [s, -l]])
                else: cnf.extend([[-s, b], [-s, l], [s, -b, -l]])
                continue
            if b is True:
                cnf.extend([[-s, a, l], [-a, s], [-l, s]])
            else:
                cnf.extend([[-s, a, b], [-s, a, l], [-a, s], [-b, -l, s]])
        prev = cur
    return prev

short = {}
for t in range(n):
    for p in range(P):
        lits = [x(w, m, p) for w, wk in enumerate(rounds) for m, (a, b) in enumerate(wk) if t in (a, b)]
        s = counter(lits, ("c", t, p))
        if hi + 1 < len(s) and s[hi + 1] not in (True, False): cnf.append([-s[hi + 1]])
        if lo > 0: cnf.append([s[lo]])
        # short <=> not at least hi
        short[t, p] = -s[hi]
for t in range(n):
    cnf.extend(CardEnc.equals([short[t, p] for p in range(P)], P - r, vpool=pool, encoding=EncType.totalizer).clauses)
for p in range(P):
    cnf.extend(CardEnc.equals([short[t, p] for t in range(n)], 2 * (P - r), vpool=pool, encoding=EncType.totalizer).clauses)
if fix is None:
    for m in range(P): cnf.append([x(0, m, m)])
else:
    assert P - r == 1, "--fix-short needs every team short on exactly one pair"
    for m, (a, b) in enumerate(extra):
        cnf.append([short[a, m]]); cnf.append([short[b, m]])
with Solver(name=solver, bootstrap_with=cnf.clauses) as sv:
    ok = sv.solve()
    out = {"n": n, "W": W, "status": "SAT" if ok else "UNSAT", "solver": solver, "fix_short": fix}
    if ok:
        md = set(l for l in sv.get_model() if l > 0)
        out["plan"] = [[next(p for p in range(P) if x(w, m, p) in md) for m in range(P)] for w in range(W)]
    print(json.dumps(out), flush=True)
