"""Surrogates for a verifier with an escalate option (stdlib only).

A verifier sees x, believes eta = P(work is correct | x), and must output accept (+1), reject (-1) or escalate (0, i.e. hand the
case to refereed re-execution). Losses: a wrong accept/reject costs 1, escalating costs d < 1/2 (re-execution cost in units of the
cost of a wrong verdict). The Bayes rule is: accept if eta >= 1-d, reject if eta <= d, else escalate.

We train a real-valued score u and decode it with cutoffs +-1/2. Two convex surrogates:
  * polyhedral (Bartlett-Wegkamp generalised hinge): phi(z) = 1 - a z (z<0), 1 - z (0<=z<1), 0 (z>=1), a = (1-d)/d.
    Its conditional risk is piecewise linear in u with kinks at -1, 0, 1, which *embed* the three actions.
  * logistic: phi(z) = log(1+e^-z), decoded on p = sigmoid(u) with the Bayes thresholds.
"""
import math
import random


def a_of(d):
    return (1.0 - d) / d


def phi_poly(z, d):
    if z < 0:
        return 1.0 - a_of(d) * z
    if z < 1:
        return 1.0 - z
    return 0.0


def dphi_poly(z, d):
    """A subgradient of phi_poly."""
    if z < 0:
        return -a_of(d)
    if z < 1:
        return -1.0
    return 0.0


def phi_log(z):
    return math.log1p(math.exp(-z)) if z > -30 else -z


def cond_risk(phi, u, eta):
    """Conditional surrogate risk eta*phi(u) + (1-eta)*phi(-u)."""
    return eta * phi(u) + (1.0 - eta) * phi(-u)


def action_risk(a, eta, d):
    """Conditional 0-1-d risk of action a in {+1, 0, -1}."""
    if a == 1:
        return 1.0 - eta
    if a == -1:
        return eta
    return d


def bayes_risk(eta, d):
    return min(eta, 1.0 - eta, d)


def decode_poly(u):
    return 1 if u > 0.5 else (-1 if u < -0.5 else 0)


def decode_prob(p, d):
    return 1 if p >= 1.0 - d else (-1 if p <= d else 0)


def sigmoid(u):
    return 1.0 / (1.0 + math.exp(-u)) if u > -700 else 0.0


def regret_loss_poly(u, eta, d):
    return action_risk(decode_poly(u), eta, d) - bayes_risk(eta, d)


def regret_loss_log(u, eta, d):
    return action_risk(decode_prob(sigmoid(u), d), eta, d) - bayes_risk(eta, d)


def poly_min_risk(eta, d):
    """Exact minimum conditional polyhedral risk: minimum over the kinks -1, 0, 1."""
    r = lambda u: cond_risk(lambda z: phi_poly(z, d), u, eta)
    return min(r(-1.0), r(0.0), r(1.0))


def poly_minimiser(eta, d):
    r = lambda u: cond_risk(lambda z: phi_poly(z, d), u, eta)
    return min((-1.0, 0.0, 1.0), key=r)


def log_minimiser(eta):
    """argmin of eta*phi(u)+(1-eta)*phi(-u) is the logit of eta."""
    return math.log(eta / (1.0 - eta))


def regret_poly(u, eta, d):
    return cond_risk(lambda z: phi_poly(z, d), u, eta) - poly_min_risk(eta, d)


def regret_log(u, eta):
    return cond_risk(phi_log, u, eta) - cond_risk(phi_log, log_minimiser(eta), eta)


def transfer_constant_poly(d, n=2000):
    """sup over eta in (0,1), u of regret_loss / regret_surrogate for the polyhedral surrogate, on a grid. Excludes ratio 0/0."""
    best = 0.0
    for i in range(1, n):
        eta = i / n
        for j in range(-300, 301):
            u = j / 100.0
            rs = regret_poly(u, eta, d)
            rl = regret_loss_poly(u, eta, d)
            if rl > 1e-12:
                best = max(best, rl / max(rs, 1e-15))
    return best


def sgd_scalar(surrogate, eta, d, T, rng, lr0=1.0):
    """Stochastic subgradient descent on a single scalar score with y ~ Bernoulli(eta), step lr0/sqrt(t) (poly) or lr0/t (log).
    Returns the final (Polyak-free) iterate."""
    u = 0.0
    for t in range(1, T + 1):
        y = 1 if rng.random() < eta else -1
        z = y * u
        if surrogate == "poly":
            g = y * dphi_poly(z, d)
            u -= lr0 / math.sqrt(t) * g
        else:
            g = -y * (1.0 - sigmoid(z))
            u -= lr0 / t * g
    return u
