"""E14: E13's setting with A5' replaced by A5_0, "exists at every world" is positive.

    python3 research/theism-formal-evidence/experiments/e14_plain_necessity/run.py

E13 found that Anderson's axioms with varying domains and an actualist "x has f necessarily"
prove de dicto ("at every world something God-like exists") but not de re ("some God-like
individual exists at every world"): Anderson's NE ("every essence of x is exemplified at every
world") can be met by other individuals' cells in a coarse algebra.  Here NE is replaced by plain
necessary existence, NE_0(x) iff x exists at every world, and A5_0 says the property whose cells
are the full rows of the necessary existents is positive (so it must be in the algebra).

Prediction (H19, LOG.md, written before this ran).  (a) In every model of A1, A2w, A3', A5_0
every God-like individual exists at every world.  (b) De dicto holds too.  (c) With E13's H and
G(H): models of all four are the H with NE_0 a union of blocks and H <= NE_0.  (d) NE_0 <= NE
always; the model sets are not nested (E13's de re countermodels satisfy A5' and not A5_0; and,
a guess, some frame has an A5_0 model where A5' fails).  (e) Full semantics: the same models as
A5', one per necessary existent.

The search enumerates every domain assignment and every up-closed positive family on E13's
frames, applies the axioms from the definitions, and compares with (c).  Writes results.json
and table.md here.
"""
import importlib.util, json, sys, time
from pathlib import Path

HERE = Path(__file__).resolve().parent


def _load(name, rel):
    spec = importlib.util.spec_from_file_location(name, HERE.parent / rel / "run.py")
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m


e13 = _load("e13", "e13_actualist_necessity")
e8, e11, e12 = e13.e8, e13.e11, e13.e12


def ne0(fr):
    """Cells of the individuals that exist at every world."""
    return sum(r for r in fr.row if (r & fr.Ex) == r)


def search(fr):
    """Models of A1, A2w, A3' (actualist reading) with flags for A5', A5_0, de dicto, de re."""
    NE, N0 = fr.NE(), ne0(fr)
    out = []
    for U in e11.upsets(fr.k):
        P = {fr.to_cells(s) for s in U}
        if not P or any((fr.full ^ f) in P for f in P):
            continue                                            # A2w
        if any(fr.cl(f & fr.Ex) not in P for f in P):
            continue                                            # A1
        gstar = [x for x in range(fr.d) if all((f in P) == fr.has_box(f, x) for f in fr.props)]
        G = sum(fr.row[x] for x in gstar)
        if G not in P:
            continue                                            # A3'
        nec = [x for x in gstar if (fr.row[x] & fr.Ex) == fr.row[x]]
        out.append({"gstar": gstar, "a5": NE in P, "a50": N0 in P,
                    "dicto": all(G & fr.Ex & fr.world[w] for w in range(fr.w)),
                    "re_some": bool(nec), "re_all": len(nec) == len(gstar)})
    return out


def predicted(fr):
    """(c) from the H19 formula, using E13's H and G(H) (no search)."""
    hE = [fr.cl(r & fr.Ex) for r in fr.row]
    N0 = ne0(fr)
    if fr.cl(N0) != N0:
        return 0
    c = 0
    for s in range(1, 1 << fr.k):
        H = fr.to_cells(s)
        G = sum(fr.row[y] for y in range(fr.d) if hE[y] == H)
        if H & ~G or fr.cl(G) != G:
            continue
        c += not (H & ~N0)
    return c


SIZES = e12.SIZES


def run(sizes=SIZES):
    rows = []
    for w, d in sizes:
        t = time.time(); n = w * d
        r = {"w": w, "d": d, "frames_checked": 0, "agree_c": 0, "ne0_subset_ne": 0,
             "models_A1_A2w_A3": 0, "models_a5": 0, "models_a50": 0, "models_both": 0,
             "a50_not_a5": 0, "a5_not_a50": 0, "a5_not_a50_re_fails": 0,
             "a50_dicto_fails": 0, "a50_re_some_fails": 0, "a50_re_all_fails": 0,
             "a5_re_all_fails": 0, "full_ok": True, "full_frames": 0,
             "examples_a50_not_a5": [], "mismatches": []}
        parts = list(e8.partitions(n))
        for Ex in e12.domains(w, d):
            for blocks in parts:
                if n == 6 and len(blocks) > 5:
                    continue
                fr = e13.ActualFrame(w, d, blocks, Ex)
                ms = search(fr)
                pc = predicted(fr)
                nc = sum(m["a50"] for m in ms)
                r["frames_checked"] += 1
                r["agree_c"] += nc == pc
                r["ne0_subset_ne"] += (ne0(fr) & ~fr.NE()) == 0
                if nc != pc and len(r["mismatches"]) < 3:
                    r["mismatches"].append({"Ex": Ex, "blocks": blocks, "search": nc,
                                            "predicted": pc})
                r["models_A1_A2w_A3"] += len(ms)
                r["models_a5"] += sum(m["a5"] for m in ms)
                r["models_a50"] += nc
                r["models_both"] += sum(m["a5"] and m["a50"] for m in ms)
                odd = [m for m in ms if m["a50"] and not m["a5"]]
                r["a50_not_a5"] += len(odd)
                if odd and len(r["examples_a50_not_a5"]) < 2:
                    r["examples_a50_not_a5"].append({"Ex": Ex, "blocks": blocks,
                                                     "gstar": odd[0]["gstar"]})
                r["a5_not_a50"] += sum(m["a5"] and not m["a50"] for m in ms)
                r["a5_not_a50_re_fails"] += sum(m["a5"] and not m["a50"] and not m["re_some"]
                                                for m in ms)
                r["a50_dicto_fails"] += sum(m["a50"] and not m["dicto"] for m in ms)
                r["a50_re_some_fails"] += sum(m["a50"] and not m["re_some"] for m in ms)
                r["a50_re_all_fails"] += sum(m["a50"] and not m["re_all"] for m in ms)
                r["a5_re_all_fails"] += sum(m["a5"] and not m["re_all"] for m in ms)
                if len(blocks) == n:
                    nec = sum(all(Ex >> (wi * d + x) & 1 for wi in range(w)) for x in range(d))
                    r["full_frames"] += 1
                    r["full_ok"] &= nc == nec == sum(m["a5"] for m in ms)
        r["seconds"] = round(time.time() - t, 1)
        rows.append(r)
        print({k: v for k, v in r.items() if not k.startswith("examples")}, flush=True)
    return rows


def markdown(rows):
    L = ["| worlds | individuals | frames | (c) search = formula | NE₀ &sube; NE | models of A1, A2w, A3' | + A5' (E13) | + A5₀ | both | A5₀ not A5' | A5' not A5₀ | of which de re fails | de dicto fails with A5₀ | some God-like individual not necessary, with A5₀ | same with A5' | full semantics: A5₀ = A5' = necessary existents | seconds |",
         "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for r in rows:
        fs = f"yes ({r['full_frames']})" if r["full_frames"] and r["full_ok"] else (
            "skipped (6 blocks)" if not r["full_frames"] else "NO")
        L.append(f"| {r['w']} | {r['d']} | {r['frames_checked']} | {r['agree_c']} | {r['ne0_subset_ne']} | "
                 f"{r['models_A1_A2w_A3']} | {r['models_a5']} | {r['models_a50']} | {r['models_both']} | "
                 f"{r['a50_not_a5']} | {r['a5_not_a50']} | {r['a5_not_a50_re_fails']} | "
                 f"{r['a50_dicto_fails']} | {r['a50_re_all_fails']} | {r['a5_re_all_fails']} | {fs} | {r['seconds']} |")
    return "\n".join(L)


def test_e13_countermodel_fails_a50():
    # E13's smallest de re countermodel: one block, x0 only at w0, x1 only at w1.
    fr = e13.ActualFrame(2, 2, [[0, 1, 2, 3]], 0b1001)
    ms = search(fr)
    assert [m["a5"] for m in ms] == [True] and [m["a50"] for m in ms] == [False]
    assert predicted(fr) == 0


def test_constant_domain_a50_is_a5():
    # everyone exists everywhere: NE_0 is every cell, so A5_0 always holds, and so does A5'
    for blocks in e8.partitions(4):
        fr = e13.ActualFrame(2, 2, blocks, 15)
        ms = search(fr)
        assert all(m["a50"] and m["a5"] for m in ms) and predicted(fr) == len(ms)


if __name__ == "__main__":
    test_e13_countermodel_fails_a50(); test_constant_domain_a50_is_a5()
    sizes = SIZES if "--quick" not in sys.argv else SIZES[:7]
    rows = run(sizes)
    (HERE / "results.json").write_text(json.dumps(rows, indent=1, sort_keys=True) + "\n")
    (HERE / "table.md").write_text(markdown(rows) + "\n")
    print(markdown(rows)); print("ok")
