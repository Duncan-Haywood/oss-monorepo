"""Tests: the decision procedures against hand-checked cases, and the ledger against a
published figure.  Run: python3 -m pytest research/theism-formal-evidence -q
(or python3 research/theism-formal-evidence/test_theism.py, stdlib only)."""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))
from arguments import ARGUMENTS  # noqa: E402
from bayes import contrast_shares, flip_threshold, posterior, prior_vector, unwin  # noqa: E402
from ledger import CHRISTIAN, HYPOTHESES, ITEMS, PRIOR_DEFAULT, PUBLISHED_POSTERIORS, THEISM  # noqa: E402
from logic import (A, All, And, Box, Dia, Ex, Imp, Not, Or, P, check, fo_model,  # noqa: E402
                   maximal_consistent_subsets, minimal_unsat_subsets, modal_model)

p, q, G = A("p"), A("q"), A("G")


def test_propositional_basics():
    assert check([Imp(p, q), p], q)["valid"]                      # modus ponens
    assert not check([Imp(p, q), q], p)["valid"]                  # affirming the consequent
    assert fo_model(And(p, Not(p))) is None


def test_modal_axioms_by_system():
    T_ax = Imp(Box(p), p)
    four = Imp(Box(p), Box(Box(p)))
    B_ax = Imp(p, Box(Dia(p)))
    five = Imp(Dia(p), Box(Dia(p)))
    assert not check([], T_ax, "K")["valid"] and check([], T_ax, "T", 3)["valid"]
    assert not check([], four, "T")["valid"] and check([], four, "S4", 3)["valid"]
    assert not check([], B_ax, "S4")["valid"] and check([], B_ax, "B", 3)["valid"]
    assert not check([], five, "S4")["valid"] and not check([], five, "B")["valid"]
    assert check([], five, "S5")["valid"] and check([], five, "S5")["certified"]
    assert check([], Imp(Box(Imp(p, q)), Imp(Box(p), Box(q))), "K")["valid"]   # axiom K


def test_countermodels_are_genuine():
    r = check([Box(Imp(G, Box(G))), Dia(G)], G, "S4")
    m = r["countermodel"]
    assert not r["valid"] and r["certified"]
    R = {int(k): v for k, v in m["R"].items()}
    assert all(w in R[w] for w in R)                                          # reflexive
    assert all(c in R[a] for a in R for b in R[a] for c in R[b])              # transitive


def test_ontological_logic_profile():
    prem, conc = [Box(Imp(G, Box(G))), Dia(G)], G
    got = {s: check(prem, conc, s, 3)["valid"] for s in ["K", "T", "B", "S4", "S5"]}
    assert got == {"K": False, "T": False, "B": True, "S4": False, "S5": True}
    prem2, conc2 = [Box(Imp(G, Box(G))), Dia(Not(G))], Not(G)
    got2 = {s: check(prem2, conc2, s, 3)["valid"] for s in ["K", "T", "B", "S4", "S5"]}
    assert got2 == {"K": False, "T": True, "B": True, "S4": True, "S5": True}


def test_monadic_quantifiers():
    assert check([All("x", Imp(P("F", "x"), P("H", "x"))), P("F", "a")], P("H", "a"))["valid"]
    assert not check([Ex("x", P("F", "x"))], P("F", "a"))["valid"]
    assert not check([Ex("x", P("F", "x")), Ex("x", P("H", "x"))], Ex("x", And(P("F", "x"), P("H", "x"))))["valid"]
    assert check([All("x", P("F", "x"))], Ex("x", P("F", "x")))["valid"]     # non-empty domains


def test_catalogue_verdicts():
    for arg in ARGUMENTS:
        prem = [f for _, f in arg["premises"]]
        r = check(prem, arg["conclusion"][1], "S5")
        assert r["valid"] == arg.get("expect_valid", True), arg["id"]


def test_church_positions():
    from importlib import util
    spec = util.spec_from_file_location("e1", Path(__file__).parent / "experiments/e1_arguments/run.py")
    e1 = util.module_from_spec(spec); spec.loader.exec_module(e1)
    fs = [f for _, f in e1.JOINT["church_disputes"]]
    assert minimal_unsat_subsets(fs) == [(0, 1, 2, 3), (4, 5, 6, 7)]
    mcs = maximal_consistent_subsets(fs)
    assert (0, 1, 2, 4, 5, 6) in mcs        # Catholic: drop c4 and c8
    assert (1, 2, 3, 4, 6, 7) in mcs        # Orthodox: drop c1 and c6
    assert len(mcs) == 16


def test_unwin_reproduced():
    pub = PUBLISHED_POSTERIORS[0]
    assert abs(unwin(pub["reproduce"]["prior"], pub["reproduce"]["D"]) - 2 / 3) < 1e-12


def test_shermer_inputs_do_not_give_two_percent():
    pub = PUBLISHED_POSTERIORS[1]
    p = unwin(pub["reproduce"]["prior"], pub["reproduce"]["D"])
    assert abs(p - 2.5e-4 / (1 + 2.5e-4)) < 1e-12
    assert p < 0.001  # the column reports 0.02


def test_posterior_basics():
    pr = prior_vector(0.5, 0.5, PRIOR_DEFAULT["within"])
    assert abs(sum(pr.values()) - 1) < 1e-12
    zero = {it["id"]: 0.0 for it in ITEMS}
    post = posterior(pr, zero)
    assert all(abs(post[h] - pr[h]) < 1e-12 for h in HYPOTHESES)
    # one theism-level item at +1 multiplies theism:N odds by 10
    one = {**zero, "goodness": 1.0}
    post = posterior(pr, one)
    assert abs(sum(post[h] for h in THEISM) / post["N"] - 10.0) < 1e-9
    # a church item moves only Catholic odds
    post = posterior(pr, {**zero, "honorius": -1.0})
    assert abs(post["C_orthodox"] / post["C_other"] - pr["C_orthodox"] / pr["C_other"]) < 1e-12


def test_flip_threshold_solves():
    pr = prior_vector(0.5, 0.5, PRIOR_DEFAULT["within"])
    t = flip_threshold(pr, "resurrection", CHRISTIAN, ["N", "T_other"])
    mids = {it["id"]: (it["lo"] + it["hi"]) / 2 for it in ITEMS}
    post = posterior(pr, {**mids, "resurrection": t})
    assert abs(sum(post[h] for h in CHRISTIAN) - 0.5) < 1e-9


def test_shares_sum_to_one():
    sh, var = contrast_shares((THEISM, ["N"]))
    assert abs(sum(sh.values()) - 1) < 1e-12 and var > 0
    assert sh["resurrection"] == 0.0


def test_ledger_entries_are_documented():
    for it in ITEMS:
        assert it["lo"] <= it["hi"] and it["basis"] in ("published", "argued", "sweep") and it["sources"]


def _load(name):
    import importlib.util
    spec = importlib.util.spec_from_file_location(name, Path(__file__).resolve().parent / "experiments" / name / "run.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_e3_leave_one_out_reports_every_theism_level_item():
    e3 = _load("e3_leave_one_out")
    r = e3.run()
    assert abs(r["full_P_N"] - 0.76) < 0.005
    assert r["max_abs_delta_item"] == "natural_evil" and "moral_evil" in r["flippers"]
    assert r["items"]["canon28"]["delta"] == 0.0          # church-level items do not touch naturalism


def test_e4_godel_scott_collapse_in_finite_models():
    e4 = _load("e4_godel_scott")
    # one-world models: one per individual (the principal ultrafilters), and none with two or more worlds
    assert [e4.search(1, d)["models"] for d in (1, 2, 3)] == [1, 2, 3]
    assert e4.search(2, 1)["models"] == 0 and e4.search(3, 1)["models"] == 0 and e4.search(2, 2)["models"] == 0


def test_e5_shared_cause_closed_form_matches_enumeration():
    from bayes import shared_cause_bf, shared_cause_bf_enumerated
    for n, a, b, u, r in [(4, 0.9, 0.3, 0.6, 0.7), (3, 0.5, 0.25, 0.4, 0.5)]:
        bf, om = shared_cause_bf_enumerated(n, a, b, u, r)
        assert abs(bf - shared_cause_bf(n, a / b, om)) < 1e-9 * bf
    assert shared_cause_bf(5, 3.0, 1.0) == 3.0 ** 5          # omega = 1: the independent product
    assert shared_cause_bf(5, 3.0, 0.0) == 1.0               # unreliable for sure: no force


def test_e7_anderson_collapses_under_full_semantics():
    e7 = _load("e7_anderson")
    assert [e7.search(1, d)["models"] for d in (1, 2, 3)] == [1, 2, 3]
    assert e7.search(2, 1)["models"] == 0 and e7.search(3, 1)["models"] == 0 and e7.search(2, 2)["models"] == 0


def test_e8_restricted_algebras_admit_contingent_multiworld_models():
    e8 = _load("e8_restricted")
    rows = {(r["w"], r["d"]): r for r in e8.run()}
    assert rows[(2, 2)]["algebras_with_model"] == 2
    assert all(rows[k]["algebras_with_model"] == 0 for k in [(2, 1), (3, 1), (4, 1), (5, 1)])


def test_e9_three_world_model_exists():
    """Anderson's axioms have a 3-world model over a restricted algebra (E9 example)."""
    import importlib.util
    f = Path(__file__).resolve().parent / "experiments" / "e8_restricted" / "run.py"
    spec = importlib.util.spec_from_file_location("e8", f)
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    assert m.search(3, 2, m.algebra([[0, 2, 4], [1, 3], [5]]))[1] > 0


def test_e10_theorem_matches_search():
    """Model count of Anderson's axioms = number of blocks made of whole individuals (E10)."""
    e10 = _load("e10_theorem")
    for w, d in [(1, 3), (3, 1), (2, 2)]:
        r = e10.check(w, d)
        assert r["agree"] == r["partitions_checked"], r["mismatches"]
    # full property semantics (singleton blocks) at 2 worlds x 3 individuals: no model, as corollary (d) says
    assert e10.predicted([[c] for c in range(6)], 2, 3) == 0


def test_e11_anderson_own_a2_matches_prediction():
    """With Anderson's own A2 the search's model count equals the number of generators H (E11),
    and full property semantics gives one model per individual at any number of worlds."""
    e11 = _load("e11_anderson_a2")
    for w, d in [(2, 2), (3, 1), (1, 3)]:
        for blocks in _load("e8_restricted").partitions(w * d):
            assert len(e11.search_weak(w, d, blocks)[0]) == e11.predicted(w, d, blocks)
    assert len(e11.search_weak(2, 1, [[0], [1]])[0]) == 1      # B&F's 2-world, 1-entity size
    assert len(e11.search_weak(2, 2, [[0], [1], [2], [3]])[0]) == 2
    assert e11.predicted(3, 2, [[c] for c in range(6)]) == 2



def test_e12_varying_domains_matches_prediction():
    """Varying domains (E12): search counts equal H17's formula on every 2x2 frame, the
    conclusion holds in every model of all four axioms, and A5' binds somewhere."""
    e12 = _load("e12_varying_domains")
    binds = fails = 0
    for Ex in e12.domains(2, 2):
        for blocks in _load("e8_restricted").partitions(4):
            fr = e12.Frame(2, 2, blocks, Ex)
            models, _ = e12.search(fr)
            assert (len(models), sum(m["a5"] for m in models)) == e12.predicted(fr)
            assert all(m["concl"] for m in models if m["a5"])
            binds += any(not m["a5"] for m in models)
            fails += any(not m["concl"] for m in models)
    assert binds > 0 and fails > 0
    e12.test_contingent_existent_full_semantics(); e12.test_no_necessary_existent_no_model()


def test_e13_actualist_necessity_matches_prediction():
    """Actualist "has f necessarily" (E13): search counts equal H18's formula on every 2x2
    frame, de dicto holds in every model of all four axioms, de re fails in some."""
    e13 = _load("e13_actualist_necessity")
    re_fails = 0
    for Ex in e13.e12.domains(2, 2):
        for blocks in _load("e8_restricted").partitions(4):
            fr = e13.ActualFrame(2, 2, blocks, Ex)
            models = e13.search(fr)
            assert (len(models), sum(m["a5"] for m in models)) == e13.predicted(fr)
            assert all(m["dicto"] for m in models if m["a5"])
            re_fails += sum(m["a5"] and not m["re"] for m in models)
    assert re_fails == 10
    e13.test_constant_domain_readings_agree(); e13.test_shared_essence_de_re_fails()


def test_e14_plain_necessity_closes_de_re():
    """Plain necessary existence positive (E14): search counts equal H19's formula on every 2x2
    frame, every God-like individual of a model exists at every world, and each model also
    satisfies Anderson's A5'."""
    e14 = _load("e14_plain_necessity")
    n = 0
    for Ex in e14.e12.domains(2, 2):
        for blocks in e14.e8.partitions(4):
            fr = e14.e13.ActualFrame(2, 2, blocks, Ex)
            models = [m for m in e14.search(fr) if m["a50"]]
            assert len(models) == e14.predicted(fr)
            assert all(m["re_all"] and m["dicto"] and m["a5"] for m in models)
            n += len(models)
    assert n == 35
    e14.test_e13_countermodel_fails_a50(); e14.test_constant_domain_a50_is_a5()


def test_e15_a5z_does_not_imply_a5():
    """E15: the census's exact model enumeration agrees with E14's definition-level search on
    every frame up to 4 cells, and the 2-world, 4-individual frame is a model of A5₀ where
    Anderson's A5' fails (E14's conjecture refuted)."""
    e15 = _load("e15_a5z_not_a5")
    e15.test_countermodel(); e15.test_crosscheck()


def test_e17_fitting_matches_prediction():
    """E17: Fitting's variant over block algebras of individuals.  The definition-level search
    equals H21's closed form on every frame up to 3 worlds x 3 individuals; with A5 de dicto
    never fails; with A4 de re fails only in coarse algebras; without A4 it fails under full
    semantics too."""
    e17 = _load("e17_fitting")
    stats, mism, ex = e17.run([(d, w) for d in (1, 2, 3) for w in (1, 2, 3)])
    assert mism == []
    tot = lambda k: sum(st[k] for st in stats.values())
    assert tot("dedicto_fail_withA5") == 0 and tot("dedicto_fail_withA5_noA4") == 0
    assert tot("ne_not_in_algebra") == 0
    assert tot("dere_fail_A4") > 0 and tot("full_dere_fail_A4") == 0
    assert tot("full_dere_fail_noA4") > 0 and tot("full_multi_god") == 0
    assert ex["de_re_fail_A4"]["partition"] == [0, 0]



def test_e18_afp_fitting_claims_reproduce():
    """Every AFP FittingProof theorem holds and every Nitpick claim has a countermodel (small sizes)."""
    e18 = _load("e18_afp_crosscheck")
    recs, _ = e18.run([(1, 2, False), (2, 1, False), (2, 2, False), (2, 3, False), (3, 1, False)])
    afp = {n: rep for n, _, _, rep in e18.MODEL_STATEMENTS + e18.GLOBAL_STATEMENTS}
    for (name, stage, logic, sem), r in recs.items():
        if sem != "all" or stage == "III-noA4" or name not in afp:
            continue
        if afp[name] == "proved":
            assert r["fail"] == 0, (name, stage, logic)
    k = lambda n, s, l="K": recs[(n, s, l, "all")]
    assert k("T3_deDicto", "I")["smallest"][:2] == [2, 2]
    assert k("modal collapse", "III", "S5")["smallest"][:2] == [2, 1]
    assert k("T1b", "I")["fail"] > 0
    # without A4 (B&F 2020 Fig. 6): de re survives in K, de dicto does not; both survive in S5
    assert k("GodNecExists_v2 (de re)", "III-noA4")["fail"] == 0
    assert k("GodNecExists_v1 (de dicto)", "III-noA4")["fail"] > 0
    assert k("GodNecExists_v1 (de dicto)", "III-noA4", "S5")["fail"] == 0


def test_e19_afp_anderson_claims_and_frame_conditions():
    """AFP AndersonProof theorems hold at their stages; symmetry is what the conclusion needs."""
    e19 = _load("e19_afp_anderson")
    res = e19.run([(1, 2, "all", 9), (2, 1, "all", 9), (2, 2, "all", 9), (3, 1, "all", 9)])
    agg = e19.summary(res)
    bad = lambda name, st, cls: sum(agg[(name, st)].get(cls, [0, 0, 0, 0])[0::2])
    names = {n.split(":")[0]: n for n, *_ in e19.WORLD + e19.GLOBAL}
    for st in ("III", "III-noA4"):
        for cls in ("KB", "B", "S5"):          # symmetric frames: the conclusion always holds
            assert bad(names["GodNecExists"], st, cls) == 0
        assert bad(names["GodNecExists"], st, "S4") > 0     # reflexive + transitive is not enough
    for cls in e19.ORDER:
        if cls in ("T", "B", "S4", "S5", "KB"):    # reflexive or symmetric (Lean: essential_*)
            assert bad(names["GodIsEssential"], "II", cls) == 0
        assert bad(names["T3"], "I", cls) == 0
    assert bad(names["A4b"], "II", "S4") > 0 and bad(names["A4b"], "II", "B") == 0
    assert res["e12"]["agree_III"] == res["e12"]["frames"] > 0
    assert res["smallest"]["modal collapse|III|S5"]["worlds"] == 2
    assert res["smallest"]["modal collapse|III|S5"]["individuals"] == 1


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn(); print("ok", name)
