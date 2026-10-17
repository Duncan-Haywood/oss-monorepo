import math
import random
from house_cost import model
from house_cost.model import REFERENCE, price
from house_costsens.levers import load_levers
from house_costsens.sens import draw_drivers, drivers, swings, run, quantile, lumber_value

LEVERS = load_levers()


def test_draws_are_valid_splits():
    rng = random.Random(0)
    for _ in range(50):
        d = draw_drivers(rng, 20)
        assert set(d) == set(model.STAGE_DRIVERS)
        for stage, split in d.items():
            assert set(split) == set(model.STAGE_DRIVERS[stage])
            assert math.isclose(sum(split.values()), 1.0) and all(v >= 0 for v in split.values())


def test_reference_stays_100_under_any_split():
    rng = random.Random(1)
    for _ in range(20):
        with drivers(draw_drivers(rng, 5)):
            assert math.isclose(price(REFERENCE)["price"], 100.0)


def test_drivers_context_restores():
    before = {k: dict(v) for k, v in model.STAGE_DRIVERS.items()}
    with drivers(draw_drivers(random.Random(2), 5)):
        pass
    assert model.STAGE_DRIVERS == before


def test_high_concentration_recovers_baseline():
    base = swings(LEVERS)
    rng = random.Random(3)
    with drivers(draw_drivers(rng, 1e7)):
        s = swings(LEVERS)
    for n in base:
        assert math.isclose(s[n], base[n], rel_tol=1e-2, abs_tol=0.02), n


def test_run_is_deterministic():
    a = run(LEVERS, 20, 5, seed=7)
    b = run(LEVERS, 20, 5, seed=7)
    assert a == b


def test_lumber_value_negative_and_labour_helps():
    a, b = lumber_value()
    assert b < a < 0


def test_quantile():
    assert quantile([1, 2, 3, 4, 5], 0.5) == 3
    assert quantile([0, 10], 0.25) == 2.5
