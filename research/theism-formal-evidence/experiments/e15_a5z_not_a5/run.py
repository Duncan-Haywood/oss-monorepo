"""E15: does plain necessary existence (A5_0) imply Anderson's (A5')?  A census past E14's sizes.

    python3 research/theism-formal-evidence/experiments/e15_a5z_not_a5/run.py          # 2x4, 4x2 (~1 min)
    python3 research/theism-formal-evidence/experiments/e15_a5z_not_a5/run.py --3x3    # adds 3x3 (~10 min)

Setting as E14 (S5, varying domains, rigid positive set, properties the unions of the blocks of
a partition of the world x individual cells, Anderson's A2, actualist entailment and actualist
"x has f necessarily").  E14 conjectured from a search up to 6 cells that every model of A1, A2w,
A3', A5_0 also satisfies A5'.  H20 (LOG.md, before this ran): false, smallest counterexample at 8
cells, none with two individuals, some at 2x4 and 3x3.

Exact enumeration without searching positive sets.  In any model the positive set is
{f : NecA f x} for any God-like x (the definition of G*), i.e. {f : hE(x) <= f} with hE(x) the
union of the blocks meeting x's existing cells; with A5_0 every God-like x exists at every world
(E14, Lean `godlike_necessary_plain`) and some God-like x exists (`exists_godlikeA`).  So every
model is P_H = {f : H <= f} for H = hE(x) of some necessary existent x, and P_H is a model iff
(A3') the rows of the y with hE(y) = H form a union of blocks containing H, and (A5_0) the rows of
the necessary existents form a union of blocks (A1, A2w hold automatically for such H).  A5' then
holds iff NE, the rows of the y whose hE(y) meets an existent at every world, is a union of
blocks (Lean `a5a_iff_closed`).  `crosscheck()` compares this with E14's definition-level search
on every frame up to 6 cells (6-cell full powerset excepted, as in E14).
"""
import importlib.util, itertools, json, sys, time
from pathlib import Path

HERE = Path(__file__).resolve().parent


def partitions(n):
    """Restricted growth strings: lab[c] = block of cell c."""
    lab = [0] * n

    def rec(i, m):
        if i == n:
            yield list(lab), m
            return
        for b in range(m + 1):
            lab[i] = b
            yield from rec(i + 1, max(m, b + 1))
    yield from rec(0, 0)


def domains(w, d):
    """Every Ex with a non-empty domain at each world (E12's convention), as a cell bitmask."""
    for choice in itertools.product(range(1, 1 << d), repeat=w):
        yield sum(((choice[wi] >> xi) & 1) << (wi * d + xi) for wi in range(w) for xi in range(d))


def frame_models(w, d, lab, bm, Ex):
    """List of (H, gstar, a5') for every model of A1, A2w, A3', A5_0 on this frame."""
    n = w * d
    row = [sum(1 << (wi * d + x) for wi in range(w)) for x in range(d)]
    world = [((1 << d) - 1) << (wi * d) for wi in range(w)]

    def cl(s):
        out, c = 0, 0
        while s:
            if s & 1:
                out |= bm[lab[c]]
            s >>= 1; c += 1
        return out

    nec = [x for x in range(d) if row[x] & Ex == row[x]]
    if not nec:
        return []
    N0 = sum(row[x] for x in nec)
    if cl(N0) != N0:
        return []
    hE = [cl(row[y] & Ex) for y in range(d)]
    NE = sum(row[y] for y in range(d) if all(hE[y] & Ex & world[wi] for wi in range(w)))
    a5 = cl(NE) == NE
    out = []
    for H in sorted({hE[x] for x in nec}):
        gs = [y for y in range(d) if hE[y] == H]
        G = sum(row[y] for y in gs)
        if cl(G) == G and H & ~G == 0:
            out.append((H, gs, a5))
    return out


def census(w, d):
    n = w * d
    r = {"w": w, "d": d, "frames": 0, "frames_with_a50_model": 0, "a50_models": 0,
         "a50_not_a5": 0, "frames_a50_not_a5": 0, "min_blocks_counterexample": None,
         "a50_not_a5_all_exist": 0, "min_blocks_all_exist": None,
         "examples": [], "examples_all_exist": []}
    t = time.time()
    doms = list(domains(w, d))
    rows_ = [sum(1 << (wi * d + x) for wi in range(w)) for x in range(d)]
    everyone = {Ex: all(Ex & r for r in rows_) for Ex in doms}
    for lab, k in partitions(n):
        bm = [0] * k
        for c, b in enumerate(lab):
            bm[b] |= 1 << c
        for Ex in doms:
            r["frames"] += 1
            ms = frame_models(w, d, lab, bm, Ex)
            if not ms:
                continue
            r["frames_with_a50_model"] += 1
            r["a50_models"] += len(ms)
            bad = sum(not m[2] for m in ms)
            if bad:
                r["a50_not_a5"] += bad
                r["frames_a50_not_a5"] += 1
                mb = r["min_blocks_counterexample"]
                r["min_blocks_counterexample"] = k if mb is None else min(mb, k)
                if len(r["examples"]) < 3 or k < min(e["blocks"] for e in r["examples"]):
                    r["examples"].append({"blocks": k, "lab": lab, "Ex": Ex,
                                          "gstar": ms[0][1]})
                    r["examples"] = sorted(r["examples"], key=lambda e: e["blocks"])[:3]
                if everyone[Ex]:            # standard convention: the outer domain is the union
                    r["a50_not_a5_all_exist"] += bad
                    mb = r["min_blocks_all_exist"]
                    r["min_blocks_all_exist"] = k if mb is None else min(mb, k)
                    ex = r["examples_all_exist"]
                    if len(ex) < 3 or k < min(e["blocks"] for e in ex):
                        ex.append({"blocks": k, "lab": lab, "Ex": Ex, "gstar": ms[0][1]})
                        r["examples_all_exist"] = sorted(ex, key=lambda e: e["blocks"])[:3]
    r["seconds"] = round(time.time() - t, 1)
    return r


def _e14():
    p = HERE.parent / "e14_plain_necessity" / "run.py"
    spec = importlib.util.spec_from_file_location("e14", p)
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m


def crosscheck(max_cells=5):
    """Per frame, the census's A5_0 model count and A5' flags equal E14's search (definitions)."""
    e14 = _e14()
    frames = 0
    for w in range(1, 6):
        for d in range(1, 6):
            if w * d > max_cells:
                continue
            for lab, k in partitions(w * d):
                if w * d == 6 and k == 6:
                    continue        # as E14: 2^32 positive sets; settled by Lean `full_a5z_imp_a5a`
                blocks = [[c for c, b in enumerate(lab) if b == j] for j in range(k)]
                bm = [sum(1 << c for c in b) for b in blocks]
                for Ex in domains(w, d):
                    fr = e14.e13.ActualFrame(w, d, blocks, Ex)
                    ref = [m for m in e14.search(fr) if m["a50"]]
                    mine = frame_models(w, d, lab, bm, Ex)
                    assert len(ref) == len(mine), (w, d, blocks, Ex)
                    assert sorted(m["a5"] for m in ref) == sorted(m[2] for m in mine)
                    assert sorted(tuple(m["gstar"]) for m in ref) == sorted(tuple(m[1]) for m in mine)
                    frames += 1
    return frames


def countermodel_2x4():
    """The paper countermodel (LOG.md): g=0 everywhere, a=1 at world 0, c=2 and b=3 at world 1."""
    c = lambda wi, x: wi * 4 + x
    lab = [0] * 8
    for cell in (c(0, 1), c(1, 2), c(0, 3)):
        lab[cell] = 1
    for cell in (c(1, 3), c(1, 1), c(0, 2)):
        lab[cell] = 2
    Ex = sum(1 << c(wi, x) for wi, x in [(0, 0), (0, 1), (1, 0), (1, 2), (1, 3)])
    return lab, Ex


def test_countermodel():
    lab, Ex = countermodel_2x4()
    bm = [sum(1 << i for i, b in enumerate(lab) if b == j) for j in range(3)]
    assert frame_models(2, 4, lab, bm, Ex) == [(bm[0], [0], False)]
    e14 = _e14()   # the definition-level search agrees on this frame
    fr = e14.e13.ActualFrame(2, 4, [[i for i, b in enumerate(lab) if b == j] for j in range(3)], Ex)
    assert [(m["a50"], m["a5"]) for m in e14.search(fr)] == [(True, False)]


def test_crosscheck():
    assert crosscheck(4) > 0


def markdown(rows):
    L = ["| worlds | individuals | frames | frames with an A5₀ model | A5₀ models | of which A5' fails | frames with such a model | fewest blocks in a counterexample | of which every individual exists somewhere | fewest blocks then | seconds |",
         "|---|---|---|---|---|---|---|---|---|---|---|"]
    for r in rows:
        mb = r["min_blocks_counterexample"]
        L.append(f"| {r['w']} | {r['d']} | {r['frames']:,} | {r['frames_with_a50_model']:,} | "
                 f"{r['a50_models']:,} | {r['a50_not_a5']:,} | {r['frames_a50_not_a5']:,} | "
                 f"{'none' if mb is None else mb} | {r['a50_not_a5_all_exist']:,} | "
                 f"{'none' if r['min_blocks_all_exist'] is None else r['min_blocks_all_exist']} | {r['seconds']} |")
    return "\n".join(L)


if __name__ == "__main__":
    test_countermodel()
    t = time.time(); nf = crosscheck(6 if "--full-crosscheck" in sys.argv else 5)
    print(f"crosscheck vs E14 search: {nf} frames agree ({time.time() - t:.0f}s)", flush=True)
    sizes = [(4, 2), (2, 4)] + ([(3, 3)] if "--3x3" in sys.argv else [])
    rows = []
    for w, d in sizes:
        r = census(w, d); rows.append(r)
        print({k: v for k, v in r.items() if k != "examples"}, flush=True)
    out = {"crosscheck_frames": nf, "rows": rows}
    (HERE / "results.json").write_text(json.dumps(out, indent=1, sort_keys=True) + "\n")
    (HERE / "table.md").write_text(markdown(rows) + "\n")
    print(markdown(rows)); print("ok")
