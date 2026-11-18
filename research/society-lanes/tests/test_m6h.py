"""Tests for milestone 6h's recalibration design (experiments/m6h_recalibrate.py) and the new spacing parameters."""
import os
import sys

import pytest

np = pytest.importorskip("numpy")
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(HERE, "experiments"))
sys.path.insert(0, HERE)
import m6h_recalibrate as M  # noqa: E402


def test_part_a_job_count_is_the_registered_1440():
    assert len(M.jobs_a()) == 4 * 5 * 2 * 9 * M.SEEDS_A  # 1,440 at 4 seeds


def test_grids_bracket_the_defaults_on_both_sides():
    for fam, g in M.GRIDS.items():
        assert M.DEFAULT[fam] in g
        assert max(g) > M.DEFAULT[fam] > min(g)


def test_fresh_seeds_disjoint_from_6g_and_between_parts():
    import m6g_density_cost as M6G
    old = {j[-1] for j in M6G.jobs()}
    a = {j[-1] for j in M.jobs_a()}
    b = {j[-1] for j in M.jobs_b({s: M.DEFAULT[s[0]] for s in M.SETTINGS}, {})}
    assert not (a & old) and not (b & old) and not (a & b)


def test_score_is_rms_inside_range_and_needs_min_cells():
    c = np.array([5.0, 0.0, 0.0])           # real curve T = 5 s
    cells = {(0.9, n): [dict(transit=6.0, transit_density=0.5 + 0.1 * i)] for i, n in enumerate(M.NS[:5])}
    s, k = M.score(cells, c, 0.4, 2.0)
    assert k == 5 and s == pytest.approx(1.0)
    assert np.isnan(M.score(cells, c, 0.4, 0.75)[0])   # only 3 cells inside


def test_operating_n_interpolates_first_crossing():
    cells = {(1.6, 60): [dict(transit=1, transit_density=1.0)], (1.6, 75): [dict(transit=1, transit_density=1.5)],
             (1.6, 50): [dict(transit=1, transit_density=0.8)]}
    assert M.operating_n(cells, 1.6, 1.25) == 68
    assert M.operating_n(cells, 1.6, 2.0) is None


def test_pick_takes_smallest_finite_score():
    assert M.pick({1.0: (2.0, 5), 0.5: (0.7, 5), 0.3: (float("nan"), 2)}) == 0.5
    assert M.pick({1.0: (float("nan"), 0)}) is None


def test_spacing_parameters_change_runs_and_defaults_do_not():
    pytest.importorskip("numba")
    import orca as O
    kw = dict(duration=8.0, warmup=2.0)
    base = O.simulate(20, 3.6, 16.0, 1.6, 1.0, 7, **kw)
    same = O.simulate(20, 3.6, 16.0, 1.6, 1.0, 7, tau=O.TAU, **kw)
    assert base["transits"] == same["transits"] and base["speed"] == same["speed"]
    jps = pytest.importorskip("jupedsim")  # noqa: F841
    import sftwin as S
    a = S.simulate(20, 3.6, 16.0, 1.6, 0.2, 7, model="cfsm", **kw)
    b = S.simulate(20, 3.6, 16.0, 1.6, 0.2, 7, model="cfsm", time_gap=S.CFSM_TIME_GAP, **kw)
    assert a["speed"] == b["speed"]
    c = S.simulate(20, 3.6, 16.0, 1.6, 0.1, 7, model="sf", agent_scale=500.0, **kw)
    assert np.isfinite(c["speed"])
