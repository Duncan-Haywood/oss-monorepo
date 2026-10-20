"""Three proposers at an equal evaluation budget. Each takes `f(x) -> score` and returns the
list of (x, score) in the order evaluated."""
import numpy as np
from scipy.stats import norm
from .cell import BOUNDS, clip


def _unit(x):
    return (np.asarray(x) - BOUNDS[:, 0]) / (BOUNDS[:, 1] - BOUNDS[:, 0])


def _real(u):
    return BOUNDS[:, 0] + np.asarray(u) * (BOUNDS[:, 1] - BOUNDS[:, 0])


def random_search(f, budget, seed):
    rng = np.random.default_rng(seed)
    out = []
    for _ in range(budget):
        x = _real(rng.random(len(BOUNDS)))
        out.append((x, f(x)))
    return out


def _gp(U, y, Uq, ls=0.35, noise=1e-6):
    k = lambda A, B: np.exp(-0.5 * (((A[:, None, :] - B[None]) / ls) ** 2).sum(-1))
    mu_y, sd_y = y.mean(), y.std() + 1e-9
    z = (y - mu_y) / sd_y
    K = k(U, U) + noise * np.eye(len(U))
    Ks = k(Uq, U)
    Kinv_z = np.linalg.solve(K, z)
    mu = Ks @ Kinv_z
    v = np.linalg.solve(K, Ks.T)
    var = np.clip(1.0 - (Ks * v.T).sum(1), 1e-12, None)
    return mu * sd_y + mu_y, np.sqrt(var) * sd_y


def bayes_search(f, budget, seed, n_init=8, n_cand=2000):
    """Gaussian-process (RBF, fixed length-scale) expected improvement over random candidates."""
    rng = np.random.default_rng(seed)
    out = []
    for _ in range(min(n_init, budget)):
        x = _real(rng.random(len(BOUNDS)))
        out.append((x, f(x)))
    while len(out) < budget:
        U = np.array([_unit(x) for x, _ in out])
        y = np.array([s for _, s in out])
        cand = rng.random((n_cand, len(BOUNDS)))
        mu, sd = _gp(U, y, cand)
        z = (mu - y.max()) / sd
        ei = (mu - y.max()) * norm.cdf(z) + sd * norm.pdf(z)
        x = _real(cand[int(np.argmax(ei))])
        out.append((x, f(x)))
    return out


def replay(f, proposals):
    """Evaluate a committed list of proposals (the session agent as proposer)."""
    return [(clip(x), f(x)) for x in proposals]
