import math
import os
import pytest
from heavy_hydraulics.spool_floor import read_table, size_spool, floor_drop, oc_pressure

CSV = os.path.join(os.path.dirname(__file__), "..", "experiments", "data", "pvg32_flow_full_travel.csv")


def test_table_reads_band_middles_and_exponent():
    t = read_table(CSV)
    assert [r["spool"] for r in t] == ["A", "B", "C", "D", "E"]
    a = t[0]
    assert a["q10"] == pytest.approx(11.7) and a["q20"] == pytest.approx(16.95)
    assert a["n"] == pytest.approx(math.log(16.95 / 11.7) / math.log(2))


def test_sizing_rule():
    t = read_table(CSV)
    assert size_spool(10, t)["spool"] == "A"
    assert size_spool(10.01, t)["spool"] == "B"
    assert size_spool(30, t, step_up=1)["spool"] == "D"
    assert size_spool(500, t)["spool"] == "E"
    assert size_spool(80, t, step_up=3)["spool"] == "E"


def test_floor_drop_passes_through_the_manual_points():
    row = read_table(CSV)[2]  # C
    for law in ("orifice", "power"):
        assert floor_drop(row["q10"], row, law) == pytest.approx(10.0)
        assert floor_drop(0.0, row, law) == 0.0
    assert floor_drop(row["q20"], row, "power") == pytest.approx(20.0)
    assert floor_drop(row["q10"] / 2, row, "orifice") == pytest.approx(2.5)


def test_oc_pressure_is_highest_inlet_plus_drop():
    assert oc_pressure([(120.0, 3.0), (100.0, 30.0)]) == 130.0
    assert oc_pressure([]) is None
