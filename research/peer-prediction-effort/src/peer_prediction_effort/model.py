"""Peer prediction without ground truth (stdlib only).

Task label y ~ Bernoulli(p). Worker i sees a binary signal s with P(s=y) = q_i, so g_i = 2 q_i - 1 is her signal
"gap". A strategy is a map signal -> report, written (r0, r1). Two payment rules compare two workers i, j:

  output agreement (OA):   pay 1[r_i = r_j] on a shared task.
  Dasgupta-Ghosh (DG):     pay 1[r_i = r_j] on a shared task minus 1[r_i = r_j] on two *different* tasks.

Everything is computed exactly from the joint signal distribution; `dg_monte_carlo` checks the 3-task estimator.
"""
import math
import random

STRATEGIES = {"truthful": (0, 1), "flip": (1, 0), "always0": (0, 0), "always1": (1, 1)}


def sig_prob(s, y, q):
    """P(signal = s | label = y) for a symmetric-noise signal of accuracy q."""
    return q if s == y else 1.0 - q


def joint_signal(qi, qj, p):
    """P(s_i = a, s_j = b) with signals conditionally independent given the label."""
    return {(a, b): sum((p if y == 1 else 1 - p) * sig_prob(a, y, qi) * sig_prob(b, y, qj) for y in (0, 1))
            for a in (0, 1) for b in (0, 1)}


def marginal_signal(q, p):
    return {a: sum((p if y == 1 else 1 - p) * sig_prob(a, y, q) for y in (0, 1)) for a in (0, 1)}


def oa_payoff(stri, strj, qi, qj, p):
    """Expected output-agreement payoff of worker i against j (report maps stri, strj)."""
    J = joint_signal(qi, qj, p)
    return sum(pr for (a, b), pr in J.items() if stri[a] == strj[b])


def dg_payoff(stri, strj, qi, qj, p):
    """Expected DG payoff: agreement on the shared task minus agreement on independent tasks."""
    J = joint_signal(qi, qj, p)
    mi, mj = marginal_signal(qi, p), marginal_signal(qj, p)
    shared = sum(pr for (a, b), pr in J.items() if stri[a] == strj[b])
    indep = sum(mi[a] * mj[b] for a in (0, 1) for b in (0, 1) if stri[a] == strj[b])
    return shared - indep


def dg_truthful_closed_form(qi, qj, p):
    """Truthful-vs-truthful DG payoff = 2 p (1-p) g_i g_j."""
    return 2.0 * p * (1.0 - p) * (2 * qi - 1) * (2 * qj - 1)


def payoff_matrix(rule, qi, qj, p):
    f = oa_payoff if rule == "oa" else dg_payoff
    return {(a, b): f(sa, sb, qi, qj, p) for a, sa in STRATEGIES.items() for b, sb in STRATEGIES.items()}


def pure_equilibria(rule, q, p):
    """Symmetric-worker game: all pure-strategy Nash equilibria over the four report maps (i's payoff, i vs j)."""
    M = payoff_matrix(rule, q, q, p)
    names = list(STRATEGIES)
    eq = []
    for a in names:
        for b in names:
            if all(M[(a, b)] >= M[(x, b)] - 1e-12 for x in names) and all(M[(b, a)] >= M[(b, x)] - 1e-12 for x in names):
                eq.append((a, b, M[(a, b)]))
    return eq


def dg_monte_carlo(stri, strj, qi, qj, p, trials=200000, seed=0):
    """Simulate the 3-task DG mechanism (1 shared task, two penalty tasks) and average the realised payment."""
    rng = random.Random(seed)

    def draw(q):
        y = 1 if rng.random() < p else 0
        return y, (y if rng.random() < q else 1 - y)

    tot = 0.0
    for _ in range(trials):
        y, _s = draw(qi)  # shared task: both see the same label
        si = y if rng.random() < qi else 1 - y
        sj = y if rng.random() < qj else 1 - y
        _, si2 = draw(qi)  # i's penalty task
        _, sj2 = draw(qj)  # j's independent penalty task
        tot += (stri[si] == strj[sj]) - (stri[si2] == strj[sj2])
    return tot / trials


# ---------------------------------------------------------------- continuous effort

def gap(e, kappa=0.9):
    """g(e) = 2 q(e) - 1 = kappa (1 - exp(-e)): signal gap sharpened by effort e >= 0."""
    return kappa * (1.0 - math.exp(-e))


def scale_A(alpha, p):
    """Effective bilinear payoff scale: DG truthful payoff is alpha * 2p(1-p) g_i g_j = A g_i g_j."""
    return alpha * 2.0 * p * (1.0 - p)


def best_response(m, A, c, kappa=0.9):
    """Unique maximiser of A m kappa (1 - e^-e) - c e^2/2 over e >= 0 (strictly concave); m = peer's effective gap / kappa*(...)"""
    # FOC: A m kappa e^{-e} = c e, LHS decreasing, RHS increasing.
    if m <= 0:
        return 0.0
    lo, hi = 0.0, 50.0
    for _ in range(80):
        mid = 0.5 * (lo + hi)
        if A * m * kappa * math.exp(-mid) - c * mid > 0:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def peer_gap(e, r, kappa=0.9):
    """Effective peer gap when a fraction r of comparisons are against ground truth (gap 1) and 1-r against a peer."""
    return (1.0 - r) * gap(e, kappa) + r


def symmetric_equilibria(A, c, r=0.0, kappa=0.9, emax=8.0, n=4000):
    """All symmetric pure effort equilibria e = BR(peer_gap(e, r)) as sign changes on a grid, with stability
    (stable under best-response dynamics iff the slope of e -> BR(peer_gap(e)) is < 1 there)."""
    F = lambda e: best_response(peer_gap(e, r, kappa), A, c, kappa) - e
    roots = []
    if r == 0.0:
        roots.append(0.0)
    prev_e, prev_f = 1e-9, F(1e-9)
    for i in range(1, n + 1):
        e = emax * i / n
        f = F(e)
        if prev_f > 0 >= f or prev_f < 0 <= f:
            lo, hi = prev_e, e
            for _ in range(60):
                mid = 0.5 * (lo + hi)
                if (F(mid) > 0) == (prev_f > 0):
                    lo = mid
                else:
                    hi = mid
            roots.append(0.5 * (lo + hi))
        prev_e, prev_f = e, f
    out = []
    for e in roots:
        h = 1e-4
        slope = (best_response(peer_gap(e + h, r, kappa), A, c, kappa) -
                 best_response(peer_gap(max(e - h, 0.0), r, kappa), A, c, kappa)) / (e + h - max(e - h, 0.0))
        out.append((e, slope < 1.0))
    return out


def zero_effort_stable_threshold(alpha, p, c, kappa=0.9):
    """With r=0, e=0 is unstable (and a positive equilibrium exists) iff A kappa^2 / c > 1, i.e. alpha > c/(2p(1-p)kappa^2)."""
    return scale_A(alpha, p) * kappa ** 2 / c


def alpha_threshold(p, c, kappa=0.9):
    return c / (2.0 * p * (1.0 - p) * kappa ** 2)


# ---------------------------------------------------------------- binary effort (fixed cost)

def binary_equilibria(A, c, gH, r=0.0):
    """Two-worker game, effort in {L=0 gap, H=gap gH at cost c}. Payoff A g_i * ((1-r) g_j + r) - cost.
    Returns the set of pure symmetric equilibria as 'LL' / 'HH'."""
    m = lambda g: (1 - r) * g + r
    eq = []
    # LL: deviation to H gains A gH m(0) - c
    if A * gH * m(0.0) - c <= 1e-12:
        eq.append("LL")
    # HH: deviation to L loses A gH m(gH) - c >= 0
    if A * gH * m(gH) - c >= -1e-12:
        eq.append("HH")
    return eq


def gold_rate_to_kill_shirking(A, c, gH):
    """Smallest gold-check rate making HH the unique equilibrium: r* = c / (A gH) (needs A gH > c)."""
    return c / (A * gH)


def total_cost(u, c, gH, G):
    """Cost per worker-task at scale u = A gH with r = c/u: expected pay + gold-check cost.
    pay = u((1-r)gH + r) = u gH - c gH + c ;  gold = G r."""
    r = c / u
    return u * ((1 - r) * gH + r) + G * r


def optimal_gold_design(c, gH, G):
    """Closed form: u* = sqrt(G c / gH), r* = sqrt(c gH / G), cost = 2 sqrt(G c gH) + c (1 - gH). Requires G >= c gH so r* <= 1."""
    u = math.sqrt(G * c / gH)
    r = math.sqrt(c * gH / G)
    return u, r, 2.0 * math.sqrt(G * c * gH) + c * (1.0 - gH)
