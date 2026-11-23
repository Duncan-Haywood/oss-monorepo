"""E32: seven Catholic-Orthodox disputes in one claim set (H36, LOG.md 2026-11-23).

Enumerates every minimal inconsistent subset (MUS) and every maximal consistent subset
(MSS) of the 25 claims with MARCO (Liffiton et al. 2016) over a SAT grounding, rechecks
each MUS with src/logic.py's own decision procedure (unsatisfiable, every one-smaller
subset satisfiable), and computes the minimum hitting sets H36 (d) asks for.

    "$PY" research/theism-formal-evidence/experiments/e32_church_cruxes/run.py
needs python-sat (PySAT); writes results.json and results.md next to this file.

Attributions of definitions to documents are from the standard histories and were not
checked against the texts this session (the proxy refused every source host); see
SOURCES and the LOG entry.
"""
import json
import sys
import time
from itertools import combinations
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from logic import A, All, And, Imp, Not, P, _ground, constants, fo_model, show, subformulas  # noqa: E402

ExC = lambda x: P("ExCathedra", x)  # noqa: E731
Ecu = lambda x: P("Ecumenical", x)  # noqa: E731
Err = lambda x: P("Erred", x)  # noqa: E731
PAPAL = All("x", Imp(ExC("x"), Not(Err("x"))))           # a1
COUNCIL = All("y", Imp(Ecu("y"), Not(Err("y"))))         # a2

# (id, side, text, formula, source).  side: shared | catholic | orthodox
CLAIMS = [
    ("a2", "shared", "What an ecumenical council defines cannot be in error", COUNCIL,
     "common to both: Orthodox for the seven councils, Catholic for the twenty-one"),
    ("c2", "shared", "What an ecumenical council condemns as heresy is error",
     All("z", Imp(P("Condemned", "z"), Err("z"))), "E1 claim c2"),
    ("c3", "shared", "Constantinople III condemned Honorius's letter as heresy", P("Condemned", "h"),
     "Constantinople III (681), 13th session"),
    ("fL", "shared", "Lyon II defined the Filioque", Imp(Not(A("Filioque")), Err("lyon2")),
     "Lyon II (1274), constitution on the procession of the Holy Spirit (unchecked)"),
    ("fF1", "shared", "Florence defined the Filioque", Imp(Not(A("Filioque")), Err("flor")),
     "Florence, Laetentur caeli (1439) (unchecked)"),
    ("fF2", "shared", "Florence defined purgatory", Imp(Not(A("Purgatory")), Err("flor")),
     "Florence, Laetentur caeli (1439) (unchecked)"),
    ("fF3", "shared", "Florence defined the primacy of the Roman pontiff", Imp(Not(A("Primacy")), Err("flor")),
     "Florence, Laetentur caeli (1439) (unchecked)"),
    ("fT", "shared", "Trent defined purgatory", Imp(Not(A("Purgatory")), Err("trent")),
     "Trent, session 25, decree on purgatory (1563) (unchecked)"),
    ("fV3", "shared", "Vatican I defined Roman primacy of jurisdiction", Imp(Not(A("Primacy")), Err("v1")),
     "Vatican I, Pastor Aeternus ch. 3 (1870) (unchecked)"),
    ("fV4", "shared", "Vatican I defined papal infallibility", Imp(Not(PAPAL), Err("v1")),
     "Vatican I, Pastor Aeternus ch. 4 (1870) (unchecked)"),
    ("fI", "shared", "Ineffabilis Deus defined the Immaculate Conception", Imp(Not(A("ImmConc")), Err("ineff")),
     "Pius IX, Ineffabilis Deus (1854) (unchecked)"),
    ("fM", "shared", "Munificentissimus Deus defined the Assumption", Imp(Not(A("Assumption")), Err("munif")),
     "Pius XII, Munificentissimus Deus (1950) (unchecked)"),
    ("a1", "catholic", "What a pope defines ex cathedra cannot be in error", PAPAL,
     "Vatican I, Pastor Aeternus ch. 4 (1870)"),
    ("sL", "catholic", "Lyon II was ecumenical", Ecu("lyon2"), "Catholic numbering: 14th council"),
    ("sF", "catholic", "Florence was ecumenical", Ecu("flor"), "Catholic numbering: 17th council"),
    ("sT", "catholic", "Trent was ecumenical", Ecu("trent"), "Catholic numbering: 19th council"),
    ("sV", "catholic", "Vatican I was ecumenical", Ecu("v1"), "Catholic numbering: 20th council"),
    ("sI", "catholic", "Ineffabilis Deus is an ex cathedra definition", ExC("ineff"), "standard Catholic reading"),
    ("sM", "catholic", "Munificentissimus Deus is an ex cathedra definition", ExC("munif"), "standard Catholic reading"),
    ("dF", "orthodox", "The Filioque is false", Not(A("Filioque")), "1895 Patriarchal Encyclical (unchecked)"),
    ("dP", "orthodox", "Purgatory as the Latins define it is false", Not(A("Purgatory")),
     "1895 Patriarchal Encyclical; Mark of Ephesus at Ferrara (1438) (unchecked)"),
    ("dR", "orthodox", "Roman primacy of jurisdiction is false", Not(A("Primacy")), "1895 Patriarchal Encyclical (unchecked)"),
    ("dI", "orthodox", "The Immaculate Conception is false", Not(A("ImmConc")), "1895 Patriarchal Encyclical (unchecked)"),
    ("dA1", "orthodox", "Ex cathedra papal teaching can be in error", Not(PAPAL), "1895 Patriarchal Encyclical (unchecked)"),
    ("dH", "orthodox", "Honorius's letter was ex cathedra", ExC("h"), "E1's Orthodox reading (E1 claim c4)"),
]
IDS = [c[0] for c in CLAIMS]
SIDE = {c[0]: c[1] for c in CLAIMS}
FORM = {c[0]: c[3] for c in CLAIMS}


# ------------------------------------------------------------------ grounding to CNF
class CNF:
    def __init__(self):
        self.n = 0
        self.var = {}
        self.clauses = []

    def v(self, key):
        if key not in self.var:
            self.n += 1
            self.var[key] = self.n
        return self.var[key]

    def fresh(self):
        self.n += 1
        return self.n

    def lit(self, g):
        """Tseitin: a literal equivalent to grounded formula g."""
        t = g[0]
        if t == "var":
            return self.v(g[1])
        if t == "top" or t == "bot":
            x = self.fresh()
            self.clauses.append([x] if t == "top" else [-x])
            return x
        if t == "not":
            return -self.lit(g[1])
        a, b = self.lit(g[1]), self.lit(g[2])
        if t == "imp":
            a, t = -a, "or"
        x = self.fresh()
        if t == "and":
            self.clauses += [[-x, a], [-x, b], [x, -a, -b]]
        elif t == "or":
            self.clauses += [[-x, a, b], [x, -a], [x, -b]]
        elif t == "iff":
            self.clauses += [[-x, -a, b], [-x, a, -b], [x, a, b], [x, -a, -b]]
        return x


def build(ids):
    """Selector literal per claim: sel -> claim, over the domain fo_model would use."""
    whole = And(*[FORM[i] for i in ids])
    cs = constants(whole)
    m = max(1, len(cs) + sum(1 for g in subformulas(whole) if g[0] in ("all", "ex")))
    env = {c: k for k, c in enumerate(cs)}
    cnf = CNF()
    sel = {}
    for i in ids:
        s = cnf.fresh()
        sel[i] = s
        cnf.clauses.append([-s, cnf.lit(_ground(FORM[i], env, m))])
    return cnf, sel, m


def marco(ids):
    from pysat.solvers import Solver
    cnf, sel, m = build(ids)
    sat = Solver(name="cd15", bootstrap_with=cnf.clauses)
    idx = {sel[i]: i for i in ids}
    mp = Solver(name="cd15")           # map solver over selectors: unexplored seeds
    S = [sel[i] for i in ids]
    muses, msses = [], []

    def is_sat(xs):
        return sat.solve(assumptions=list(xs))

    while mp.solve(assumptions=[]):
        model = set(l for l in mp.get_model() if l > 0)
        seed = [s for s in S if s in model]
        # grow seeds maximally when SAT, so bias the map towards "true"
        if is_sat(seed):
            cur = set(seed)
            for s in S:
                if s not in cur and is_sat(cur | {s}):
                    cur.add(s)
            msses.append(sorted(idx[s] for s in cur))
            mp.add_clause([s for s in S if s not in cur])           # block down
        else:
            cur = list(seed)
            for s in list(cur):
                trial = [x for x in cur if x != s]
                if not is_sat(trial):
                    cur = trial
            muses.append(sorted((idx[s] for s in cur), key=IDS.index))
            mp.add_clause([-s for s in cur])                        # block up
    return muses, [sorted(x, key=IDS.index) for x in msses], m, cnf.n, len(cnf.clauses)


def consistent(ids):
    """SAT on the grounding; the model is then checked by evaluating every grounded claim
    with src/logic.py's own evaluator, so a wrong CNF cannot report a false 'consistent'."""
    from pysat.solvers import Solver
    from logic import _eval3
    cnf, sel, m = build(ids)
    with Solver(name="cd15", bootstrap_with=cnf.clauses) as s:
        if not s.solve(assumptions=[sel[i] for i in ids]):
            return False
        val = {l if l > 0 else -l: l > 0 for l in s.get_model()}
    whole = And(*[FORM[i] for i in ids])
    cs = constants(whole)
    env = {c: k for k, c in enumerate(cs)}
    asg = {key: val.get(v, False) for key, v in cnf.var.items()}
    return all(_eval3(_ground(FORM[i], env, m), asg) is True for i in ids)


def recheck(mus):
    """Independent check with src/logic.py: unsat, and unsat no more without any one claim."""
    if fo_model(And(*[FORM[i] for i in mus])) is not None:
        return False
    return all(fo_model(And(*[FORM[j] for j in mus if j != i])) is not None for i in mus)


def min_hitting(sets, allowed):
    """Smallest subsets of `allowed` meeting every set; None if some set misses `allowed`."""
    if any(not (set(s) & set(allowed)) for s in sets):
        return None
    for k in range(1, len(allowed) + 1):
        hits = [h for h in combinations(allowed, k) if all(set(h) & set(s) for s in sets)]
        if hits:
            return [list(h) for h in hits]
    return None


def run():
    t0 = time.time()
    muses, msses, m, nv, nc = marco(IDS)
    t_enum = time.time() - t0
    rechecked = [recheck(x) for x in muses]
    cat = [i for i in IDS if SIDE[i] in ("shared", "catholic")]
    orth = [i for i in IDS if SIDE[i] in ("shared", "orthodox")]
    cons = {"catholic": consistent(cat), "orthodox": consistent(orth)}
    contested = [i for i in IDS if SIDE[i] != "shared"]
    nontriv = [x for x in muses if not (len(x) == 2 and set(x) == {"a1", "dA1"})]
    per = [{"mus": x, "size": len(x), "contested": [i for i in x if SIDE[i] != "shared"]} for x in muses]
    counts = {i: sum(i in x for x in nontriv) for i in IDS}
    hit = {"any_contested": min_hitting(muses, contested),
           "catholic_only": min_hitting(muses, [i for i in IDS if SIDE[i] == "catholic"]),
           "orthodox_only": min_hitting(muses, [i for i in IDS if SIDE[i] == "orthodox"]),
           "any_claim": min_hitting(muses, IDS),
           "shared_only": min_hitting(nontriv, [i for i in IDS if SIDE[i] == "shared"])}
    # which tradition positions are maximal consistent subsets themselves
    extend = {"orthodox": [c for c in IDS if c not in orth and consistent(orth + [c])],
              "catholic": [c for c in IDS if c not in cat and consistent(cat + [c])]}
    pos_max = {k: any(set(v) == set(s) for s in msses) for k, v in (("catholic", cat), ("orthodox", orth))}
    by_denial = {}
    for d in ("dF", "dP", "dR", "dI", "dA1", "dH"):
        sets = [x for x in nontriv if d in x]
        by_denial[d] = {"sets": len(sets), "min_contested": min((sum(SIDE[i] != "shared" for i in x) for x in sets), default=None)}
    return {"claims": [{"id": c[0], "side": c[1], "text": c[2], "formula": show(c[3]), "source": c[4]} for c in CLAIMS],
            "grounding": {"domain": m, "vars": nv, "clauses": nc}, "seconds_enumeration": round(t_enum, 2),
            "consistent": cons, "n_mus": len(muses), "n_nontrivial": len(nontriv), "mus": per,
            "recheck_all_ok": all(rechecked), "n_mss": len(msses), "positions_are_maximal": pos_max, "position_extensions": extend,
            "assumption_fact_in_any_mus": any("fM" in x for x in muses),
            "membership_nontrivial": counts, "by_denial": by_denial, "hitting": hit,
            "e1_crosscheck": e1_crosscheck()}


def e1_crosscheck():
    """MARCO agrees with logic.py's brute force on E1's eight-claim church set."""
    import importlib.util
    spec = importlib.util.spec_from_file_location("e1_run", HERE.parent / "e1_arguments" / "run.py")
    e1 = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(e1)
    JOINT = e1.JOINT
    from logic import minimal_unsat_subsets  # noqa: E402
    claims = JOINT["church_disputes"]
    global FORM, IDS
    saveF, saveI = FORM, IDS
    FORM = {str(k): f for k, (_, f) in enumerate(claims)}
    IDS = list(FORM)
    try:
        mine = sorted(tuple(sorted(int(i) for i in x)) for x in marco(IDS)[0])
    finally:
        FORM, IDS = saveF, saveI
    theirs = sorted(tuple(x) for x in minimal_unsat_subsets([f for _, f in claims]))
    return {"marco": mine, "brute_force": theirs, "agree": mine == theirs}


def markdown(r):
    T = {c["id"]: c["text"] for c in r["claims"]}
    out = ["# E32 results: seven Catholic–Orthodox disputes in one claim set", "",
           "Generated by `run.py` (H36, `LOG.md` 2026-11-23). MUS = minimal inconsistent subset;",
           "*contested* = held by exactly one tradition. Attributions marked (unchecked) were not read",
           "against the texts this session.", "",
           f"- Grounding: domain {r['grounding']['domain']}, {r['grounding']['vars']} variables, {r['grounding']['clauses']} clauses; enumeration {r['seconds_enumeration']} s.",
           f"- Catholic set consistent: {r['consistent']['catholic']}; Orthodox set consistent: {r['consistent']['orthodox']}.",
           f"- MUSes: {r['n_mus']} ({r['n_nontrivial']} non-trivial); every one rechecked with `src/logic.py`: {r['recheck_all_ok']}.",
           f"- Maximal consistent subsets: {r['n_mss']}; the Catholic position is one: {r['positions_are_maximal']['catholic']}, the Orthodox: {r['positions_are_maximal']['orthodox']} (it stays consistent with any of {', '.join(r['position_extensions']['orthodox']) or 'none'} added; the Catholic with {', '.join(r['position_extensions']['catholic']) or 'none'}).",
           f"- Assumption fact in any MUS: {r['assumption_fact_in_any_mus']}.",
           f"- E1 cross-check (MARCO vs brute force on E1's 8 claims): {r['e1_crosscheck']['agree']}.", "",
           "## Claims", "", "| id | side | claim | formula | source |", "|---|---|---|---|---|"]
    for c in r["claims"]:
        out.append(f"| {c['id']} | {c['side']} | {c['text']} | `{c['formula']}` | {c['source']} |")
    out += ["", "## Minimal inconsistent sets", "", "| # | size | claims | contested |", "|---|---|---|---|"]
    for k, x in enumerate(r["mus"], 1):
        out.append(f"| {k} | {x['size']} | {', '.join(x['mus'])} | {len(x['contested'])}: {', '.join(x['contested'])} |")
    out += ["", "## Each denial: how many sets, fewest contested claims in any", "", "| denial | sets | min contested |", "|---|---|---|"]
    for d, v in r["by_denial"].items():
        out.append(f"| {d} ({T[d]}) | {v['sets']} | {v['min_contested']} |")
    out += ["", "## Membership in the non-trivial sets", ""]
    for i, n in sorted(r["membership_nontrivial"].items(), key=lambda kv: -kv[1]):
        if n:
            out.append(f"- {i} ({SIDE[i]}): {n}")
    out += ["", "## Minimum hitting sets (fewest claims to drop to restore consistency)", ""]
    for k, v in r["hitting"].items():
        out.append(f"- {k}: " + ("none" if v is None else f"size {len(v[0])}, {len(v)} choice(s): " + "; ".join("{" + ", ".join(h) + "}" for h in v[:8]) + (" ..." if len(v) > 8 else "")))
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    r = run()
    (HERE / "results.json").write_text(json.dumps(r, indent=1) + "\n")
    (HERE / "results.md").write_text(markdown(r))
    print(markdown(r))
