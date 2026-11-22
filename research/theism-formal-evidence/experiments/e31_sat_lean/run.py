"""E31: check that the Lean predicate `Enc` (lean/TheismFormal/AndersonSAT.lean) is E30's `encode`.

    python3 research/theism-formal-evidence/experiments/e31_sat_lean/run.py   # ~1 min, stdlib

The Lean proof (H35 (a) to (d), LOG.md) is about `Enc`, one constructor per line of
`experiments/e30_sat/run.py`'s `encode`.  This script is H35 (e): it writes the clauses the
eleven constructors allow, with named variables ('a', x), ('s', x), ('p', t), ('q', t), and
compares them as a set with `encode`'s numbered clauses (renamed back through its own variable
maps), on every relation on 1 to 4 worlds and every (w, v) with w R v.  It also checks (d): the
pairs with v separable from w but not w R v, where `encode` must be unsatisfiable whenever every
separating A misses v.
"""
import importlib.util, itertools, json
from pathlib import Path

HERE = Path(__file__).resolve().parent


def _load(name):
    spec = importlib.util.spec_from_file_location(name + "_run", HERE.parent / name / "run.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


e30 = _load("e30_sat")


def lean_clauses(R, w, v):
    """The clauses `Enc succ w v` admits, constructor by constructor."""
    T = e30.reach(R, v)
    out = {(("+", "a", v),), (("-", "s", v),)}                       # av, sv
    out |= {(("+", "a", x),) for x in R[w] if x in T}                 # aw
    for t in T:
        N = R[t]
        if not N:
            continue
        for y in N:                                                   # pa, ps, qa, qs
            out |= {(("-", "p", t), ("+", "a", y)), (("-", "p", t), ("+", "s", y)),
                    (("-", "q", t), ("-", "a", y)), (("-", "q", t), ("-", "s", y))}
        out.add((("+", "p", t),) + tuple(("-", "a", y) for y in N))  # pA
        out.add((("+", "p", t),) + tuple(("-", "s", y) for y in N))  # pS
        out.add((("+", "q", t),) + tuple(("+", "a", y) for y in N))  # qA
        out.add((("+", "q", t),) + tuple(("+", "s", y) for y in N))  # qS
    return {frozenset(c) for c in out}


def encode_named(R, w, v):
    """`encode`'s clauses with its variable numbers renamed: a and s through its maps, and the
    two fresh variables per world with successors in the order `encode` allocates them."""
    cl, a, s, n = e30.encode(R, w, v)
    name = {i: ("a", x) for x, i in a.items()}
    name.update({i: ("s", x) for x, i in s.items()})
    k = 2 * len(a)
    for t in sorted(e30.reach(R, v)):
        if R[t]:
            name[k + 1], name[k + 2] = ("p", t), ("q", t)
            k += 2
    assert k == n
    return [frozenset(("+" if l > 0 else "-",) + name[abs(l)] for l in c) for c in cl]


def main():
    rows, relations, pairs, dupes, mism = [], 0, 0, 0, 0
    nonsucc = sep_nonsucc = unsat_sep_nonsucc = 0
    for n in range(1, 5):
        rel_n = pair_n = mism_n = 0
        for bits in itertools.product(range(1 << n), repeat=n):
            R = {t: [x for x in range(n) if bits[t] >> x & 1] for t in range(n)}
            rel_n += 1
            for w in range(n):
                for v in range(n):
                    if v in R[w]:
                        pair_n += 1
                        got = encode_named(R, w, v)
                        dupes += len(got) - len(set(got))
                        if set(got) != lean_clauses(R, w, v):
                            mism_n += 1
                    elif n <= 3:
                        nonsucc += 1
                        if e30.separable_brute(R, n, w, v):
                            sep_nonsucc += 1
                            if e30.separable_sat(R, w, v, solver=e30.dpll) is None:
                                unsat_sep_nonsucc += 1
        rows.append({"worlds": n, "relations": rel_n, "pairs_wRv": pair_n, "mismatches": mism_n})
        relations += rel_n; pairs += pair_n; mism += mism_n
    d_frame = {0: [], 1: [1]}
    out = {"by_size": rows, "relations": relations, "pairs": pairs, "mismatches": mism,
           "duplicate_clauses_in_encode": dupes,
           "non_successor_pairs_up_to_3": nonsucc, "separable_non_successor": sep_nonsucc,
           "separable_non_successor_unsat": unsat_sep_nonsucc,
           "d_frame_separable": e30.separable_brute(d_frame, 2, 0, 1),
           "d_frame_sat": e30.separable_sat(d_frame, 0, 1, solver=e30.dpll) is not None}
    (HERE / "results.json").write_text(json.dumps(out, indent=1) + "\n")
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
