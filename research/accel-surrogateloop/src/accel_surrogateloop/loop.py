"""Minimum-mass design under a tip-deflection limit, three ways, with the 64x8 Q6 FE solve as the expensive evaluator.

Every method gets the same budget of FE evaluations and reports its best feasible mass after each one (None until one
is feasible). Designs are 8 section heights in [H_LO, H_HI]; mass is proportional to their sum.
  random    : uniform random designs.
  es        : (1+10)-style evolution strategy on the FE solve alone (Gaussian mutation of the best feasible design, step size
              adapted by success rate; if none is feasible yet, of the least-violating one).
  assisted  : surrogate-assisted. N0 random FE evaluations train an MLP on log deflection; each round it screens a pool of
              candidates (mutations of the best FE-verified designs plus random ones), keeps those whose predicted
              deflection times (1 + margin) meets the limit, sends the ROUND lightest to the FE solve, and retrains on
              everything evaluated so far. `wbits` makes the surrogate a quantisation-aware one.
"""
import numpy as np
from . import fe2d, mlp

MESH = (64, 8)
SIZES = [fe2d.NSEG, 32, 32, 1]
N0, ROUND, POOL = 30, 10, 4000


def _norm(H):
    return (H - (fe2d.H_LO + fe2d.H_HI) / 2) / ((fe2d.H_HI - fe2d.H_LO) / 2)


def evaluate(h):
    return fe2d.tip_deflection(h, *MESH)


def _best(H, d, limit):
    """Lightest feasible design so far, or the least-violating one if none is feasible."""
    ok = d <= limit
    if ok.any():
        idx = np.flatnonzero(ok)
        return idx[np.argmin(H[idx].sum(1))]
    return int(np.argmin(d))


def _trace(H, d, limit):
    """Best feasible mass after each evaluation (None before the first feasible one)."""
    out, best = [], None
    for h, x in zip(H, d):
        if x <= limit:
            m = float(h.sum())
            best = m if best is None else min(best, m)
        out.append(best)
    return out


def mutate(rng, centre, sigma, n):
    return np.clip(centre + rng.normal(0, sigma * (fe2d.H_HI - fe2d.H_LO), (n, fe2d.NSEG)), fe2d.H_LO, fe2d.H_HI)


def random_search(rng, limit, budget):
    H = fe2d.sample_designs(rng, budget)
    d = np.array([evaluate(h) for h in H])
    return _trace(H, d, limit), H, d


def es(rng, limit, budget, lam=ROUND):
    H = list(fe2d.sample_designs(rng, N0))
    d = [evaluate(h) for h in H]
    sigma = 0.15
    while len(H) < budget:
        Ha, da = np.array(H), np.array(d)
        i = _best(Ha, da, limit)
        before = Ha[i].sum() if da[i] <= limit else np.inf
        kids = mutate(rng, Ha[i], sigma, min(lam, budget - len(H)))
        for k in kids:
            H.append(k)
            d.append(evaluate(k))
        Hn, dn = np.array(H), np.array(d)
        j = _best(Hn, dn, limit)
        improved = dn[j] <= limit and Hn[j].sum() < before - 1e-12
        sigma = min(0.4, sigma * 1.3) if improved else max(0.01, sigma * 0.8)
    H, d = np.array(H), np.array(d)
    return _trace(H, d, limit), H, d


def assisted(rng, limit, budget, margin=0.05, wbits=None, rnd=ROUND):
    H = list(fe2d.sample_designs(rng, N0))
    d = [evaluate(h) for h in H]
    params = mlp.init(rng, SIZES)
    screened_out = 0                       # candidates the surrogate predicted infeasible but that were never checked
    wrong = 0                              # FE-evaluated picks the surrogate had predicted feasible that were not
    picked = 0
    while len(H) < budget:
        Ha, da = np.array(H), np.array(d)
        y = np.log(da)
        ym, ys = y.mean(), y.std() + 1e-12
        yn = ((y - ym) / ys)[:, None]
        first = len(H) == N0
        params = mlp.train(params, _norm(Ha), yn, rng, epochs=300 if first else 60, lr=3e-3 if first else 1e-3)
        if wbits:
            params = mlp.train(params if first else params, _norm(Ha), yn, rng, epochs=40, lr=1e-3, wbits=wbits)
        i = _best(Ha, da, limit)
        ok = da <= limit
        elite = Ha[np.argsort(np.where(ok, Ha.sum(1), np.inf))[:3]] if ok.any() else Ha[[i]]
        cand = [mutate(rng, e, s, POOL // 6) for e in elite for s in (0.03, 0.1)]
        cand = np.vstack(cand + [fe2d.sample_designs(rng, POOL // 10)])
        pred = np.exp(mlp.forward(params, _norm(cand), wbits=wbits, abits=8 if wbits else None)[:, 0] * ys + ym)
        feas = pred * (1 + margin) <= limit
        pool = cand[feas] if feas.any() else cand[np.argsort(pred)[:rnd]]
        order = np.argsort(pool.sum(1))
        take = pool[order[:min(rnd, budget - len(H))]]
        for h in take:
            x = evaluate(h)
            H.append(h)
            d.append(x)
            picked += 1
            wrong += x > limit
    H, d = np.array(H), np.array(d)
    return _trace(H, d, limit), H, d, {'picked': picked, 'infeasible_picks': int(wrong)}
