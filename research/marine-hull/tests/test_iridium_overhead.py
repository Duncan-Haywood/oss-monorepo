import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "experiments"))
from run_iridium_overhead import iridium_wh  # noqa: E402


def test_one_kb_is_forty_joules():
    assert abs(iridium_wh(1, 1) - 40 / 3600) < 1e-12


def test_extra_kb_cost_thirty_joules():
    assert abs(iridium_wh(1, 5) - (40 + 120) / 3600) < 1e-12


def test_linear_in_surfacings():
    assert abs(iridium_wh(100, 5) - 100 * iridium_wh(1, 5)) < 1e-9
