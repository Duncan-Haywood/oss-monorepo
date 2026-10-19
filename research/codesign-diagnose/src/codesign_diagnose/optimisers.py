"""Baselines with no LLM: random search, CMA-ES (cma package) and Gaussian-process Bayesian optimisation
(expected improvement). Each returns the list of evaluation records in order, so all methods are compared
at the same number of simulated designs."""
import json
import numpy as np
from scipy.stats import norm, qmc
from .problem import LB, UB


def _unit(x): return (np.asarray(x) - LB) / (UB - LB)
def _phys(u): return LB + np.clip(u, 0, 1) * (UB - LB)


def random_search(prob, budget, seed):
    rng = np.random.default_rng(seed)
    return [prob.evaluate(_phys(rng.random(5))) for _ in range(budget)]


def cma_es(prob, budget, seed):
    import cma
    rng = np.random.default_rng(seed)
    u0 = rng.random(5) * 0.6 + 0.2
    es = cma.CMAEvolutionStrategy(u0, 0.3, {"bounds": [0, 1], "seed": seed + 1, "popsize": 6, "verbose": -9})
    recs = []
    while len(recs) < budget:
        xs = es.ask()
        rs = [prob.evaluate(_phys(np.array(x))) for x in xs[: budget - len(recs)]]
        recs += rs
        if len(rs) == len(xs):
            es.tell(xs, [prob.penalised(r) for r in rs])
    return recs


def _gp_fit_predict(U, y, Uc):
    """Matern-5/2 GP with a shared lengthscale chosen by marginal likelihood over a grid; zero-mean on standardised y."""
    mu, sd = y.mean(), y.std() + 1e-9
    z = (y - mu) / sd

    def K(A, B, ell):
        d = np.sqrt(((A[:, None, :] - B[None, :, :]) ** 2).sum(-1)) / ell
        return (1 + np.sqrt(5) * d + 5 * d ** 2 / 3) * np.exp(-np.sqrt(5) * d)

    best = None
    for ell in (0.1, 0.2, 0.35, 0.6, 1.0):
        Kxx = K(U, U, ell) + 1e-6 * np.eye(len(U))
        try:
            Lc = np.linalg.cholesky(Kxx)
        except np.linalg.LinAlgError:
            continue
        a = np.linalg.solve(Lc.T, np.linalg.solve(Lc, z))
        ll = -0.5 * z @ a - np.log(np.diag(Lc)).sum()
        if best is None or ll > best[0]:
            best = (ll, ell, Lc, a)
    _, ell, Lc, a = best
    Ks = K(Uc, U, ell)
    m = Ks @ a
    v = np.linalg.solve(Lc, Ks.T)
    var = np.maximum(1.0 - (v ** 2).sum(0), 1e-12)
    return m * sd + mu, np.sqrt(var) * sd


def bayes_opt(prob, budget, seed, n_init=8):
    rng = np.random.default_rng(seed)
    U = qmc.Sobol(5, seed=seed).random(n_init)
    recs = [prob.evaluate(_phys(u)) for u in U]
    y = np.array([np.log(prob.penalised(r) + 0.02) for r in recs])
    while len(recs) < budget:
        cand = np.vstack([rng.random((3000, 5)),
                          np.clip(U[np.argmin(y)] + 0.05 * rng.standard_normal((500, 5)), 0, 1)])
        mu, s = _gp_fit_predict(U, y, cand)
        imp = y.min() - mu
        zz = imp / s
        ei = imp * norm.cdf(zz) + s * norm.pdf(zz)
        u = cand[np.argmax(ei)]
        r = prob.evaluate(_phys(u))
        recs.append(r); U = np.vstack([U, u]); y = np.append(y, np.log(prob.penalised(r) + 0.02))
    return recs


def score_proposals(prob, paths):
    """Evaluate session-agent proposals stored as JSON files: {"round": n, "notes": str, "designs": [[w, t, L, v, s], ...]}."""
    recs = []
    for p in paths:
        with open(p) as f:
            for x in json.load(f)["designs"]:
                recs.append(prob.evaluate(x))
    return recs


def best_curve(recs, points):
    """Best feasible test success among the first n evaluations, for each n in points (0 if none feasible)."""
    return [max([r["success"] for r in recs[:n] if r["feasible"]] or [0.0]) for n in points]
