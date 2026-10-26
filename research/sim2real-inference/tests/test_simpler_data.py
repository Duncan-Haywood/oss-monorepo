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


def test_transcription_matches_authors_dicts_except_eggplant():
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "experiments", "m4b_crosscheck"))
    import crosscheck
    n, diffs = crosscheck.compare()
    assert n == 72
    assert {(d[0], d[1], d[2]) for d in diffs} == {("eggplant_basket", "Octo-Base", "real"), ("eggplant_basket", "Octo-Small", "real")}


def test_ranking_accuracy_analytic_cases():
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "experiments", "m4f_ranking"))
    import ranking
    assert abs(ranking.acc_real(1.0, 0.0, 1) - 1.0) < 1e-12
    assert abs(ranking.acc_real(0.5, 0.5, 3) - 0.5) < 1e-12            # equal rates: a coin flip
    # p=(.5,0), m=1: correct when the first policy succeeds (prob .5), a tie otherwise
    assert abs(ranking.acc_real(0.5, 0.0, 1) - 0.75) < 1e-12
