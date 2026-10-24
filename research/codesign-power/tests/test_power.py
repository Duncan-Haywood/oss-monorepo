import json, os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src")); sys.path.insert(0, os.path.join(HERE, "..", "..", "codesign-headroom", "src"))
from codesign_power import best_design, boot_ci, diff_ci, spearman
from codesign_headroom.problem import scenarios, TRAIN, TEST, FRESH, Problem, success_rate

SRC = os.path.join(HERE, "..", "..", "codesign-headroom", "experiments", "results.json")


def test_best_design_ignores_infeasible_and_later_records():
    recs = [dict(feasible=True, success=0.5), dict(feasible=False, success=0.99), dict(feasible=True, success=0.7), dict(feasible=True, success=0.9)]
    assert best_design(recs, 3)["success"] == 0.7
    assert best_design(recs, 4)["success"] == 0.9
    assert best_design(recs[1:2], 1) is None


def test_best_design_first_on_ties():
    recs = [dict(feasible=True, success=0.8, k=0), dict(feasible=True, success=0.8, k=1)]
    assert best_design(recs, 2)["k"] == 0


def test_best_design_matches_headroom_curve():
    src = json.load(open(SRC))
    for runs in src["methods"].values():
        for run in runs:
            for n in (10, 20, 40):
                b = best_design(run["recs"], n)
                assert (b["success"] if b else 0.0) == run["curve"][n - 1]


def test_boot_ci_contains_mean_and_is_ordered():
    v = np.random.default_rng(0).uniform(size=8)
    m, lo, hi = boot_ci(v)
    assert lo <= m <= hi and abs(m - v.mean()) < 1e-12


def test_boot_ci_constant_is_degenerate():
    assert boot_ci([0.5] * 8) == (0.5, 0.5, 0.5)


def test_diff_ci_detects_a_clear_gap():
    d, lo, hi = diff_ci([0.9, 0.91, 0.92, 0.9], [0.5, 0.52, 0.51, 0.5])
    assert lo > 0.3 and hi < 0.5 and abs(d - 0.4) < 0.05


def test_spearman_known_values():
    assert abs(spearman([1, 2, 3, 4], [10, 20, 30, 40]) - 1) < 1e-12
    assert abs(spearman([1, 2, 3, 4], [4, 3, 2, 1]) + 1) < 1e-12
    assert abs(spearman([1, 1, 2, 2], [1, 2, 1, 2])) < 1e-12
    assert np.isnan(spearman([1, 1, 1], [1, 2, 3]))


def test_large_scene_set_is_disjoint_from_the_selection_sets():
    big = scenarios(600, 4004)
    key = lambda s: (s["kind"], round(s["size"], 6), round(s["mass_g"], 4))
    seen = {key(s) for s in TRAIN + TEST + FRESH}
    assert not seen & {key(s) for s in big}
    assert all(s["dz_mm"] <= 25 for s in big)


def test_a_stored_design_replays_to_its_stored_test_score():
    src = json.load(open(SRC))
    r = src["methods"]["random search"][0]["recs"][0]
    d, _ = Problem().design(r["x"])
    if r["feasible"]:
        assert abs(success_rate(d, r["force_n"], TEST) - r["success"]) < 1e-9
