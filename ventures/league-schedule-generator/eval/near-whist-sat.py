"""Near-whist base rounds on Z_n (n = 4k+2) found by a SAT solver instead of annealing.

    python3 eval/near-whist-sat.py <n> [--seed S] [--neg]   # one JSON line, eval/near-whist-search.txt format

The base round (whist.mjs, NEAR_WHIST_BASES) seats 4k of the n points at k tables and leaves two out.
Developed over Z_n it must give partner distances 1..2k exactly once and never 2k+1, opponent
distances 1..2k at most twice and 2k+1 exactly once (README, "Americano for 4k+2 players").

Encoding, on pairs rather than seats so the k! table orders and 8 seatings per table vanish:
  P[p,q]  p and q are partners in the base round;
  T[p,q]  p and q sit at the same table (partners or opponents);
  out[p]  p sits out (exactly two points; point 0 is fixed out by translation).
A seated point has exactly three table-mates and exactly one partner among them; T is transitive,
so the tables are 4-cliques; opponent O[p,q] = T and not P. Distance counts are cardinality
constraints (pysat, sequential counter / totalizer). With --neg the round must also be mapped onto
itself by x -> -x, and with --mult u by x -> u*x (u a unit of Z_n); both shrink the search and can
rule designs out (eval/near-whist-sat.txt).
Needs python-sat (pip install python-sat). Cap the run from outside with `timeout`.
"""
import json, random, sys, time
from itertools import combinations
from pysat.card import CardEnc, EncType
from pysat.formula import IDPool
from pysat.solvers import Cadical153


def build(n, seed=0, neg=False, mult=None):
    assert n % 4 == 2
    k = (n - 2) // 4
    h = n // 2  # 2k+1, the half-circle distance
    pool = IDPool()
    key = lambda p, q: (min(p, q), max(p, q))
    P = lambda p, q: pool.id(("P",) + key(p, q))
    T = lambda p, q: pool.id(("T",) + key(p, q))
    O = lambda p, q: pool.id(("O",) + key(p, q))
    out = lambda p: pool.id(("out", p))
    cl = []

    def card(lits, lo, hi):
        if hi is not None and hi < len(lits):
            cl.extend(CardEnc.atmost(lits, bound=hi, vpool=pool, encoding=EncType.seqcounter).clauses)
        if lo:
            cl.extend(CardEnc.atleast(lits, bound=lo, vpool=pool, encoding=EncType.seqcounter).clauses)

    pts = range(n)
    for p, q in combinations(pts, 2):
        cl.append([-P(p, q), T(p, q)])                      # partners share a table
        cl.append([-O(p, q), T(p, q)]); cl.append([-O(p, q), -P(p, q)]); cl.append([-T(p, q), P(p, q), O(p, q)])
        cl.append([-T(p, q), -out(p)]); cl.append([-T(p, q), -out(q)])
    card([out(p) for p in pts], 2, 2)
    if not mult and not neg:
        cl.append([out(0)])  # translation; with a multiplier only translations by (u-1)-annihilated steps commute
    for p in pts:
        others = [q for q in pts if q != p]
        # seated: exactly 3 table-mates, exactly 1 partner (out points have none, by the clauses above)
        tl = [T(p, q) for q in others]
        pl = [P(p, q) for q in others]
        card(tl, None, 3); card(pl, None, 1)
        # at least 3 / at least 1 when seated: reify with out(p)
        for lits, b in ((tl, 3), (pl, 1)):
            enc = CardEnc.atleast(lits, bound=b, vpool=pool, encoding=EncType.seqcounter)
            for c in enc.clauses:
                cl.append([out(p)] + c)
    for p, q, r in combinations(pts, 3):                    # transitivity of T
        cl.append([-T(p, q), -T(q, r), T(p, r)])
        cl.append([-T(p, q), -T(p, r), T(q, r)])
        cl.append([-T(p, r), -T(q, r), T(p, q)])
    for d in range(1, h + 1):
        pairs = sorted({key(p, (p + d) % n) for p in pts})
        if d < h:
            card([P(*pr) for pr in pairs], 1, 1)
            card([O(*pr) for pr in pairs], None, 2)
        else:
            for pr in pairs: cl.append([-P(*pr)])
            card([O(*pr) for pr in pairs], 1, 1)
    for u in ([n - 1] if neg else []) + ([mult] if mult else []):
        m = lambda p, u=u: (u * p) % n
        for p, q in combinations(pts, 2):
            for V in (P, T):
                cl.append([-V(p, q), V(m(p), m(q))])
        for p in pts:
            cl.append([-out(p), out(m(p))])
    return pool, cl, P, T, out


def decode(n, model, P, T, out):
    s = set(l for l in model if l > 0)
    seen, tables = set(), []
    for p in range(n):
        if p in seen or out(p) in s:
            continue
        mates = [q for q in range(n) if q != p and T(p, q) in s]
        group = [p] + mates
        a = p
        b = next(q for q in mates if P(p, q) in s)
        x, y = [q for q in mates if q != b]
        tables.append([a, b, x, y])
        seen.update(group)
    return tables


def main():
    n = int(sys.argv[1])
    seed = int(sys.argv[sys.argv.index("--seed") + 1]) if "--seed" in sys.argv else 0
    neg = "--neg" in sys.argv
    mult = int(sys.argv[sys.argv.index("--mult") + 1]) if "--mult" in sys.argv else None
    t0 = time.time()
    pool, cl, P, T, out = build(n, seed, neg, mult)
    print(f"# n={n} vars={pool.top} clauses={len(cl)} neg={neg} mult={mult} seed={seed}", file=sys.stderr, flush=True)
    with Cadical153(bootstrap_with=cl) as s:
        if seed:
            rng = random.Random(seed)
            s.set_phases([v if rng.random() < 0.5 else -v for v in range(1, pool.top + 1)])
        ok = s.solve()
        ms = int((time.time() - t0) * 1000)
        tables = decode(n, s.get_model(), P, T, out) if ok else None
    print(json.dumps({"n": n, "mods": [n], "kind": "near", "ms": ms, "method": "sat" + (" neg" if neg else "") + (f" mult {mult}" if mult else ""), "seed": seed, "tables": tables}, separators=(",", ":")))


if __name__ == "__main__":
    main()
