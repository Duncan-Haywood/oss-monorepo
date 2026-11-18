"""Milestone 149: hedged fall-backs for the ff tau-b guard, replayed on milestones 144 to 147."""
import importlib.util
import random
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments"


def _load():
    spec = importlib.util.spec_from_file_location("verified_dse_t149", EXP / "hedge_ff" / "analyse.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_hedge_spends_at_most_the_budget():
    m = _load()
    n, R, p = 60, 5.0, 4
    B = n + 8 * (R - 1)
    sk = list(range(n))
    others = list(range(p, n))
    for s, h in m.HEDGES:
        chosen = m.hedge_pick(n, sk, R, B - p * R, others, s, h, random.Random(1))
        assert len(chosen) == len(set(chosen)) and not set(chosen) & set(range(p))
        mapped_routes = min(s, len(chosen))
        assert s + mapped_routes * (R - 1) + (len(chosen) - mapped_routes) * R <= B - p * R + 1e-9


def test_empty_hedge_matches_random_count():
    """HF(0, 0) routes exactly k - p fresh points, milestone 148's random fall-back."""
    m = _load()
    n, R, p = 60, 5.0, 4
    B = n + 8 * (R - 1)
    k = int(B // R)
    chosen = m.hedge_pick(n, list(range(n)), R, B - p * R, list(range(p, n)), 0, 0, random.Random(2))
    assert len(chosen) == k - p


def test_hedge_keeps_the_subset_best():
    m = _load()
    n, R, p = 60, 5.0, 4
    B = n + 8 * (R - 1)
    rng = random.Random(3)
    chosen = m.hedge_pick(n, list(range(n)), R, B - p * R, list(range(p, n)), 32, 3, rng)
    rng2 = random.Random(3)
    sub = rng2.sample(list(range(p, n)), 32)
    assert chosen[:3] == sorted(sub)[:3]


def test_results_report_the_registered_outcome():
    txt = (EXP / "hedge_ff" / "results.txt").read_text()
    assert "(1) PRIMARY: LOMO guard over the full grid below SWC: False (4.21 against 2.98)" in txt
    assert "(7) GC entries reproduce milestone 148: True" in txt
