"""Policy search (cross-entropy method and a random-search baseline) under a fidelity or DR."""
import numpy as np
from .env import (LEVELS, PARAM_HI, PARAM_LO, randomise_fidelity, rollout,
                  sample_scenario, SUCCESS_DEPTH)


def episode_score(params, fid, sc):
    """Success, with a small shaping bonus for depth so that near-misses rank above stalls."""
    r = rollout(params, fid, sc)
    return float(r["success"]) + 0.1 * float(np.clip(r["depth"] / SUCCESS_DEPTH, 0.0, 1.0)), r["success"]


def make_trainer_fidelity(condition):
    """Return f(rng) -> Fidelity for a training condition: 'L0', 'L1', 'L2' or 'DR'."""
    if condition == "DR":
        return randomise_fidelity
    return lambda rng, f=LEVELS[condition]: f


def evaluate_batch(params, sample_fid, rng_seeds):
    """Score one parameter vector on common random scenarios (one rng seed per episode)."""
    tot = 0.0
    for sd in rng_seeds:
        rng = np.random.default_rng(sd)
        s, _ = episode_score(params, sample_fid(rng), sample_scenario(rng))
        tot += s
    return tot / len(rng_seeds)


def cem(condition, seed, pop=24, iters=12, n_eps=16, elite_frac=0.25):
    """Cross-entropy method on the 5 policy parameters, in a normalised [0, 1] box.

    Budget is pop * iters * n_eps episodes. Common random numbers: all candidates in an
    iteration see the same scenarios, so ranking noise is lower.
    """
    rng = np.random.default_rng(seed)
    sample_fid = make_trainer_fidelity(condition)
    mu, sd = np.full(5, 0.5), np.full(5, 0.3)
    n_el = max(2, int(pop * elite_frac))
    for _ in range(iters):
        z = np.clip(rng.normal(mu, sd, size=(pop, 5)), 0.0, 1.0)
        seeds = rng.integers(0, 2**31, size=n_eps)
        scores = np.array([evaluate_batch(PARAM_LO + zi * (PARAM_HI - PARAM_LO), sample_fid, seeds) for zi in z])
        el = z[np.argsort(scores)[-n_el:]]
        mu, sd = el.mean(0), np.maximum(el.std(0), 0.03)
    return PARAM_LO + mu * (PARAM_HI - PARAM_LO)


def random_search(condition, seed, pop=24, iters=12, n_eps=16):
    """Equal-budget baseline: pop * iters random candidates, each scored on n_eps episodes.

    Candidates are scored on fresh scenarios per iteration, the best-scoring one is kept.
    """
    rng = np.random.default_rng(seed)
    sample_fid = make_trainer_fidelity(condition)
    best, best_s = None, -1.0
    for _ in range(iters):
        seeds = rng.integers(0, 2**31, size=n_eps)
        for _ in range(pop):
            p = PARAM_LO + rng.random(5) * (PARAM_HI - PARAM_LO)
            s = evaluate_batch(p, sample_fid, seeds)
            if s > best_s:
                best, best_s = p, s
    return best


def success_rate(params, fid, n=200, seed=12345):
    """Held-out success rate on a fixed set of n scenarios (same for every policy)."""
    rng = np.random.default_rng(seed)
    ok = 0
    for _ in range(n):
        ok += bool(rollout(params, fid, sample_scenario(rng))["success"])
    return ok / n
