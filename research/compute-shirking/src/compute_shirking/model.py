"""Detecting skipped training steps from the loss alone.

A worker is paid for T optimiser steps but runs (1-f)T.  The verifier sees a held-out loss estimate
    S = ln Lhat_submitted - mean_k ln Lhat_reference        (k reference runs of the full T steps),
whose null sd is  sigma' = sqrt(rho_eval^2 + rho_seed^2) * sqrt(1 + 1/k),  rho_eval^2 ~ 2/m (m eval samples, squared error
on Gaussian data), rho_seed = run-to-run relative sd of the loss.  One-sided z test at level alpha.

Skipping a fraction f moves the expected log loss by  shift(f) = ln(L(T)/... ) = ln( L((1-f)T) / L(T) ), so the largest
skip that is detected with probability <= P is the loss curve *inverted at the noise band*:
    (1-f*) T = L^{-1}( L(T) e^{sigma' (z_alpha + Phi^{-1}(P))} ).
For L(t) = Linf + A t^-beta with reducible share r = A T^-beta / L(T) this is closed form:
    f* = 1 - (1 + (e^{sigma' (z+z_P)} - 1)/r)^(-1/beta),    and  f* = 1 - exp(-sigma'(z+z_P)/beta)  when r = 1.
"""
import math, random
from statistics import NormalDist

__all__ = ["z_of", "sigma_total", "log_shift_powerlaw", "hide_fraction_powerlaw", "hide_fraction_curve", "detect_prob",
           "eval_size_for_cap", "seed_floor", "spot_detect", "profit", "best_skip", "hybrid_detect", "hybrid_hide",
           "QuadraticGD", "simulate_test", "audit_equivalent"]

_N = NormalDist()


def z_of(alpha):
    return _N.inv_cdf(1 - alpha)


def sigma_total(m, rho_seed, k=math.inf):
    """Null sd of the log-loss difference.  m eval samples (rho_eval^2 = 2/m, math.inf -> no eval noise)."""
    ev = 2.0 / m if m != math.inf else 0.0
    return math.sqrt((ev + rho_seed ** 2) * (1.0 + (0.0 if k == math.inf else 1.0 / k)))


def log_shift_powerlaw(f, beta, r=1.0):
    """E ln L((1-f)T) - ln L(T) for L = Linf + A t^-beta with reducible share r at T."""
    return math.log(1.0 + r * ((1.0 - f) ** (-beta) - 1.0))


def hide_fraction_powerlaw(sig, beta, r=1.0, z=1.6448536269514722, p_detect=0.5):
    """Largest skipped fraction f whose detection probability is <= p_detect (normal statistic, shift known)."""
    q = sig * (z + _N.inv_cdf(p_detect))
    if q <= 0:
        return 0.0
    return 1.0 - (1.0 + (math.exp(q) - 1.0) / r) ** (-1.0 / beta)


def hide_fraction_curve(loss, T, sig, z=1.6448536269514722, p_detect=0.5, tol=1e-10):
    """Same, for any decreasing loss curve loss(t): f* = 1 - L^{-1}(L(T) e^q)/T by bisection on t in (0, T]."""
    q = sig * (z + _N.inv_cdf(p_detect))
    target = loss(T) * math.exp(q)
    if q <= 0:
        return 0.0
    lo, hi = 1e-9, float(T)
    if loss(lo) <= target:
        return 1.0
    while hi - lo > tol * T:
        mid = 0.5 * (lo + hi)
        if loss(mid) > target:
            lo = mid
        else:
            hi = mid
    return 1.0 - 0.5 * (lo + hi) / T


def detect_prob(shift, sig, z=1.6448536269514722):
    """P(S > z sig) when S ~ N(shift, sig^2)."""
    return 1.0 - _N.cdf(z - shift / sig)


def eval_size_for_cap(f0, beta, r, rho_seed, k=math.inf, z=1.6448536269514722, p_detect=0.5):
    """Eval samples m so that the hidden fraction at detection prob p_detect is <= f0.  None if the seed floor makes it impossible."""
    q_max = log_shift_powerlaw(f0, beta, r)
    s_max = q_max / (z + _N.inv_cdf(p_detect))
    infl = 1.0 + (0.0 if k == math.inf else 1.0 / k)
    ev = s_max ** 2 / infl - rho_seed ** 2
    return None if ev <= 0 else 2.0 / ev


def seed_floor(beta, r, rho_seed, k=math.inf, z=1.6448536269514722, p_detect=0.5):
    """Hidden fraction with unlimited eval data (only seed noise and k reference runs left)."""
    return hide_fraction_powerlaw(sigma_total(math.inf, rho_seed, k), beta, r, z, p_detect)


def spot_detect(f, T, n_audit):
    """P(at least one of n_audit distinct steps drawn uniformly from T is a skipped one), skipped = round(f T): exact hypergeometric."""
    s = round(f * T)
    if s <= 0:
        return 0.0
    if n_audit > T - s:
        return 1.0
    return 1.0 - math.exp(math.lgamma(T - s + 1) - math.lgamma(T - s - n_audit + 1) - math.lgamma(T + 1) + math.lgamma(T - n_audit + 1))


def profit(f, K, stake, p_det):
    """Cheater's expected profit from skipping fraction f of a job that costs K: saved cost minus stake times detection prob."""
    return f * K - stake * p_det(f)


def best_skip(K, stake, p_det, grid=2000):
    """Profit-maximising skip fraction on a grid (profit is not concave: p_det is S-shaped)."""
    best = (0.0, 0.0)
    for i in range(grid + 1):
        f = i / grid * 0.999
        v = profit(f, K, stake, p_det)
        if v > best[1]:
            best = (f, v)
    return best


def hybrid_detect(f, T, n_audit, beta, r, sig, z=1.6448536269514722):
    """Loss test and n_audit random step audits, independent: 1 - (1-P_loss)(1-P_spot)."""
    pl = detect_prob(log_shift_powerlaw(f, beta, r), sig, z)
    ps = spot_detect(f, T, n_audit)
    return 1.0 - (1.0 - pl) * (1.0 - ps)


def hybrid_hide(T, n_audit, beta, r, sig, z=1.6448536269514722, p_detect=0.5):
    """Largest f with hybrid detection <= p_detect (monotone in f, bisection)."""
    lo, hi = 0.0, 1.0
    for _ in range(60):
        mid = 0.5 * (lo + hi)
        if hybrid_detect(mid, T, n_audit, beta, r, sig, z) > p_detect:
            hi = mid
        else:
            lo = mid
    return lo


def audit_equivalent(f, p_detect=0.5):
    """Random step audits (with replacement) that alone hide exactly a skipped fraction f at detection prob p_detect:
    (1-f)^n = 1-p_detect  =>  n = ln(1-p_detect)/ln(1-f).  The loss test is 'worth' this many audits."""
    return math.log(1.0 - p_detect) / math.log(1.0 - f) if 0 < f < 1 else (math.inf if f <= 0 else 0.0)


class QuadraticGD:
    """Full-batch GD on 0.5 w' diag(lam) w with lam_i = i^-a, w0 ~ N(0, I); loss = w' diag(lam) w (population squared error, x ~ N(0,Lam)).

    w_i(t) = (1 - eta lam_i)^t w_i(0), so loss and its seed variance are exact O(d) sums:
        E L(t) = sum_i c_i,  Var L(t) = 2 sum_i c_i^2,  c_i = lam_i (1-eta lam_i)^(2t).
    A held-out estimate on m samples is L * chi2_m / m (exact for Gaussian x)."""

    def __init__(self, d=200, a=1.5, eta=1.0):
        self.d, self.a, self.eta = d, a, eta
        self.lam = [(i + 1) ** (-a) for i in range(d)]
        self.g = [1.0 - eta * l for l in self.lam]

    def _c(self, t):
        return [l * g ** (2 * t) for l, g in zip(self.lam, self.g)]

    def mean_loss(self, t):
        return sum(self._c(t))

    def seed_rel_sd(self, t):
        c = self._c(t)
        s = sum(c)
        return math.sqrt(2.0 * sum(x * x for x in c)) / s

    def run_loss(self, w0, t):
        return sum(l * (g ** t * w) ** 2 for l, g, w in zip(self.lam, self.g, w0))

    def sample_w0(self, rng):
        return [rng.gauss(0.0, 1.0) for _ in range(self.d)]

    def eval_loss(self, w0, t, m, rng):
        L = self.run_loss(w0, t)
        return L if m == math.inf else L * rng.gammavariate(m / 2.0, 2.0) / m


def simulate_test(gd, T, f, m, k, alpha, trials, rng):
    """Fraction of trials in which the z test on S = ln Lhat_sub - mean ln Lhat_ref (k reference runs, T steps) fires.
    The threshold uses the exact null sd from seed_rel_sd(T) and eval noise 2/m (the verifier knows the curve family)."""
    sig = sigma_total(m, gd.seed_rel_sd(T), k)
    thr = z_of(alpha) * sig
    t_sub = (1.0 - f) * T
    fires = 0
    for _ in range(trials):
        ref = sum(math.log(gd.eval_loss(gd.sample_w0(rng), T, m, rng)) for _ in range(k)) / k
        S = math.log(gd.eval_loss(gd.sample_w0(rng), t_sub, m, rng)) - ref
        fires += S > thr
    return fires / trials
