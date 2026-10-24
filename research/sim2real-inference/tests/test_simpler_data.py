import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "experiments", "m4_simpler"))
import data


def test_real_rates_are_integer_counts():
    assert data.check() == []


def test_shape_and_ranges():
    r = data.rows()
    assert len(r) == 6 * 4 + 3 * 4
    assert all(0 <= x[4] <= 1 and 0 <= x[5] <= 1 and x[3] > 1 for x in r)


def test_spot_checks_against_paper_table_iv():
    d = {(x[1], x[2]): (x[4], x[5]) for x in r_ } if (r_ := data.rows()) else {}
    assert d[("pick_coke_can", "RT-1 (Converged)")] == (0.853, 0.857)
    assert d[("open_drawer", "RT-2-X")] == (0.333, 0.157)
