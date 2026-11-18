"""E11: Anderson's emendation with Anderson's OWN A2, over every finite property algebra.

    python3 research/theism-formal-evidence/experiments/e11_anderson_a2/run.py

E7 to E10 used Scott's A2 (exactly one of f and its complement f' is positive).  Anderson (1990)
keeps only half: if f is positive, f' is not (Benzmueller & Fuenmayor 2020, sec. 5).  Here A2 is
that half.  Without the other half the positive set P is no longer a choice of one property from
each complementary pair, so the search enumerates every up-closed family of properties (A1 forces
P to be up-closed), as monotone Boolean functions on the algebra's blocks, and applies A2 (weak),
G*, A3' and A5' with the same definitions as E8's `search`.

Prediction (H16, LOG.md, written before this ran): models correspond one-to-one to the non-empty
unions of blocks H such that H is the union of the rows of the individuals y with hull(y) = H
(hull = union of the blocks meeting y's row); P = {f : H <= f}.  The script compares the search's
count with that number on every partition of up to 5 cells, and on 6-cell partitions with up to
5 blocks.  Writes results.json and results.md next to this file.
"""
import importlib.util, json, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("e8", HERE.parent / "e8_restricted" / "run.py")
e8 = importlib.util.module_from_spec(spec); spec.loader.exec_module(e8)


def upsets(k):
    """Every up-closed family of subsets of range(k), each a frozenset of bitmasks over blocks."""
    if k == 0:
        yield frozenset(); yield frozenset({0}); return
    lower = list(upsets(k - 1))
    top = 1 << (k - 1)
    for u0 in lower:          # sets without block k-1
        for u1 in lower:      # sets with block k-1 (minus that bit); U0 <= U1 for up-closure
            if u0 <= u1:
                yield u0 | frozenset(s | top for s in u1)


def search_weak(w, d, blocks):
    """Exhaustive count of models of A1, weak A2, A3', A5' over the partition algebra."""
    k = len(blocks)
    bmask = [sum(1 << c for c in b) for b in blocks]
    to_cells = lambda s: sum(bmask[i] for i in range(k) if s >> i & 1)
    props = [to_cells(s) for s in range(1 << k)]
    full = (1 << (w * d)) - 1
    cell = lambda wi, xi: wi * d + xi
    box_mask = [sum(1 << cell(wi, xi) for wi in range(w)) for xi in range(d)]
    has_box = lambda f, xi: (f & box_mask[xi]) == box_mask[xi]
    # NE does not depend on P (E10 step 4), but compute it as E8 does, from the definitions.
    NE = 0
    for xi in range(d):
        ok = True
        for f in props:
            if all(has_box(g, xi) == ((f | g) == g) for g in props):
                if any(not any(f >> cell(wj, yi) & 1 for yi in range(d)) for wj in range(w)):
                    ok = False; break
        if ok:
            NE |= box_mask[xi]
    models = []
    for U in upsets(k):
        Pset = {to_cells(s) for s in U}
        if any((full ^ f) in Pset for f in Pset):
            continue                                   # weak A2
        gstar = [xi for xi in range(d) if all((f in Pset) == has_box(f, xi) for f in props)]
        G = sum(box_mask[xi] for xi in gstar)
        if G not in Pset:                              # A3' (G in the algebra and positive)
            continue
        if NE not in Pset:                             # A5'
            continue
        models.append((Pset, gstar, G))
    return models, props, box_mask


def predicted(w, d, blocks):
    """Number of non-empty unions of blocks H equal to the union of the rows y with hull(y) = H."""
    bmask = [sum(1 << c for c in b) for b in blocks]
    R = [sum(1 << (wi * d + xi) for wi in range(w)) for xi in range(d)]
    hull = [sum(m for m in bmask if m & r) for r in R]
    n = 0
    for s in range(1, 1 << len(blocks)):
        H = sum(bmask[i] for i in range(len(blocks)) if s >> i & 1)
        if sum(R[y] for y in range(d) if hull[y] == H) == H:
            n += 1
    return n


def contingent_godlike(models, props, box_mask, w, d):
    """Does some model's God-like individual have a property at some worlds and not others?"""
    for _, gstar, _ in models:
        for x in gstar:
            for f in props:
                if len({(f >> (wi * d + x)) & 1 for wi in range(w)}) > 1:
                    return True
    return False


SIZES = [(1, 1), (1, 2), (2, 1), (1, 3), (3, 1), (1, 4), (2, 2), (4, 1),
         (1, 5), (5, 1), (3, 2), (2, 3)]


def run():
    out = []
    for w, d in SIZES:
        t = time.time()
        n = w * d
        checked = agree = with_model = total = cg = skipped = 0
        full_partition = None
        mismatch = []
        for blocks in e8.partitions(n):
            if n == 6 and len(blocks) > 5:
                skipped += 1
                continue
            models, props, box_mask = search_weak(w, d, blocks)
            p = predicted(w, d, blocks)
            checked += 1
            agree += len(models) == p
            if len(models) != p:
                mismatch.append([sorted(b) for b in blocks])
            with_model += bool(models)
            total += len(models)
            cg += contingent_godlike(models, props, box_mask, w, d)
            if len(blocks) == n:
                full_partition = len(models)
        out.append({"w": w, "d": d, "partitions_checked": checked, "agree": agree,
                    "skipped_6_blocks": skipped, "algebras_with_model": with_model,
                    "models_total": total, "algebras_where_godlike_has_contingent_property": cg,
                    "models_full_semantics": full_partition, "mismatches": mismatch[:3],
                    "seconds": round(time.time() - t, 1)})
        print(out[-1], flush=True)
    return out


def markdown(rows):
    L = ["| worlds | individuals | partitions checked | search = prediction | algebras with a model | models in total | algebras where a God-like individual has a contingent property | models under full semantics (every cell a block) | seconds |",
         "|---|---|---|---|---|---|---|---|---|"]
    for r in rows:
        fs = "skipped (6 blocks)" if r["models_full_semantics"] is None else r["models_full_semantics"]
        L.append(f"| {r['w']} | {r['d']} | {r['partitions_checked']} | {r['agree']} | {r['algebras_with_model']} | "
                 f"{r['models_total']} | {r['algebras_where_godlike_has_contingent_property']} | {fs} | {r['seconds']} |")
    return "\n".join(L)


def test_upsets_count():
    # Dedekind numbers M(0..4) = 2, 3, 6, 20, 168
    assert [sum(1 for _ in upsets(k)) for k in range(5)] == [2, 3, 6, 20, 168]


def test_two_worlds_one_individual_full():
    # Benzmueller & Fuenmayor's countermodel size: two worlds, one entity, every cell a property.
    models, _, _ = search_weak(2, 1, [[0], [1]])
    assert len(models) == 1


if __name__ == "__main__":
    test_upsets_count(); test_two_worlds_one_individual_full()
    rows = run()
    (HERE / "results.json").write_text(json.dumps(rows, indent=1, sort_keys=True) + "\n")
    (HERE / "table.md").write_text(markdown(rows) + "\n")
    print(markdown(rows))
    print("ok")
