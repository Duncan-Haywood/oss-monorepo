import importlib.util
import pathlib
import random

_d = pathlib.Path(__file__).resolve().parents[1] / "experiments" / "hub_airspace"
_s = importlib.util.spec_from_file_location("hub_airspace_disclosure", _d / "disclosure.py")
dc = importlib.util.module_from_spec(_s)
_s.loader.exec_module(dc)
gp = dc.gp


def test_subsets_cover_all_256_once():
    assert len(dc.SUBSETS) == 256
    assert len(set(dc.SUBSETS)) == 256


def test_src_of_marks_disclosed_operators_real():
    assert dc.src_of(frozenset()) == "C" * 8
    assert dc.src_of(frozenset({0, 7})) == "RCCCCCCR"


def test_order_by_is_descending_with_index_ties():
    assert dc.order_by([0.1, 0.5, 0.5, 0.0, 0.2, 0.3, 0.05, 0.01]) == [1, 2, 5, 4, 0, 6, 7, 3]


def test_curve_reads_prefix_subsets():
    ratio = {D: 1.0 + len(D) / 10 + (0.5 if 3 in D else 0.0) for D in dc.SUBSETS}
    c = dc.curve(ratio, [3, 0, 1, 2, 4, 5, 6, 7])
    assert c[0] == 1.0 and abs(c[1] - 1.6) < 1e-12 and abs(c[8] - 2.3) < 1e-12


def test_influence_is_zero_for_an_operator_with_no_pairs_and_nonnegative():
    r = random.Random(3)
    w = {(i, j, "enr"): (0.0 if 7 in (i, j) else r.uniform(0.1, 3.0)) for i, j in dc.CROSS}
    parts = gp.bipartitions()[1:]
    infl = dc.influence(parts, w, gp.best(parts, w))
    assert infl[7] == 0.0
    assert all(x >= 0.0 for x in infl)


def test_lens_mass_counts_inside_disc_only():
    d = [(0.25, 0.0, 0.0), (0.5, 100.0, 0.0), (0.25, 1000.0, 0.0)]
    assert abs(dc.lens_mass(d, (0.0, 0.0), 150.0) - 0.75) < 1e-12
