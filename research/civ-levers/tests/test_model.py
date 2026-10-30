import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from civ_levers.levers import apply, ladder_positions, outcome  # noqa: E402
from civ_levers.model import (  # noqa: E402
    clusters, complete_society, cross_share, hk_run, measures, polarized_society, rewire_bridges, run,
)


def test_deffuant_cluster_count_matches_published_rule():
    # Deffuant et al. (2000): about floor(1/(2 eps)) major clusters from uniform opinions.
    for eps, want in ((0.15, 3), (0.2, 2), (0.5, 1)):
        x = np.random.default_rng(1).uniform(0, 1, 300)
        soc = run(complete_society(x), 600, seed=1, eps=eps, mu=0.5)
        assert len(clusters(soc.x, 0.01, 0.05)) == want


def test_hk_consensus_threshold_on_uniform_grid():
    # Hegselmann-Krause: consensus from a uniform start once eps is about 0.2-0.25 (Lorenz 2007).
    assert len(clusters(hk_run(np.linspace(0, 1, 500), 0.25)[0], 1e-6)) == 1
    assert len(clusters(hk_run(np.linspace(0, 1, 500), 0.1)[0], 1e-6)) >= 4


def test_hk_analytic_two_groups():
    x = np.array([0.4, 0.4, 0.6])
    assert np.allclose(hk_run(x, 0.3)[0], 1.4 / 3)  # all in reach: one step to the mean
    assert np.allclose(hk_run(x, 0.1)[0], x)        # none in reach: nobody moves


def test_degroot_limit_reaches_consensus_on_connected_graph():
    soc = polarized_society(n=200, seed=2)
    run(soc, 600, seed=2, eps=1.01)
    assert soc.x.max() - soc.x.min() < 1e-3


def test_single_zealot_opinion_is_the_only_fixed_point_under_averaging():
    soc = polarized_society(n=200, seed=3)
    soc.x[:5], soc.fixed[:5] = 0.9, True
    run(soc, 1500, seed=3, eps=1.01)
    assert np.allclose(soc.x, 0.9, atol=1e-3)


def test_strong_repulsion_drives_camps_to_extremes():
    # Jager and Amblard (2005): a narrow non-commitment zone splits a society to the poles.
    soc = run(polarized_society(seed=4), 400, seed=4, eps=0.2, tau=0.4)
    assert measures(soc)["extreme"] > 0.95


def test_no_repulsion_means_opinions_stay_within_start_range():
    soc = polarized_society(seed=5)
    lo, hi = soc.x.min(), soc.x.max()
    run(soc, 200, seed=5, eps=0.3)
    assert soc.x.min() >= lo - 1e-12 and soc.x.max() <= hi + 1e-12


def test_rewiring_raises_cross_share_and_keeps_ties():
    soc = polarized_society(seed=6)
    b = rewire_bridges(soc, 0.5, seed=6)
    assert abs(cross_share(soc) - 0.05) < 0.01
    assert 0.45 < cross_share(b) < 0.6
    assert abs(len(b.indices) - len(soc.indices)) < 0.01 * len(soc.indices)


def test_ladder_steps_are_within_reach():
    for eps in (0.2, 0.3, 0.4):
        p = np.concatenate([[0.2], ladder_positions(eps), [0.8]])
        assert np.all(np.diff(p) <= 0.8 * eps + 1e-12)


def test_bridging_backfires_only_with_repulsion():
    no = [outcome("bridge", 0.25, 0.3, math.inf, seed=s)["extreme"] for s in range(3)]
    yes = [outcome("bridge", 0.25, 0.3, 0.7, seed=s)["extreme"] for s in range(3)]
    base = [outcome("none", 0, 0.3, 0.7, seed=s)["extreme"] for s in range(3)]
    assert max(no) == 0.0 and min(yes) > 0.9 and max(base) < 0.05


def test_moderate_broadcast_merges_without_repulsion_when_in_reach():
    assert outcome("broadcast", 0.1, 0.3, math.inf, seed=0)["gap"] < 0.05


def test_apply_is_deterministic():
    a, _ = apply("moderates", 0.1, 0.3, seed=7)
    b, _ = apply("moderates", 0.1, 0.3, seed=7)
    assert np.array_equal(a.x, b.x) and np.array_equal(a.fixed, b.fixed)


def test_contact_with_no_gain_matches_fixed_eps_bridging():
    # gain = loss = 0 and no identity filter must reproduce civ-levers' fixed-eps bridging exactly.
    from civ_levers.contact import outcome_contact
    a = outcome_contact(0.25, 0.3, math.inf, 0.0, seed=3, sweeps=60)
    b = outcome("bridge", 0.25, 0.3, math.inf, seed=3, sweeps=60)
    assert abs(a["gap"] - b["gap"]) < 1e-9


def test_contact_gain_raises_mean_tolerance():
    from civ_levers.contact import outcome_contact
    m = outcome_contact(0.25, 0.2, math.inf, 0.02, seed=1, sweeps=60)
    assert m["eps_mean"] > 0.2
