import math
import random
from house_cost import model
from house_cost.model import REFERENCE, price
from house_sobol.levers import load_levers
from house_sobol.sobol import evaluate, groups, indices, perturb_splits, run, lever_params

LEVERS = load_levers()


def test_groups_cover_columns():
    gs = groups(LEVERS)
    assert [n for n, _ in gs][-2:] == ["framing_share", "splits"]
    assert sum(c for _, c in gs) == 10 + 1 + 15


def test_perturbed_splits_valid_and_sigma_zero_is_identity():
    rng = random.Random(0)
    us = [rng.random() for _ in range(15)]
    for sigma in (0.0, 0.5):
        out = perturb_splits(us, sigma)
        for stage, split in out.items():
            assert set(split) == set(model.STAGE_DRIVERS[stage])
            assert math.isclose(sum(split.values()), 1.0)
    for stage, split in perturb_splits(us, 0.0).items():
        for d, w in split.items():
            assert math.isclose(w, model.STAGE_DRIVERS[stage][d])


def test_evaluate_restores_model_and_matches_house_cost_at_midpoint_of_sigma_zero():
    before = {k: dict(v) for k, v in model.STAGE_DRIVERS.items()}
    share = model.FRAMING_MATERIAL_SHARE
    p, _ = evaluate([0.5] * 26, LEVERS, 0.0)
    assert model.STAGE_DRIVERS == before and model.FRAMING_MATERIAL_SHARE == share
    mid = {k: (a + b) / 2 for k, a, b in lever_params(LEVERS)}
    h = model.House(**mid)
    assert p > 0 and p != 100.0
    model.FRAMING_MATERIAL_SHARE = 0.45
    try:
        assert math.isclose(p, price(h)["price"])
    finally:
        model.FRAMING_MATERIAL_SHARE = share


def test_estimators_on_additive_function():
    # f = x1 + 3*x2 on uniforms: S1 = (1, 9)/10, ST equals S1.
    rng = random.Random(3)
    n = 20000
    A = [(rng.random(), rng.random()) for _ in range(n)]
    B = [(rng.random(), rng.random()) for _ in range(n)]
    f = lambda r: r[0] + 3 * r[1]
    fa, fb = [f(r) for r in A], [f(r) for r in B]
    ab1 = [f((b[0], a[1])) for a, b in zip(A, B)]
    s1, st = indices(fa, fb, ab1)
    assert abs(s1 - 0.1) < 0.02 and abs(st - 0.1) < 0.02


def test_interaction_total_exceeds_first_order():
    # f = x1 * x2: ST > S1 for each.
    rng = random.Random(4)
    n = 20000
    A = [(rng.random(), rng.random()) for _ in range(n)]
    B = [(rng.random(), rng.random()) for _ in range(n)]
    f = lambda r: r[0] * r[1]
    fa, fb = [f(r) for r in A], [f(r) for r in B]
    ab1 = [f((b[0], a[1])) for a, b in zip(A, B)]
    s1, st = indices(fa, fb, ab1)
    assert st > s1 + 0.05


def test_run_is_deterministic_and_total_indices_sane():
    r1, s1 = run(LEVERS, 1500, 0.5, seed=7, boot=20)
    r2, _ = run(LEVERS, 1500, 0.5, seed=7, boot=20)
    assert r1 == r2
    for o in (0, 1):
        assert sum(v[0] for v in r1[o].values()) < 1.3
        assert all(v[3] > -0.1 for v in r1[o].values())
    assert s1[0][1] > 0
