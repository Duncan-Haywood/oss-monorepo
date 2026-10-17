"""Terminal fleet value for the reinvestment problem of ``selfrep-reinvest`` (cash never binds).

Objective: goods made over [0, T] plus ``s`` per machine left at T (``s`` = resale or scrap value
of a machine, in the same currency units as the goods value ``a`` per machine-hour). Dynamics:
``N' = k u N`` with ``k = (1 - fail) / W``. Copy flat out until ``ts``, then make goods:

    J(ts) = N0 e^{k ts} [ a (T - ts) + s ],   dJ/dts = 0  =>  T - ts = 1/k - s/a.

So a terminal value shortens the goods phase from 1/k to 1/k - s/a, and if s >= a/k the shop never
switches (copies until the end). The numeric side reuses ``run`` from ``selfrep_reinvest`` (relative path).
"""
import math
import pathlib
import sys

_root = pathlib.Path(__file__).resolve().parents[3]
sys.path.insert(0, str(_root / "selfrep-reinvest" / "src"))
from selfrep_reinvest.model import Params, bang_bang, growth_rate, run  # noqa: E402


def closed_form(p, s, n0=1.0):
    """Optimal switch time and value for terminal value ``s`` per machine; cash free."""
    k, T, a = growth_rate(p), p.horizon, p.a
    tail = 1 / k - s / a                       # optimal length of the goods phase
    if tail <= 0:                              # never switch: copy until T
        return T, n0 * math.exp(k * T) * s
    if T <= tail:                              # horizon shorter than the goods phase: goods only
        return 0.0, n0 * (a * T + s)
    ts = T - tail
    return ts, n0 * math.exp(k * ts) * (a * tail + s)


def value(p, ts, s, n0=1.0):
    """Numeric J(ts) with the terminal term, via the Euler simulation."""
    g, n, _, _ = run(p, bang_bang(ts), n0)
    return g + s * n


def best_switch(p, s, step=1.0):
    best, ts = (0.0, -1.0), 0.0
    while ts <= p.horizon + 1e-9:
        j = value(p, ts, s)
        if j > best[1]:
            best = (ts, j)
        ts += step
    return best
