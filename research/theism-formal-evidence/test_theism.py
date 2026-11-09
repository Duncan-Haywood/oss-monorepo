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


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn(); print("ok", name)


def test_e7_anderson_collapses_under_full_semantics():
    e7 = _load("e7_anderson")
    assert [e7.search(1, d)["models"] for d in (1, 2, 3)] == [1, 2, 3]
    assert e7.search(2, 1)["models"] == 0 and e7.search(3, 1)["models"] == 0 and e7.search(2, 2)["models"] == 0
