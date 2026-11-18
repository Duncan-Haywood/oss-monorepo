"""Milestone 6q: the bench-shaped gear-pump family reproduces 6p's bench efficiency at the working point, and the
committed break-even with it reproduces 6k's Casappa sweep where the two overlap."""
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parents[1]
EXP = HERE / "experiments"
RES = EXP / "excavator_gear_pump_bench_results.txt"


def test_bench_family_matches_6p_at_150_bar():
    lines = RES.read_text().splitlines()
    row = next(l for l in lines if l.strip().startswith("fig11 "))
    eta150 = float(row.split()[4])
    p6 = (EXP / "kp30_bench_results.txt").read_text()
    assert "central 0.9130" in p6
    assert abs(eta150 - 0.9130) < 0.0006            # the same bench reading, through Gear and gear_pump_point


def test_fine_sweep_reproduces_6k_and_bench_share_is_complete():
    text = RES.read_text()
    for c, share in (("1.000", "9.9"), ("1.050", "28.6"), ("1.100", "54.9"), ("1.150", "94.8")):
        assert f"c {c}:" in text and f"beats 3.986: {share}% (6k committed {share}%)" in text
    assert "share beating 3.986 L/h over the 18 settings: 100.0% to 100.0%" in text
    cross = next(l for l in text.splitlines() if l.strip().startswith("50% crossing: c"))
    assert abs(float(cross.split("index 2 ")[1].split()[0]) - 0.8281) < 0.005


def test_bench_rows_power_is_torque_times_speed():
    pytest.importorskip("numpy")
    pytest.importorskip("h5py")
    sys.path.insert(0, str(HERE / "src"))
    sys.path.insert(0, str(EXP))
    import math
    import excavator_gear_pump_bench as b
    rows = b.bench_rows()
    p43 = {(r[2], r[3]): r[4] for r in rows if r[0] == 43 and r[1] == "power"}
    # 1500 r/min, 150 bar: measured 110.72 Nm (6p) scaled by 43.98 / 44
    assert abs(p43[(150, 1500)] - 110.721 * 43.98 / 44.0 * 2 * math.pi * 1500 / 60000) < 1e-6
