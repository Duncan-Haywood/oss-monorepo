import pytest
from heavy_hydraulics import (Phase, Actuator, cycle_energy, scale_cycle,
                              REFERENCE_CYCLE, CIRCUITS)
from heavy_hydraulics.circuits import W_PER_BAR_LPM


def single(p, q, s=10.0):
    return (Phase("x", s, (Actuator(p, q),)),)


def test_ls_single_actuator_analytic():
    # one actuator: LS shaft energy = useful * (p + dp)/p / eta
    c = single(100, 20)
    r = cycle_energy(c, "load_sensing", dp_ls=20, eta_pump=0.8)
    assert r["shaft_J"] == pytest.approx(r["useful_J"] * 1.2 / 0.8)


def test_open_centre_full_flow_single_actuator():
    c = single(100, 10)
    r = cycle_energy(c, "open_centre", pump_flow=40, dp_spool=10, eta_pump=1.0)
    assert r["shaft_J"] == pytest.approx(40 * 110 * W_PER_BAR_LPM * 10)


def test_ordering_on_reference_cycle():
    e = {c: cycle_energy(REFERENCE_CYCLE, c)["shaft_J"] for c in CIRCUITS}
    assert e["metered"] < e["load_sensing"] < e["open_centre"]


def test_equal_pressures_no_sharing_loss():
    c = scale_cycle(REFERENCE_CYCLE, spread=0.0)
    ls = cycle_energy(c, "load_sensing", dp_ls=5, eta_pump=1)
    m = cycle_energy(c, "metered", dp_m=5, eta_pump=1)
    assert ls["shaft_J"] == pytest.approx(m["shaft_J"])


def test_pump_too_small_raises():
    with pytest.raises(ValueError):
        cycle_energy(REFERENCE_CYCLE, "open_centre", pump_flow=10)


def test_energy_conserved():
    r = cycle_energy(REFERENCE_CYCLE, "load_sensing")
    assert r["shaft_J"] == pytest.approx(r["useful_J"] + r["heat_J"])


def test_idle_sensitivity_hits_target_load_factor():
    import io, contextlib, os, random, sys
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "experiments"))
    with contextlib.redirect_stdout(io.StringIO()):
        import idle_sensitivity as i
    c, *_ = i.pc.one(random.Random(1))
    c2 = i.with_idle(c, 0.35, random.Random(2))
    peak = max(i.useful_power(p) for p in c)
    lf = sum(i.useful_power(p) * p.seconds for p in c2) / sum(p.seconds for p in c2) / peak
    assert 0.34 < lf < 0.36


def test_flow_share_single_actuator_unchanged():
    from heavy_hydraulics.flow_share import phase_slowdown
    assert phase_slowdown([(100.0, 20.0)], 45.0, 10.9) == 1.0


def test_flow_share_equal_loads_split_evenly_within_pump_flow():
    from heavy_hydraulics.flow_share import shared_flows
    got = shared_flows([(100.0, 10.0), (100.0, 10.0)], 45.0, 10.9)
    assert abs(got[0] - got[1]) < 1e-6 and 10.0 <= got[0] and sum(got) <= 45.0 + 1e-6


def test_flow_share_low_pressure_actuator_steals():
    from heavy_hydraulics.flow_share import shared_flows
    hi, lo = shared_flows([(150.0, 10.0), (40.0, 10.0)], 45.0, 10.9)
    assert hi < 10.0 < lo


def test_flow_share_faster_bypass_closing_helps_the_stalled_actuator():
    from heavy_hydraulics.flow_share import phase_slowdown
    d = [(40.0, 20.0), (160.0, 20.0)]
    slow = [phase_slowdown(d, 45.0, 10.9, k) for k in (0.5, 1.0, 2.0, 3.0)]
    assert all(a >= b for a, b in zip(slow, slow[1:]))
    assert phase_slowdown(d, 45.0, 10.9, 1.0) == phase_slowdown(d, 45.0, 10.9)


def test_flow_share_ls_factor_is_one_inside_pump_flow_and_scales_beyond():
    import os, sys
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "experiments"))
    from flow_share_ls import ls_factor
    assert ls_factor([(50.0, 20.0), (100.0, 20.0)], 45.0) == 1.0
    assert abs(ls_factor([(50.0, 40.0), (100.0, 40.0)], 45.0) - 80.0 / 45.0) < 1e-12
