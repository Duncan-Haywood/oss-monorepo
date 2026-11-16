"""E27: deciding E24's separability is NP-complete (reduction from hypergraph 2-colourability).

    python3 research/theism-formal-evidence/experiments/e27_separability_np/run.py   # ~1 min

Prediction H31 is in LOG.md, committed before this script and before
lean/TheismFormal/AndersonNP.lean.  A successor v of w is *separable* (E24) if sets of worlds
A, S have R(w) <= A, v not in S and, for every t in R*(v),
  (i)  R(t) <= A  iff  R(t) <= S,   (ii)  R(t) misses A  iff  R(t) misses S.

The script
 1. writes a backtracking decider for separability (new code, shares none with E24) and checks
    it against exhaustive search over (A, S) on every serial relation up to 4 worlds (at 4
    worlds the exhaustive search runs where the decider says "not separable"; where it says
    "separable" its witness is checked directly); the triples must total E24's 11,628;
 2. builds the reduction frame of H31 for every hypergraph with up to 4 points and up to 4
    distinct non-empty edges, and checks separability against brute-force 2-colourability;
 3. builds the Fano-plane frame (16 worlds): v must have no separation and no back witness.
"""
import itertools, json, time
from pathlib import Path

HERE = Path(__file__).resolve().parent


def reach(R, a):
    seen, todo = {a}, [a]
    while todo:
        u = todo.pop()
        for s in R[u]:
            if s not in seen:
                seen.add(s); todo.append(s)
    return seen


def typ(bits):
    return 2 if all(bits) else 0 if not any(bits) else 1


def separable_bt(R, w, v):
    """Backtracking: labels (a, s) per world of T = R*(v); returns a witness (A, S) or None."""
    T = sorted(reach(R, v))
    sets = [sorted(R[t]) for t in T]
    order = [v] + [x for x in T if x != v]
    pos = {x: i for i, x in enumerate(order)}
    # check a set once its last member (in order) is labelled
    due = {i: [] for i in range(len(order))}
    for N in sets:
        due[max(pos[x] for x in N)].append(N)
    lab = {}

    def options(x):
        if x == v:
            return [(1, 0)]
        return [(1, 1), (1, 0)] if x in R[w] else [(0, 0), (1, 1), (0, 1), (1, 0)]

    def rec(i):
        if i == len(order):
            return True
        x = order[i]
        for o in options(x):
            lab[x] = o
            if all(typ([lab[y][0] for y in N]) == typ([lab[y][1] for y in N]) for N in due[i]):
                if rec(i + 1):
                    return True
        del lab[x]
        return False

    if not rec(0):
        return None
    return ({x for x in lab if lab[x][0]} | set(R[w]), {x for x in lab if lab[x][1]})


def separable_brute(R, n, w, v):
    T = reach(R, v)
    Rm = [sum(1 << s for s in R[t]) for t in range(n)]
    Rw = Rm[w]
    for A in range(1 << n):
        if Rw & ~A:
            continue
        for S in range(1 << n):
            if S >> v & 1:
                continue
            if all(((Rm[t] & ~A == 0) == (Rm[t] & ~S == 0)) and ((Rm[t] & A == 0) == (Rm[t] & S == 0)) for t in T):
                return True
    return False


def check_witness(R, w, v, A, S):
    if not set(R[w]) <= A or v in S:
        return False
    for t in reach(R, v):
        N = set(R[t])
        if (N <= A) != (N <= S) or (not (N & A)) != (not (N & S)):
            return False
    return True


def back(R, w, v):
    return any(v in R[u] and set(R[u]) <= set(R[w]) for u in reach(R, v))


def frame(points, edges):
    """H31's reduction: worlds 0 = w, 1 = v, 2.. points, then edges."""
    np_ = len(points)
    P = {p: 2 + i for i, p in enumerate(points)}
    Ew = [2 + np_ + j for j in range(len(edges))]
    R = {0: [1], 1: list(Ew)}
    for p in points:
        R[P[p]] = [P[p]]
    for j, e in enumerate(edges):
        R[Ew[j]] = [1] + [P[p] for p in e]
    return R


def two_col(points, edges):
    for bits in itertools.product((0, 1), repeat=len(points)):
        c = dict(zip(points, bits))
        if all(len({c[p] for p in e}) == 2 for e in edges):
            return True
    return False


def main():
    out = {}
    t0 = time.time()
    # 1. decider vs exhaustive on all serial relations up to 4 worlds
    stage1 = {}
    for n in range(1, 5):
        succ_sets = [s for s in range(1, 1 << n)]
        sep_n = mism = 0
        for rows in itertools.product(succ_sets, repeat=n):
            R = {t: [s for s in range(n) if rows[t] >> s & 1] for t in range(n)}
            for w in range(n):
                for v in R[w]:
                    wit = separable_bt(R, w, v)
                    b = separable_brute(R, n, w, v) if n <= 3 or wit is None else True
                    if wit is not None and not check_witness(R, w, v, *wit):
                        mism += 1
                    if (wit is not None) != b:
                        mism += 1
                    sep_n += wit is not None
        stage1[n] = {"separable_triples": sep_n, "mismatches": mism}
    out["decider_check"] = stage1
    # at n = 4 the exhaustive search runs only where the decider says "not separable";
    # where it says "separable" its witness is checked directly instead.
    # 2. reduction frames vs 2-colourability
    stage2 = {}
    for npts in range(1, 5):
        pts = list(range(npts))
        nonempty = [e for r in range(1, npts + 1) for e in itertools.combinations(pts, r)]
        for m in range(1, 5):
            tot = col = mism = 0
            for edges in itertools.combinations(nonempty, m):
                R = frame(pts, edges)
                wit = separable_bt(R, 0, 1)
                c = two_col(pts, edges)
                if wit is not None and not check_witness(R, 0, 1, *wit):
                    mism += 1
                if (wit is not None) != c:
                    mism += 1
                if len(R) <= 9 and separable_brute(R, len(R), 0, 1) != c:
                    mism += 1
                tot += 1; col += c
            stage2[f"{npts}p_{m}e"] = {"hypergraphs": tot, "2-colourable": col, "mismatches": mism}
    out["reduction_check"] = stage2
    # 3. Fano plane
    fano = [(0, 1, 2), (0, 3, 4), (0, 5, 6), (1, 3, 5), (1, 4, 6), (2, 3, 6), (2, 4, 5)]
    R = frame(list(range(7)), fano)
    out["fano"] = {"worlds": len(R), "serial": all(R[t] for t in R),
                   "two_colourable": two_col(list(range(7)), fano),
                   "separable": separable_bt(R, 0, 1) is not None,
                   "back_witness": back(R, 0, 1)}
    R6 = frame(list(range(7)), fano[:6])
    wit = separable_bt(R6, 0, 1)
    out["fano_minus_line"] = {"separable": wit is not None,
                              "witness_valid": wit is not None and check_witness(R6, 0, 1, *wit)}
    out["seconds"] = round(time.time() - t0, 1)
    (HERE / "results.json").write_text(json.dumps(out, indent=1) + "\n")
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
