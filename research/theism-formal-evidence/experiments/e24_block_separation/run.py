"""E24: without A4a, the exact frame condition for GodIsEssential over complement-closed
collections (block algebras included).

    python3 research/theism-formal-evidence/experiments/e24_block_separation/run.py         # ~1 min
    python3 research/theism-formal-evidence/experiments/e24_block_separation/run.py --quick

Prediction H28 is in LOG.md, committed before this script and before
lean/TheismFormal/AndersonSep.lean.  A successor v of w is *separable* if some sets of worlds
A, S have R(w) <= A, v not in S and, for every t in R*(v),
  (i)  R(t) <= A  iff  R(t) <= S,   (ii)  R(t) misses A  iff  R(t) misses S.

The script
 1. finds the separable pairs by brute force over (A, S) on every serial relation up to 4 worlds;
 2. compares, at 3 worlds, the (relation, world) pairs with a separable successor against E21's
    block-algebra failing pairs (E21's back-condition pairs minus its 24 misses, read from
    E21's results.json);
 3. checks the four-block countermodel of H28 (b) at the definition level for every separable
    (relation, w, v) up to 4 worlds: the collection is enumerated explicitly (every union of
    the four blocks), God-likeness, actualist entailment, essence and Anderson's NE are computed
    from AndersonK.lean's definitions, and every axiom and the failure are checked.
It shares no code with E19, E21 or E23.
"""
import itertools, json, sys, time
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
    return any(R[u] >> v & 1 and R[u] & ~R[w] == 0 for u in reach(R, n, v))


def cond(Rt, A, S):
    return ((Rt & ~A == 0) == (Rt & ~S == 0)) and ((Rt & A == 0) == (Rt & S == 0))


def separations(R, n, w, v):
    T = reach(R, n, v)
    for A in range(1 << n):
        if R[w] & ~A:
            continue
        for S in range(1 << n):
            if S >> v & 1:
                continue
            if all(cond(R[t], A, S) for t in T):
                yield A, S


def check(R, n, w, v, A, S):
    """H28 (b): the four-block model, checked from the definitions."""
    cell = lambda y, t: 1 << (y * n + t)
    full = (1 << 2 * n) - 1
    C = {t for t in range(n) if cond(R[t], A, S)}
    G = {t for t in range(n) if reach(R, n, t) <= C}
    inB = lambda y, t: bool((A if y == X else S) >> t & 1)
    inG = lambda y, t: y == X or t in G
    blocks = {}
    for y in (X, Z):
        for t in range(n):
            k = (inB(y, t), inG(y, t))
            blocks[k] = blocks.get(k, 0) | cell(y, t)
    bl = list(blocks.values())
    Pr = sorted({sum(b for i, b in enumerate(bl) if m >> i & 1) for m in range(1 << len(bl))})
    Prset = set(Pr)
    on = lambda y, t: sum(cell(y, s) for s in range(n) if R[t] >> s & 1)
    M = [on(X, t) | on(Z, t) for t in range(n)]
    has = lambda Y, m: Y & m == m
    pos = lambda t, Y: has(Y, on(X, t))
    box = lambda y, t, Y: has(Y, on(y, t))
    god = {(y, t): all(pos(t, Y) == box(y, t, Y) for Y in Pr) for y in (X, Z) for t in range(n)}
    ent = lambda t, P1, P2: P1 & ~P2 & M[t] == 0  # everyone exists everywhere
    ess = lambda t, Y, y: all(box(y, t, Zp) == ent(t, Y, Zp) for Zp in Pr)
    g = sum(cell(y, t) for (y, t), b in god.items() if b)
    ne = {(y, t): all(not ess(t, Y, y) or all(Y & (cell(X, s) | cell(Z, s))
                                               for s in range(n) if R[t] >> s & 1)
                      for Y in Pr) for y in (X, Z) for t in range(n)}
    nmask = sum(cell(y, t) for (y, t), b in ne.items() if b)
    Bset = sum(cell(y, t) for y in (X, Z) for t in range(n) if inB(y, t))
    zgod = {t for t in range(n) if god[(Z, t)]}
    return {
        "x_god_everywhere": all(god[(X, t)] for t in range(n)),
        "z_god_exactly_G": zgod == G,
        "Rstar_v_in_G": reach(R, n, v) <= G,
        "g_in": g in Prset, "gc_in": full & ~g in Prset, "ne_all": nmask == full and nmask in Prset,
        "block_algebra": all(full & ~Y in Prset for Y in Pr),
        "A1a": all(not (pos(t, Y) and pos(t, full & ~Y)) for t in range(n) for Y in Pr),
        "A2": all(pos(t, Q) for t in range(n) for Y in Pr if pos(t, Y) for Q in Pr if ent(t, Y, Q)),
        "T2": all(pos(t, g) for t in range(n)),
        "A5": all(pos(t, nmask) for t in range(n)),
        "B_pos_at_w": pos(w, Bset), "z_lacks_B_at_v": not Bset >> (Z * n + v) & 1,
        "fails": god[(X, w)] and not ess(w, g, X),
    }, len(bl)


def main(quick):
    t0 = time.time()
    out = {"by_size": {}, "checked": 0, "all_ok": 0, "bad": [], "sep_with_back": 0,
           "max_blocks": 0}
    sep_pairs3 = set()
    for n in ((1, 2, 3) if quick else (1, 2, 3, 4)):
        pairs = back_fail = sep = 0
        for R in itertools.product(range(1, 1 << n), repeat=n):
            for w in range(n):
                pairs += 1
                succ = [v for v in range(n) if R[w] >> v & 1]
                back_fail += any(not back(R, n, w, v) for v in succ)
                any_sep = False
                for v in succ:
                    wit = next(separations(R, n, w, v), None)
                    if wit is None:
                        continue
                    any_sep = True
                    out["sep_with_back"] += back(R, n, w, v)
                    r, nb = check(R, n, w, v, *wit)
                    out["max_blocks"] = max(out["max_blocks"], nb)
                    out["checked"] += 1
                    ok = all(r.values())
                    out["all_ok"] += ok
                    if not ok and len(out["bad"]) < 20:
                        out["bad"].append([n, list(R), w, v, wit, r])
                sep += any_sep
                if any_sep and n == 3:
                    sep_pairs3.add((tuple(R), w))
        out["by_size"][n] = {"relation_world_pairs": pairs, "back_condition_fails": back_fail,
                             "separable": sep}
    # E21 at 3 worlds: block-algebra failing pairs = back-condition pairs minus its misses
    e21 = json.loads((HERE.parent / "e21_frame_characterisation" / "results.json").read_text())
    misses = {(tuple(m[2]), m[3]) for m in e21["posthoc_misses"] if m[0] == "I" and m[1] == 3}
    back3 = {(R, w) for R in itertools.product(range(1, 8), repeat=3) for w in range(3)
             if any(R[w] >> v & 1 and not back(R, 3, w, v) for v in range(3))}
    e21_seen = back3 - misses
    out["e21_misses"] = len(misses)
    out["e21_seen_pairs"] = len(e21_seen)
    out["separable_pairs_3"] = len(sep_pairs3)
    out["separable_not_seen"] = sorted(map(list, sep_pairs3 - e21_seen))
    out["seen_not_separable"] = sorted(map(list, e21_seen - sep_pairs3))
    out["e21_match"] = sep_pairs3 == e21_seen
    out["seconds"] = round(time.time() - t0, 1)
    (HERE / "results.json").write_text(json.dumps(out, indent=1, default=str))
    print(json.dumps(out, indent=1, default=str))


if __name__ == "__main__":
    main("--quick" in sys.argv)
