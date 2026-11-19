"""E28: separability (E24) by frame class.  NP-complete already on reflexive (KT) frames,
polynomial on transitive ones, impossible once v reaches w (all symmetric frames).

    python3 research/theism-formal-evidence/experiments/e28_frame_classes/run.py   # ~2 min

Prediction H32 is in LOG.md, committed before this script and before
lean/TheismFormal/AndersonKT.lean.  Labels per world of T = R*(v): E0 = (0,0), E1 = (1,1),
X = (1,0), Y = (0,1) for ([in A], [in S]).

The script
 1. checks the label lemma (a) against E24's Cond on every label multiset of size 1 to 5;
 2. on every relation (not only serial ones) up to 4 worlds and every (w, v) with w R v,
    decides separability (E27's decider, cross-checked by exhaustive search over (A, S);
    exhaustive search alone where some world of T has no successor) and
    checks (b) v reaches w => not separable, (c) v on no cycle => separable,
    (d) R transitive => (separable iff not v R v); and tabulates separability by frame class;
 3. builds H32 (e)'s reflexive reduction frame for every hypergraph with up to 4 points and up
    to 4 distinct non-empty edges and compares separability with 2-colourability; on the
    smallest ones it also runs an independent labelling search written from the lemma;
 4. the Fano plane's reflexive frame (46 worlds): not separable; minus one line: separable;
 5. the 7-world reflexive frame on which arc consistency passes but no separation exists
    (found by scratch code before H32), checked by exhaustive search over (A, S).
"""
import importlib.util, itertools, json, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("e27_run", HERE.parent / "e27_separability_np" / "run.py")
_e27 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_e27)
separable_bt, separable_brute, check_witness = _e27.separable_bt, _e27.separable_brute, _e27.check_witness
reach, typ, two_col = _e27.reach, _e27.typ, _e27.two_col

E0, E1, X, Y = (0, 0), (1, 1), (1, 0), (0, 1)
LABELS = [E0, E1, X, Y]


def cond_labels(labs):
    return typ([l[0] for l in labs]) == typ([l[1] for l in labs])


def lemma(labs):
    s = set(labs)
    return not (s & {X, Y}) or {E0, E1} <= s or {X, Y} <= s


def is_trans(R, n):
    return all(u in R[t] for t in range(n) for s in R[t] for u in R[s])


def is_sym(R, n):
    return all(t in R[s] for t in range(n) for s in R[t])


def on_cycle(R, v):
    return any(v in R[t] for t in reach(R, v))


def kt_frame(points, edges):
    """H32 (e): worlds 0 w, 1 v, 2 y, 3 x, then points, then 5 per edge (c, t0, t1, u0, u1)."""
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


def sep_lemma(R, w, v):
    """Independent labelling search written from the lemma (exhaustive over T's labels)."""
    T = sorted(reach(R, v))
    free = [t for t in T if t != v]
    for labs in itertools.product(LABELS, repeat=len(free)):
        L = dict(zip(free, labs)); L[v] = X
        if any(L[t][0] == 0 for t in T if t in R[w]):
            continue
        if all(lemma([L[s] for s in R[t]]) for t in T):
            return True
    return False


def gac(R, w, v):
    T = sorted(reach(R, v))
    D = {x: set(LABELS) for x in T}
    D[v] = {X}
    for x in T:
        if x in R[w]:
            D[x] &= {E1, X}
    changed = True
    while changed:
        changed = False
        for t in T:
            N = R[t]
            sup = {x: set() for x in N}
            for combo in itertools.product(*[sorted(D[x]) for x in N]):
                if lemma(combo):
                    for x, l in zip(N, combo):
                        sup[x].add(l)
            for x in N:
                if sup[x] != D[x]:
                    D[x] = sup[x]; changed = True
                    if not D[x]:
                        return False
    return True


def main():
    out = {}
    t0 = time.time()
    # 1. lemma
    bad = tot = 0
    for k in range(1, 6):
        for labs in itertools.product(LABELS, repeat=k):
            tot += 1; bad += cond_labels(labs) != lemma(labs)
    out["lemma"] = {"multisets": tot, "mismatches": bad}
    # 2. every relation up to 4 worlds
    classes = ["all", "serial", "reflexive", "transitive", "symmetric", "S4"]
    tab = {}
    viol = {"b_reach_w": 0, "c_acyclic": 0, "d_transitive": 0, "decider_vs_brute": 0}
    for n in range(1, 5):
        cnt = {c: [0, 0] for c in classes}
        for rows in itertools.product(range(1 << n), repeat=n):
            R = {t: [s for s in range(n) if rows[t] >> s & 1] for t in range(n)}
            ser = all(R[t] for t in range(n))
            ref = all(t in R[t] for t in range(n))
            tr = is_trans(R, n)
            sy = is_sym(R, n)
            for w in range(n):
                for v in R[w]:
                    if all(R[t] for t in reach(R, v)):
                        wit = separable_bt(R, w, v)
                        sep = wit is not None
                        if sep and not check_witness(R, w, v, *wit):
                            viol["decider_vs_brute"] += 1
                        if not sep and separable_brute(R, n, w, v):
                            viol["decider_vs_brute"] += 1
                    else:  # E27's decider assumes every R(t) on T is non-empty
                        sep = separable_brute(R, n, w, v)
                    if w in reach(R, v) and sep:
                        viol["b_reach_w"] += 1
                    if not on_cycle(R, v) and not sep:
                        viol["c_acyclic"] += 1
                    if tr and sep != (v not in R[v]):
                        viol["d_transitive"] += 1
                    for c, f in (("all", True), ("serial", ser), ("reflexive", ref),
                                 ("transitive", tr), ("symmetric", sy), ("S4", ref and tr)):
                        if f:
                            cnt[c][0] += 1; cnt[c][1] += sep
        tab[n] = {c: {"pairs": a, "separable": b} for c, (a, b) in cnt.items()}
    out["by_class"] = tab
    out["violations"] = viol
    # 3. KT reduction
    red = {}
    for npts in range(1, 5):
        pts = list(range(npts))
        nonempty = [e for r in range(1, npts + 1) for e in itertools.combinations(pts, r)]
        for m in range(1, 5):
            tot = col = mism = lem = 0
            for edges in itertools.combinations(nonempty, m):
                R = kt_frame(pts, edges)
                assert all(t in R[t] for t in R)
                wit = separable_bt(R, 0, 1)
                c = two_col(pts, edges)
                if wit is not None and not check_witness(R, 0, 1, *wit):
                    mism += 1
                if (wit is not None) != c:
                    mism += 1
                if npts <= 2 and m == 1:
                    lem += 1
                    if sep_lemma(R, 0, 1) != c:
                        mism += 1
                tot += 1; col += c
            red[f"{npts}p_{m}e"] = {"hypergraphs": tot, "2-colourable": col,
                                    "lemma_search_checked": lem, "mismatches": mism}
    out["kt_reduction"] = red
    # 4. Fano
    fano = [(0, 1, 2), (0, 3, 4), (0, 5, 6), (1, 3, 5), (1, 4, 6), (2, 3, 6), (2, 4, 5)]
    R = kt_frame(list(range(7)), fano)
    out["fano_kt"] = {"worlds": len(R), "reflexive": all(t in R[t] for t in R),
                      "two_colourable": two_col(list(range(7)), fano),
                      "separable": separable_bt(R, 0, 1) is not None}
    R6 = kt_frame(list(range(7)), fano[:6])
    wit = separable_bt(R6, 0, 1)
    out["fano_minus_line_kt"] = {"separable": wit is not None,
                                 "witness_valid": wit is not None and check_witness(R6, 0, 1, *wit)}
    # 5. arc consistency is not exact on KT
    Rg = {0: [0], 1: [1, 5, 6], 2: [2, 4, 5], 3: [0, 1, 3], 4: [3, 4], 5: [3, 5], 6: [0, 3, 6]}
    out["gac_gap"] = {"frame": {str(k): v for k, v in Rg.items()}, "w": 2, "v": 4,
                      "reflexive": all(t in Rg[t] for t in Rg),
                      "arc_consistent": gac(Rg, 2, 4),
                      "separable_exhaustive": separable_brute(Rg, 7, 2, 4)}
    out["seconds"] = round(time.time() - t0, 1)
    (HERE / "results.json").write_text(json.dumps(out, indent=1) + "\n")
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
