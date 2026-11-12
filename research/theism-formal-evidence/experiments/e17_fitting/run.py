"""E17: Fitting's variant of Goedel's argument over block algebras, with varying domains.

    python3 research/theism-formal-evidence/experiments/e17_fitting/run.py      # about 1 min

Fitting's variant as Benzmueller & Fuenmayor (2020, arXiv:1910.08955, Fig. 6) encode it.
Positive properties are extensions: sets of individuals, the same at every world.  Here the
properties are the unions of the blocks of a partition of the individuals (full semantics = the
partition into singletons).  S5 (every world sees every world), varying non-empty domains
dom[w]; an individual may exist nowhere.  E = the individuals that exist somewhere.

Definitions, read literally from the figure (actualist quantifiers over existents):
  G x at w      iff  x is in every Y with P_w(Y)
  A1a, A1b      exactly one of Y and its complement is in P_w
  A2            P_w(X) and (X & E) <= Y  gives  P_w(Y)
  T2            the extension of G at w is a property and is in P_w
  E Y x         x in Y, and for every Z containing x: (Y & E) <= Z
  NE x          for every essence Y of x and every world v: Y & dom[v] non-empty
  A5            the extension of NE is a property and is in P_w
  A4 (optional) P_w the same at every world; B&F's Fig. 6 does not list it.
Conclusions: de dicto, at every world w some x in dom[w] is God-like at w; de re, one x is
God-like at every world and exists at every world.

The search is definition-level: at each world every positive set allowed by A1 (one of each
complement pair) is tried against A2, T2 and A5.  Nothing in those conditions mentions the world
at which they are evaluated (NE quantifies over all worlds), so the admissible positive sets are
the same set S at every world; models with A4 are S, without A4 are S^|W|, and both are
enumerated to test the conclusions.  The search's counts are compared with H21's closed form
(LOG.md, written before this ran): with kE blocks that have an existent somewhere and kN blocks
that have an existent at every world, models of A1, A2, T2 number kE per world, adding A5 kN.
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
    """ext[Y] = bitmask of individuals in the union of the blocks in Y."""
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
    return ext


def base_sets(m, ext, E):
    """Every P (a frozenset of property codes) satisfying A1a, A1b, A2, T2, and its G."""
    full = (1 << m) - 1
    pairs = [Y for Y in range(1 << m) if Y < (full ^ Y)]
    inv = {e: Y for Y, e in enumerate(ext)}
    out = []
    for choice in range(1 << len(pairs)):
        P = set()
        for i, Y in enumerate(pairs):
            P.add(Y if (choice >> i) & 1 else full ^ Y)
        ok = True
        for X in P:
            xe = ext[X] & E
            for Y in range(1 << m):
                if (xe & ~ext[Y]) == 0 and Y not in P:
                    ok = False
                    break
            if not ok:
                break
        if not ok:
            continue
        g = -1
        for Y in P:
            g &= ext[Y]
        g &= ext[full]
        if g not in inv or inv[g] not in P:   # T2
            continue
        out.append((frozenset(P), g))
    return out


def ne_mask(d, m, ext, dom, E):
    full_ind = (1 << d) - 1
    ne = 0
    for x in range(d):
        ok = True
        for Y in range(1 << m):
            if not (ext[Y] >> x & 1):
                continue
            ess = all((ext[Y] & E & ~ext[Z]) == 0 for Z in range(1 << m) if ext[Z] >> x & 1)
            if ess and any((ext[Y] & dv) == 0 for dv in dom):
                ok = False
                break
        if ok:
            ne |= 1 << x
    return ne & full_ind


def run(sizes):
    stats = {}
    mism = []
    examples = {"de_re_fail_A4": None, "multi_god_all_necessary": None}
    base_cache = {}
    for d, w in sizes:
        key = f"{w}x{d}"
        st = dict(frames=0, base_A4=0, base_noA4=0, models_A4=0, models_noA4=0,
                  ne_not_in_algebra=0, dedicto_fail_withA5=0, dedicto_fail_base_A4=0,
                  dedicto_fail_base_noA4=0, dere_fail_A4=0, dere_fail_noA4=0,
                  full_frames=0, full_models_A4=0, full_necessary=0, full_dere_fail_A4=0,
                  full_dere_fail_noA4=0, full_multi_god=0, coarse_multi_god_A4=0,
                  godlike_not_everywhere_A4=0, dedicto_fail_withA5_noA4=0,
                  ne_wider_than_ne0=0)
        for lab, m in partitions(d):
            ext = ext_table(lab, m)
            singletons = m == d
            for dom in itertools.product(range(1, 1 << d), repeat=w):
                E = 0
                for dv in dom:
                    E |= dv
                ck = (tuple(lab), E)
                if ck not in base_cache:
                    base_cache[ck] = base_sets(m, ext, E)
                S0 = base_cache[ck]
                st["frames"] += 1
                ne = ne_mask(d, m, ext, dom, E)
                ne0 = -1
                for dv in dom:
                    ne0 &= dv
                ne0 &= (1 << d) - 1
                inv = {e: Y for Y, e in enumerate(ext)}
                if ne != ne0:
                    st["ne_wider_than_ne0"] += 1
                if ne not in inv:
                    st["ne_not_in_algebra"] += 1
                S = [(P, g) for P, g in S0 if ne in inv and inv[ne] in P]
                # closed form
                blocks = [ext[1 << b] for b in range(m)]
                kE = sum(1 for b in blocks if b & E)
                kN = sum(1 for b in blocks if all(b & dv for dv in dom))
                if len(S0) != kE or len(S) != kN:
                    mism.append(dict(size=key, lab=lab, dom=dom, base=len(S0), kE=kE,
                                     a5=len(S), kN=kN))
                st["base_A4"] += len(S0)
                st["base_noA4"] += len(S0) ** w
                st["models_A4"] += len(S)
                st["models_noA4"] += len(S) ** w
                # conclusions, A4 (one P at all worlds)
                for P, g in S0:
                    if not all(g & dv for dv in dom):
                        st["dedicto_fail_base_A4"] += 1
                for P, g in S:
                    if not all(g & dv for dv in dom):
                        st["dedicto_fail_withA5"] += 1
                    dere = any((g >> x & 1) and all(dv >> x & 1 for dv in dom) for x in range(d))
                    if not dere:
                        st["dere_fail_A4"] += 1
                        if examples["de_re_fail_A4"] is None:
                            examples["de_re_fail_A4"] = dict(size=key, partition=lab, dom=dom, G=g)
                        if singletons:
                            st["full_dere_fail_A4"] += 1
                    if bin(g).count("1") > 1:
                        st["coarse_multi_god_A4"] += 1
                        if (g & ~ne0) == 0 and w > 1 and examples["multi_god_all_necessary"] is None:
                            examples["multi_god_all_necessary"] = dict(size=key, partition=lab, dom=dom, G=g)
                        if singletons:
                            st["full_multi_god"] += 1
                    if g & ~ne0:
                        st["godlike_not_everywhere_A4"] += 1
                # without A4: a P per world
                for tup in itertools.product(S0, repeat=w):
                    if not all(tup[i][1] & dom[i] for i in range(w)):
                        st["dedicto_fail_base_noA4"] += 1
                for tup in itertools.product(S, repeat=w):
                    if not all(tup[i][1] & dom[i] for i in range(w)):
                        st["dedicto_fail_withA5_noA4"] += 1
                    dere = any(all((tup[i][1] >> x & 1) and (dom[i] >> x & 1) for i in range(w))
                               for x in range(d))
                    if not dere:
                        st["dere_fail_noA4"] += 1
                        if singletons:
                            st["full_dere_fail_noA4"] += 1
                if singletons:
                    st["full_frames"] += 1
                    st["full_models_A4"] += len(S)
                    st["full_necessary"] += bin(ne).count("1")
        stats[key] = st
        print(key, st, flush=True)
    return stats, mism, examples


if __name__ == "__main__":
    t = time.time()
    sizes = [(d, w) for d in (1, 2, 3, 4) for w in (1, 2, 3)] + [(3, 4), (5, 1), (5, 2)]
    stats, mism, examples = run(sizes)
    out = dict(sizes=[f"{w}x{d}" for d, w in sizes], stats=stats, mismatches=mism[:20],
               n_mismatches=len(mism), examples=examples, seconds=round(time.time() - t, 1))
    (HERE / "results.json").write_text(json.dumps(out, indent=1))
    keys = ["frames", "models_A4", "models_noA4", "ne_not_in_algebra", "dedicto_fail_withA5", "dedicto_fail_withA5_noA4",
            "dedicto_fail_base_A4", "dedicto_fail_base_noA4", "dere_fail_A4", "dere_fail_noA4",
            "full_dere_fail_A4", "full_dere_fail_noA4", "full_multi_god", "coarse_multi_god_A4",
            "godlike_not_everywhere_A4", "ne_wider_than_ne0"]
    lines = ["| worlds x individuals | " + " | ".join(keys) + " |", "|" + "---|" * (len(keys) + 1)]
    tot = {k: 0 for k in keys}
    for s in out["sizes"]:
        lines.append(f"| {s} | " + " | ".join(f"{stats[s][k]:,}" for k in keys) + " |")
        for k in keys:
            tot[k] += stats[s][k]
    lines.append("| **all** | " + " | ".join(f"{tot[k]:,}" for k in keys) + " |")
    (HERE / "table.md").write_text("\n".join(lines) + "\n")
    print("mismatches", len(mism), "examples", examples, "seconds", out["seconds"])
    sys.exit(1 if mism else 0)
