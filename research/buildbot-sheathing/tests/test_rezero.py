"""Milestone 72: re-zero scheduling for a drifting F/T bias."""
import random

from buildbot_sheathing import rezero as R


def test_sheet_has_62_nails():
    assert len(R.sheet_nails()) == 62


def test_no_rezero_when_every_deadline_is_long():
    assert R.greedy([0, 1, 1], [1, 1, 1], [100, 100, 100]) == []


def test_rezero_before_the_first_late_press():
    # elapsed at press ends 1, 2, 3, 4; press 2's deadline 2.5 forces a re-zero before it
    assert R.greedy([0, 0, 0, 0], [1, 1, 1, 1], [9, 9, 2.5, 9]) == [2]


def test_infeasible_press():
    assert R.greedy([0, 0], [1, 2], [5, 1.5]) is None
    assert R.brute_force([0, 0], [1, 2], [5, 1.5]) is None


def test_elapsed_matches_the_definition():
    g, t = [0, 3, 0, 2], [1, 1, 2, 1]
    assert R.elapsed(g, t, 1, 3) == 1 + (0 + 2) + (2 + 1)


def test_greedy_is_optimal_on_random_instances():
    rng = random.Random(1)
    for _ in range(300):
        n = rng.randint(2, 9)
        t = [rng.uniform(0.5, 2) for _ in range(n)]
        g = [0.0] + [rng.uniform(0, 3) for _ in range(n - 1)]
        T = [rng.uniform(1, 10) for _ in range(n)]
        st, b = R.greedy(g, t, T), R.brute_force(g, t, T)
        assert (st is None) == (b is None)
        if st is not None:
            assert len(st) == b and R.feasible(g, t, T, st)


def test_fixed_interval_is_greedy_with_one_deadline():
    g, t = [0] + [0.5] * 9, [1] * 10
    assert R.fixed_interval(g, t, 3.0) == R.greedy(g, t, [3.0] * 10)
