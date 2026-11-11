import random

import pytest

from heavy_hydraulics import Phase, Actuator, cycle_energy, REFERENCE_CYCLE
from heavy_hydraulics.circuits import W_PER_BAR_LPM
from heavy_hydraulics.breakeven import breakeven_margin, median_breakeven, share_ls_worse

Q = 45.0


def energies(c, m, d, pn=0.0, t_idle=0.0, q_i=0.0, p_i=0.0, q_sb=0.0):
    ls = cycle_energy(c, "load_sensing", pump_flow=Q, dp_ls=m, eta_pump=1.0)["shaft_J"]
    ls += (q_i * (p_i + m) + q_sb * m) * W_PER_BAR_LPM * t_idle
    oc = cycle_energy(c, "open_centre", pump_flow=Q, dp_spool=d, eta_pump=1.0)["shaft_J"]
    oc += Q * pn * W_PER_BAR_LPM * t_idle
    return ls, oc


def rand_cycle(rng):
    return tuple(Phase(f"p{k}", rng.uniform(1, 5), tuple(
        Actuator(rng.uniform(20, 200), rng.uniform(1, 20)) for _ in range(rng.randint(1, 2))))
        for k in range(4))


def test_ls_equals_oc_at_the_closed_form_margin():
    rng = random.Random(1)
    for _ in range(200):
        c = rand_cycle(rng)
        kw = dict(d=rng.uniform(0, 10), pn=rng.uniform(0, 15), t_idle=rng.uniform(0, 30),
                  q_i=rng.uniform(0, 8), p_i=rng.uniform(0, 25), q_sb=rng.uniform(0, 4))
        r = breakeven_margin(c, Q, oc_drop=kw["d"], p_neutral=kw["pn"], t_idle=kw["t_idle"],
                             q_idle=kw["q_i"], p_idle=kw["p_i"], q_standby=kw["q_sb"])
        ls, oc = energies(c, r["m"], **kw)
        assert ls == pytest.approx(oc, rel=1e-9)
        lo, oc2 = energies(c, r["m"] - 1.0, **kw)
        assert lo < oc2
        assert r["m"] == pytest.approx((r["S"] + r["D"] + r["I"]) / r["B"])


def test_slopes_are_exact_derivatives():
    c = REFERENCE_CYCLE
    a = breakeven_margin(c, Q, oc_drop=3.0, p_neutral=8.0, t_idle=10.0, q_standby=2.0)
    b = breakeven_margin(c, Q, oc_drop=4.0, p_neutral=8.0, t_idle=10.0, q_standby=2.0)
    e = breakeven_margin(c, Q, oc_drop=3.0, p_neutral=9.0, t_idle=10.0, q_standby=2.0)
    assert b["m"] - a["m"] == pytest.approx(a["dm_ddrop"])
    assert e["m"] - a["m"] == pytest.approx(a["dm_dpn"])


def test_per_phase_pressures_match_constant_drop():
    c = REFERENCE_CYCLE
    ps = [max(x.pressure for x in ph.actuators) + 6.0 for ph in c]
    assert breakeven_margin(c, Q, oc_pressures=ps)["m"] == pytest.approx(breakeven_margin(c, Q, oc_drop=6.0)["m"])


def test_median_of_ratios_crosses_one_at_median_breakeven():
    rng = random.Random(2)
    cycles = [rand_cycle(rng) for _ in range(301)]
    ms = [breakeven_margin(c, Q, oc_drop=5.0)["m"] for c in cycles]
    m0 = median_breakeven(ms)
    ratios = sorted(energies(c, m0, 5.0)[0] / energies(c, m0, 5.0)[1] for c in cycles)
    assert ratios[150] == pytest.approx(1.0, rel=1e-9)
    worse = 100.0 * sum(energies(c, 30.0, 5.0)[0] > energies(c, 30.0, 5.0)[1] for c in cycles) / len(cycles)
    assert share_ls_worse(ms, 30.0) == pytest.approx(worse)


def test_rejects_bad_inputs():
    c = (Phase("x", 1.0, (Actuator(100, 50),)),)
    with pytest.raises(ValueError):
        breakeven_margin(c, Q)
    c = (Phase("x", 1.0, (Actuator(100, 10),)),)
    with pytest.raises(ValueError):
        breakeven_margin(c, Q, oc_pressures=[90.0])
