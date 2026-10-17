"""Closed-form optimum of the saturating-market reinvestment problem of ``selfrep-satmarket``.

Problem: fleet ``n' = k u n``, goods output ``g = (1 - u) n``, revenue rate ``R(g) = a c (1 - exp(-g/c))``,
maximise ``int_0^T R dt`` over ``u(t)`` in [0, 1], ``n(0) = n0``, final fleet worth nothing.

Pontryagin: ``H = R(g) + lam k u n``; ``dH/du = n (lam k - R'(g))``; ``lam' = -R'(g)``; ``lam(T) = 0``.
Three arcs, in order:
  1. ``u = 1`` (g = 0) for ``t < t1``.
  2. singular arc: ``lam k = R'(g)`` for all t gives ``R''(g) g' = -k R'(g)``, i.e. ``g' = k c`` (output grows
     linearly). With ``n' = k (n - g)`` this is linear and solves in closed form.
  3. ``u = 0`` for the last ``1/k`` hours (``lam(t) = R'(n_e)(T - t)`` there, and ``lam k = R'`` at ``T - 1/k``).
Matching n continuous at ``t1`` (with g = 0 at entry, since lam is continuous and R'(0) = a) and ``g = n`` at the
exit fixes ``t1`` through ``n0 e^{k t1} = c (1 - exp(-k (te - t1)))``, solved here by bisection.
The result is the continuous-time optimum candidate; Euler steps of 1 h (as in ``selfrep-satmarket``) differ a little.
"""
import math


def revenue(a, c, g):
    return a * c * (-math.expm1(-g / c))


def solve(k, c, horizon, n0=1.0):
    """Return a dict with the switch times and the closed-form arcs, or ``singular=False`` when none exists.

    No singular arc exists when ``n0 e^{k te} <= c (1 - e^{-k te})``-type conditions fail, i.e. when the fleet
    never gets large relative to the market; then the optimum is bang-bang with the last ``1/k`` hours at u = 0.
    """
    te = horizon - 1.0 / k
    if te <= 0:
        return dict(singular=False, t1=0.0, te=0.0)

    def f(t1):  # n0 e^{k t1} - c (1 - e^{-k (te - t1)}); increasing in t1
        return n0 * math.exp(k * t1) - c * (-math.expm1(-k * (te - t1)))

    if f(0.0) >= 0:  # fleet already as large as the market allows at t = 0: no growth phase
        return dict(singular=True, t1=0.0, te=te)
    if f(te) <= 0:  # fleet never reaches market scale: pure bang-bang, no interior arc
        return dict(singular=False, t1=te, te=te)
    lo, hi = 0.0, te
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if f(mid) < 0:
            lo = mid
        else:
            hi = mid
    return dict(singular=True, t1=0.5 * (lo + hi), te=te)


def fleet_and_u(k, c, horizon, t, sol, n0=1.0):
    """Closed-form (n, u) at time ``t`` for the arcs in ``sol``."""
    t1, te = sol["t1"], sol["te"]
    if t < t1:
        return n0 * math.exp(k * t), 1.0
    if t < te:
        e1 = n0 * math.exp(k * t1)
        n = k * c * (t - t1) + c + (e1 - c) * math.exp(k * (t - t1))
        g = k * c * (t - t1)
        return n, max(0.0, min(1.0, 1.0 - g / n))
    n_e = fleet_and_u(k, c, horizon, te - 1e-12, sol, n0)[0] if te > t1 else n0 * math.exp(k * te)
    return n_e, 0.0


def policy(k, c, horizon, n0=1.0):
    """Feedback-free open-loop policy ``u(t)`` for ``selfrep_satmarket.model.run`` (ignores the state)."""
    sol = solve(k, c, horizon, n0)
    return (lambda t, n: fleet_and_u(k, c, horizon, t, sol, n0)[1]), sol


def value(a, k, c, horizon, n0=1.0, n_steps=60000):
    """Continuous-time objective of the closed-form path by midpoint quadrature (no Euler error)."""
    sol = solve(k, c, horizon, n0)
    dt = horizon / n_steps
    total = 0.0
    for i in range(n_steps):
        t = (i + 0.5) * dt
        n, u = fleet_and_u(k, c, horizon, t, sol, n0)
        total += revenue(a, c, (1 - u) * n) * dt
    return total, sol
