"""The section III-B table of sectional-flow variants (paper/make_table_sectional.py)."""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "paper"))

import make_table_sectional as mts  # noqa: E402


def test_band_areas_match_printed_summaries():
    files = mts.load()
    table = mts.cells(files)
    bad, n = mts.check_against_summaries(files, table)
    assert bad == []
    assert n == 18


def test_known_cells():
    table = mts.cells(mts.load())
    t = dict(table["T"]["rows"])
    m = dict(table["M"]["rows"])
    assert round(t["Relative velocity (strip default)"][0], 3) == 0.406
    assert round(m["+ incident surge on $n_x$, default motions"][0], 3) == 0.732
    assert round(table["T"]["ref"][2], 5) == -0.39907
    assert round(t["+ incident surge on $n_x$, own exciting force"][3], 3) == 1.362
    assert t["+ incident surge on $n_x$, own exciting force"][0] is None


def test_committed_table_is_current():
    with open(mts.OUT) as f:
        committed = f.read()
    assert committed == mts.render(mts.cells(mts.load()))


def test_trapezoid_uneven_spacing():
    assert abs(mts.trapezoid([1, 1, 1, 1, 1]) - 1.5) < 1e-12
