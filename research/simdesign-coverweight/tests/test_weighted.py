import numpy as np
import pytest

from simdesign_coverweight.weighted import PROCESSES, sample_parts, weights, wcoverage, wshop_value


def test_weights_sum_to_one():
    p = sample_parts(500, 1)
    for mode in ("count", "mass"):
        assert weights(p, mode).sum() == pytest.approx(1.0)


def test_count_weights_equal_plain_share():
    p = sample_parts(2000, 2, load=True)
    from simdesign_processcover import coverage
    assert wcoverage({"cast"}, p, weights(p, "count")) == pytest.approx(coverage({"cast"}, p))


def test_mass_weights_proportional_to_volume():
    p = np.array([[10.0, 0.0, 2.0], [10.0, 0.0, 4.0]])
    w = weights(p, "mass")
    assert w[1] == pytest.approx(2 * w[0])


def test_bad_mode():
    with pytest.raises(ValueError):
        weights(sample_parts(5), "value")


def test_coverage_in_unit_interval_and_monotone():
    p = sample_parts(3000, 3, load=True)
    wt = weights(p, "mass")
    a = wcoverage({"fdm"}, p, wt)
    b = wcoverage({"fdm", "cast"}, p, wt)
    assert 0 <= a <= b <= 1


def test_shop_value_caches_and_matches():
    p = sample_parts(1000, 4)
    wt = weights(p, "mass")
    v = wshop_value(p, wt)
    assert v({"fdm", "cnc"}) == v(["cnc", "fdm"]) == pytest.approx(wcoverage({"fdm", "cnc"}, p, wt))


def test_one_heavy_part_dominates_mass_weighting():
    p = np.array([[25.0, 5.0, 30.0]] + [[3.0, 5.0, 1.5]] * 9)
    wt = weights(p, "mass")
    assert wt[0] > 0.9
    # the big part (w/b < 8, depth 30 mm) is FDM-feasible, so weighted FDM coverage is above 0.9
    assert wcoverage({"fdm"}, p, wt) > 0.9


def test_processes_available():
    assert set(PROCESSES) == {"fdm", "cnc", "laser", "cast"}
