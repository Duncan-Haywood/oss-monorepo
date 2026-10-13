"""Strategic sleeping in a self-financed wealth ledger (extends sleeping-ledger).

Ledger: awake set A, price p_i = w_i/W_A, market loss lhat = sum_A p_i l_i, update w_i <- w_i (1 + eta (lhat - l_i)) for i in A.
  * Leave-one-out identity (exact): the transfer to i equals  eta * W_A * (1 - p_i) * S_i,  where
        S_i = lhat_{-i} - lhat = p_i (lhat - l_i) / (1 - p_i)
    is the loss the mixture saves by having i in the room (lhat_{-i} = price-weighted loss of the others).  The ledger pays each
    module in proportion to its marginal contribution -- if the wake declaration is made before the router serves.
  * Post-hoc sleeping: a module that sees its own loss and sleeps iff l_i > theta.  Against an honest rival B (equal skill, iid
    U(0,1) losses, awake always) A's expected wealth gain is  eta w_A p_B kappa(theta),  kappa(theta) = theta (1-theta) / 2,
    maximised at theta = 1/2 with kappa = 1/8, so the share s of A follows logit s' = eta kappa: A takes over the market while the
    router, which served before the declarations, has unchanged expected loss 1/2.
  * Ex-ante sleeping on a noisy signal sigma = l_A + nu Z (router serves the awake mixture): ledger growth is eta s (1-s) g and the
    router's realised saving is s g with the same  g = E[(1/2 - l_A) 1{sigma <= theta}]  -- wealth tracks real savings.
  * Sleeping tax tau (fraction of the sleeper's wealth paid pro rata to the awake): threshold sleeping stops paying iff
    tau >= eta p_B / 2, i.e. a fixed-share rate; a specialist asleep a fraction phi of rounds then decays as (1-tau)^phi.
"""
import math, random

__all__ = ["step", "loo_saving", "kappa", "g_signal", "best_theta", "sim_expost", "sim_exante", "logit", "mean_field_rounds",
           "tax_best_theta", "tax_deterrence_threshold", "honest_decay_halflife"]


def step(w, awake, l, eta, tax=0.0):
    """One ledger round.  Sleepers pay `tax` of their wealth, shared pro rata to the awake (budget balanced).  Returns new wealth list."""
    w = list(w)
    A = list(awake)
    WA = sum(w[i] for i in A)
    lh = sum(w[i] * l[i] for i in A) / WA
    pot = 0.0
    if tax:
        for i in range(len(w)):
            if i not in A:
                pot += tax * w[i]; w[i] *= 1 - tax
    for i in A:
        w[i] = w[i] * (1 + eta * (lh - l[i])) + pot * (w[i] / WA)
    return w


def loo_saving(w, awake, l, i):
    """Loss saved by i's presence: lhat_{-i} - lhat, and the price p_i, market loss lhat, total awake wealth W_A."""
    WA = sum(w[j] for j in awake)
    lh = sum(w[j] * l[j] for j in awake) / WA
    p = w[i] / WA
    lo = (lh - p * l[i]) / (1 - p)
    return lo - lh, p, lh, WA


def kappa(theta):
    """E[(l_B - l_A) 1{l_A <= theta}] for iid U(0,1): the per-round exploit rate of threshold sleeping."""
    return theta * (1 - theta) / 2


def _Phi(x):
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def g_signal(theta, nu, m=4000):
    """g = E[(1/2 - l_A) 1{sigma <= theta}], sigma = l_A + nu Z, l_A ~ U(0,1) (midpoint quadrature).  nu = 0 is exact foresight."""
    s = 0.0
    for k in range(m):
        x = (k + 0.5) / m
        pr = (1.0 if x <= theta else 0.0) if nu == 0 else _Phi((theta - x) / nu)
        s += (0.5 - x) * pr
    return s / m


def best_theta(nu, grid=400):
    """Threshold maximising g for noise nu; returns (theta, g)."""
    best = (0.0, -1.0)
    for k in range(-grid, 3 * grid + 1):
        th = k / grid
        v = g_signal(th, nu, m=1000)
        if v > best[1]:
            best = (th, v)
    return best


def logit(s):
    return math.log(s / (1 - s))


def mean_field_rounds(s0, s1, eta, k):
    """Rounds for share to go s0 -> s1 when ds = eta k s (1-s):  (logit s1 - logit s0)/(eta k)."""
    return (logit(s1) - logit(s0)) / (eta * k)


def sim_expost(s0, eta, theta, T, rng):
    """A (post-hoc sleeper, sleeps iff own loss > theta) vs honest B, both U(0,1) losses.  The router serves the wealth mixture of
    both before declarations, so its realised loss is s l_A + (1-s) l_B.  Returns (shares, realised router losses)."""
    w = [s0, 1 - s0]; shares, rl = [], []
    for _ in range(T):
        la, lb = rng.random(), rng.random()
        rl.append(w[0] * la + w[1] * lb)
        A = [1] if la > theta else [0, 1]
        w = step(w, A, [la, lb], eta)
        shares.append(w[0])
    return shares, rl


def sim_exante(s0, eta, theta, nu, T, rng):
    """A sleeps iff its noisy signal exceeds theta, declared BEFORE the router serves; router serves the awake mixture."""
    w = [s0, 1 - s0]; shares, rl = [], []
    for _ in range(T):
        la, lb = rng.random(), rng.random()
        sig = la + nu * rng.gauss(0, 1)
        A = [1] if sig > theta else [0, 1]
        WA = sum(w[i] for i in A)
        rl.append(sum(w[i] * [la, lb][i] for i in A) / WA)
        w = step(w, A, [la, lb], eta)
        shares.append(w[0])
    return shares, rl


def _tax_growth(theta, eta, pB, tau):
    """Expected wealth growth rate (per unit wealth) of A with threshold theta under sleeping tax tau, U(0,1) losses."""
    return eta * pB * kappa(theta) - tau * (1 - theta)


def tax_best_theta(eta, pB, tau, grid=2000):
    best = (1.0, 0.0)
    for k in range(grid + 1):
        th = k / grid
        v = _tax_growth(th, eta, pB, tau)
        if v > best[1] + 1e-15:
            best = (th, v)
    return best


def tax_deterrence_threshold(eta, pB):
    """Smallest tax at which never sleeping is A's best response: theta* = 1/2 + tau/(eta pB) >= 1."""
    return eta * pB / 2


def honest_decay_halflife(tau, phi):
    """Rounds for an honest specialist asleep a fraction phi of rounds to lose half its wealth: ln 2 / (-phi ln(1-tau))."""
    return math.log(2) / (-phi * math.log(1 - tau))
