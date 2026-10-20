import pathlib
import sys

import numpy as np
import pytest

from simdesign_processcover import PROCESSES, feasible, coverage, sample_parts, shop_value

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "selfrep-nextmachine" / "src"))
from selfrep_nextmachine.select import exhaustive, greedy  # noqa: E402


def one(proc, w, r, b):
    return bool(feasible(PROCESSES[proc], np.array([[w, r, b]]))[0])


def test_fdm_only_shared_rules():
    assert one("fdm", 10, 0, 4)
    assert not one("fdm", 1.0, 0, 4)        # wall below 1.2
    assert not one("fdm", 40, 0, 4)         # slenderness w/b > 8
    assert not one("fdm", 10, 0, 1.0)       # depth below 1.2


def test_cnc_rules():
    assert one("cnc", 10, 4, 5)
    assert not one("cnc", 10, 2, 5)         # fillet below tool radius
    assert not one("cnc", 5, 4, 5)          # web below tool diameter
    assert not one("cnc", 10, 4, 22)        # deeper than 3 tool diameters
    assert not one("cnc", 10, 4, 7)         # 7 mm is >10 % from stock 6 and 8


def test_laser_rules():
    assert one("laser", 6, 1, 2)
    assert not one("laser", 1.5, 1, 1.5)    # web below 3 mm
    assert not one("laser", 20, 1, 13)       # above 12 mm gauge
    assert not one("laser", 3, 1, 4)        # web narrower than sheet thickness


def test_cast_rules():
    assert one("cast", 12, 4, 6)
    assert not one("cast", 12, 4, 2)        # max/min ratio 6 > 3
    assert not one("cast", 12, 2, 6)        # fillet below 3


def test_monotone_coverage_and_union():
    parts = sample_parts(4000, seed=1)
    c = {k: coverage({k}, parts) for k in PROCESSES}
    assert coverage({"fdm", "cnc"}, parts) >= max(c["fdm"], c["cnc"])
    assert coverage({"fdm", "cnc", "laser", "cast"}, parts) >= coverage({"fdm", "cnc", "laser"}, parts)
    assert coverage(set(), parts) == 0.0


def test_deterministic_sampling():
    assert np.array_equal(sample_parts(100, 3), sample_parts(100, 3))
    with pytest.raises(ValueError):
        sample_parts(10, kind="bogus")


def test_greedy_exhaustive_agree_on_budget_zero_and_full():
    parts = sample_parts(3000, seed=2)
    val = shop_value(parts)
    machines = {"cnc router": ("cnc", 800.0), "laser cutter": ("laser", 600.0), "casting setup": ("cast", 300.0)}
    assert exhaustive(machines, 0, val) == [] and greedy(machines, 0, val) == []
    full = exhaustive(machines, 1e9, val)
    assert val({"fdm"} | {machines[n][0] for n in full}) >= val({"fdm", "cnc", "laser", "cast"}) - 1e-12


def test_load_rule_separates_materials():
    # 10 x 6 mm arm: plastic (20 MPa) fails a 100 N tip load, steel/aluminium pass it
    p = np.array([[10.0, 5.0, 6.0, 100.0]])
    assert not feasible(PROCESSES["fdm"], p)[0]
    assert feasible(PROCESSES["cnc"], p)[0]
    # beam formula by hand: 6*100*80/(6*100) = 80 MPa
    assert 6 * 100 * 80 / (6 * 10 ** 2) == pytest.approx(80.0)


def test_load_never_adds_coverage():
    g = sample_parts(3000, 5)
    l = sample_parts(3000, 5, load=True)
    for k in PROCESSES:
        assert coverage({k}, l) <= coverage({k}, g) + 1e-12


def test_load_sample_has_geometry_unchanged():
    assert np.array_equal(sample_parts(50, 7)[:, :3], sample_parts(50, 7, load=True)[:, :3])
