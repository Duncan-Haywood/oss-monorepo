from dataclasses import replace

from house_orderlead import Carry, plan_begins, simulate_ordered
from house_schedule import Params, simulate

P = Params()
PLAN = plan_begins(P, n=40)
FREE = Carry(deposit=0.0, storage_rate=0.0, damage_rate=0.0)


def test_baseline_rule_reproduces_house_schedule():
    for s in range(10):
        T, I, _ = simulate_ordered(P, s, baseline=True)
        T0, I0 = simulate(P, s)
        assert abs(T - T0) < 1e-9 and abs(I - I0) < 1e-9


def test_huge_lead_equals_ordering_at_day_zero():
    for s in range(10):
        T = simulate_ordered(P, s, k=1000, plan=PLAN)[0]
        assert abs(T - simulate(replace(P, order_early=True), s)[0]) < 1e-9


def test_ordering_earlier_never_finishes_later():
    for s in range(20):
        ts = [simulate_ordered(P, s, k=k, plan=PLAN)[0] for k in (0, 1, 2, 4, 50)]
        assert all(a >= b - 1e-9 for a, b in zip(ts, ts[1:]))


def test_holding_costs_are_nonnegative_and_scale_with_rates():
    for s in range(10):
        lo = simulate_ordered(P, s, k=4, plan=PLAN, carry=Carry(storage_rate=0.1, damage_rate=0.0))[2]
        hi = simulate_ordered(P, s, k=4, plan=PLAN, carry=Carry(storage_rate=0.4, damage_rate=0.0))[2]
        assert 0 <= lo <= hi


def test_free_to_hold_still_charges_only_financing():
    c = simulate_ordered(P, 3, k=1000, plan=PLAN, carry=FREE)[2]
    assert c >= 0
    assert c < simulate_ordered(P, 3, k=1000, plan=PLAN)[2]
