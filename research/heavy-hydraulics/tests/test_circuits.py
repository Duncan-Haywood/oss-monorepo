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


def test_section_area_root_found_when_supply_pressure_exceeds_old_bracket():
    # k = 20 at the PVG 32 neutral drop: the sizing root is above p_i + 400 bar; the old bracket
    # returned its endpoint (area 1.5 for a 30 L/min section at 200 bar), the correct root is smaller.
    from heavy_hydraulics.flow_share import bypass_area, section_area
    from math import sqrt
    a0 = bypass_area(45.0, 10.9)
    a = section_area(30.0, 200.0, 45.0, a0, 20.0)
    ps = 200.0 + (30.0 / a) ** 2
    assert a < 1.0
    assert abs((a0 - 20.0 * a) * sqrt(ps) - 15.0) < 1e-6


def test_ls_compensator_loss_is_inside_the_margin():
    # Milestone 3o: a pre-compensated section throttles a light actuator down from the
    # pump pressure (p_max + dp_ls) to its own, and that loss is already charged.
    # Two actuators at 50 and 150 bar, 10 L/min each: shaft energy = q_total (p_max + dp_ls)
    # exactly, so the lighter one's compensator drop is q_light * (p_max - p_light + dp_ls).
    c = (Phase("x", 10.0, (Actuator(50, 10), Actuator(150, 10))),)
    r = cycle_energy(c, "load_sensing", dp_ls=15, eta_pump=1.0)
    assert r["shaft_J"] == pytest.approx(20 * (150 + 15) * W_PER_BAR_LPM * 10.0)
    # Adding a separate compensator drop dp_c on top of the spool drop is the same as
    # raising dp_ls by dp_c: the model has no further term for it.
    a = cycle_energy(c, "load_sensing", dp_ls=15 + 4, eta_pump=1.0)["shaft_J"]
    b = cycle_energy(c, "load_sensing", dp_ls=15, eta_pump=1.0)["shaft_J"]
    assert a - b == pytest.approx(20 * 4 * W_PER_BAR_LPM * 10.0)


def test_fixed_pump_surplus_is_dropped_at_pump_pressure():
    # Milestone 3p: a fixed pump of Q feeds a spool (q = a sqrt(p - p_l)) and a bypass (q = b sqrt(p)).
    # With the bypass sized for the surplus, the solved pressure is p_l + drop and shaft power is Q p,
    # i.e. cycle_energy's open_centre charge (f = 1). A wider bypass lowers p and the actuator gets less than its demand.
    from math import sqrt
    Q, pl, q, dp = 45.0, 150.0, 20.0, 6.0
    a, b = q / sqrt(dp), (Q - q) / sqrt(pl + dp)

    def flow(p, bb):
        return a * sqrt(max(p - pl, 0.0)) + bb * sqrt(p)

    lo, hi = pl, 1e4
    for _ in range(200):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if flow(mid, b) < Q else (lo, mid)
    assert lo == pytest.approx(pl + dp, abs=1e-9)
    e = cycle_energy((Phase("x", 1.0, (Actuator(pl, q),)),), "open_centre", pump_flow=Q, dp_spool=dp, eta_pump=1.0)
    assert e["shaft_J"] == pytest.approx(Q * lo * W_PER_BAR_LPM)
    # widen the bypass: the pressure falls and the actuator's flow falls short of its demand
    lo, hi = 0.0, 1e4
    for _ in range(200):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if flow(mid, 1.2 * b) < Q else (lo, mid)
    assert lo < pl + dp
    assert a * sqrt(lo - pl) < q


def test_regen_peaky_rating_bounds():
    """Milestone 5e: a unit-mean profile's 95% rating is between the mean and its peak; flat needs 0.95x."""
    import importlib.util, os
    path = os.path.join(os.path.dirname(__file__), "..", "experiments", "regen_peaky.py")
    spec = importlib.util.spec_from_file_location("regen_peaky", path)
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    assert abs(m.rating_for(m.profile("flat"), .95) - 0.95) < 1e-6
    tri = m.profile("triangle")
    assert abs(max(tri) - 2.0) < 1e-3
    # analytic: triangle with peak 2 (unit mean) captures 1 - (2-c)^2/4 at cap c, so 95% needs c = 2 - sqrt(0.2)
    assert abs(m.rating_for(tri, .95) - (2 - 0.2 ** 0.5)) < 1e-3
