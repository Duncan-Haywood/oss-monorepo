"""E18: every claim of the AFP formalisation of Fitting's variant, checked in our finite semantics.

    python3 research/theism-formal-evidence/experiments/e18_afp_crosscheck/run.py   # a few minutes

Source: Fuenmayor & Benzmueller, "Types, Tableaus and Goedel's God in Isabelle/HOL", Archive of
Formal Proofs (2017), theory FittingProof.thy (read from the AFP's GitHub mirror,
isabelle-prover/mirror-afp-devel, thys/Types_Tableaus_and_Goedels_God).  Each statement below
names the lemma it transcribes; `expect` is what the AFP file reports (proved by Isabelle, or
"nitpick ... oops" = countersatisfiable).

Semantics (as E17, generalised to the AFP's logic):
  worlds 0..w-1 with ANY accessibility relation R (the AFP proves its theorems in K and adds S5
  only for modal collapse); S5 = R an equivalence relation.  Domains dom[v] are arbitrary,
  possibly empty (the AFP's existsAt is an unconstrained constant).  Individuals 0..d-1;
  extensions (Fitting's properties, type <0>) are the unions of the blocks of a partition of the
  individuals (full semantics = singletons; otherwise a coarse, Henkin-style algebra).  P_w is a
  set of extensions per world.  An intension (type up<0>) is a function from worlds to
  extensions.  Propositions (for D and modal collapse) are all sets of worlds.
Definitions, read from FittingProof.thy:
  G x at w        x in every Y with P_w(Y)                  (G_w = the extension of G at w)
  G* x at w       for all Y: P_w(Y) iff x in Y
  X => Y at w     box forall^E z (X z -> Y z): (X & Ew) <= Y, Ew = union of dom[v], v in R[w]
  A1a, A1b        exactly one of Y and its complement is in P_w
  A2              P_w(X) and X => Y give P_w(Y)
  T2              G_w is an extension in the algebra and P_w(G_w)
  A4a             P_w(X) gives P_v(X) for every v in R[w]
  E Y x at w      x in Y and for all Z containing x: Y => Z
  NE x at w       every essence Y of x (at w) has an existent at every v in R[w]
  A5              NE_w (the extension at w) is in the algebra and P_w(NE_w)
Stages, as in the file: I = A1a A1b A2 T2; II = I + A4a; III = II + A5.  "III-noA4" = I + A5,
the reading of B&F 2020 Fig. 6, which lists no A4.

Two quantifications over intensions are decided exactly by a shortcut stated at the point of use
(T1b: the intension's values off w are unconstrained); Q4 enumerates every intension.
Prediction H22 is in LOG.md, written before this ran.
"""
import itertools, json, sys, time
from pathlib import Path

HERE = Path(__file__).resolve().parent


def partitions(n):
    lab = [0] * n

    def rec(i, m):
        if i == n:
            yield list(lab), m
            return
        for b in range(m + 1):
            lab[i] = b
            yield from rec(i + 1, max(m, b + 1))
    yield from rec(0, 0)


def ext_table(lab, m):
    bm = [0] * m
    for x, b in enumerate(lab):
        bm[b] |= 1 << x
    ext = []
    for Y in range(1 << m):
        e = 0
        for b in range(m):
            if Y >> b & 1:
                e |= bm[b]
        ext.append(e)
    return ext, bm


def gmask(P, ext, d):
    g = (1 << d) - 1
    for Y in P:
        g &= ext[Y]
    return g


def base_sets(m, d, ext, inv, Ew):
    """Every P_w allowed by A1a, A1b, A2, T2 at a world whose successors' existents are Ew."""
    full = (1 << m) - 1
    pairs = [Y for Y in range(1 << m) if Y < (full ^ Y)]
    out = []
    for choice in range(1 << len(pairs)):
        P = frozenset(Y if (choice >> i) & 1 else full ^ Y for i, Y in enumerate(pairs))
        ok = True
        for X in P:
            xe = ext[X] & Ew
            for Y in range(1 << m):
                if (xe & ~ext[Y]) == 0 and Y not in P:
                    ok = False
                    break
            if not ok:
                break
        if not ok:
            continue
        g = gmask(P, ext, d)
        if g in inv and inv[g] in P:
            out.append(P)
    return out


def relations(w, s5_only):
    out = []
    for bits in range(1 << (w * w)):
        R = [(bits >> (i * w)) & ((1 << w) - 1) for i in range(w)]
        eq = (all(R[i] >> i & 1 for i in range(w))
              and all((R[j] >> i & 1) == (R[i] >> j & 1) for i in range(w) for j in range(w))
              and all(not (R[i] >> j & 1 and R[j] >> k & 1) or R[i] >> k & 1
                      for i in range(w) for j in range(w) for k in range(w)))
        if s5_only and not eq:
            continue
        out.append((R, eq))
    return out


def succ(Rw, w):
    return [v for v in range(w) if Rw >> v & 1]


# ---- statements -------------------------------------------------------------------------------
# Each model statement is f(M, w) -> bool at world w; valid = true at every world.
# M: dict(w, d, R, dom, ext, inv, m, P (tuple per world), G (tuple), Gs (tuple, G*), NE, Ew)

def st_D(M, w):                       # lemma D: box phi -> dia phi for all phi; iff R[w] non-empty
    return M["R"][w] != 0


def st_defs_equiv(M, w):              # GodDefsAreEquivalent: G x <-> G* x
    return M["G"][w] == M["Gs"][w]


def st_T1a(M, w):                     # T1a: P X -> dia exists^E z. X z  (X an extension)
    S = succ(M["R"][w], M["w"])
    return all(any(M["ext"][X] & M["dom"][v] for v in S) for X in M["P"][w])


def st_T1b(M, w):                     # T1b, X an intension: P (down X) -> dia exists^E X
    # Countersatisfied at w iff some Y in P_w has (w not in R[w] or Y & dom[w] empty): take X(w) = Y
    # and X(v) = the empty extension at every v != w.  Exact, since X off w is unconstrained.
    for Y in M["P"][w]:
        if not (M["R"][w] >> w & 1) or (M["ext"][Y] & M["dom"][w]) == 0:
            return False
    return True


def st_T3_dere(M, w):                 # T3_deRe: (lambda X. dia exists^E X) (down G)
    return any(M["G"][w] & M["dom"][v] for v in succ(M["R"][w], M["w"]))


def st_T3_dedicto(M, w):              # T3_deDicto: dia exists^E (down G)
    return any(M["G"][v] & M["dom"][v] for v in succ(M["R"][w], M["w"]))


def st_A4b(M, w):                     # A4b: not P X -> box not P X
    for X in range(1 << M["m"]):
        if X not in M["P"][w] and any(X in M["P"][v] for v in succ(M["R"][w], M["w"])):
            return False
    return True


def _essence(M, w, Ymask, x):
    if not (Ymask >> x & 1):
        return False
    ye = Ymask & M["Ew"][w]
    return all((ye & ~e) == 0 for e in M["ext"] if e >> x & 1)


def st_god_essential(M, w):           # GodIsEssential: G x -> E (down G) x
    g = M["G"][w]
    return all(_essence(M, w, g, x) for x in range(M["d"]) if g >> x & 1)


def st_godstar_essential(M, w):       # God_starIsEssential: G* x -> E (down G*) x
    g = M["Gs"][w]
    return all(_essence(M, w, g, x) for x in range(M["d"]) if g >> x & 1)


def st_ex_nec_v1(M, w):               # GodExImpliesNecEx_v1: exists (down G) -> box exists^E (down G)
    if not M["G"][w]:
        return True
    return all(M["G"][v] & M["dom"][v] for v in succ(M["R"][w], M["w"]))


def st_ex_nec_v2(M, w):               # GodExImpliesNecEx_v2: exists (down G) -> (lambda X. box exists^E X)(down G)
    if not M["G"][w]:
        return True
    return all(M["G"][w] & M["dom"][v] for v in succ(M["R"][w], M["w"]))


def st_poss_nec_v1(M, w):             # possExImpliesNecEx_v1: dia exists (down G) -> box exists^E (down G)
    S = succ(M["R"][w], M["w"])
    if not any(M["G"][v] for v in S):
        return True
    return all(M["G"][v] & M["dom"][v] for v in S)


def st_poss_nec_v2(M, w):             # possExImpliesNecEx_v2: (lambda X. dia exists^E X)(down G) -> (lambda X. box exists^E X)(down G)
    S = succ(M["R"][w], M["w"])
    if not any(M["G"][w] & M["dom"][v] for v in S):
        return True
    return all(M["G"][w] & M["dom"][v] for v in S)


def st_nec_v1(M, w):                  # GodNecExists_v1 (de dicto): box exists^E (down G)
    return all(M["G"][v] & M["dom"][v] for v in succ(M["R"][w], M["w"]))


def st_nec_v2(M, w):                  # GodNecExists_v2 (de re): (lambda X. box exists^E X)(down G)
    return all(M["G"][w] & M["dom"][v] for v in succ(M["R"][w], M["w"]))


def st_star_nec_v1(M, w):             # God_starNecExists_v1
    return all(M["Gs"][v] & M["dom"][v] for v in succ(M["R"][w], M["w"]))


def st_star_nec_v2(M, w):             # God_starNecExists_v2
    return all(M["Gs"][w] & M["dom"][v] for v in succ(M["R"][w], M["w"]))


def st_collapse(M, w):                # forall Phi. Phi -> box Phi; fails iff R[w] has a world other than w
    return (M["R"][w] & ~(1 << w)) == 0


def st_U1(M, w):                      # B&F 2020 U1 (Fitting): P_w is an ultrafilter of the algebra
    P, ext, m = M["P"][w], M["ext"], M["m"]
    if 0 in P:
        return False
    for X in P:
        for Y in range(1 << m):
            if (ext[X] & ~ext[Y]) == 0 and Y not in P:
                return False
        for Y in P:
            if (X & Y) not in P:
                return False
    return True


def st_principal_block(M, w):         # P_w = "contains b" for one block b
    P, m = M["P"][w], M["m"]
    return any(P == frozenset(Y for Y in range(1 << m) if Y >> b & 1) for b in range(m))


def st_one_being(M, w):               # E17's stronger de re (not an AFP statement): one x, God-like and
    S = succ(M["R"][w], M["w"])        # existing at every accessible world
    return any(all(M["G"][v] >> x & 1 and M["dom"][v] >> x & 1 for v in S) for x in range(M["d"]))


def st_no_empty_domain(M, w):         # (f): no world with an empty domain
    return M["dom"][w] != 0


MODEL_STATEMENTS = [
    # name, function, first stage it is stated at, AFP's report
    ("D (axioms imply seriality)", st_D, "I", "proved"),
    ("GodDefsAreEquivalent", st_defs_equiv, "I", "proved"),
    ("T1a", st_T1a, "I", "proved"),
    ("T1b", st_T1b, "I", "nitpick"),
    ("T3_deRe", st_T3_dere, "I", "proved"),
    ("T3_deDicto", st_T3_dedicto, "I", "nitpick"),
    ("U1: P is an ultrafilter (B&F 2020)", st_U1, "I", "proved"),
    ("P principal, generated by a block (H22 d)", st_principal_block, "I", "predicted"),
    ("A4b", st_A4b, "II", "proved"),
    ("GodIsEssential", st_god_essential, "II", "proved"),
    ("God_starIsEssential", st_godstar_essential, "II", "proved"),
    ("GodExImpliesNecEx_v1", st_ex_nec_v1, "III", "proved"),
    ("GodExImpliesNecEx_v2", st_ex_nec_v2, "III", "proved"),
    ("possExImpliesNecEx_v1", st_poss_nec_v1, "III", "proved"),
    ("possExImpliesNecEx_v2", st_poss_nec_v2, "III", "proved"),
    ("GodNecExists_v1 (de dicto)", st_nec_v1, "III", "proved"),
    ("GodNecExists_v2 (de re)", st_nec_v2, "III", "proved"),
    ("God_starNecExists_v1", st_star_nec_v1, "III", "proved"),
    ("God_starNecExists_v2", st_star_nec_v2, "III", "proved"),
    ("modal collapse", st_collapse, "III", "nitpick"),
    ("no empty domain (H22 f)", st_no_empty_domain, "III", "predicted"),
    ("one necessary God-like being (E17's de re; not in the AFP)", st_one_being, "III", "not stated"),
]
STAGES = ["I", "II", "III", "III-noA4"]
STAGE_INCLUDES = {"I": {"I"}, "II": {"I", "II"}, "III": {"I", "II", "III"},
                  "III-noA4": {"I", "III"}}


def T4(M, pre, post):                 # global consequence: valid(pre) -> valid(post)
    W = range(M["w"])
    return not all(pre(M, w) for w in W) or all(post(M, w) for w in W)


def t4_v1(M):
    return T4(M, lambda M, w: any(M["G"][v] for v in succ(M["R"][w], M["w"])), st_nec_v1)


def t4_v2(M):
    return T4(M, st_T3_dere, st_nec_v2)


GLOBAL_STATEMENTS = [("T4_v1", t4_v1, "III", "proved"), ("T4_v2", t4_v2, "III", "proved")]


def q4_frame(R, dom, ext, m, w):
    """Countersatisfiable: box exists^E Q <-> (lambda X. box exists^E X)(down Q), Q an intension.
    Returns True if valid on the frame (every intension, every world)."""
    for Q in itertools.product(range(1 << m), repeat=w):
        for u in range(w):
            S = succ(R[u], w)
            lhs = all(ext[Q[v]] & dom[v] for v in S)
            rhs = all(ext[Q[u]] & dom[v] for v in S)
            if lhs != rhs:
                return False
    return True


# ---- search -----------------------------------------------------------------------------------

def new_rec():
    return dict(models=0, fail=0, smallest=None, example=None)


def run(sizes):
    recs = {}

    def rec(name, stage, logic, sem):
        return recs.setdefault((name, stage, logic, sem), new_rec())

    def note(name, stage, s5, full, ok, size, ex):
        for logic in (["K", "S5"] if s5 else ["K"]):
            for sem in ("full" if full else "coarse", "all"):
                r = rec(name, stage, logic, sem)
                r["models"] += 1
                if not ok:
                    r["fail"] += 1
                    if r["smallest"] is None or size < tuple(r["smallest"]):
                        r["smallest"] = list(size)
                        r["example"] = ex

    frames_done = {}
    for w, d, s5_only in sizes:
        key = f"{w}x{d}" + (" S5" if s5_only else "")
        t0 = time.time()
        nframes = 0
        nmodels = {s: 0 for s in STAGES}
        rels = relations(w, s5_only)
        for lab, m in partitions(d):
            ext, bm = ext_table(lab, m)
            inv = {e: Y for Y, e in enumerate(ext)}
            full = m == d
            base_cache = {}
            for R, eq in rels:
                for dom in itertools.product(range(1 << d), repeat=w):
                    nframes += 1
                    Ew = []
                    for u in range(w):
                        e = 0
                        for v in succ(R[u], w):
                            e |= dom[v]
                        Ew.append(e)
                    lists = []
                    for u in range(w):
                        if Ew[u] not in base_cache:
                            base_cache[Ew[u]] = base_sets(m, d, ext, inv, Ew[u])
                        lists.append(base_cache[Ew[u]])
                    if any(not L for L in lists):
                        continue
                    # NE at each world
                    NE = []
                    for u in range(w):
                        S = succ(R[u], w)
                        ne = 0
                        for x in range(d):
                            ok = True
                            for Y in range(1 << m):
                                if not (ext[Y] >> x & 1):
                                    continue
                                ye = ext[Y] & Ew[u]
                                if all((ye & ~e) == 0 for e in ext if e >> x & 1):
                                    if any((ext[Y] & dom[v]) == 0 for v in S):
                                        ok = False
                                        break
                            if ok:
                                ne |= 1 << x
                        NE.append(ne)
                    size = (w, d, m)
                    q4_done = False
                    for Ptup in itertools.product(*lists):
                        a4 = all(X in Ptup[v] for u in range(w) for X in Ptup[u]
                                 for v in succ(R[u], w))
                        a5 = all(NE[u] in inv and inv[NE[u]] in Ptup[u] for u in range(w))
                        G = tuple(gmask(Ptup[u], ext, d) for u in range(w))
                        Gs = tuple(sum(1 << x for x in range(d)
                                       if all((Y in Ptup[u]) == bool(ext[Y] >> x & 1)
                                              for Y in range(1 << m))) for u in range(w))
                        M = dict(w=w, d=d, R=R, dom=dom, ext=ext, inv=inv, m=m, P=Ptup, G=G,
                                 Gs=Gs, NE=NE, Ew=Ew)
                        ex = dict(size=key, partition=lab, R=R, dom=list(dom),
                                  P=[sorted(p) for p in Ptup], G=list(G))
                        in_stage = {"I": True, "II": a4, "III": a4 and a5, "III-noA4": a5}
                        for stg in STAGES:
                            if not in_stage[stg]:
                                continue
                            nmodels[stg] += 1
                            for name, f, first, _ in MODEL_STATEMENTS:
                                if first not in STAGE_INCLUDES[stg]:
                                    continue
                                ok = all(f(M, u) for u in range(w))
                                note(name, stg, eq, full, ok, size, ex)
                            for name, f, first, _ in GLOBAL_STATEMENTS:
                                if first in STAGE_INCLUDES[stg]:
                                    note(name, stg, eq, full, f(M), size, ex)
                        if not q4_done:   # a frame property; counted once per frame with a model
                            q4_done = True
                            ok = q4_frame(R, dom, ext, m, w)
                            note("Q4: box exists^E Q <-> (lambda X. box exists^E X)(down Q)",
                                 "I", eq, full, ok, size, dict(size=key, partition=lab, R=R,
                                                                dom=list(dom)))
        frames_done[key] = dict(frames=nframes, models=nmodels, seconds=round(time.time() - t0, 1))
        print(key, frames_done[key], flush=True)
    return recs, frames_done


SIZES = [(1, 1, False), (1, 2, False), (1, 3, False), (1, 4, False),
         (2, 1, False), (2, 2, False), (2, 3, False), (2, 4, False),
         (3, 1, False), (3, 2, False), (3, 3, False),
         (3, 4, True), (4, 2, True), (4, 3, True)]


def main():
    sizes = SIZES
    if "--quick" in sys.argv:
        sizes = [s for s in SIZES if s[0] * s[1] <= 6 and not s[2]]
    recs, frames = run(sizes)
    expect = {n: (first, rep) for n, _, first, rep in MODEL_STATEMENTS + GLOBAL_STATEMENTS}
    expect["Q4: box exists^E Q <-> (lambda X. box exists^E X)(down Q)"] = ("I", "nitpick")
    rows = []
    for (name, stage, logic, sem), r in sorted(recs.items(), key=lambda kv: kv[0]):
        rows.append(dict(statement=name, stage=stage, logic=logic, semantics=sem,
                         afp=expect[name][1], **r))
    out = dict(sizes=[list(s) for s in sizes], frames=frames, rows=rows)
    if "--quick" not in sys.argv:
        (HERE / "results.json").write_text(json.dumps(out, indent=1))
    # table: one line per statement x stage, K/S5 x full/coarse fail counts
    order = [n for n, *_ in MODEL_STATEMENTS + GLOBAL_STATEMENTS] + [
        "Q4: box exists^E Q <-> (lambda X. box exists^E X)(down Q)"]
    idx = {(r["statement"], r["stage"], r["logic"], r["semantics"]): r for r in rows}
    lines = ["| statement | AFP | stage | K full | K coarse | S5 full | S5 coarse | smallest countermodel, K | smallest, S5 |",
             "|---|---|---|---|---|---|---|---|---|"]
    for name in order:
        for stg in STAGES:
            cells = []
            any_row = False
            for logic in ("K", "S5"):
                for sem in ("full", "coarse"):
                    r = idx.get((name, stg, logic, sem))
                    if r:
                        any_row = True
                        cells.append(f"{r['fail']:,} / {r['models']:,}")
                    else:
                        cells.append("–")
            if not any_row:
                continue
            ra = idx.get((name, stg, "K", "all"))
            sm = ra["smallest"] if ra and ra["smallest"] else None
            rs = idx.get((name, stg, "S5", "all"))
            ss = rs["smallest"] if rs and rs["smallest"] else None
            lines.append(f"| {name} | {expect[name][1]} | {stg} | " + " | ".join(cells)
                         + f" | {tuple(sm) if sm else '–'} | {tuple(ss) if ss else '–'} |")
    table = "\n".join(lines) + "\n"
    if "--quick" not in sys.argv:
        (HERE / "table.md").write_text(table)
    print(table)


if __name__ == "__main__":
    main()
