"""E23: without A4a, is E21's post-hoc condition exact over general property collections?

    python3 research/theism-formal-evidence/experiments/e23_horn_countermodel/run.py      # ~10 min
    python3 research/theism-formal-evidence/experiments/e23_horn_countermodel/run.py --quick

Prediction H27 is in LOG.md, committed before this script and before
lean/TheismFormal/AndersonHorn.lean.  This is an independent, definition-level check of the Lean
countermodel: it enumerates the collection explicitly (every set of cells closed under the Horn
rules), computes God-likeness, entailment, essence and Anderson's NE from their definitions in
AndersonK.lean, and checks every axiom and the failure of GodIsEssential.  It shares no code
with E19 or E21; E21's results.json is read only for the list of its 24 misses.

For every serial relation on 1 to 3 worlds and every (w, v0) with R w v0 and no back witness,
and (without --quick) every serial relation on 4 worlds, it checks:
  (a) x is God-like everywhere, z on R*(v0);  (b) g, its complement and NE are in the collection
  (NE = every cell);  (c) A1a, A2, T2, A5;  (d) GodIsEssential fails for x at w;
and that the number of (relation, world) pairs where the back condition fails at 3 worlds equals
E21's failing pairs plus its misses, and (e) at each E21 miss the collection is not a block
algebra (not closed under complement).
"""
import itertools, json, random, sys, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
X, Z = 1, 0  # individuals: Lean's true = x, false = z


def reach(R, n, a):
    seen, todo = {a}, [a]
    while todo:
        u = todo.pop()
        for s in range(n):
            if R[u] >> s & 1 and s not in seen:
                seen.add(s); todo.append(s)
    return seen


def back(R, n, w, v):
    """essential_back's witness: u in R*(v), u R v, R(u) subset of R(w)."""
    return any(R[u] >> v & 1 and R[u] & ~R[w] == 0 for u in reach(R, n, v))


def check(R, n, w, v0):
    cell = lambda y, t: 1 << (y * n + t)
    cells_on = lambda y, S: sum(cell(y, s) for s in range(n) if S >> s & 1)
    full = (1 << 2 * n) - 1
    T = reach(R, n, v0)
    hx = [cells_on(X, R[t]) for t in range(n)]
    hz = [cells_on(Z, R[t]) for t in range(n)]
    M = [hx[t] | hz[t] for t in range(n)]  # all cells at worlds R(t)
    has = lambda Y, m: Y & m == m
    Pr = [Y for Y in range(full + 1) if all(has(Y, hx[t]) == has(Y, hz[t]) for t in T)]
    Prset = set(Pr)
    pos = lambda t, Y: has(Y, hx[t])
    box = lambda y, t, Y: has(Y, hx[t] if y == X else hz[t])
    god = {(y, t): all(pos(t, Y) == box(y, t, Y) for Y in Pr) for y in (X, Z) for t in range(n)}
    ent = lambda t, A, B: A & ~B & M[t] == 0  # every individual exists everywhere
    ess = lambda t, Y, y: all(box(y, t, Zp) == ent(t, Y, Zp) for Zp in Pr)
    g = sum(cell(y, t) for (y, t), b in god.items() if b)
    gc = full & ~g
    ne = {(y, t): all(not ess(t, Y, y) or all(Y & (cell(X, s) | cell(Z, s)) for s in range(n) if R[t] >> s & 1)
                      for Y in Pr) for y in (X, Z) for t in range(n)}
    nmask = sum(cell(y, t) for (y, t), b in ne.items() if b)
    r = {
        "a_x": all(god[(X, t)] for t in range(n)),
        "a_z": all(god[(Z, t)] for t in T),
        "b_g": g in Prset, "b_gc": gc in Prset, "b_ne": nmask in Prset and nmask == full,
        "A1a": all(not (pos(t, A) and pos(t, full & ~A)) for t in range(n) for A in Pr if full & ~A in Prset),
        "A2": all(pos(t, B) for t in range(n) for A in Pr if pos(t, A) for B in Pr if ent(t, A, B)),
        "T2": all(pos(t, g) for t in range(n)),
        "A5": all(pos(t, nmask) for t in range(n)),
        "d_fails": god[(X, w)] and not ess(w, g, X),
    }
    r["block"] = all(full & ~A in Prset for A in Pr)
    return r


def serial_relations(n):
    return itertools.product(range(1, 1 << n), repeat=n)


def main(quick):
    t0 = time.time()
    out = {"checked": 0, "all_ok": 0, "bad": [], "by_size": {}, "block_algebras": 0}
    for n in ((1, 2, 3) if quick else (1, 2, 3, 4)):
        pairs = fail_pairs = 0
        for R in serial_relations(n):
            for w in range(n):
                pairs += 1
                bad_vs = [v for v in range(n) if R[w] >> v & 1 and not back(R, n, w, v)]
                if bad_vs:
                    fail_pairs += 1
                for v in bad_vs:
                    r = check(R, n, w, v)
                    out["checked"] += 1
                    ok = all(val for k, val in r.items() if k != "block")
                    out["all_ok"] += ok
                    out["block_algebras"] += r["block"]
                    if not ok:
                        out["bad"].append([n, list(R), w, v, r])
        out["by_size"][n] = {"relation_world_pairs": pairs, "back_condition_fails": fail_pairs}
    # E21's misses: back condition fails, no block-algebra model fails
    e21 = json.loads((HERE.parent / "e21_frame_characterisation" / "results.json").read_text())
    misses = sorted({(m[1], tuple(m[2]), m[3]) for m in e21["posthoc_misses"] if m[0] == "I"})
    out["e21_misses"] = len(misses)
    mres = []
    for n, R, w in misses:
        vs = [v for v in range(n) if R[w] >> v & 1 and not back(R, n, w, v)]
        rs = [check(R, n, w, v) for v in vs]
        mres.append({"n": n, "R": list(R), "w": w, "v0": vs,
                     "model_ok": bool(vs) and all(all(x for k, x in r.items() if k != "block") for r in rs),
                     "any_block": any(r["block"] for r in rs)})
    out["e21_misses_failing_model"] = sum(m["model_ok"] for m in mres)
    out["e21_misses_block"] = sum(m["any_block"] for m in mres)
    out["e21_miss_detail"] = mres
    # E21 results.md: 36 (relation, world) pairs fail in some block-algebra model at stage I
    out["e21_failing_pairs_I"] = 36
    out["sum_matches"] = out["by_size"][3]["back_condition_fails"] == 36 + len(misses)
    out["seconds"] = round(time.time() - t0, 1)
    (HERE / "results.json").write_text(json.dumps(out, indent=1))
    print(json.dumps({k: v for k, v in out.items() if k != "e21_miss_detail"}, indent=1))


if __name__ == "__main__":
    main("--quick" in sys.argv)
