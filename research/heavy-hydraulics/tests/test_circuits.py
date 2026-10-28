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
