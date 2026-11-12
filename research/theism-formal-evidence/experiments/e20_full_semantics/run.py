"""E20: does a property collection that can tell individuals apart remove E19's frame conditions?

    python3 research/theism-formal-evidence/experiments/e20_full_semantics/run.py   # about 25 minutes

The theorems are proved in Lean (lean/TheismFormal/AndersonFull.lean).  This script checks them,
and prediction H24 (d), against E19's exact model enumeration (experiments/e19_afp_anderson/run.py,
reused unchanged) on every frame of E19's sizes up to 3 worlds x 2 individuals, every relation.

For each model it records, per frame class (K, T, KB, K4, B, S4, S5):
  * whether the algebra is *separating*: for every individual x, the rigid singleton row(x), its
    complement and the existence property Ex are all properties of the algebra (full semantics
    always is; a coarse block algebra may not be);
  * failures of GodIsEssential (stages II and III) and GodExistenceImpliesNecExistence (stage III),
    from E19's definition-level checks;
  * for every GodIsEssential failure at world u for God-like x, whether some successor of u has an
    existing God-like individual other than x (H24 d, Lean `essential_failure`).
H24 predicts 0 failures of either statement in separating algebras, in every class, and that
every GodIsEssential failure has the second God-like individual.

Prediction H24 is in LOG.md, written before this script and before the Lean file.
"""
import importlib.util, itertools, json, sys, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("e19", HERE.parent / "e19_afp_anderson" / "run.py")
e19 = importlib.util.module_from_spec(spec); spec.loader.exec_module(e19)

SIZES = [(1, 1), (1, 2), (1, 3), (2, 1), (2, 2), (3, 1), (2, 3), (3, 2)]


def separating(fr):
    full = (1 << (fr.w * fr.d)) - 1
    need = [fr.Ex]
    for y in range(fr.d):
        need += [fr.row[y], full ^ fr.row[y]]
    return all(fr.in_alg(c) for c in need)


def second_god(fr, P, G, u, x):
    """Some successor v of u has an existing God-like individual z != x."""
    for v in e19.succ(fr, u):
        for z in range(fr.d):
            c = fr.cell(v, z)
            if z != x and G >> c & 1 and fr.Ex >> c & 1:
                return True
    return False


def run(sizes, log=None):
    t0 = time.time()
    tab = {}   # (statement, separating?, class) -> [failures, models]
    d_ok = d_bad = 0
    frames = 0
    for (w, d) in sizes:
        rels = e19.relations(w, "all")
        doms = list(itertools.product(range(1 << d), repeat=w))
        parts = list(e19.e8.partitions(w * d))
        for R in rels:
            cls = e19.fclass(e19.flags(R, w))
            for dom in doms:
                for blocks in parts:
                    fr = e19.Frame(w, d, R, list(dom), blocks)
                    frames += 1
                    sep = separating(fr)
                    _, reps, _ = e19.models(fr)
                    for st, Pt, G, n in reps:
                        checks = []
                        if st in ("II", "III"):
                            checks.append(("GodIsEssential", e19.s_ess))
                        if st == "III":
                            checks.append(("GodExistenceImpliesNecExistence", e19.s_GEINE))
                        for name, fn in checks:
                            r = tab.setdefault(f"{name}|{st}|{'separating' if sep else 'not separating'}|{cls}", [0, 0])
                            r[1] += n
                            if any(not fn(fr, Pt, G, u) for u in range(w)):
                                r[0] += n
                        if st in ("II", "III"):
                            for u in range(w):
                                for x in range(d):
                                    if G >> fr.cell(u, x) & 1 and not fr.ess(u, G, x):
                                        if second_god(fr, Pt, G, u, x):
                                            d_ok += 1
                                        else:
                                            d_bad += 1
        if log:
            print(f"  {w}x{d}: {frames} frames, {time.time() - t0:.0f}s", file=log, flush=True)
    return {"frames": frames, "table": tab, "h24d_failures_with_second_god": d_ok,
            "h24d_failures_without": d_bad, "seconds": round(time.time() - t0, 1)}


def markdown(res):
    order = ["K", "T", "KB", "K4", "B", "S4", "S5"]
    lines = ["| statement | stage | algebra | " + " | ".join(order) + " |", "|---|---|---|" + "---|" * len(order)]
    keys = sorted({tuple(k.split("|")[:3]) for k in res["table"]})
    for name, st, alg in keys:
        row = []
        for c in order:
            v = res["table"].get(f"{name}|{st}|{alg}|{c}")
            row.append("·" if not v else f"{v[0]:,}/{v[1]:,}")
        lines.append(f"| {name} | {st} | {alg} | " + " | ".join(row) + " |")
    return "\n".join(lines) + "\n"


def test_full_semantics_is_separating():
    fr = e19.Frame(2, 2, [3, 3], [1, 3], [[0], [1], [2], [3]])
    assert separating(fr)


def test_trivial_algebra_is_not_separating():
    fr = e19.Frame(1, 2, [1], [3], [[0, 1]])
    assert not separating(fr)


if __name__ == "__main__":
    sizes = SIZES[:5] if "--quick" in sys.argv else SIZES
    res = run(sizes, log=sys.stderr)
    if "--quick" not in sys.argv:
        (HERE / "results.json").write_text(json.dumps(res, indent=1))
        (HERE / "table.md").write_text(markdown(res))
    print(json.dumps({k: v for k, v in res.items() if k != "table"}))
    print(markdown(res))
