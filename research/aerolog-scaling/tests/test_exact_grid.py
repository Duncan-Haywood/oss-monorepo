import importlib.util
import os
import sys

HERE = os.path.join(os.path.dirname(__file__), "..", "experiments", "hub_airspace")
sys.path.insert(0, HERE)
spec = importlib.util.spec_from_file_location("exact_grid_test", os.path.join(HERE, "exact_grid.py"))
eg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(eg)


def test_old_grid_misses_six_and_eleven_bands():
    ks = {eg.kcap(h, 12) for h in eg.OLD}
    assert 6 not in ks and 11 not in ks
    assert set(range(1, 13)) - ks == {6, 11}


def test_new_grid_has_every_band_count_and_contains_old():
    assert set(eg.OLD) <= set(eg.NEW)
    assert {eg.kcap(h, 12) for h in eg.NEW} == set(range(1, 13))
    added = sorted(set(eg.NEW) - set(eg.OLD))
    assert len(added) == 2
    assert abs(added[0] - eg.H / 21) < 1e-12 and abs(added[1] - eg.H / 11) < 1e-12


def test_added_spacings_are_the_widest_for_their_band_count():
    for h in set(eg.NEW) - set(eg.OLD):
        k = eg.kcap(h, 12)
        assert eg.kcap(h * (1 + 1e-6), 12) == k - 1


def test_best_picks_lowest_F_within_the_given_grid():
    p = {1.0: ((0,), 3.0, None), 2.0: ((0,), 1.0, None), 3.0: ((0,), 2.0, None)}
    assert eg.best(p, (1.0, 3.0))[0] == 3.0
    assert eg.best(p, (1.0, 2.0, 3.0))[0] == 2.0
