import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from ship_decision import decide


def row(cov_w):
    return {"city": "x", "target": "a2i", "models": {
        m: {"dequantised_nonempty": {"coverage": c, "width": w}} for m, (c, w) in cov_w.items()}}


def test_narrowest_above_floor():
    r = row({"baseline": (0.80, 50), "table3": (0.80, 40), "full": (0.80, 60)})
    assert decide([r])[0]["ship"] == "table3"


def test_undercovering_arm_excluded():
    r = row({"baseline": (0.80, 50), "table3": (0.70, 10), "full": (0.80, 60)})
    assert decide([r])[0]["ship"] == "baseline"


def test_tie_prefers_readable():
    r = row({"baseline": (0.8, 50), "table3": (0.8, 50), "full": (0.8, 50)})
    assert decide([r])[0]["ship"] == "baseline"


def test_near_tie_within_one_percent_prefers_readable():
    r = row({"baseline": (0.8, 100.5), "table3": (0.8, 100.0), "full": (0.8, 120)})
    assert decide([r])[0]["ship"] == "baseline"
