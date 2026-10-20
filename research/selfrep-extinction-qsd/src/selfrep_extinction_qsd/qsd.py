"""Quasi-stationary approximation of the extinction time of the `selfrep-extinction-kits` Markov shop.

The chain (states, rates, truncation) is imported from `selfrep-extinction-kits`, not copied. Extinction
(fleet size 0) is absorbing. If the chain survives long enough to forget its start, the time to extinction
is close to exponential with rate lambda0, the slowest decay rate of the sub-generator on the non-extinct
states, and the conditional law of the state given survival is the quasi-stationary distribution (QSD).
Then mean time to extinction ~ 1/lambda0, whatever the (surviving) start.
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[3] / "selfrep-extinction-kits" / "src"))
from selfrep_extinction_kits.chain import _states, transitions  # noqa: E402


def build(a, w, l, nmax=30, kmax=12):
    """Transient states, their total exit rates and outgoing (rate, target index or None for extinction)."""
    states = [s for s in _states(nmax, kmax) if s[0] + s[1] > 0]
    idx = {s: n for n, s in enumerate(states)}
    out, q = [], []
    for s in states:
        tr = transitions(s, a, w, l, nmax, kmax)
        out.append([(r, idx.get(t)) for r, t in tr])
        q.append(sum(r for r, _ in tr))
    return states, idx, out, q


def qsd(a, w, l, nmax=30, kmax=12, tol=1e-14, max_iter=2000000):
    """Power iteration on the uniformised sub-stochastic matrix. Returns (lambda0, qsd dict state->prob, states)."""
    states, idx, out, q = build(a, w, l, nmax, kmax)
    lam = 1.05 * max(q)
    x = [1.0 / len(states)] * len(states)
    for it in range(max_iter):
        y = [xi * (1 - qi / lam) for xi, qi in zip(x, q)]
        for i, xi in enumerate(x):
            for r, j in out[i]:
                if j is not None:
                    y[j] += xi * r / lam
        s = sum(y)  # survival fraction over one uniformised step
        y = [v / s for v in y]
        est = (1 - s) * lam  # P = I + Q/lam, so the survival fraction is 1 - lambda0/lam
        d = max(abs(u - v) for u, v in zip(x, y))
        x = y
        if d < tol:  # the vector itself has stopped moving, not just the rate estimate
            break
    return est, {st: v for st, v in zip(states, x)}, it


def mean_times(a, w, l, nmax=30, kmax=12, tol=1e-12, max_sweeps=200000):
    """Exact expected hours to extinction from every non-extinct state (Gauss-Seidel on the jump chain)."""
    states, idx, out, q = build(a, w, l, nmax, kmax)
    h = [0.0] * len(states)
    for _ in range(max_sweeps):
        d = 0.0
        for i, tr in enumerate(out):
            v = (1.0 + sum(r * h[j] for r, j in tr if j is not None)) / q[i]
            d = max(d, abs(v - h[i]))
            h[i] = v
        if d < tol * max(1.0, max(h)):
            break
    return {st: v for st, v in zip(states, h)}


def mean_fleet(dist):
    return sum((b + i) * p for (b, i, k), p in dist.items())
