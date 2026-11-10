"""E10: a theorem for Anderson's axioms over every finite property algebra, checked by search.

    python3 research/theism-formal-evidence/experiments/e10_theorem/run.py

Setting (as E7 to E9): S5, constant domain, positive set the same at every world.  A finite
Boolean algebra of sets of (world, individual) cells is always the set of unions of the blocks of
a partition of the cells, so E8's partition algebras are every finite property space there is.

Theorem (proof in results.md): A1, A2, A3', A5' have a model over the partition iff some block is
a union of whole individuals ("rows": one individual's cells at every world).  Each such block B
gives exactly one model (positive = supersets of B); there are no others.

This script checks the theorem against E8's exhaustive search for every partition of up to 5
cells, and every partition of 6 cells (3x2, 2x3) with up to 5 blocks, rigid-only algebras
included.  It also checks two corollaries on every model found: G* is non-empty and its members
have no contingent property; no non-trivial proposition (property true of everything at some
worlds and nothing at the others) is in the algebra.  Writes results.json next to this file;
results.md holds the proof and is written by hand around the generated table.
"""
import importlib.util, json, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("e8", HERE.parent / "e8_restricted" / "run.py")
e8 = importlib.util.module_from_spec(spec); spec.loader.exec_module(e8)


def rows(w, d):
    return [sum(1 << (wi * d + xi) for wi in range(w)) for xi in range(d)]


def predicted(blocks, w, d):
    """Number of blocks that are unions of whole rows (the theorem's model count)."""
    R = rows(w, d)
    n = 0
    for b in blocks:
        m = sum(1 << c for c in b)
        if all((m & r) in (0, r) for r in R):
            n += 1
    return n


def contingent_propositions(props, w, d):
    """Properties in the algebra that are 'p holds' for a p true at some but not all worlds."""
    col = [sum(1 << (wi * d + xi) for xi in range(d)) for wi in range(w)]
    out = []
    for S in range(1, (1 << w) - 1):
        m = sum(col[wi] for wi in range(w) if S >> wi & 1)
        if m in props:
            out.append(m)
    return out


def check(w, d, max_blocks=None):
    tot = agree = skipped = models_total = 0
    with_model = 0
    mismatches = []
    cor_prop_ok = True
    for blocks in e8.partitions(w * d):
        if max_blocks and len(blocks) > max_blocks:
            skipped += 1; continue
        props = e8.algebra(blocks)
        n, nontriv = e8.search(w, d, props)
        p = predicted(blocks, w, d)
        tot += 1
        models_total += n
        with_model += n > 0
        if n == p and nontriv == n:
            agree += 1
        else:
            mismatches.append({"blocks": blocks, "search": n, "nontrivial": nontriv, "theorem": p})
        if n and contingent_propositions(props, w, d):
            cor_prop_ok = False
    return {"w": w, "d": d, "partitions_checked": tot, "agree": agree, "skipped_over_max_blocks": skipped,
            "algebras_with_model": with_model, "models_total": models_total,
            "no_contingent_proposition_in_any_model_algebra": cor_prop_ok, "mismatches": mismatches[:5]}


SIZES = [(1, 1), (1, 2), (1, 3), (1, 4), (1, 5), (2, 1), (3, 1), (4, 1), (5, 1), (2, 2), (3, 2), (2, 3)]


def run():
    out = []
    for w, d in SIZES:
        t = time.time()
        r = check(w, d, max_blocks=5 if w * d == 6 else None)
        r["seconds"] = round(time.time() - t, 1)
        out.append(r)
        print(r["w"], r["d"], r["partitions_checked"], r["agree"], r["algebras_with_model"], r["seconds"], flush=True)
    return out


def test_theorem_small():
    for w, d in [(1, 2), (2, 1), (2, 2)]:
        r = check(w, d)
        assert r["agree"] == r["partitions_checked"], r["mismatches"]


if __name__ == "__main__":
    res = run()
    (HERE / "results.json").write_text(json.dumps(res, indent=1, sort_keys=True) + "\n")
    print("all agree:", all(r["agree"] == r["partitions_checked"] for r in res))
