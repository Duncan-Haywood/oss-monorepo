"""E13: Anderson's emendation with varying domains and an ACTUALIST "x has f necessarily".

    python3 research/theism-formal-evidence/experiments/e13_actualist_necessity/run.py

E12 read "x has f necessarily" possibilistically (x's cell has f at every world, whether or not
x exists there).  Here it is box (E!x -> f x): f contains rowE(x) = x's row & Ex.  G* and
essence both use this reading; entailment, A1, A2w, A3', NE, A5' are as in E12.

  G*(x)        for every f: f in P  iff  rowE(x) <= f
  ess(f, x)    for every g: rowE(x) <= g  iff  f & Ex <= g
  NE(x)        for every essence f of x: at every world some EXISTING y has f
  de dicto     at every world some God-like individual exists      (the argument's conclusion)
  de re        some one God-like individual exists at every world  (a necessary God-like being)

Prediction (H18, LOG.md, written before this ran).  hE(y) = union of the blocks meeting rowE(y);
G(H) = union of the full rows of the y with hE(y) = H.  (a) Models of A1, A2w, A3' are
P = {f : H <= f} for non-empty unions of blocks H with H <= G(H) and G(H) a union of blocks.
(b) NE = rows of the y with hE(y) & Ex meeting every world; A5' adds NE a union of blocks and
H <= NE.  (c) de dicto holds in every model of all four axioms, and fails in some model of the
first three.  (d) Full semantics: one model per individual existing at every world.  (e) de re
fails in some model of all four axioms under both readings (E12's and this one), never under
full semantics.

The script enumerates every domain assignment and every up-closed family of properties, applies
the axioms from the definitions, compares counts with (a) and (b), and counts de re failures
under both readings.  Writes results.json and table.md here.
"""
import importlib.util, json, sys, time
from pathlib import Path

HERE = Path(__file__).resolve().parent


def _load(name, rel):
    spec = importlib.util.spec_from_file_location(name, HERE.parent / rel / "run.py")
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m


e8 = _load("e8", "e8_restricted")
e11 = _load("e11", "e11_anderson_a2")
e12 = _load("e12", "e12_varying_domains")


class ActualFrame(e12.Frame):
    """E12's frame with box (E!x -> f x) in place of the possibilist box."""

    def has_box(self, f, x):
        r = self.row[x] & self.Ex
        return (f & r) == r


def search(fr):
    """Models of A1, A2w, A3' with flags for A5', de dicto and de re (definitions only)."""
    NE = fr.NE()
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
            continue                                            # A3' (G in algebra and in P)
        out.append({"gstar": gstar, "a5": NE in P,
                    "dicto": all(G & fr.Ex & fr.world[w] for w in range(fr.w)),
                    "re": any((fr.row[x] & fr.Ex) == fr.row[x] for x in gstar)})
    return out


def predicted(fr):
    """(a), (b) for the actualist reading from the H18 formula (no search)."""
    hE = [fr.cl(r & fr.Ex) for r in fr.row]
    NE = sum(fr.row[y] for y in range(fr.d)
             if all(hE[y] & fr.Ex & fr.world[w] for w in range(fr.w)))
    ne_alg = fr.cl(NE) == NE
    a = b = 0
    for s in range(1, 1 << fr.k):
        H = fr.to_cells(s)
        G = sum(fr.row[y] for y in range(fr.d) if hE[y] == H)
        if H & ~G or fr.cl(G) != G:
            continue
        a += 1
        b += ne_alg and not (H & ~NE)
    return a, b


SIZES = e12.SIZES


def run(sizes=SIZES):
    rows = []
    for w, d in sizes:
        t = time.time(); n = w * d
        r = {"w": w, "d": d, "frames_checked": 0, "agree_a": 0, "agree_b": 0,
             "models_A1_A2w_A3": 0, "models_all_four": 0, "a5_binds_frames": 0,
             "dicto_fails_without_A5": 0, "dicto_fails_with_A5": 0,
             "re_fails_with_A5": 0, "e12_models_all_four": 0, "e12_re_fails_with_A5": 0,
             "frames_counts_differ_from_e12": 0, "full_ok": True, "full_frames": 0,
             "full_re_fails": 0, "examples_re_fail": [], "mismatches": []}
        parts = list(e8.partitions(n))
        for Ex in e12.domains(w, d):
            for blocks in parts:
                if n == 6 and len(blocks) > 5:
                    continue
                fa, fp = ActualFrame(w, d, blocks, Ex), e12.Frame(w, d, blocks, Ex)
                ma, mp = search(fa), search(fp)
                pa, pb = predicted(fa)
                na, nb = len(ma), sum(m["a5"] for m in ma)
                r["frames_checked"] += 1
                r["agree_a"] += na == pa; r["agree_b"] += nb == pb
                if (na, nb) != (pa, pb) and len(r["mismatches"]) < 3:
                    r["mismatches"].append({"Ex": Ex, "blocks": blocks, "search": [na, nb],
                                            "predicted": [pa, pb]})
                r["models_A1_A2w_A3"] += na; r["models_all_four"] += nb
                r["a5_binds_frames"] += nb < na
                r["dicto_fails_without_A5"] += sum(not m["dicto"] for m in ma)
                r["dicto_fails_with_A5"] += sum(m["a5"] and not m["dicto"] for m in ma)
                bad = [m for m in ma if m["a5"] and not m["re"]]
                r["re_fails_with_A5"] += len(bad)
                if bad and len(r["examples_re_fail"]) < 2:
                    r["examples_re_fail"].append({"Ex": Ex, "blocks": blocks,
                                                  "gstar": bad[0]["gstar"]})
                np_ = sum(m["a5"] for m in mp)
                r["e12_models_all_four"] += np_
                r["e12_re_fails_with_A5"] += sum(m["a5"] and not m["re"] for m in mp)
                r["frames_counts_differ_from_e12"] += np_ != nb
                if len(blocks) == n:
                    nec = sum(all(Ex >> (wi * d + x) & 1 for wi in range(w)) for x in range(d))
                    r["full_frames"] += 1
                    r["full_ok"] &= nb == nec
                    r["full_re_fails"] += sum(m["a5"] and not m["re"] for m in ma)
        r["seconds"] = round(time.time() - t, 1)
        rows.append(r)
        print({k: v for k, v in r.items() if k != "examples_re_fail"}, flush=True)
    return rows


def markdown(rows):
    L = ["| worlds | individuals | frames | (a) search = formula | (b) search = formula | models of A1, A2w, A3' | of which also A5' | frames where A5' binds | de dicto fails without A5' | de dicto fails with A5' | de re fails with A5' (actualist) | E12 models of all four | de re fails with A5' (E12, possibilist) | frames where the two readings' counts differ | full semantics: models = necessary existents | seconds |",
         "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for r in rows:
        fs = f"yes ({r['full_frames']})" if r["full_frames"] and r["full_ok"] else (
            "skipped (6 blocks)" if not r["full_frames"] else "NO")
        L.append(f"| {r['w']} | {r['d']} | {r['frames_checked']} | {r['agree_a']} | {r['agree_b']} | "
                 f"{r['models_A1_A2w_A3']} | {r['models_all_four']} | {r['a5_binds_frames']} | "
                 f"{r['dicto_fails_without_A5']} | {r['dicto_fails_with_A5']} | {r['re_fails_with_A5']} | "
                 f"{r['e12_models_all_four']} | {r['e12_re_fails_with_A5']} | "
                 f"{r['frames_counts_differ_from_e12']} | {fs} | {r['seconds']} |")
    return "\n".join(L)


def test_constant_domain_readings_agree():
    # with every individual existing everywhere the two readings coincide
    for blocks in e8.partitions(4):
        fa = ActualFrame(2, 2, blocks, 15); fp = e12.Frame(2, 2, blocks, 15)
        assert len(search(fa)) == len(search(fp)) == predicted(fa)[0]


def test_shared_essence_de_re_fails():
    # 2 worlds, 2 individuals, one block; x0 exists only at w0, x1 only at w1.
    # cells: (w0,x0)=0 (w0,x1)=1 (w1,x0)=2 (w1,x1)=3
    for F in (ActualFrame, e12.Frame):
        fr = F(2, 2, [[0, 1, 2, 3]], 0b1001)
        good = [m for m in search(fr) if m["a5"]]
        assert len(good) == 1 and good[0]["gstar"] == [0, 1]
        assert good[0]["dicto"] and not good[0]["re"]


if __name__ == "__main__":
    test_constant_domain_readings_agree(); test_shared_essence_de_re_fails()
    sizes = SIZES if "--quick" not in sys.argv else SIZES[:7]
    rows = run(sizes)
    (HERE / "results.json").write_text(json.dumps(rows, indent=1, sort_keys=True) + "\n")
    (HERE / "table.md").write_text(markdown(rows) + "\n")
    print(markdown(rows)); print("ok")
