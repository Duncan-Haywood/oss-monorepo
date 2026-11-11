"""E12: Anderson's emendation (his own A2) with VARYING domains and actualist quantifiers.

    python3 research/theism-formal-evidence/experiments/e12_varying_domains/run.py

E7 to E11 used a constant domain.  Anderson (1990) intends varying domains with actualist
quantifiers.  Here each world w has a non-empty domain; Ex is the set of cells (w, y) with y
existing at w.  Properties stay possibilist (any union of blocks of a partition of all cells).

  entailment   f => g      iff  box forall y (f y -> g y), y ranging over existents,
                                i.e. f & Ex <= g (as cell sets)
  A1           f in P and f => g  implies  g in P
  A2w          f in P implies f' not in P                       (Anderson's own half)
  G*(x)        for every f: f in P  iff  x has f at every world (possibilist box, as before)
  A3'          G (the rows of the G* individuals) is in the algebra and in P
  ess(f, x)    for every g: x has g at every world  iff  f => g
  NE(x)        for every f with ess(f, x): at every world some EXISTING y has f
  A5'          NE is in the algebra and in P
  conclusion   at every world some God-like individual exists

Prediction (H17, LOG.md, written before this ran).  hull(y) = union of the blocks meeting y's
row.  (a) Models of A1, A2w, A3' are P = {f : H <= f} for non-empty unions of blocks H with
H = union of the rows of the y with hull(y) = H, and every block of H meeting Ex.  (b) A5' adds:
H & Ex meets every world, and NE is in the algebra.  (c) The conclusion holds in every model of
all four axioms, and fails at some world in some model of the first three.  (d) Full property
semantics: one model per individual existing at every world.

The script enumerates every domain assignment and every up-closed family of properties (A1
implies up-closure), applies the axioms from the definitions above, and compares the counts with
(a) and (b) computed by the formula.  Writes results.json, results.md and table.md here.
"""
import importlib.util, itertools, json, sys, time
from pathlib import Path

HERE = Path(__file__).resolve().parent


def _load(name, rel):
    spec = importlib.util.spec_from_file_location(name, HERE.parent / rel / "run.py")
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m


e8 = _load("e8", "e8_restricted")
e11 = _load("e11", "e11_anderson_a2")


def domains(w, d):
    """Every Ex: a non-empty subset of individuals at each world, as a cell bitmask."""
    rows = [m for m in range(1, 1 << d)]
    for choice in itertools.product(rows, repeat=w):
        yield sum(((choice[wi] >> xi) & 1) << (wi * d + xi) for wi in range(w) for xi in range(d))


class Frame:
    def __init__(self, w, d, blocks, Ex):
        self.w, self.d, self.Ex = w, d, Ex
        self.k = len(blocks)
        self.bmask = [sum(1 << c for c in b) for b in blocks]
        self.props = [self.to_cells(s) for s in range(1 << self.k)]
        self.full = (1 << (w * d)) - 1
        self.row = [sum(1 << (wi * d + xi) for wi in range(w)) for xi in range(d)]
        self.world = [sum(1 << (wi * d + xi) for xi in range(d)) for wi in range(w)]

    def to_cells(self, s):
        return sum(self.bmask[i] for i in range(self.k) if s >> i & 1)

    def cl(self, cells):
        """Smallest union of blocks containing the given cells."""
        return sum(m for m in self.bmask if m & cells)

    def has_box(self, f, x):
        return (f & self.row[x]) == self.row[x]

    def entails(self, f, g):
        return (f & self.Ex) & ~g == 0

    def NE(self):
        """NE as a cell set, straight from the definitions of ess and NE (actualist)."""
        out = 0
        for x in range(self.d):
            ok = True
            for f in self.props:
                if all(self.has_box(g, x) == self.entails(f, g) for g in self.props):
                    if any(not (f & self.Ex & self.world[wi]) for wi in range(self.w)):
                        ok = False; break
            if ok:
                out |= self.row[x]
        return out


def search(fr):
    """Models of A1, A2w, A3' (list), and which of them also satisfy A5' and the conclusion."""
    NE = fr.NE()
    rows = []
    for U in e11.upsets(fr.k):
        P = {fr.to_cells(s) for s in U}
        if not P or any((fr.full ^ f) in P for f in P):
            continue                                            # A2w
        if any(fr.cl(f & fr.Ex) not in P for f in P):
            continue                                            # A1 (P is already up-closed)
        gstar = [x for x in range(fr.d) if all((f in P) == fr.has_box(f, x) for f in fr.props)]
        G = sum(fr.row[x] for x in gstar)
        if G not in P:
            continue                                            # A3'
        a5 = NE in P
        concl = all(G & fr.Ex & fr.world[wi] for wi in range(fr.w))
        rows.append({"P": P, "gstar": gstar, "a5": a5, "concl": concl})
    return rows, NE


def predicted(fr):
    """(a) count without A5', (b) count with A5', from the H17 formula (no search)."""
    hull = [fr.cl(r) for r in fr.row]
    # NE by the closed form: vacuous if some block of hull(x) misses Ex, else hull(x) & Ex
    # must meet every world.
    NE = 0
    for x in range(fr.d):
        blocks_h = [m for m in fr.bmask if m & hull[x]]
        if any(not (m & fr.Ex) for m in blocks_h) or \
                all(hull[x] & fr.Ex & fr.world[wi] for wi in range(fr.w)):
            NE |= fr.row[x]
    ne_in_alg = fr.cl(NE) == NE
    a = b = 0
    for s in range(1, 1 << fr.k):
        H = fr.to_cells(s)
        if sum(fr.row[y] for y in range(fr.d) if hull[y] == H) != H:
            continue
        if any((m & H) and not (m & fr.Ex) for m in fr.bmask):
            continue
        a += 1
        if ne_in_alg and all(H & fr.Ex & fr.world[wi] for wi in range(fr.w)):
            b += 1
    return a, b


SIZES = [(1, 1), (1, 2), (2, 1), (1, 3), (3, 1), (1, 4), (2, 2), (4, 1),
         (1, 5), (5, 1), (3, 2), (2, 3)]


def run(sizes=SIZES):
    out = []
    for w, d in sizes:
        t = time.time()
        n = w * d
        r = {"w": w, "d": d, "domain_assignments": 0, "frames_checked": 0, "skipped_6_blocks": 0,
             "agree_a": 0, "agree_b": 0, "models_A1_A2w_A3": 0, "models_all_four": 0,
             "conclusion_fails_without_A5": 0, "conclusion_fails_with_A5": 0,
             "a5_binds_frames": 0, "full_semantics": [], "existence_in_algebra_models": 0,
             "existence_positive_models": 0, "constant_domain_matches_e11": True,
             "mismatches": []}
        parts = list(e8.partitions(n))
        for Ex in domains(w, d):
            r["domain_assignments"] += 1
            for blocks in parts:
                if n == 6 and len(blocks) > 5:
                    r["skipped_6_blocks"] += 1
                    continue
                fr = Frame(w, d, blocks, Ex)
                models, NE = search(fr)
                pa, pb = predicted(fr)
                na = len(models)
                nb = sum(m["a5"] for m in models)
                r["frames_checked"] += 1
                r["agree_a"] += na == pa
                r["agree_b"] += nb == pb
                if (na, nb) != (pa, pb) and len(r["mismatches"]) < 3:
                    r["mismatches"].append({"Ex": Ex, "blocks": blocks, "search": [na, nb],
                                            "predicted": [pa, pb]})
                r["models_A1_A2w_A3"] += na
                r["models_all_four"] += nb
                r["a5_binds_frames"] += nb < na
                r["conclusion_fails_without_A5"] += sum(not m["concl"] for m in models)
                r["conclusion_fails_with_A5"] += sum(m["a5"] and not m["concl"] for m in models)
                if fr.cl(Ex) == Ex:
                    for m in models:
                        if m["a5"]:
                            r["existence_in_algebra_models"] += 1
                            r["existence_positive_models"] += Ex in m["P"]
                if Ex == fr.full:
                    r["constant_domain_matches_e11"] &= nb == e11.predicted(w, d, blocks)
                if len(blocks) == n:
                    nec = sum(all(Ex >> (wi * d + x) & 1 for wi in range(w)) for x in range(d))
                    r["full_semantics"].append([nb, nec])
        fs = r.pop("full_semantics")
        r["full_semantics_frames"] = len(fs)
        r["full_semantics_models_eq_necessary_existents"] = all(a == b for a, b in fs)
        r["full_semantics_frames_with_no_model"] = sum(a == 0 for a, _ in fs)
        r["seconds"] = round(time.time() - t, 1)
        out.append(r)
        print(r, flush=True)
    return out


def markdown(rows):
    L = ["| worlds | individuals | domain assignments | frames checked | (a) search = formula | (b) search = formula | models of A1, A2w, A3' | of which also A5' | frames where A5' binds | conclusion fails without A5' | conclusion fails with A5' | full semantics: models = necessary existents | full-semantics frames with no model | seconds |",
         "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for r in rows:
        fs = f"yes ({r['full_semantics_frames']})" if r["full_semantics_frames"] and \
            r["full_semantics_models_eq_necessary_existents"] else (
            "skipped (6 blocks)" if not r["full_semantics_frames"] else "NO")
        L.append(f"| {r['w']} | {r['d']} | {r['domain_assignments']} | {r['frames_checked']} | "
                 f"{r['agree_a']} | {r['agree_b']} | {r['models_A1_A2w_A3']} | {r['models_all_four']} | "
                 f"{r['a5_binds_frames']} | {r['conclusion_fails_without_A5']} | "
                 f"{r['conclusion_fails_with_A5']} | {fs} | {r['full_semantics_frames_with_no_model']} | {r['seconds']} |")
    return "\n".join(L)


def test_constant_domain_is_e11():
    for blocks in e8.partitions(4):
        fr = Frame(2, 2, blocks, (1 << 4) - 1)
        models, _ = search(fr)
        assert sum(m["a5"] for m in models) == e11.predicted(2, 2, blocks)


def test_contingent_existent_full_semantics():
    # two worlds, two individuals; x0 exists at both worlds, x1 only at world 0.
    # cells: (w0,x0)=0 (w0,x1)=1 (w1,x0)=2 (w1,x1)=3
    fr = Frame(2, 2, [[0], [1], [2], [3]], 0b0111)
    models, _ = search(fr)
    good = [m for m in models if m["a5"]]
    assert len(good) == 1 and good[0]["gstar"] == [0] and good[0]["concl"]


def test_no_necessary_existent_no_model():
    # x0 exists only at w0, x1 only at w1: no model under full semantics.
    fr = Frame(2, 2, [[0], [1], [2], [3]], 0b1001)
    models, _ = search(fr)
    assert not any(m["a5"] for m in models)


if __name__ == "__main__":
    test_constant_domain_is_e11(); test_contingent_existent_full_semantics()
    test_no_necessary_existent_no_model()
    sizes = SIZES if "--quick" not in sys.argv else SIZES[:10]
    rows = run(sizes)
    (HERE / "results.json").write_text(json.dumps(rows, indent=1, sort_keys=True) + "\n")
    (HERE / "table.md").write_text(markdown(rows) + "\n")
    print(markdown(rows))
    print("ok")
