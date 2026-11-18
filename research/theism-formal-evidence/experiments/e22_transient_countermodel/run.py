"""E22: E21's stage-II/III converse at any size: a countermodel for every transient successor.

    python3 research/theism-formal-evidence/experiments/e22_transient_countermodel/run.py
    python3 research/theism-formal-evidence/experiments/e22_transient_countermodel/run.py --quick

Prediction H26 is in LOG.md, written before this script and before the Lean file
(lean/TheismFormal/AndersonTransient.lean), which proves it for every serial frame.

This script is an independent check that the Lean model is a model in E19's own semantics (the
search code every earlier experiment used, experiments/e19_afp_anderson/run.py, unchanged), not
only in the Lean encoding.  For a serial relation R, a world w and a successor v0 of w on no cycle,
it builds H26's model as an E19 `Frame`: 2 individuals (0 = x, 1 = z) existing everywhere, the
cell partition {all x cells and the z cells outside S} + a singleton for each z cell in S, where
S = the worlds that reach v0, and P = "every property whose cells include block 0" at every world.
From E19's definitions it then checks: (a) x is God-like at every world; (b) z is God-like at
exactly the worlds outside S and at v0; (c) the God-like cells G and Anderson's NE are properties
in the algebra; (d) A1a and A2 (E19's `local_ok`), T2, A4a (P is constant) and A5 hold; (e)
GodIsEssential fails for x at w.  Frames: every serial relation up to 4 worlds and a seeded
random sample of sparse serial relations (edge probability 0.3) at 5, 6 and 8 worlds; every (w, v0) pair with v0 transient.
"""
import importlib.util, json, random, sys, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("e19", HERE.parent / "e19_afp_anderson" / "run.py")
e19 = importlib.util.module_from_spec(spec); spec.loader.exec_module(e19)


def closure(R, w):
    """T[u] = worlds reachable from u in one or more steps (bitmask)."""
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


def transient_pairs(R, w):
    """(w0, v0) with R w0 v0 and v0 on no cycle (v0 not in R+(v0))."""
    T = closure(R, w)
    return [(u, v) for u in range(w) for v in range(w) if R[u] >> v & 1 and not T[v] >> v & 1]


def build(R, w, v0):
    """H26's model as an E19 Frame and its P tuple."""
    T = closure(R, w)
    S = [u for u in range(w) if u == v0 or T[u] >> v0 & 1]
    d = 2
    cell = lambda v, y: v * d + y
    big = [cell(v, 0) for v in range(w)] + [cell(v, 1) for v in range(w) if v not in S]
    blocks = [sorted(big)] + [[cell(v, 1)] for v in S]
    fr = e19.Frame(w, d, R, [3] * w, blocks)
    P = sum(1 << s for s in range(fr.nprops) if s & 1)      # properties containing block 0
    return fr, (P,) * w, S


def check(R, w, w0, v0):
    """Return a dict of H26 (a) to (e) outcomes for one (frame, w0, v0)."""
    fr, Pt, S = build(R, w, v0)
    gods = [fr.godlike(u, Pt[u]) for u in range(w)]
    a = all(0 in g for g in gods)
    b = all((1 in gods[u]) == (u not in S or u == v0) for u in range(w))
    G = sum(1 << fr.cell(u, y) for u in range(w) for y in gods[u])
    c = fr.in_alg(G) and fr.in_alg(fr.NE)
    d = c and all(fr.local_ok(u, Pt[u]) for u in range(w)) and \
        all(Pt[u] >> fr.index[G] & 1 for u in range(w)) and \
        all(Pt[u] >> fr.index[fr.NE] & 1 for u in range(w))
    e = not fr.ess(w0, G, 0)
    # the exact condition (a) of E21 at w0, as a further consistency check
    return {"a": a, "b": b, "c": c, "d": d, "e": e}


def serial_relations(w):
    full = (1 << w) - 1
    for bits in range(1 << (w * w)):
        R = [(bits >> (i * w)) & full for i in range(w)]
        if all(R):
            yield R


def random_serial(w, rng, p=0.3):
    """Each edge independently with probability p, redrawn until serial (sparse relations have
    more transient worlds than uniform ones)."""
    while True:
        R = [sum(1 << v for v in range(w) if rng.random() < p) for _ in range(w)]
        if all(R):
            return R


def sample(w, n, rng):
    return [random_serial(w, rng) for _ in range(n)]


def run(exhaustive=(1, 2, 3, 4), sampled=((5, 5000), (6, 5000), (8, 2000)), seed=22, log=None):
    t0 = time.time()
    out = {"sizes": {}, "fail": [], "seed": seed}
    rng = random.Random(seed)
    jobs = [(w, "all", serial_relations(w)) for w in exhaustive]
    jobs += [(w, f"sample {n}", sample(w, n, rng)) for w, n in sampled]
    for w, kind, rels in jobs:
        nrel = npairs = nrel_with = 0
        bad = {k: 0 for k in "abcde"}
        for R in rels:
            nrel += 1
            pairs = transient_pairs(R, w)
            nrel_with += bool(pairs)
            for w0, v0 in pairs:
                npairs += 1
                r = check(R, w, w0, v0)
                for k, ok in r.items():
                    if not ok:
                        bad[k] += 1
                        if len(out["fail"]) < 20:
                            out["fail"].append({"R": R, "w0": w0, "v0": v0, "part": k})
        out["sizes"][f"{w} ({kind})"] = {"relations": nrel, "with_transient_successor": nrel_with,
                                          "pairs": npairs, "failed_checks": bad}
        if log:
            print(f"  {w} worlds ({kind}): {nrel} serial relations, {npairs} (w, v0) pairs, "
                  f"failed {bad}, {time.time() - t0:.0f}s", file=log, flush=True)
    out["seconds"] = round(time.time() - t0, 1)
    return out


def markdown(res):
    lines = ["| worlds | serial relations | with a transient successor | (w, v0) pairs | "
             "(a) | (b) | (c) | (d) | (e) |", "|---|---|---|---|---|---|---|---|---|"]
    for k, s in res["sizes"].items():
        b = s["failed_checks"]
        cells = " | ".join("held" if b[x] == 0 else f"**{b[x]} failed**" for x in "abcde")
        lines.append(f"| {k} | {s['relations']:,} | {s['with_transient_successor']:,} | "
                     f"{s['pairs']:,} | {cells} |")
    return "\n".join(lines)


if __name__ == "__main__":
    quick = "--quick" in sys.argv
    res = run(exhaustive=(1, 2, 3), sampled=((4, 200),)) if quick else run(log=sys.stdout)
    print(markdown(res))
    if not quick:
        (HERE / "results.json").write_text(json.dumps(res, indent=1) + "\n")
        (HERE / "table.md").write_text(markdown(res) + "\n")
    print(f"{res['seconds']} s; first failures: {res['fail'][:3]}")
