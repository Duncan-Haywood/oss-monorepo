"""Milestone 7b: SpunGear equals Gear up to the largest size, spins it to the cap above (flow at the solved speed is
the asked-for flow), holds per-unit values beyond the cap, and the committed results follow from those pieces."""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
EXP = HERE / "experiments"
RES = EXP / "gear_pump_spin_results.txt"
sys.path.insert(0, str(HERE / "src"))
sys.path.insert(0, str(EXP))


def _azpf():
    import gear_pump_eight as g8
    import digitise_rexroth_azpf as rf
    from excavator_gear_pump import Gear
    from gear_pump_spin import SpunGear
    rows = g8.azpf_rows()
    return Gear(rows, sizes=rf.SIZES), SpunGear(rows, rf.SIZES, 3000.0)


def test_spun_equals_held_inside_the_family():
    held, spun = _azpf()
    for q in (10.0, 30.0, 50.0, float(spun.qn[-1])):
        for p in (50.0, 150.0, 200.0):
            assert spun.eta(q, p) == held.eta(q, p)
        assert spun.idle(q, 12.0) == held.idle(q, 12.0)


def test_speed_gives_the_asked_flow_and_is_capped():
    from heavy_hydraulics.measured import gear_pump_point
    _, spun = _azpf()
    for q in (65.0, 75.0, 84.0):
        n = spun.speed(q)
        assert 2100.0 < n < 3000.0
        assert abs(gear_pump_point(spun.rows, 28, n)[0](20.0) - q) < 1e-3
    assert spun.speed(85.0) == spun.speed(150.0) == 3000.0
    # beyond the cap the per-unit values are held: efficiency equal, idle power proportional to flow
    assert spun.eta(90.0, 150.0) == spun.eta(150.0, 150.0)
    assert abs(spun.idle(150.0, 12.0) / 150.0 - spun.idle(90.0, 12.0) / 90.0) < 1e-12


def test_spinning_raises_drag_per_litre_and_lowers_efficiency_at_the_index_point():
    held, spun = _azpf()
    assert spun.idle(80.0, 0.0) / 80.0 > held.idle(80.0, 0.0) / 80.0
    assert spun.eta(85.0, 150.0) < held.eta(85.0, 150.0)
    # drag per L/min rises monotonically with the spin speed
    d = [spun.idle(q, 0.0) / q for q in (60.0, 65.0, 70.0, 75.0, 80.0)]
    assert all(b > a for a, b in zip(d, d[1:]))


def test_committed_results_are_consistent():
    text = RES.read_text()
    assert "Check: held diagonals against 7a's table: azpf 0.8075 (+0.0000), azpn 0.8050 (+0.0000)" in text
    m = re.search(r"azpf_spin\s+([\d.]+)\s+[+-][\d.]+\s+([\d.]+)", text)
    e, kw = float(m.group(1)), float(m.group(2))
    held, spun = _azpf()
    assert abs(spun.eta(85.0, 150.0) - e) < 1e-4
    m = re.search(r"AZPF spun: E50 ([\d.]+).*\n.*at ([\d.]+) kW: ([\d.]+), error ([+-][\d.]+)", text)
    e50, kw2, pred, err = (float(m.group(i)) for i in range(1, 5))
    assert kw2 == kw
    assert abs(0.8239 + 0.0179 * (kw - 3.57) - pred) < 3e-4
    assert abs(e50 - pred - err) < 1e-4
    m = re.search(r"diagonal RMS: one-number ([\d.]+), two-number ([\d.]+)", text)
    assert float(m.group(2)) < float(m.group(1)) / 3
