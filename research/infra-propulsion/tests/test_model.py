import math
from infra_propulsion import *


def test_battery_range_is_energy_over_force():
    m = truck()
    c = battery(250)
    r = range_km(m, c, 1000.0)
    assert abs(r - 1000 * 250 * 3600 * 0.9 * 0.88 / m.force(m.m0) / 1000) < 1e-6


def test_breguet_matches_closed_form():
    m = aircraft()
    c = diesel()
    store = 100e3
    # closed form with fuel mass = store (lhv-based burn), eps_sys = 0.95 lhv: energy = 0.95 lhv store

    k = c.eta["aircraft"] * c.lhv * 17.0 / G
    # integration burns energy/lhv = 0.95*store of mass
    burned = 0.95 * store
    exact = k * math.log(m.m0 / (m.m0 - burned)) / 1000.0
    assert abs(range_km(m, c, store, steps=4000) - exact) / exact < 1e-3


def test_solution_hits_range_exactly():
    for f in MODES.values():
        m = f()
        for c in (diesel(), battery(500), h2_700bar()):
            s = solve(m, c)
            if s["feasible"]:
                assert abs(range_km(m, c, s["store"]) - m.range_km) / m.range_km < 1e-6 or s["payload"] == m.payload_cap


def test_payload_monotone_in_specific_energy():
    m = ship()
    ps = [solve(m, battery(w))["payload"] for w in (150, 300, 600, 1200)]
    assert ps == sorted(ps)


def test_aircraft_battery_infeasible_today():
    assert not solve(aircraft(), battery(250))["feasible"]


def test_diesel_truck_floor_is_plausible_mpg():
    m = truck()
    kg_mi = m.force(m.m0) * 1609.344 / diesel().eta["truck"] / DIESEL_LHV
    mpg = 1 / (kg_mi / 0.832 / 3.785)
    assert 6.5 < mpg < 9.0


def test_davis_rail_per_ton_about_5_lb():
    m = rail()
    lb_ton = m.force(m.m0) / m.m0 / LB_PER_TON_N_PER_KG
    assert 4.5 < lb_ton < 6.0


def test_admiralty_scaling():
    a, b = ship(v_kn=10), ship(v_kn=20)
    # F = P / v ~ v^2
    assert abs(b.force(b.m0) / a.force(a.m0) - 4.0) < 1e-9


def test_breakeven_returns_bracketing_value():
    m = truck()
    w = breakeven_wh_kg(m, 0.9)
    base = solve(m, diesel())["payload"]
    assert abs(solve(m, battery(w))["payload"] / base - 0.9) < 1e-3
