"""E19: every claim of the AFP formalisation of Anderson's variant, checked in our finite semantics,
and which of S5's frame conditions each step of the argument uses.

    python3 research/theism-formal-evidence/experiments/e19_afp_anderson/run.py   # a few minutes

Source: Fuenmayor & Benzmueller, "Types, Tableaus and Goedel's God in Isabelle/HOL", Archive of
Formal Proofs (2017), theory AndersonProof.thy (read from the AFP's GitHub mirror,
isabelle-prover/mirror-afp-devel, thys/Types_Tableaus_and_Goedels_God), which follows Fitting's
book, pp. 169-171, and Anderson (1990).

Semantics (E12's, generalised to the AFP's logic):
  worlds 0..w-1, ANY accessibility relation R; S5 = R an equivalence relation.  Domains dom[v]
  arbitrary, possibly empty.  A cell is (world, individual); Ex = the existing cells.  Properties
  (intensions, type up<0>) are the unions of the blocks of a partition of the cells (full
  semantics = singletons).  P_w is a set of properties per world, not assumed rigid.
  For a world w: SC_w = the cells at R-successors of w, S_w = SC_w & Ex, Rx_w = x's cells in SC_w.
Definitions, read from AndersonProof.thy:
  box (Y x) at w   Rx_w <= Y
  G x at w         for every Y: P_w(Y) iff box (Y x)                      (God-like, G^A)
  X => Y at w      box forall^E z (X z -> Y z):  X & S_w <= Y
  A1a              P_w(X) gives not P_w(complement X)          (Axiom 11.3A, Anderson's half)
  A2               P_w(X) and X => Y at w give P_w(Y)          (Axiom 11.5)
  T2               G (a cell set) is in the algebra and P_w(G)  (posited, Prop. 11.16)
  A4a              P_w(X) gives P_v(X) for every v in R[w]     (Axiom 11.11)
  E Y x at w       for every Z: box (Z x) iff Y => Z           (Def. 11.34; no "Y x" conjunct)
  NE x at w        every Y with E Y x at w has an existent at every v in R[w]  (Def. 11.35)
  A5               NE (cell set) is in the algebra and P_w(NE)  (Axiom 11.37)
Stages as in the file: I = A1a A2 T2; II = I + A4a; III = II + A5.  "III-noA4" = I + A5.

How models are enumerated (exact).  By A1a and A2, P_w is determined by the traces of its members
on S_w and is an intersecting up-set of those traces (the blocks meeting S_w); every such family
is a candidate.  If some x is God-like at w, P_w = N(x, w) = {Y : Rx_w <= Y}.  So each world is
either "godly" (P_w one of the N(x, w)) or "godless" (P_w equals no N(y, w), and nobody is
God-like there).  The godly/godless pattern fixes G; godless worlds then range over every
intersecting up-set that contains G's trace (and NE's, with A5) and equals no N(y, w).  Stages
without A4a are counted per pattern (worlds are independent); stages with A4a are enumerated
model by model with A4a as the constraint.  Frames where a godless world has 6 trace blocks are
skipped (1,422,564 candidates per world) and counted as skipped.

Prediction H23 is in LOG.md, written before this script existed.
"""
import importlib.util, itertools, json, sys, time
from pathlib import Path

HERE = Path(__file__).resolve().parent


def _load(name, rel):
    spec = importlib.util.spec_from_file_location(name, HERE.parent / rel / "run.py")
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m


e8 = _load("e8", "e8_restricted")
e12 = _load("e12", "e12_varying_domains")


# ---- intersecting up-sets of 2^[n] as bitmasks over the 2^n subsets ----------------------------
_IU = {}


def inter_upsets(n):
    """Every up-set U of subsets of range(n) with no two disjoint members (A1a), as a bitmask
    over subsets.  Built from intersecting antichains of non-empty sets (counts 1, 2, 4, 12, 81,
    2646 for n = 0..5)."""
    if n in _IU:
        return _IU[n]
    subs = list(range(1, 1 << n))
    up_of = {A: sum(1 << B for B in range(1 << n) if B & A == A) for A in subs}
    out = []

    def rec(i, ch, mask):
        out.append(mask)
        for j in range(i, len(subs)):
            A = subs[j]
            if all((A & B) and (A & B) != A and (A & B) != B for B in ch):
                ch.append(A); rec(j + 1, ch, mask | up_of[A]); ch.pop()
    rec(0, [], 0)
    _IU[n] = out
    return out


# ---- frames ------------------------------------------------------------------------------------
def relations(w, cls):
    out = []
    for bits in range(1 << (w * w)):
        R = [(bits >> (i * w)) & ((1 << w) - 1) for i in range(w)]
        f = flags(R, w)
        if cls == "all" or (cls == "s4" and f["r"] and f["t"]) or (cls == "s5" and f["r"] and f["s"] and f["t"]):
            out.append(R)
    return out


def flags(R, w):
    r = all(R[i] >> i & 1 for i in range(w))
    s = all((R[j] >> i & 1) == (R[i] >> j & 1) for i in range(w) for j in range(w))
    t = all(not (R[i] >> j & 1 and R[j] >> k & 1) or R[i] >> k & 1
            for i in range(w) for j in range(w) for k in range(w))
    return {"r": r, "s": s, "t": t, "serial": all(R[i] for i in range(w)),
            "universal": all(R[i] == (1 << w) - 1 for i in range(w))}


def fclass(f):
    """K, T, B, K4, ... named by which of reflexive / symmetric / transitive hold."""
    return {(0, 0, 0): "K", (1, 0, 0): "T", (0, 1, 0): "KB", (0, 0, 1): "K4", (1, 1, 0): "B",
            (1, 0, 1): "S4", (0, 1, 1): "KB4", (1, 1, 1): "S5"}[(int(f["r"]), int(f["s"]), int(f["t"]))]


class Frame:
    def __init__(self, w, d, R, dom, blocks):
        self.w, self.d, self.R, self.dom = w, d, R, dom
        self.cell = lambda v, y: v * d + y
        self.k = len(blocks)
        self.bm = [sum(1 << c for c in b) for b in blocks]
        self.props = [sum(self.bm[i] for i in range(self.k) if s >> i & 1) for s in range(1 << self.k)]
        self.index = {c: s for s, c in enumerate(self.props)}
        self.nprops = 1 << self.k
        self.world = [sum(1 << self.cell(v, y) for y in range(d)) for v in range(w)]
        self.row = [sum(1 << self.cell(v, y) for v in range(w)) for y in range(d)]
        self.Ex = sum(1 << self.cell(v, y) for v in range(w) for y in range(d) if dom[v] >> y & 1)
        self.SC = [sum(self.world[v] for v in range(w) if R[u] >> v & 1) for u in range(w)]
        self.S = [self.SC[u] & self.Ex for u in range(w)]
        self.Rx = [[self.row[y] & self.SC[u] for y in range(d)] for u in range(w)]
        # traces: the blocks meeting S_w, and each property's trace on them
        self.tb = [[i for i in range(self.k) if self.bm[i] & self.S[u]] for u in range(w)]
        self.tr = [[sum(1 << j for j, i in enumerate(self.tb[u]) if s >> i & 1) for s in range(self.nprops)]
                   for u in range(w)]
        self.N = [[self.pset(lambda s, u=u, y=y: (self.props[s] & self.Rx[u][y]) == self.Rx[u][y])
                   for y in range(d)] for u in range(w)]
        self.NE = self.ne()

    def pset(self, pred):
        return sum(1 << s for s in range(self.nprops) if pred(s))

    def in_alg(self, cells):
        return cells in self.index

    # definition-level checks (used to validate candidates and in the statements)
    def local_ok(self, u, P):
        """A1a and A2 at world u, straight from the definitions."""
        full = self.nprops - 1
        for X in range(self.nprops):
            if P >> X & 1:
                if P >> (full ^ X) & 1:
                    return False
                xs = self.props[X] & self.S[u]
                for Y in range(self.nprops):
                    if (xs & ~self.props[Y]) == 0 and not (P >> Y & 1):
                        return False
        return True

    def godlike(self, u, P):
        return [y for y in range(self.d) if P == self.N[u][y]]

    def ess(self, u, Y, y):
        return all(((self.props[Z] & self.Rx[u][y]) == self.Rx[u][y]) ==
                   ((Y & self.S[u] & ~self.props[Z]) == 0) for Z in range(self.nprops))

    def ne(self):
        out = 0
        for u in range(self.w):
            for y in range(self.d):
                if all(not self.ess(u, self.props[Y], y) or
                       all(self.props[Y] & self.Ex & self.world[v] for v in range(self.w) if self.R[u] >> v & 1)
                       for Y in range(self.nprops)):
                    out |= 1 << self.cell(u, y)
        return out

    def from_trace(self, u, U):
        return sum(1 << s for s in range(self.nprops) if U >> self.tr[u][s] & 1)


# ---- statements --------------------------------------------------------------------------------
# A model is (fr, P tuple, G cells).  World statements f(fr, P, G, u) -> bool.

def succ(fr, u):
    return [v for v in range(fr.w) if fr.R[u] >> v & 1]


def s_D(fr, P, G, u): return fr.R[u] != 0
def s_T1(fr, P, G, u): return all(fr.props[X] & fr.S[u] for X in range(fr.nprops) if P[u] >> X & 1)
def s_T3(fr, P, G, u): return bool(G & fr.S[u])
def s_A4b(fr, P, G, u): return all((P[v] & ~P[u]) == 0 for v in succ(fr, u))
def s_rigid(fr, P, G, u): return all(P[v] == P[u] for v in succ(fr, u))
def s_ess(fr, P, G, u): return all(fr.ess(u, G, y) for y in range(fr.d) if G >> fr.cell(u, y) & 1)
def _nec_ex(fr, G, u): return all(G & fr.Ex & fr.world[v] for v in succ(fr, u))
def s_GEINE(fr, P, G, u): return not (G & fr.world[u]) or _nec_ex(fr, G, u)
def s_PEINE(fr, P, G, u): return not any(G & fr.world[v] for v in succ(fr, u)) or _nec_ex(fr, G, u)
def s_GNE(fr, P, G, u): return _nec_ex(fr, G, u)
def s_nonempty(fr, P, G, u): return fr.dom[u] != 0


def g_T4(fr, P, G):
    """T4 (global consequence): if dia exists G holds at every world, box exists^E G does."""
    if all(any(G & fr.world[v] for v in succ(fr, u)) for u in range(fr.w)):
        return all(_nec_ex(fr, G, u) for u in range(fr.w))
    return True


def g_collapse(fr, P, G):
    """Modal collapse (forall Phi. Phi -> box Phi) is valid in the model iff no world sees another."""
    return all(fr.R[u] & ~(1 << u) == 0 for u in range(fr.w))


# (name, function, stage the AFP states it at, what the file reports, AFP frame condition)
WORLD = [
    ("D (seriality, forced)", s_D, "I", "not stated (our check of H23 c)", "K"),
    ("T1: P X -> dia exists^E X", s_T1, "I", "proved", "K"),
    ("T3: dia exists^E G", s_T3, "I", "proved", "K"),
    ("A4b: not P X -> box not P X", s_A4b, "II", "proved (A4a, symm)", "S5"),
    ("rigidPred P", s_rigid, "II", "proved (A4a, A4b)", "S5"),
    ("GodIsEssential: G x -> E G x", s_ess, "II", "proved (refl, A4a, A2, T2)", "S5"),
    ("GodExistenceImpliesNecExistence: exists G -> box exists^E G", s_GEINE, "III", "proved", "S5"),
    ("possExistenceImpliesNecEx: dia exists G -> box exists^E G", s_PEINE, "III", "proved (symm, tran)", "S5"),
    ("GodNecExists: box exists^E G", s_GNE, "III", "proved (T3, T4)", "S5"),
    ("non-empty domain (not in the file)", s_nonempty, "III", "not stated", "S5"),
]
GLOBAL = [
    ("T4: valid(dia exists G) -> valid(box exists^E G)", g_T4, "III", "proved (global consequence)", "S5"),
    ("modal collapse", g_collapse, "III", "countersatisfiable (Nitpick)", "S5"),
]
STAGES = ["I", "II", "III", "III-noA4"]
LATER = {"I": ["I", "II", "III", "III-noA4"], "II": ["II", "III"], "III": ["III", "III-noA4"]}


# ---- model enumeration -------------------------------------------------------------------------
def options(fr):
    """Per world: the distinct godly choices N(x, w) that pass A1a and A2."""
    out = []
    for u in range(fr.w):
        seen = []
        for y in range(fr.d):
            N = fr.N[u][y]
            if N not in seen and fr.local_ok(u, N):
                seen.append(N)
        out.append(seen)
    return out


def godless(fr, u, G, need_ne):
    """Every P_u with A1a, A2, T2 (and A5 if need_ne) that equals no N(y, u)."""
    n = len(fr.tb[u])
    if n >= 6:
        return None
    gi, ni = fr.index.get(G), fr.index.get(fr.NE)
    if gi is None or (need_ne and ni is None):
        return []
    gt, nt = fr.tr[u][gi], (fr.tr[u][ni] if need_ne else None)
    out = []
    for U in inter_upsets(n):
        if not (U >> gt & 1) or (need_ne and not (U >> nt & 1)):
            continue
        P = fr.from_trace(u, U)
        if P not in fr.N[u]:
            out.append(P)
    return out


def models(fr, cap=200000):
    """Yield (stage set, P tuple, G) for enumerated models and per-stage counts.

    Returns dict with counts per stage, and a list of (stages, P, G) for the statement checks:
    stage-I/III-noA4 models are represented once per godly/godless pattern (statements other than
    T1/A4b/rigid depend only on the pattern), stage-II/III models are enumerated in full.
    """
    opts = options(fr)
    counts = {s: 0 for s in STAGES}
    reps, skipped = [], False
    for pat in itertools.product(*[[None] + o for o in opts]):
        G = 0
        for u, P in enumerate(pat):
            if P is not None:
                for y in fr.godlike(u, P):
                    G |= 1 << fr.cell(u, y)
        if not fr.in_alg(G):
            continue
        gi = fr.index[G]
        if any(P is not None and not (P >> gi & 1) for P in pat):
            continue                                                       # T2 at godly worlds
        ne_ok = fr.in_alg(fr.NE)
        nei = fr.index.get(fr.NE)
        for need_ne in (False, True):
            if need_ne and not ne_ok:
                continue
            if need_ne and any(P is not None and not (P >> nei & 1) for P in pat):
                continue
            lists = []
            for u, P in enumerate(pat):
                if P is not None:
                    lists.append([P])
                else:
                    L = godless(fr, u, G, need_ne)
                    if L is None:
                        skipped = True; L = []
                    lists.append(L)
            n = 1
            for L in lists:
                n *= len(L)
            if n == 0:
                continue
            st = "III-noA4" if need_ne else "I"
            counts[st] += n
            # one representative per pattern for the pattern-level statements (P of the godless
            # worlds: the first candidate; T1 holds for every candidate by A1a, checked below)
            reps.append((st, tuple(L[0] for L in lists), G, n))
            # A4a: backtracking over worlds
            sel = [None] * fr.w

            def rec(i):
                if i == fr.w:
                    yield tuple(sel); return
                for P in lists[i]:
                    ok = True
                    for v in range(i):
                        if fr.R[v] >> i & 1 and (sel[v] & ~P):
                            ok = False; break
                        if fr.R[i] >> v & 1 and (P & ~sel[v]):
                            ok = False; break
                    if ok:
                        sel[i] = P
                        yield from rec(i + 1)
                sel[i] = None
            st2 = "III" if need_ne else "II"
            for Pt in rec(0):
                counts[st2] += 1
                reps.append((st2, Pt, G, 1))
                if counts[st2] > cap:
                    raise RuntimeError("cap")
    return counts, reps, skipped


def run(sizes, log=None):
    t0 = time.time()
    fails = {}      # (statement, stage, class) -> [failures, models]
    smallest = {}   # (statement, stage) -> first countermodel at the smallest size
    e12cmp = {"frames": 0, "agree_III": 0, "agree_II": 0, "disagree": []}
    tot = {s: 0 for s in STAGES}
    nframes = nskipped = 0
    t1_bad = 0
    sat = {s: None for s in STAGES}
    for (w, d, rcls, maxb) in sizes:
        rels = relations(w, rcls)
        doms = list(itertools.product(range(1 << d), repeat=w))
        parts = [p for p in e8.partitions(w * d) if (len(p) <= maxb if maxb else len(p) == w * d)]
        for R in rels:
            f = flags(R, w)
            cls = fclass(f)
            for dom in doms:
                for blocks in parts:
                    fr = Frame(w, d, R, list(dom), blocks)
                    nframes += 1
                    counts, reps, skipped = models(fr)
                    nskipped += skipped
                    for s in STAGES:
                        tot[s] += counts[s]
                        if counts[s] and sat[s] is None:
                            sat[s] = (w, d)
                    full = len(blocks) == w * d
                    for st, Pt, G, n in reps:
                        # T1 for every model: the godless candidates are intersecting up-sets, so
                        # check the representative and assert the trace lists exclude the empty trace
                        for name, fn, stage, rep, _ in WORLD:
                            if st not in LATER[stage]:
                                continue
                            if name.startswith(("A4b", "rigid")) and st == "III-noA4":
                                continue      # needs P at godless worlds; III-noA4 is per pattern
                            key = (name, st, cls, "full" if full else "coarse")
                            rec_ = fails.setdefault(key, [0, 0])
                            rec_[1] += n
                            bad = sum(not fn(fr, Pt, G, u) for u in range(w)) > 0
                            if bad:
                                rec_[0] += n
                                sk = (name, st, cls)
                                if sk not in smallest:
                                    smallest[sk] = {"worlds": w, "individuals": d, "blocks": len(blocks),
                                                    "R": R, "dom": list(dom), "P": [bin(p) for p in Pt],
                                                    "G": bin(G)}
                        for name, fn, stage, rep, _ in GLOBAL:
                            if st not in ("III", "III-noA4"):
                                continue
                            key = (name, st, cls, "full" if full else "coarse")
                            rec_ = fails.setdefault(key, [0, 0])
                            rec_[1] += n
                            if not fn(fr, Pt, G):
                                rec_[0] += n
                                sk = (name, st, cls)
                                if sk not in smallest:
                                    smallest[sk] = {"worlds": w, "individuals": d, "blocks": len(blocks),
                                                    "R": R, "dom": list(dom), "P": [bin(p) for p in Pt],
                                                    "G": bin(G)}
                    # H23 (d): one class, non-empty domains -> E12's formula
                    if f["universal"] and all(dom):
                        Ex = sum(1 << (v * d + y) for v in range(w) for y in range(d) if dom[v] >> y & 1)
                        a, b = e12.predicted(e12.Frame(w, d, blocks, Ex))
                        e12cmp["frames"] += 1
                        e12cmp["agree_II"] += counts["II"] == a
                        e12cmp["agree_III"] += counts["III"] == b
                        if counts["II"] != a or counts["III"] != b:
                            e12cmp["disagree"].append([w, d, blocks, list(dom), counts["II"], a, counts["III"], b])
        if log:
            print(f"  {w}x{d} {rcls} <= {maxb} blocks: {nframes} frames so far, {time.time() - t0:.0f}s",
                  file=log, flush=True)
    return {"frames": nframes, "skipped_frames": nskipped, "models": tot, "first_model_size": sat,
            "fails": {"|".join(k): v for k, v in fails.items()},
            "smallest": {"|".join(k): v for k, v in smallest.items()},
            "e12": e12cmp, "seconds": round(time.time() - t0, 1)}


SIZES = [  # (worlds, individuals, relation class, max blocks)
    (1, 1, "all", 9), (1, 2, "all", 9), (1, 3, "all", 9), (1, 4, "all", 9), (1, 5, "all", 9),
    (2, 1, "all", 9), (2, 2, "all", 9), (3, 1, "all", 9), (2, 3, "all", 9), (3, 2, "all", 9),
    (4, 1, "s4", 9), (5, 1, "s5", 9), (4, 1, "all", 0), (2, 4, "all", 0),
]   # max blocks 0 = full semantics only


def summary(res):
    """Per statement and stage: frame classes with failures and without."""
    agg = {}
    for key, (bad, n) in res["fails"].items():
        name, st, cls, alg = key.split("|")
        a = agg.setdefault((name, st), {})
        c = a.setdefault(cls, [0, 0, 0, 0])   # full bad, full n, coarse bad, coarse n
        off = 0 if alg == "full" else 2
        c[off] += bad; c[off + 1] += n
    return agg


ORDER = ["K", "T", "KB", "K4", "B", "S4", "KB4", "S5"]


def markdown(res):
    agg = summary(res)
    lines = ["| statement | stage | " + " | ".join(ORDER) + " |", "|---|---|" + "---|" * len(ORDER)]
    names = [n for n, *_ in WORLD] + [n for n, *_ in GLOBAL]
    for name in names:
        for st in STAGES:
            if (name, st) not in agg:
                continue
            row = []
            for cls in ORDER:
                c = agg[(name, st)].get(cls)
                if not c or c[1] + c[3] == 0:
                    row.append("·")
                else:
                    row.append(f"{c[0] + c[2]:,}/{c[1] + c[3]:,}")
            lines.append(f"| {name} | {st} | " + " | ".join(row) + " |")
    return "\n".join(lines) + "\n"


# ---- tests (also run from test_theism.py) ------------------------------------------------------
def test_inter_upset_counts():
    assert [len(inter_upsets(n)) for n in range(6)] == [1, 2, 4, 12, 81, 2646]


def test_candidates_satisfy_local_axioms():
    fr = Frame(2, 2, [3, 3], [1, 3], [[0], [1], [2], [3]])
    for u in range(2):
        for P in godless(fr, u, fr.row[0], False) or []:
            assert fr.local_ok(u, P)


def test_one_world_one_individual():
    fr = Frame(1, 1, [1], [1], [[0]])
    counts, _, _ = models(fr)
    assert counts["III"] == 1


if __name__ == "__main__":
    sizes = SIZES
    if len(sys.argv) > 1 and sys.argv[1] == "--quick":
        sizes = SIZES[:7]
    res = run(sizes, log=sys.stderr)
    (HERE / "results.json").write_text(json.dumps(res, indent=1))
    (HERE / "table.md").write_text(markdown(res))
    print(json.dumps({k: res[k] for k in ("frames", "skipped_frames", "models", "first_model_size", "seconds")}))
    print(json.dumps({k: v for k, v in res["e12"].items() if k != "disagree"}), len(res["e12"]["disagree"]))
