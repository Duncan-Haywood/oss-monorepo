import random
from dataclasses import replace
from house_schedule import TASKS, Scenario, simulate, run, interest_share


def test_graph_is_topologically_ordered():
    seen = set()
    for name, _, _, preds, *_ in TASKS:
        assert set(preds) <= seen
        seen.add(name)


def test_deterministic():
    assert run(Scenario("a"), 200, seed=3) == run(Scenario("a"), 200, seed=3)


def test_without_noise_duration_is_at_least_critical_path():
    sc = Scenario("q", rain_p=0.0, inspect_fail=0.0, handoff_gap=1e-9, sd_frac=0.0, order_early=True)
    total, _ = simulate(sc, random.Random(0))
    finish = {}
    for name, _, mean, preds, *_ in TASKS:
        finish[name] = max([finish[p] for p in preds], default=0) + mean
    assert total >= max(finish.values())


def test_more_rain_and_failures_never_shorten_on_average():
    base = run(Scenario("b"), 1500)["mean"]
    assert run(Scenario("b", rain_p=0.3), 1500)["mean"] > base
    assert run(Scenario("b", inspect_fail=0.4), 1500)["mean"] > base


def test_ordering_early_helps():
    assert run(Scenario("e", order_early=True), 1500)["mean"] < run(Scenario("b"), 1500)["mean"]


def test_interest_share_scales_with_rate_and_carry():
    assert interest_share(100, 0.08) == 2 * interest_share(100, 0.04) == 2 * interest_share(50, 0.08)
