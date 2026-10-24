import os, sys
from dataclasses import replace
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from infra_sortvalue import Config, load_items, run_many, summarise
from infra_sortvalue.model import value_of, recall

ITEMS = load_items()


def test_table_is_taco():
    assert len(ITEMS) == 4784


def test_light_load_revenue_is_expected_value():
    # Nothing is ever lost to the clock, so revenue/min = arrival rate x mean(recall x value) x grasp.
    c = Config(speed=0.05, density=1.0, arm_speed=50.0, t_base=0.01, false_call=0.0, horizon=60000)
    tgt = [(cat, r) for cat, sup, r in ITEMS if value_of(cat, c) > 0 and sup in ("Bottle", "Can")]
    ev = sum(recall(r * c.scene_width, c) * value_of(k, c) for k, r in tgt) / len(ITEMS) * c.grasp
    exp = ev * c.speed * c.density * 60
    got, ci = summarise(run_many(c, ITEMS, runs=10), "per_min")
    assert abs(got - exp) < max(3 * ci, 0.03 * exp)


def test_policies_tie_when_all_items_are_identical():
    # one value for every target and no travel differences: value order cannot help
    c = Config(can_value=1.0, arm_speed=1e6, density=6.0)
    a = [r["per_min"] for r in run_many(replace(c, policy="fifo"), ITEMS, 8)]
    b = [r["per_min"] for r in run_many(replace(c, policy="density"), ITEMS, 8)]
    assert abs(sum(a) - sum(b)) / sum(a) < 0.03


def test_value_order_not_worse_under_overload():
    c = Config(density=10.0)
    f = sum(r["per_min"] for r in run_many(replace(c, policy="fifo"), ITEMS, 20))
    v = sum(r["per_min"] for r in run_many(replace(c, policy="value"), ITEMS, 20))
    assert v > f


def test_revenue_never_exceeds_available_value():
    for r in run_many(Config(density=10.0, false_cost=0.0), ITEMS, 5):
        assert r["revenue"] <= r["available"] + 1e-9


def test_runs_repeat_exactly():
    assert run_many(Config(), ITEMS, 3) == run_many(Config(), ITEMS, 3)
