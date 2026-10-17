"""m-verifier audit game with a public-good structure.

Solver cheats w.p. x: gains s if nobody audits, loses S if anyone audits.
Verifier i audits w.p. y_i at private cost k. A caught cheat pays a total reward lam*S ("split": shared equally by
the auditors) or lam*S to *each* auditor ("bounty"). An unaudited cheat costs every verifier h (public harm).
"""
from dataclasses import dataclass
import math


@dataclass(frozen=True)
class Params:
    s: float = 1.0
    S: float = 4.0
    k: float = 0.5
    h: float = 2.0
    lam: float = 1.0
    scheme: str = "split"  # "split" or "bounty"


def pmf_others(ys, i):
    """Poisson-binomial pmf of the number of auditors among verifiers other than i."""
    pmf = [1.0]
    for j, y in enumerate(ys):
        if j == i:
            continue
        nxt = [0.0] * (len(pmf) + 1)
        for n, p in enumerate(pmf):
            nxt[n] += p * (1 - y)
            nxt[n + 1] += p * y
        pmf = nxt
    return pmf


def detect_prob(ys):
    p = 1.0
    for y in ys:
        p *= 1 - y
    return 1 - p


def solver_adv(P, ys):
    """Expected payoff of cheating minus honest: (1-q)s - qS."""
    q = detect_prob(ys)
    return (1 - q) * P.s - q * P.S


def verifier_adv(P, x, ys, i):
    """Expected payoff of auditing minus skipping for verifier i (others fixed)."""
    pmf = pmf_others(ys, i)
    if P.scheme == "split":
        share = sum(p / (n + 1) for n, p in enumerate(pmf)) * P.lam * P.S
    elif P.scheme == "bounty":
        share = P.lam * P.S
    else:
        raise ValueError(P.scheme)
    return -P.k + x * (share + P.h * pmf[0])


def equilibrium(P, m):
    """Symmetric interior equilibrium (x*, y*, q*). Returns None if x* > 1 (verifiers under-incentivised)."""
    q = P.s / (P.s + P.S)
    a = 1 - q
    y = 1 - a ** (1.0 / m)
    if P.scheme == "split":
        D = P.lam * P.S * q / (m * y) + P.h * (1 - y) ** (m - 1)
    else:
        D = P.lam * P.S + P.h * (1 - y) ** (m - 1)
    x = P.k / D
    if x > 1:
        return None
    return x, y, q


def redundancy(P, m):
    """Expected audits per round divided by the aggregate detection probability, at equilibrium."""
    q = P.s / (P.s + P.S)
    y = 1 - (1 - q) ** (1.0 / m)
    return m * y / q


def redundancy_limit(P):
    q = P.s / (P.s + P.S)
    return math.log(1 / (1 - q)) / q


def flow_modes(P, m, eps=1e-6):
    """Linearise the logit flow theta' = advantages at the symmetric equilibrium (central differences).
    Returns (antisym, sym_trace, sym_det): antisym is the eigenvalue (multiplicity m-1) of perturbations that
    shift audit effort between verifiers; the symmetric x/y block has trace sym_trace and determinant sym_det.
    The symmetric equilibrium is a sink of the flow iff antisym < 0 (or m=1), sym_trace < 0 and sym_det > 0."""
    x, y, q = equilibrium(P, m)
    th0 = math.log(y / (1 - y))
    thx = math.log(x / (1 - x))
    sg = lambda t: 1 / (1 + math.exp(-t))

    def g(tx, tys):
        ys = [sg(t) for t in tys]
        xx = sg(tx)
        return solver_adv(P, ys), [verifier_adv(P, xx, ys, i) for i in range(len(ys))]

    base = [th0] * m
    # d g_0 / d theta_1 (off-diagonal); diagonal is identically 0 since g_i does not depend on y_i
    o = 0.0
    if m > 1:
        up, dn = list(base), list(base)
        up[1] += eps
        dn[1] -= eps
        o = (g(thx, up)[1][0] - g(thx, dn)[1][0]) / (2 * eps)
    antisym = -o if m > 1 else 0.0
    up, dn = [t + eps for t in base], [t - eps for t in base]
    A_xy = (g(thx, up)[0] - g(thx, dn)[0]) / (2 * eps)
    A_yy = (g(thx, up)[1][0] - g(thx, dn)[1][0]) / (2 * eps)
    A_yx = (g(thx + eps, base)[1][0] - g(thx - eps, base)[1][0]) / (2 * eps)
    return antisym, A_yy, -A_xy * A_yx
