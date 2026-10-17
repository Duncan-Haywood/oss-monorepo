"""Learning dynamics in the inspection game of refereed verification (stdlib only).

Same game as ``verification_game.inspection``: solver cheats w.p. x (saves s if unchecked,
loses stake S if checked), verifier checks w.p. y (cost k, earns lam*S from a caught cheat,
suffers harm h from an unchecked cheat).

Advantage of cheating over honesty:  u_s(y) = (s+S)(y* - y),  y* = s/(s+S)
Advantage of checking over skipping: u_v(x) = (lam S + h)(x - x*),  x* = k/(lam S + h)
Both are linear, so in logit coordinates every dynamics below is a bilinear system.
With learning rates eta_s = eta*(lam S+h) and eta_v = eta*(s+S) ("matched") the game is
strategically zero-sum: payoffs -C (x-x*)(y-y*) up to own-action-only terms, C=(s+S)(lam S+h).
"""
import math
import random
from dataclasses import dataclass


@dataclass(frozen=True)
class Params:
    s: float
    S: float
    k: float
    lam: float = 0.5
    h: float = 0.0


def equilibrium(p: Params):
    a, b = p.s + p.S, p.lam * p.S + p.h
    if p.k >= b:
        raise ValueError("verifier's dilemma: no interior equilibrium")
    return p.k / b, p.s / a


def _sig(z):
    return 1 / (1 + math.exp(-z)) if z >= 0 else math.exp(z) / (1 + math.exp(z))


def _logit(x):
    return math.log(x / (1 - x))


def _kl(q, x):
    return q * math.log(q / x) + (1 - q) * math.log((1 - q) / (1 - x))


def potential(p: Params, x, y):
    """H = KL(x*||x) + KL(y*||y). Conserved by matched replicator flow; nondecreasing under
    matched Hedge (zero-sum result of Bailey & Piliouras 2018); H=0 only at equilibrium."""
    xs, ys = equilibrium(p)
    return _kl(xs, x) + _kl(ys, y)


def omega(p: Params):
    """Linearised angular frequency (per unit eta) of the matched flow around equilibrium:
    d(delta x)/dt = -C x*(1-x*) delta y, d(delta y)/dt = C y*(1-y*) delta x  =>
    omega = C sqrt(x*(1-x*) y*(1-y*)), C = (s+S)(lam S + h)."""
    xs, ys = equilibrium(p)
    C = (p.s + p.S) * (p.lam * p.S + p.h)
    return C * math.sqrt(xs * (1 - xs) * ys * (1 - ys))


def period(p: Params, eta):
    """Predicted small-oscillation period in rounds for matched Hedge with rate eta."""
    return 2 * math.pi / (eta * omega(p))


def _gains(p, x, y, matched):
    a, b = p.s + p.S, p.lam * p.S + p.h
    xs, ys = equilibrium(p)
    gs, gv = a * (ys - y), b * (x - xs)
    if matched:
        return b * gs, a * gv
    return gs, gv


def hedge(p: Params, eta, T, x0=0.5, y0=0.5, optimistic=False, matched=True):
    """Full-information Hedge (or optimistic Hedge) on expected payoffs.
    Returns lists (x_t, y_t), t=0..T."""
    a, b = _logit(x0), _logit(y0)
    x, y = x0, y0
    xs, ys = [x], [y]
    prev = _gains(p, x, y, matched)
    for _ in range(T):
        g = _gains(p, x, y, matched)
        if optimistic:
            a += eta * (2 * g[0] - prev[0]); b += eta * (2 * g[1] - prev[1])
        else:
            a += eta * g[0]; b += eta * g[1]
        prev = g
        a = max(-40.0, min(40.0, a)); b = max(-40.0, min(40.0, b))
        x, y = _sig(a), _sig(b)
        xs.append(x); ys.append(y)
    return xs, ys


def replicator_rk4(p: Params, dt, T, x0=0.5, y0=0.5):
    """Matched continuous-time flow in logit coordinates (RK4), horizon T time units."""
    xs_, ys_ = equilibrium(p)
    a_, b_ = p.s + p.S, p.lam * p.S + p.h
    C = a_ * b_

    def f(u, v):
        return C * (ys_ - _sig(v)), C * (_sig(u) - xs_)
    u, v = _logit(x0), _logit(y0)
    out = [(x0, y0)]
    for _ in range(int(T / dt)):
        k1 = f(u, v)
        k2 = f(u + dt / 2 * k1[0], v + dt / 2 * k1[1])
        k3 = f(u + dt / 2 * k2[0], v + dt / 2 * k2[1])
        k4 = f(u + dt * k3[0], v + dt * k3[1])
        u += dt / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0])
        v += dt / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])
        out.append((_sig(u), _sig(v)))
    return out


def stochastic_hedge(p: Params, eta0, T, seed=0, decay=0.5, x0=0.5, y0=0.5):
    """Hedge against *realised* opponent actions (full-information about the opponent's
    sampled action), matched rates, step eta_t = eta0 / t^decay. Returns (xs, ys, cheats, checks)."""
    rng = random.Random(seed)
    a_, b_ = p.s + p.S, p.lam * p.S + p.h
    u, v = _logit(x0), _logit(y0)
    xs, ys, cheats, checks = [], [], 0, 0
    for t in range(1, T + 1):
        x, y = _sig(u), _sig(v)
        xs.append(x); ys.append(y)
        cheat, check = rng.random() < x, rng.random() < y
        cheats += cheat; checks += check
        eta = eta0 / t ** decay
        # solver's cheat-minus-honest payoff vs realised check; verifier's check-minus-skip vs realised cheat
        gs = (0.0 - p.S) if check else p.s
        gv = (p.lam * p.S + p.h - p.k) if cheat else -p.k
        u += eta * b_ * gs
        v += eta * a_ * gv
        u = max(-40.0, min(40.0, u)); v = max(-40.0, min(40.0, v))
    return xs, ys, cheats, checks
