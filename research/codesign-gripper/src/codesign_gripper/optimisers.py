"""Baselines with no LLM: random search, CMA-ES (cma package) and Gaussian-process Bayesian optimisation
(expected improvement), all maximising the objective J on the unit cube of the four design variables. Every
method gets the same number of simulator evaluations. Same structure as research/simdesign-llm."""
import json
import numpy as np
from scipy.stats import norm, qmc
from . import gripper as G

D = 4


def _phys(u): return G.LB + np.clip(u, 0, 1) * (G.UB - G.LB)


def random_search(budget, seed, evaluate=G.evaluate):
    rng = np.random.default_rng(seed)
    return [evaluate(_phys(rng.random(D))) for _ in range(budget)]


def cma_es(budget, seed, evaluate=G.evaluate):
    import cma
    rng = np.random.default_rng(seed)
    es = cma.CMAEvolutionStrategy(rng.random(D) * 0.6 + 0.2, 0.3,
                                  {"bounds": [0, 1], "seed": seed + 1, "popsize": 6, "verbose": -9})
    recs = []
    while len(recs) < budget:
        xs = es.ask()
        rs = [evaluate(_phys(np.array(x))) for x in xs[: budget - len(recs)]]
        recs += rs
        if len(rs) == len(xs):
            es.tell(xs, [-r["J"] for r in rs])
    return recs


def _gp(U, y, Uc):
    """Matern-5/2 GP, shared lengthscale chosen by marginal likelihood over a grid, standardised y."""
    mu, sd = y.mean(), y.std() + 1e-9
    z = (y - mu) / sd

    def K(A, B, ell):
        d = np.sqrt(((A[:, None, :] - B[None, :, :]) ** 2).sum(-1)) / ell
        return (1 + np.sqrt(5) * d + 5 * d ** 2 / 3) * np.exp(-np.sqrt(5) * d)

    best = None
    for ell in (0.1, 0.2, 0.35, 0.6, 1.0):
        try:
            Lc = np.linalg.cholesky(K(U, U, ell) + 1e-4 * np.eye(len(U)))
        except np.linalg.LinAlgError:
            continue
        a = np.linalg.solve(Lc.T, np.linalg.solve(Lc, z))
        ll = -0.5 * z @ a - np.log(np.diag(Lc)).sum()
        if best is None or ll > best[0]:
            best = (ll, ell, Lc, a)
    _, ell, Lc, a = best
    Ks = K(Uc, U, ell)
    v = np.linalg.solve(Lc, Ks.T)
    return (Ks @ a) * sd + mu, np.sqrt(np.maximum(1.0 - (v ** 2).sum(0), 1e-12)) * sd


def bayes_opt(budget, seed, n_init=8, evaluate=G.evaluate):
    rng = np.random.default_rng(seed)
    U = qmc.Sobol(D, seed=seed).random(n_init)
    recs = [evaluate(_phys(u)) for u in U]
    y = np.array([-r["J"] for r in recs])
    while len(recs) < budget:
        cand = np.vstack([rng.random((3000, D)), np.clip(U[np.argmin(y)] + 0.05 * rng.standard_normal((500, D)), 0, 1)])
        m, s = _gp(U, y, cand)
        imp = y.min() - m
        zz = imp / s
        u = cand[np.argmax(imp * norm.cdf(zz) + s * norm.pdf(zz))]
        r = evaluate(_phys(u))
        recs.append(r); U = np.vstack([U, u]); y = np.append(y, -r["J"])
    return recs


def score_proposals(paths, evaluate=G.evaluate):
    """Session-agent proposals as JSON files: {"round": n, "notes": str, "designs": [[L, t, w, a], ...]}."""
    recs = []
    for p in paths:
        with open(p) as f:
            for x in json.load(f)["designs"]:
                recs.append(evaluate(x))
    return recs


def best_curve(recs, points):
    """Best objective J among the first n evaluations, for each n in points."""
    return [max(r["J"] for r in recs[:n]) for n in points]
