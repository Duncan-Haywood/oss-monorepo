"""Milestone 3zd: the update rules at the image edge (experiments/m3zd_edge)."""
import importlib.util, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
_s = importlib.util.spec_from_file_location("m3zd_an", os.path.join(HERE, "..", "experiments", "m3zd_edge", "analyse.py"))
an = importlib.util.module_from_spec(_s)
_s.loader.exec_module(an)


def test_fold_radius_matches_analytic_case():
    # r(x) = f x (1 + k2 x^4) with k2 < 0 peaks where 1 + 5 k2 x^4 = 0
    f, k2 = 500.0, -0.5
    x = (1 / (5 * 0.5)) ** 0.25
    want = f * x * (1 + k2 * x ** 4)
    got = an.fold_radius({"f": f, "k1": 0.0, "k2": k2})
    assert abs(got - want) < 0.05
    assert an.fold_radius({"f": 500.0, "k1": 0.1, "k2": 0.0}) is None


def test_edge_band_scores_zero_when_the_held_model_is_the_truth_and_rules_cannot_move_it():
    T = {"f": 517.0, "k1": 0.26, "k2": -0.95, "k3": 1.16}
    truth = {"fr1": T}
    # a pool that agrees with the truth's f exactly and has its own k1, k2 = truth's (k3 dropped by joint)
    b = {"unit": "fr1", "seq": "s", "f": 517.0, "sd": 5.0, "k1": 0.26, "k2": -0.95, "D": 0.0, "sdD": None}
    p = an.p_at_d0([b], truth, truth, an.BANDS["edge"])
    assert max(abs(v) for v in p["never"]) < 1e-6
    assert max(abs(v) for v in p["f_gate0.5"]) < 1e-6
    # the joint rule drops TUM's k3, so at the edge it is off by a measurable amount
    assert max(abs(v) for v in p["joint_always"]) > 1.0


def test_reference_folds_are_the_ones_the_plan_quotes():
    refs = an.m3za.references()
    assert abs(an.fold_radius(refs["board"]["fr1"]) - 381) < 1
    assert abs(an.fold_radius(refs["tf"]["fr1"]) - 403) < 1
    for t, u in (("tum", "fr1"), ("tum", "fr3"), ("board", "fr3"), ("tf", "fr3")):
        assert an.fold_radius(refs[t][u]) is None
