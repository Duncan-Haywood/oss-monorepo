"""E29: separability (E24) on Euclidean frames (axiom 5).  Linear, never with a reflexive w,
and the same as E23's back-witness condition.

    python3 research/theism-formal-evidence/experiments/e29_euclidean/run.py   # ~1 min

Prediction H33 is in LOG.md, committed before this script and before
lean/TheismFormal/AndersonK5.lean.  The script
 1. on every relation up to 4 worlds that is Euclidean (a R b, a R c => b R c), and every
    (w, v) with w R v, decides separability by exhaustive search over (A, S) (E27's
    separable_brute) and checks
      (a) every t in R*(v) has R(t) = R(v),
      (b) separable iff some successor of v is not a successor of w,
      (c) w R w => not separable; transitive => not separable,
      (d) separable iff no back witness (E23),
      (e) no successor of w separable iff R is transitive at w;
    and tabulates by class (K5, KD5, K45, KD45, KT5 = S5);
 2. the same checks on Euclidean closures of random relations on 5 to 7 worlds (seeded);
 3. for contrast, counts the (relation, w, v) triples on up to 4 worlds where separability and
    "no back witness" differ in all, serial and reflexive frames (E24/E27: they can differ).
"""
import importlib.util, itertools, json, random, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("e27_run", HERE.parent / "e27_separability_np" / "run.py")
_e27 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_e27)
reach, separable_brute, back = _e27.reach, _e27.separable_brute, _e27.back


def is_eucl(R, n):
    return all(c in R[b] for a in range(n) for b in R[a] for c in R[a])


def is_trans(R, n):
    return all(u in R[t] for t in range(n) for s in R[t] for u in R[s])


def eucl_closure(R, n):
    R = {t: set(R[t]) for t in range(n)}
    changed = True
    while changed:
        changed = False
        for a in range(n):
            for b in list(R[a]):
                new = R[a] - R[b]
                if new:
                    R[b] |= new; changed = True
    return {t: sorted(R[t]) for t in range(n)}


def rule(R, w, v):
    """H33 (b): the linear test."""
    return any(u not in R[w] for u in R[v])


def check(R, n, viol):
    tr = is_trans(R, n)
    res = []
    for w in range(n):
        none_sep = True
        for v in R[w]:
            sep = separable_brute(R, n, w, v)
            none_sep &= not sep
            if any(set(R[t]) != set(R[v]) for t in reach(R, v)):
                viol["a_same_successors"] += 1
            if sep != rule(R, w, v):
                viol["b_rule"] += 1
            if sep and (w in R[w] or tr):
                viol["c_refl_or_trans"] += 1
            if sep == back(R, w, v):
                viol["d_back"] += 1
            res.append(sep)
        trans_at_w = all(u in R[w] for v in R[w] for u in R[v])
        if none_sep != trans_at_w:
            viol["e_trans_at_w"] += 1
    return res


def main():
    t0 = time.time()
    out = {}
    viol = {"a_same_successors": 0, "b_rule": 0, "c_refl_or_trans": 0, "d_back": 0, "e_trans_at_w": 0}
    classes = ["K5", "KD5", "K45", "KD45", "S5"]
    tab = {}
    contrast = {}
    for n in range(1, 5):
        cnt = {c: {"frames": 0, "pairs": 0, "separable": 0} for c in classes}
        con = {c: {"pairs": 0, "sep_ne_noback": 0} for c in ("all", "serial", "reflexive")}
        for rows in itertools.product(range(1 << n), repeat=n):
            R = {t: [s for s in range(n) if rows[t] >> s & 1] for t in range(n)}
            ser = all(R[t] for t in range(n))
            ref = all(t in R[t] for t in range(n))
            if is_eucl(R, n):
                res = check(R, n, viol)
                tr = is_trans(R, n)
                for c, f in (("K5", True), ("KD5", ser), ("K45", tr), ("KD45", ser and tr), ("S5", ref)):
                    if f:
                        cnt[c]["frames"] += 1; cnt[c]["pairs"] += len(res); cnt[c]["separable"] += sum(res)
            else:
                for w in range(n):
                    for v in R[w]:
                        d = separable_brute(R, n, w, v) == back(R, w, v)
                        for c, f in (("all", True), ("serial", ser), ("reflexive", ref)):
                            if f:
                                con[c]["pairs"] += 1; con[c]["sep_ne_noback"] += d
        tab[n] = cnt
        contrast[n] = con
    out["euclidean_exhaustive"] = tab
    out["non_euclidean_sep_vs_noback"] = contrast
    rng = random.Random(29)
    samp = {}
    for n, k in ((5, 3000), (6, 1500), (7, 400)):
        v0 = dict(viol)
        pairs = seps = 0
        for _ in range(k):
            p = rng.choice([0.15, 0.25, 0.4])
            R0 = {t: [s for s in range(n) if rng.random() < p] for t in range(n)}
            R = eucl_closure(R0, n)
            assert is_eucl(R, n)
            res = check(R, n, viol)
            pairs += len(res); seps += sum(res)
        samp[n] = {"frames": k, "pairs": pairs, "separable": seps,
                   "new_violations": sum(viol.values()) - sum(v0.values())}
    out["euclidean_random"] = samp
    out["violations"] = viol
    out["seconds"] = round(time.time() - t0, 1)
    (HERE / "results.json").write_text(json.dumps(out, indent=1) + "\n")
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
