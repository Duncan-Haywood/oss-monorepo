"""Scoring a verifier whose report decides whether the job is accepted.

Truth: fault probability q. A verifier reports r; the protocol accepts iff r <= tau_d, and
the fault outcome y is observed only on acceptance. Reward on acceptance is the Brier
reward *recentred* at tau_s:  S(r,y) = 1 - (y-r)^2 - (2 tau_s - 1) y,  whose expectation
under q is  1 - r^2 + 2q(r - tau_s)  (linear in q). Rejection pays a reserve c0.
tau_s = 1/2 is plain Brier.
"""
import math

__all__ = ["reward", "exp_reward", "payoff", "best_response", "reserve_interval",
           "truthful_reserve", "is_truthful", "rent", "opt_loss", "eq_loss", "best_reserve",
           "naive_loss", "ipw_payment_moments", "explore_cost", "misreport_cost"]


def reward(r, y, tau_s):
    return 1 - (y - r) ** 2 - (2 * tau_s - 1) * y


def exp_reward(r, q, tau_s):
    return 1 - r * r + 2 * q * (r - tau_s)


def payoff(r, q, tau_d, tau_s, c0):
    return exp_reward(r, q, tau_s) if r <= tau_d else c0


def best_response(q, tau_d, tau_s, c0):
    """(report, accepted, payoff); ties go to the truthful report."""
    r_acc = min(q, tau_d)
    p_acc = exp_reward(r_acc, q, tau_s)
    if q > tau_d:
        return (q, False, c0) if c0 >= p_acc - 1e-12 else (r_acc, True, p_acc)
    # q <= tau_d: truthful report is accepted; rejection needs any report above tau_d
    return (q, True, p_acc) if p_acc >= c0 - 1e-12 else (1.0, False, c0)


def reserve_interval(tau_d, tau_s):
    """[lo, hi] of reserves that make truthful reporting a best response for every q in [0,1].
    Feasible (lo <= hi) iff tau_s >= tau_d, and then lo = hi = 1 + tau_d^2 - 2 tau_d tau_s."""
    lo = (1 - tau_d ** 2 + 2 * (tau_d - tau_s)) if tau_d >= tau_s else (1 + tau_d ** 2 - 2 * tau_d * tau_s)
    hi = (1 - tau_s ** 2) if tau_s <= tau_d else (1 + tau_d ** 2 - 2 * tau_d * tau_s)
    return lo, hi


def truthful_reserve(tau_d, tau_s):
    return 1 + tau_d ** 2 - 2 * tau_d * tau_s


def is_truthful(tau_d, tau_s, c0, n=2000):
    for i in range(n + 1):
        q = i / n
        if abs(best_response(q, tau_d, tau_s, c0)[0] - q) > 1e-12:
            return False
    return True


def rent(tau_d, tau_s):
    """expected excess over the reserve paid to accepted verifiers, q ~ U[0,1], truthful play
    (closed form: [(tau_d-tau_s)^3 + tau_s^3]/3 - tau_d (tau_d-tau_s)^2; tau_s >= tau_d)"""
    return ((tau_d - tau_s) ** 3 + tau_s ** 3) / 3 - tau_d * (tau_d - tau_s) ** 2


def opt_loss(tau):
    """E min(q, tau) for q ~ U[0,1]; cost q if accepted, tau if rejected (units of a fault)"""
    return tau - tau * tau / 2


def eq_loss(tau_d, tau_s, c0, n=20000):
    """decision loss at the verifiers' best responses, q ~ U[0,1] (midpoint rule)"""
    tot = 0.0
    for i in range(n):
        q = (i + .5) / n
        _, acc, _ = best_response(q, tau_d, tau_s, c0)
        tot += q if acc else tau_d
    return tot / n


def best_reserve(tau_d, tau_s, n=800):
    """reserve minimising equilibrium decision loss on a grid over [0, 2]"""
    best = min((eq_loss(tau_d, tau_s, c / n * 2, 4000), c / n * 2) for c in range(n + 1))
    return best[1], best[0]


def naive_loss(tau_d):
    """score only when accepted, pay nothing on rejection, plain Brier: everyone is accepted"""
    return 0.5


def ipw_payment_moments(r, q, tau_s, eps):
    """exploration variant for r > tau_d: accept with prob eps anyway and pay S/eps when observed.
    Returns (mean, variance) of the payment; the mean equals exp_reward (exactly proper)."""
    m = exp_reward(r, q, tau_s)
    second = q * reward(r, 1, tau_s) ** 2 + (1 - q) * reward(r, 0, tau_s) ** 2
    return m, second / eps - m * m


def explore_cost(tau, eps):
    """extra decision loss per job from exploring on a truthful reject region, q ~ U[0,1]:
    eps * E[(q-tau)+] = eps (1-tau)^2 / 2"""
    return eps * (1 - tau) ** 2 / 2


def misreport_cost(r, q):
    """inside the accept region the loss from misreporting is exactly (r-q)^2"""
    return (r - q) ** 2
