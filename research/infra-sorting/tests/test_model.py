import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from infra_sorting import Config, load_items, run_many, summarise
from infra_sorting.model import recall, TARGET

ITEMS = load_items()


def test_table_is_taco():
    assert len(ITEMS) == 4784                    # TACO annotations.json has 4784 annotations
    assert 0.14 < sum(1 for c, _ in ITEMS if c in TARGET) / len(ITEMS) < 0.16


def test_light_load_recovery_equals_recall_times_grasp():
    # Very slow belt, short pick: nothing is ever lost to the clock, so recovery is the
    # per-item detection probability times grasp success.
    c = Config(speed=0.05, pick_time=0.05, density=1.0, horizon=40000)
    expect = sum(recall(r * c.scene_width, c) for k, r in ITEMS if k in TARGET) / sum(1 for k, _ in ITEMS if k in TARGET) * c.grasp
    got, ci = summarise(run_many(c, ITEMS, runs=20), "recovery")
    assert abs(got - expect) < max(3 * ci, 0.01)


def test_pick_rate_never_exceeds_cycle_limit():
    c = Config(speed=1.5, density=8.0, pick_time=1.0, false_call=0.5)
    for r in run_many(c, ITEMS, runs=5):
        assert r["picks_min"] + r["grasp_fail"] * 60 / c.horizon <= 60.0 / c.pick_time + 1e-9


def test_no_false_calls_means_pure_bin():
    c = Config(false_call=0.0)
    for r in run_many(c, ITEMS, runs=5):
        assert r["purity"] == 1.0


def test_faster_belt_lowers_recovery():
    lo = summarise(run_many(Config(speed=0.2), ITEMS, runs=20), "recovery")[0]
    hi = summarise(run_many(Config(speed=1.5), ITEMS, runs=20), "recovery")[0]
    assert hi < lo


def test_deterministic():
    c = Config()
    assert run_many(c, ITEMS, runs=3) == run_many(c, ITEMS, runs=3)
