"""E21: exactly which frames let GodIsEssential fail, with and without A4a.

    python3 research/theism-formal-evidence/experiments/e21_frame_characterisation/run.py   # ~25 min
    python3 research/theism-formal-evidence/experiments/e21_frame_characterisation/run.py --quick

Prediction H25 is in LOG.md, written before this script and before the Lean file
(lean/TheismFormal/AndersonFrames.lean).  The script reuses E19's exact model enumeration
(experiments/e19_afp_anderson/run.py, unchanged) on every frame up to 3 worlds x 2 individuals and
2 x 3 (every relation, every domain assignment, every partition of the cells), and checks:

  (a) in every model, at every world u and God-like x: GodIsEssential for x at u iff every existing
      God-like z at every successor v of u has, at v, every property positive at u;
  (c)/(e) without A4a (stages I and III-noA4): world u fails in some model iff some edge u->v is off
      every cycle (u not in R+(v));
  (d)/(e) with A4a (stages II and III): world u fails in some model iff some successor v of u is on
      no cycle (v not in R+(v));
  (f) non-serial relations have no stage-I model.
"""
import importlib.util, itertools, json, sys, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("e19", HERE.parent / "e19_afp_anderson" / "run.py")
e19 = importlib.util.module_from_spec(spec); spec.loader.exec_module(e19)

SIZES = [(1, 1), (1, 2), (1, 3), (2, 1), (2, 2), (3, 1), (2, 3), (3, 2)]
STAGES = ["I", "III-noA4", "II", "III"]
A4 = {"I": False, "III-noA4": False, "II": True, "III": True}


def closure(R, w):
    """R+ as bitmasks: T[u] = worlds reachable from u in one or more steps."""
    T = list(R)
    changed = True
    while changed:
        changed = False
        for u in range(w):
            n = T[u]
            for v in range(w):
                if T[u] >> v & 1:
                    n |= T[v]
            if n != T[u]:
                T[u] = n; changed = True
    return T


def predicted(R, w):
    """Per world: (edge off every cycle, successor on no cycle)."""
    T = closure(R, w)
    edge = [any(R[u] >> v & 1 and not T[v] >> u & 1 for v in range(w)) for u in range(w)]
    world = [any(R[u] >> v & 1 and not T[v] >> v & 1 for v in range(w)) for u in range(w)]
    return edge, world


def posthoc(R, w, a4):
    """Post-hoc condition, written after the --quick run refuted H25 (e) for stage I (NOT a
    prediction): world u can fail iff some successor v of u has no u' in R*(v) with u' -> v and
    (A4a, or succ(u') a subset of succ(u))."""
    T = closure(R, w)
    out = []
    for u in range(w):
        bad = False
        for v in range(w):
            if not R[u] >> v & 1:
                continue
            reach = T[v] | (1 << v)
            ok = any(reach >> t & 1 and R[t] >> v & 1 and (a4 or (R[t] & ~R[u]) == 0) for t in range(w))
            if not ok:
                bad = True
        out.append(bad)
    return out


def cond_a(fr, P, G, u):
    """Right side of H25 (a) at u: every existing God-like z at every successor v of u has, at v,
    every property positive at u."""
    pos = [fr.props[Z] for Z in range(fr.nprops) if P[u] >> Z & 1]
    for v in e19.succ(fr, u):
        for z in range(fr.d):
            c = fr.cell(v, z)
            if G >> c & 1 and fr.Ex >> c & 1 and not all(p >> c & 1 for p in pos):
                return False
    return True


def run(sizes, log=None):
    t0 = time.time()
    frames = 0
    a_checked = a_bad = 0
    nonserial_models = 0
    # per (stage, relation key, world): did any model fail at that world? and was it predicted?
    seen = {}   # (st, w, d, Rtuple) -> [fail flags per world], plus model counts
    nmodels = {}
    for (w, d) in sizes:
        rels = e19.relations(w, "all")
        doms = list(itertools.product(range(1 << d), repeat=w))
        parts = list(e19.e8.partitions(w * d))
        for R in rels:
            serial = all(R[i] for i in range(w))
            key = (w, d, tuple(R))
            for dom in doms:
                for blocks in parts:
                    fr = e19.Frame(w, d, R, list(dom), blocks)
                    frames += 1
                    _, reps, _ = e19.models(fr)
                    for st, Pt, G, n in reps:
                        if not serial:
                            nonserial_models += n
                            continue
                        f = seen.setdefault((st,) + key, [False] * w)
                        nmodels[(st,) + key] = nmodels.get((st,) + key, 0) + n
                        for u in range(w):
                            gods = [x for x in range(d) if G >> fr.cell(u, x) & 1]
                            if not gods:
                                continue
                            rhs = cond_a(fr, Pt, G, u)
                            for x in gods:
                                lhs = fr.ess(u, G, x)
                                a_checked += 1
                                if lhs != rhs:
                                    a_bad += 1
                                if not lhs:
                                    f[u] = True
        if log:
            print(f"  {w}x{d}: {frames} frames, {time.time() - t0:.0f}s", file=log, flush=True)
    # compare with prediction, per (stage, size, relation, world)
    cmp = {st: {"worlds": 0, "fail_pred_and_seen": 0, "fail_pred_not_seen": 0,
                "fail_seen_not_pred": 0, "safe_both": 0} for st in STAGES}
    misses = []
    smallest = {}
    for (st, w, d, R), f in seen.items():
        edge, world = predicted(list(R), w)
        pred = edge if not A4[st] else world
        for u in range(w):
            c = cmp[st]; c["worlds"] += 1
            if pred[u] and f[u]:
                c["fail_pred_and_seen"] += 1
                k = (w, d)
                if st not in smallest or k < smallest[st][0]:
                    smallest[st] = (k, list(R), u)
            elif pred[u]:
                c["fail_pred_not_seen"] += 1; misses.append([st, w, d, list(R), u, "predicted, not seen"])
            elif f[u]:
                c["fail_seen_not_pred"] += 1; misses.append([st, w, d, list(R), u, "seen, not predicted"])
            else:
                c["safe_both"] += 1
    # a predicted failure needs only to show at some individual count; collapse over d
    by_rel = {}
    for (st, w, d, R), f in seen.items():
        edge, world = predicted(list(R), w)
        pred = edge if not A4[st] else world
        g = by_rel.setdefault((st, w, R), [[False] * w, pred])
        for u in range(w):
            g[0][u] |= f[u]
    rel_cmp = {st: {"worlds": 0, "agree": 0, "pred_not_seen": 0, "seen_not_pred": 0} for st in STAGES}
    post_cmp = {st: {"worlds": 0, "agree": 0, "cond_not_seen": 0, "seen_not_cond": 0} for st in STAGES}
    post_miss = []
    for (st, w, R), (f, _) in by_rel.items():
        cond = posthoc(list(R), w, A4[st])
        for u in range(w):
            c = post_cmp[st]; c["worlds"] += 1
            if f[u] == cond[u]:
                c["agree"] += 1
            elif cond[u]:
                c["cond_not_seen"] += 1; post_miss.append([st, w, list(R), u, "condition, not seen"])
            else:
                c["seen_not_cond"] += 1; post_miss.append([st, w, list(R), u, "seen, not condition"])
    rel_miss = []
    for (st, w, R), (f, pred) in by_rel.items():
        for u in range(w):
            c = rel_cmp[st]; c["worlds"] += 1
            if f[u] == pred[u]:
                c["agree"] += 1
            elif pred[u]:
                c["pred_not_seen"] += 1; rel_miss.append([st, w, list(R), u, "predicted, not seen"])
            else:
                c["seen_not_pred"] += 1; rel_miss.append([st, w, list(R), u, "seen, not predicted"])
    return {"frames": frames, "seconds": round(time.time() - t0, 1),
            "a_checked": a_checked, "a_mismatches": a_bad, "nonserial_models": nonserial_models,
            "by_size": cmp, "by_relation": rel_cmp, "posthoc": post_cmp, "posthoc_misses": post_miss, "relation_misses": rel_miss,
            "size_misses_count": len(misses), "size_misses_sample": misses[:40],
            "smallest_failure": {st: {"size": v[0], "R": v[1], "world": v[2]} for st, v in smallest.items()},
            "models": sum(nmodels.values())}


def markdown(res):
    lines = ["| stage | A4a | (relation, world) pairs | agree | predicted, no failure found | failure, not predicted |",
             "|---|---|---|---|---|---|"]
    for st in STAGES:
        c = res["by_relation"][st]
        lines.append(f"| {st} | {'yes' if A4[st] else 'no'} | {c['worlds']:,} | {c['agree']:,} | {c['pred_not_seen']:,} | {c['seen_not_pred']:,} |")
    lines += ["", "Post-hoc condition (written after the quick run, not predicted):", "",
              "| stage | (relation, world) pairs | agree | condition, no failure found | failure, condition false |",
              "|---|---|---|---|---|"]
    for st in STAGES:
        c = res["posthoc"][st]
        lines.append(f"| {st} | {c['worlds']:,} | {c['agree']:,} | {c['cond_not_seen']:,} | {c['seen_not_cond']:,} |")
    return "\n".join(lines) + "\n"


def test_closure_cycle():
    # 0 -> 1 -> 2 -> 2: 1 is on no cycle, 2 is; edge 0->1 off every cycle
    R = [0b010, 0b100, 0b100]
    edge, world = predicted(R, 3)
    assert edge == [True, True, False] and world == [True, False, False]


def test_symmetric_and_reflexive_safe():
    R = [0b11, 0b11]
    assert predicted(R, 2) == ([False, False], [False, False])
    R = [0b01, 0b10]   # reflexive, no edges between: every successor on a cycle, every edge on one
    assert predicted(R, 2) == ([False, False], [False, False])


if __name__ == "__main__":
    sizes = SIZES[:5] if "--quick" in sys.argv else SIZES
    res = run(sizes, log=sys.stderr)
    if "--quick" not in sys.argv:
        (HERE / "results.json").write_text(json.dumps(res, indent=1))
        (HERE / "table.md").write_text(markdown(res))
    print(json.dumps({k: v for k, v in res.items() if k not in ("size_misses_sample",)}, indent=1))
    print(markdown(res))
