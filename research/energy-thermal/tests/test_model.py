import math
import pytest
from energy_thermal import (Store, Medium, SAND, WATER, lumped_decay, heat_pump_cop,
                            size_for_delivery, energy_kwh)


def test_charge_energy_matches_rho_c_dt():
    s = Store(SAND, 10.0, 0.5)
    s.charge(500.0)
    expected = 10.0 * 1600 * 800 * (500 - 10) / 3.6e6
    assert s.usable_kwh(10.0) == pytest.approx(expected, rel=1e-9)


def test_no_loss_with_zero_conductance_to_ambient():
    s = Store(SAND, 5.0, 0.3, h_out=1e-12)
    s.charge(400.0)
    e0 = sum(c * t for c, t in zip(s.cap, s.T))
    s.run(60)
    e1 = sum(c * t for c, t in zip(s.cap, s.T))
    assert e1 == pytest.approx(e0, rel=1e-6)


def test_matches_lumped_decay_when_medium_is_well_mixed_and_insulation_has_no_mass():
    ins = Medium("light", 1e-3, 1.0, 0.05)
    s = Store(WATER, 2.0, 0.2, insulation=ins, n_ins=6)
    s.charge(90.0)
    cap = sum(s.cap[:s.n_med])
    days = 20
    s.run(days, dt_h=1.0)
    exact = lumped_decay(s.ua(), cap, 90.0, 10.0, days * 86400)
    assert s.mean_medium_temp() == pytest.approx(exact, abs=0.15)


def test_steady_conductance_of_a_shell_is_analytic():
    s = Store(SAND, 1.0, 0.4, h_out=1e9)
    r1, r2 = s.r_med, s.r_out
    shell = 4 * math.pi * 0.08 / (1 / r1 - 1 / r2)
    # the series includes a half sand shell too, so the total is slightly smaller than the shell alone
    assert s.ua() == pytest.approx(shell, rel=0.06)
    assert s.ua() < shell


def test_bigger_store_keeps_a_larger_share():
    def kept(v):
        s = Store(SAND, v, 0.5)
        s.charge(500.0)
        s.run(30)
        return s.usable_kwh(100.0) / (v * 1600 * 800 * 400 / 3.6e6)
    assert kept(1) < kept(10) < kept(100)


def test_thicker_insulation_keeps_more():
    def kept(t):
        s = Store(SAND, 10.0, t)
        s.charge(500.0)
        s.run(30)
        return s.usable_kwh(100.0)
    assert kept(0.25) < kept(0.5) < kept(1.0)


def test_size_for_delivery_meets_target():
    v, s = size_for_delivery(SAND, 2000.0, 60, 500.0, 100.0, 0.5)
    assert s.usable_kwh(100.0) >= 2000.0 - 1e-6
    assert v * 1600 * 800 * 400 / 3.6e6 > 2000.0  # must be bigger than the no-loss size


def test_heat_pump_cop_falls_with_lift():
    assert heat_pump_cop(35, 5) > heat_pump_cop(35, -10) > heat_pump_cop(55, -10) > 1


def test_energy_kwh():
    assert energy_kwh(3.6e6) == 1.0
