import numpy as np
from infra_hosting_feeders import FEEDERS, MEASURES, load_names, random_placement, pv_shape, load_day, load_year, day_stats

F = FEEDERS["123"]


def test_shapes_are_the_shipped_ones():
    pv = pv_shape()
    assert len(pv) == 1440 and pv.max() == 1.0 and 0 < pv.min() < 0.01
    y = load_year()
    assert len(y) == 8760 and y.max() == 1.0 and 0.2 < y.min() < 0.3


def test_load_day_interpolates_the_hourly_points():
    y = load_year()
    d = load_day(10)
    assert len(d) == 1440
    assert np.isclose(d[0], y[240]) and np.isclose(d[60], y[241]) and np.isclose(d[90], (y[241] + y[242]) / 2)
    assert len(load_day(364)) == 1440       # the last day closes on the first hour


def test_day_without_pv_has_no_undervoltage_and_converges():
    pl = random_placement(np.random.default_rng(1), load_names(F))
    r = day_stats(F, MEASURES[0], load_day(358), pv_shape(), pl, 0)
    assert r["bad"] == 0 and r["under"] == 0 and r["vmin"] > 0.95


def test_pv_raises_the_peak_voltage_and_regulator_set_point_lowers_it():
    pl = random_placement(np.random.default_rng(1), load_names(F))
    lm, pv = load_day(358), pv_shape()
    none = day_stats(F, MEASURES[0], lm, pv, pl, 0)
    base = day_stats(F, MEASURES[0], lm, pv, pl, 2000)
    low = day_stats(F, MEASURES[3], lm, pv, pl, 2000)
    assert base["vmax"] > none["vmax"] + 0.02 and base["over"] > 0
    assert low["over"] < base["over"] and low["vmax"] < base["vmax"]
