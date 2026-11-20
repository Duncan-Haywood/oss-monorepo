"""Tests for milestone 6i's lobby entry (sftwin.entry_x, experiments/m6i_lobby.py)."""
import os
import sys

import pytest

np = pytest.importorskip("numpy")
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(HERE, "experiments"))
sys.path.insert(0, HERE)
import sftwin as S  # noqa: E402


def test_edge_entry_is_the_old_placement_and_draws_nothing():
    rng = np.random.default_rng(1)
    state = rng.bit_generator.state
    assert S.entry_x(rng, 1, 16.0) == 0.35
    assert S.entry_x(rng, -1, 16.0) == pytest.approx(15.65)
    assert rng.bit_generator.state == state


def test_lobby_entry_lies_behind_the_end_inside_the_run_out():
    rng = np.random.default_rng(2)
    xs = [S.entry_x(rng, 1, 16.0, "lobby") for _ in range(200)]
    assert all(-S.LOBBY[1] <= x <= -S.LOBBY[0] for x in xs)
    xs = [S.entry_x(rng, -1, 16.0, "lobby") for _ in range(200)]
    assert all(16.0 + S.LOBBY[0] <= x <= 16.0 + S.LOBBY[1] for x in xs)
    assert S.LOBBY[1] < 1.5   # sftwin's walkable area runs 1.5 m past each end


def test_unknown_entry_rejected():
    with pytest.raises(ValueError):
        S.entry_x(np.random.default_rng(0), 1, 16.0, "door")


M = pytest.importorskip("m6i_lobby")


def test_part_a_job_count_and_seeds_fresh():
    import m6g_density_cost as G
    import m6h_recalibrate as H
    assert len(M.jobs_a()) == 3 * 2 * 2 * 9 * M.SEEDS_A
    old = {j[-1] for j in G.jobs()} | {j[-1] for j in H.jobs_a()} | {j[-1] for j in H.jobs_b(
        {s: H.DEFAULT[s[0]] for s in H.SETTINGS}, {})}
    a = {j[-1] for j in M.jobs_a()}
    b = {j[-1] for j in M.jobs_b({})}
    assert not (a & old) and not (b & old) and not (a & b)


def test_settings_are_6h_choices():
    assert dict(((f, m), v) for f, m, v in M.SETTINGS) == {("sf", 0.75): 1000.0, ("cfsm", 0.5): 0.3,
                                                           ("orca", 1.0): 2.0}


def test_real_points_from_committed_file():
    real = M.real_points()
    assert sum(len(v) for v in real["free"].values()) == 1084
    assert sum(len(v) for v in real["symmetric"].values()) == 1917
    assert len(real["free"]) == 5 and len(real["symmetric"]) == 8


def test_operating_n_interpolates_and_reports_never():
    cells = {(1.6, n): [dict(transit=6.0, transit_density=0.01 * n)] for n in M.NS}
    assert M.operating_n(cells, 1.6, 0.5) == 50
    assert M.operating_n(cells, 1.6, 5.0) is None
    assert M.max_density(cells, 1.6) == pytest.approx(1.6)


def test_jobs_b_adds_operating_pair():
    jobs = M.jobs_b({("cfsm", 0.5): {1.6: 100, 0.9: None}})
    ns = {(j[1], j[2], j[3]) for j in jobs}
    assert ("cfsm", 1.6, 100) in ns and ("cfsm", 1.6, 80) in ns
    assert all(j[6] == "lobby" for j in jobs)
