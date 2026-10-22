"""Random-search 'training' of the follow skill's three gains against a simulator and a distribution of worlds."""
import numpy as np

from . import model as M


def sample_policies(rng, n):
    K = np.exp(rng.uniform(np.log(100.0), np.log(30000.0), n))
    B = np.exp(rng.uniform(np.log(10.0), np.log(2000.0), n))
    Ki = np.where(rng.random(n) < 0.3, 0.0, np.exp(rng.uniform(np.log(10.0), np.log(5000.0), n)))
    return K, B, Ki


def score_candidates(K, B, Ki, world, kind, chunk=20, **crit):
    """Success rate and mean peak tilt of each candidate over the same episodes (common random numbers)."""
    n_ep = world["m"].size
    succ, tilt = np.zeros(K.size), np.zeros(K.size)
    for a in range(0, K.size, chunk):
        sl = slice(a, a + chunk)
        c = K[sl].size
        w = {k: np.tile(v, c) for k, v in world.items()}
        pol = {"K": np.repeat(K[sl], n_ep), "B": np.repeat(B[sl], n_ep), "Ki": np.repeat(Ki[sl], n_ep)}
        r = M.simulate(w, pol, kind)
        ok = M.success(r, **crit).reshape(c, n_ep)
        succ[sl] = ok.mean(1)
        tilt[sl] = np.nan_to_num(r["peak_tilt_deg"], nan=30.0).reshape(c, n_ep).mean(1)
    return succ, tilt


def train(seed, kind, randomised, n_cand=300, n_ep=120, **crit):
    """Return the best (K, B, Ki) by success rate, ties broken by smaller mean peak tilt.

    randomised=False trains on the single nominal world (22 kg, 2 s, 0.2 s lag, exact feed-forward) only."""
    rng = np.random.default_rng(seed)
    K, B, Ki = sample_policies(rng, n_cand)
    world = M.draw_world(rng, n_ep, kind) if randomised else M.nominal_world(n_ep, kind=kind)
    succ, tilt = score_candidates(K, B, Ki, world, kind, **crit)
    best = int(np.lexsort((tilt, -succ))[0])
    return {"K": float(K[best]), "B": float(B[best]), "Ki": float(Ki[best]), "train_success": float(succ[best])}
