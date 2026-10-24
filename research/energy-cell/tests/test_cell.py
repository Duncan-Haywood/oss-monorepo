import numpy as np
import pytest
from energy_cell import BOUNDS, BASELINE, clip, random_search, bayes_search, replay, stack_mass_kg

pybamm = pytest.importorskip("pybamm")


def quad(x):
    u = (np.asarray(x) - BOUNDS[:, 0]) / (BOUNDS[:, 1] - BOUNDS[:, 0])
    return float(-((u - 0.7) ** 2).sum())


def test_clip_and_baseline_in_bounds():
    assert np.all(clip(BASELINE) == BASELINE)
    assert np.all(clip(BOUNDS[:, 1] * 2) == BOUNDS[:, 1])


def test_mass_grows_with_thickness_and_is_plausible():
    lo, hi = BASELINE.copy(), BASELINE.copy()
    lo[0], hi[0] = 50, 150
    assert stack_mass_kg(hi) > stack_mass_kg(lo)
    assert 0.03 < stack_mass_kg(BASELINE) < 0.08  # a 5 Ah single-layer stack, no casing


def test_random_search_reproducible_and_in_bounds():
    a = random_search(quad, 10, seed=3)
    b = random_search(quad, 10, seed=3)
    assert [s for _, s in a] == [s for _, s in b]
    assert all(np.all(x >= BOUNDS[:, 0]) and np.all(x <= BOUNDS[:, 1]) for x, _ in a)


def test_bayes_beats_random_on_smooth_function():
    wins = 0
    for seed in range(5):
        r = max(s for _, s in random_search(quad, 25, seed))
        b = max(s for _, s in bayes_search(quad, 25, seed))
        wins += b >= r
    assert wins >= 4


def test_replay_clips():
    out = replay(quad, [BOUNDS[:, 1] * 3])
    assert np.all(out[0][0] == BOUNDS[:, 1])


def test_evaluate_smoke():
    from energy_cell import evaluate
    r = evaluate(BASELINE, cycles=4)
    assert r["score"] > 100 and 0.9 < r["retention"] <= 1.0  # Wh/kg of the stack, not a finished cell
