"""E30: a linear-size SAT encoding of separability (E24), checked exhaustively on small frames and
run on K and KT frames with thousands of worlds.

    pip install python-sat   # PySAT (MIT), CaDiCaL 1.5.3 backend
    python3 research/theism-formal-evidence/experiments/e30_sat/run.py   # ~10 min

Prediction H34 is in LOG.md, committed before this script.  A successor v of w is *separable*
(E24) if sets A, S have R(w) <= A, v not in S and, for every t in T = R*(v),
  (i)  R(t) <= A  iff  R(t) <= S,   (ii)  R(t) misses A  iff  R(t) misses S.

`encode` writes the CNF of H34 (a).  `solve` uses PySAT when it is installed; `dpll` is a
stdlib solver used by the tests and as a fallback on small formulas.

The script
 1. every relation (serial or not) on 1 to 4 worlds and every (w, v) with w R v: SAT verdict
    against E27's exhaustive search over (A, S); every model's witness through E27's
    `check_witness`; the size bound of H34 (a);
 2. seeded random 3-uniform hypergraphs, n points, m = round(r n) edges: SAT on E27's K
    reduction frame and E28's KT reduction frame against a separate NAE encoding of the
    hypergraph (and brute-force 2-colouring for n <= 14); SAT times;
 3. E27's backtracking decider with a 5 s limit on a subset of those instances (n <= 40);
 4. seeded random serial and reflexive frames, 300 worlds: how E28's sufficient tests and SAT
    split the (w, v) pairs.
"""
import importlib.util, itertools, json, random, signal, statistics, sys, time
from pathlib import Path

HERE = Path(__file__).resolve().parent


def _load(name):
    spec = importlib.util.spec_from_file_location(name + "_run", HERE.parent / name / "run.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_e27 = _load("e27_separability_np")
reach, separable_bt, separable_brute, check_witness = (
    _e27.reach, _e27.separable_bt, _e27.separable_brute, _e27.check_witness)
kfr = _e27.frame


def kt_frame(points, edges):
    """E28's KT reduction (copied from e28_frame_classes/run.py so this file loads alone)."""
    P = {p: 4 + i for i, p in enumerate(points)}
    base = 4 + len(points)
    R = {0: {0, 1}, 1: {1, 2, 3}, 2: {2, 1}, 3: {3, 2}}
    for p in points:
        R[P[p]] = {P[p]}
    for j, e in enumerate(edges):
        c, t0, t1, u0, u1 = (base + 5 * j + k for k in range(5))
        R[0] |= {t0, t1, u0}
        R[1] |= {t0, u0}
        R[t0] = {t0, t1}
        R[t1] = {t1, c, 2}
        R[u0] = {u0, u1, 3}
        R[u1] = {u1, c, 2}
        R[c] = {c} | {P[p] for p in e}
    return {t: sorted(s) for t, s in R.items()}


# ---------------------------------------------------------------- encoding (H34 a)

def encode(R, w, v):
    """CNF whose models are the separations of v from w.  Returns (clauses, a, s, nvars)
    with a[x], s[x] the variables of x in T = R*(v)."""
    T = sorted(reach(R, v))
    a = {x: 2 * i + 1 for i, x in enumerate(T)}
    s = {x: 2 * i + 2 for i, x in enumerate(T)}
    n = 2 * len(T)
    cl = [[a[v]], [-s[v]]]
    for x in R[w]:
        if x in a:
            cl.append([a[x]])
    for t in T:
        N = list(R[t])
        if not N:
            continue  # (i) and (ii) hold trivially for an empty R(t)
        P, Q = n + 1, n + 2
        n += 2
        for y in N:
            cl += [[-P, a[y]], [-P, s[y]], [-Q, -a[y]], [-Q, -s[y]]]
        cl.append([P] + [-a[y] for y in N])
        cl.append([P] + [-s[y] for y in N])
        cl.append([Q] + [a[y] for y in N])
        cl.append([Q] + [s[y] for y in N])
    return cl, a, s, n


def size_bound(R, w, v):
    T = reach(R, v)
    return 4 * len(T), 4 * sum(len(R[t]) for t in T) + 4 * len(T) + len(T) + 2


def dpll(clauses, nvars):
    """Small stdlib DPLL with unit propagation; returns a model (set of true literals) or None."""
    def simplify(cls, lit):
        out = []
        for c in cls:
            if lit in c:
                continue
            if -lit in c:
                c = [l for l in c if l != -lit]
                if not c:
                    return None
            out.append(c)
        return out

    def rec(cls, assign):
        while True:
            unit = next((c[0] for c in cls if len(c) == 1), None)
            if unit is None:
                break
            assign = assign | {unit}
            cls = simplify(cls, unit)
            if cls is None:
                return None
        if not cls:
            return assign
        lit = cls[0][0]
        for l in (lit, -lit):
            c2 = simplify(cls, l)
            if c2 is not None:
                r = rec(c2, assign | {l})
                if r is not None:
                    return r
        return None

    return rec([list(c) for c in clauses], frozenset())


def solve(clauses, nvars):
    """Model as a set of true literals, or None.  PySAT/CaDiCaL if present, else dpll."""
    try:
        from pysat.solvers import Solver
    except ImportError:
        return dpll(clauses, nvars)
    with Solver(name="cadical153", bootstrap_with=clauses) as S:
        if not S.solve():
            return None
        return {l for l in S.get_model() if l > 0}


def separable_sat(R, w, v, solver=solve):
    cl, a, s, n = encode(R, w, v)
    m = solver(cl, n)
    if m is None:
        return None
    A = {x for x in a if a[x] in m} | set(R[w])
    S = {x for x in s if s[x] in m}
    return A, S


# ---------------------------------------------------------------- hypergraphs

def random_hypergraph(n, m, rng):
    return [tuple(rng.sample(range(n), 3)) for _ in range(m)]


def nae_sat(n, edges):
    """2-colourability as NAE-SAT over point variables 1..n (independent of the frame)."""
    cl = []
    for e in edges:
        cl.append([p + 1 for p in e])
        cl.append([-(p + 1) for p in e])
    return solve(cl, n) is not None


def two_col_brute(n, edges):
    masks = [sum(1 << p for p in e) for e in edges]
    full = (1 << n) - 1
    for c in range(1 << (n - 1)):  # colour of point n-1 fixed to 0 by symmetry
        if all(c & m and (~c & full) & m for m in masks):
            return True
    return False


class Timeout(Exception):
    pass


def _alarm(signum, frame):
    raise Timeout


def bt_timed(R, w, v, limit):
    signal.signal(signal.SIGALRM, _alarm)
    signal.setitimer(signal.ITIMER_REAL, limit)
    t0 = time.perf_counter()
    try:
        r = separable_bt(R, w, v)
        return (r is not None), time.perf_counter() - t0
    except Timeout:
        return None, limit
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)


# ---------------------------------------------------------------- random frames

def random_frame(n, c, rng, reflexive):
    p = c / n
    R = {t: [s for s in range(n) if rng.random() < p] for t in range(n)}
    for t in range(n):
        if reflexive and t not in R[t]:
            R[t].append(t)
        if not R[t]:
            R[t].append(rng.randrange(n))
    return R


def main():
    sys.setrecursionlimit(100000)
    out = {"solver": None}
    try:
        import pysat
        out["solver"] = "PySAT %s, cadical153" % getattr(pysat, "__version__", "?")
    except ImportError:
        out["solver"] = "stdlib dpll (PySAT not installed)"
    t_start = time.time()

    # 1. exhaustive, every relation up to 4 worlds
    ex = {"triples": 0, "separable": 0, "mismatch": 0, "bad_witness": 0, "over_bound": 0, "by_n": {}}
    for n in range(1, 5):
        tri = sep = 0
        for rows in itertools.product(range(1 << n), repeat=n):
            R = {t: [s for s in range(n) if rows[t] >> s & 1] for t in range(n)}
            for w in range(n):
                for v in R[w]:
                    cl, a, s, nv = encode(R, w, v)
                    bv, bc = size_bound(R, w, v)
                    ex["over_bound"] += nv > bv or len(cl) > bc
                    wit = separable_sat(R, w, v)
                    brute = separable_brute(R, n, w, v)
                    ex["mismatch"] += (wit is not None) != brute
                    if wit is not None:
                        ex["bad_witness"] += not check_witness(R, w, v, *wit)
                    tri += 1; sep += brute
        ex["by_n"][n] = {"triples": tri, "separable": sep}
        ex["triples"] += tri; ex["separable"] += sep
    ex["seconds"] = round(time.time() - t_start, 1)
    out["exhaustive"] = ex
    print("part 1", ex, flush=True)

    # 2. random 3-uniform hypergraphs, reduction frames
    rng = random.Random(30)
    NS = [10, 14, 20, 40, 80, 120, 200]
    RS = [0.5, 1.0, 1.5, 1.75, 2.0, 2.25, 2.5, 3.0, 3.5]
    SEEDS = 20
    cells, inst = [], []
    hyp = {"instances": 0, "mismatch_nae": 0, "mismatch_brute": 0, "bad_witness": 0,
           "max_worlds": 0, "max_sat_s": 0.0}
    for n in NS:
        for r in RS:
            m = round(r * n)
            row = {"n": n, "r": r, "m": m, "colourable": 0, "sep_K": 0, "sep_KT": 0,
                   "sat_s_K": [], "sat_s_KT": []}
            for k in range(SEEDS):
                edges = random_hypergraph(n, m, rng)
                col = nae_sat(n, edges)
                if n <= 14:
                    hyp["mismatch_brute"] += col != two_col_brute(n, edges)
                row["colourable"] += col
                for name, R in (("K", kfr(list(range(n)), edges)), ("KT", kt_frame(list(range(n)), edges))):
                    hyp["max_worlds"] = max(hyp["max_worlds"], len(R))
                    t0 = time.perf_counter()
                    wit = separable_sat(R, 0, 1)
                    dt = time.perf_counter() - t0
                    hyp["max_sat_s"] = max(hyp["max_sat_s"], dt)
                    row["sat_s_" + name].append(dt)
                    hyp["instances"] += 1
                    hyp["mismatch_nae"] += (wit is not None) != col
                    if wit is not None:
                        hyp["bad_witness"] += not check_witness(R, 0, 1, *wit)
                        row["sep_" + name] += 1
                if n <= 40 and r in (1.5, 2.0, 2.5) and k < 5:
                    inst.append((n, r, k, edges, col))
            for name in ("K", "KT"):
                xs = row.pop("sat_s_" + name)
                row["median_ms_" + name] = round(1000 * statistics.median(xs), 2)
                row["max_ms_" + name] = round(1000 * max(xs), 2)
            row["worlds_KT"] = 4 + n + 5 * m
            cells.append(row)
            print("part 2", row, flush=True)
    hyp["max_sat_s"] = round(hyp["max_sat_s"], 3)
    out["hypergraphs"] = {"summary": hyp, "seeds_per_cell": SEEDS, "cells": cells}

    # 3. backtracking with a time limit
    LIMIT = 5.0
    bt = []
    for n, r, k, edges, col in inst:
        if n < 20:
            continue
        for name, R in (("K", kfr(list(range(n)), edges)), ("KT", kt_frame(list(range(n)), edges))):
            res, dt = bt_timed(R, 0, 1, LIMIT)
            t0 = time.perf_counter(); separable_sat(R, 0, 1); ds = time.perf_counter() - t0
            bt.append({"n": n, "r": r, "seed": k, "frame": name, "colourable": col,
                       "bt": res, "bt_s": round(dt, 3), "sat_s": round(ds, 4)})
            assert res is None or res == col
    out["backtracking"] = {"limit_s": LIMIT, "runs": bt,
                           "timeouts": sum(b["bt"] is None for b in bt),
                           "timeouts_by_n": {n: sum(b["bt"] is None for b in bt if b["n"] == n)
                                             for n in (20, 40)},
                           "runs_by_n": {n: sum(b["n"] == n for b in bt) for n in (20, 40)}}
    print("part 3", {k: v for k, v in out["backtracking"].items() if k != "runs"}, flush=True)

    # 4. random frames
    rng = random.Random(31)
    rf = []
    viol = 0
    for reflexive in (False, True):
        for c in [0.5, 1.0, 1.5, 2.0, 3.0, 5.0, 8.0]:
            row = {"class": "reflexive" if reflexive else "serial", "n": 300, "c": c,
                   "pairs": 0, "reach_w": 0, "acyclic": 0, "open": 0, "open_separable": 0,
                   "max_sat_s": 0.0}
            for _ in range(40):
                R = random_frame(300, c, rng, reflexive)
                pairs = [(w, v) for w in range(300) for v in R[w]]
                for w, v in rng.sample(pairs, min(10, len(pairs))):
                    T = reach(R, v)
                    t0 = time.perf_counter()
                    wit = separable_sat(R, w, v)
                    row["max_sat_s"] = max(row["max_sat_s"], time.perf_counter() - t0)
                    if wit is not None and not check_witness(R, w, v, *wit):
                        viol += 1
                    row["pairs"] += 1
                    if w in T:
                        row["reach_w"] += 1; viol += wit is not None
                    elif not any(v in R[t] for t in T):
                        row["acyclic"] += 1; viol += wit is None
                    else:
                        row["open"] += 1; row["open_separable"] += wit is not None
            row["max_sat_s"] = round(row["max_sat_s"], 4)
            rf.append(row)
            print("part 4", row, flush=True)
    out["random_frames"] = {"rows": rf, "violations": viol}
    out["seconds"] = round(time.time() - t_start, 1)
    (HERE / "results.json").write_text(json.dumps(out, indent=1) + "\n")
    print("done", out["seconds"], "s")


if __name__ == "__main__":
    main()
