"""Exact Markov-chain model of a lone replicating printer shop (stylised).

Assumptions that make it a continuous-time Markov chain (CTMC): vitamin kits (one kit = ``vit_cost`` units, enough
for one copy) arrive as a Poisson process of rate ``budget / vit_cost``; a build takes an exponential time of mean
``work_h``; machine lifetimes are exponential with mean ``life_h``; no failed builds, no recycling. A machine
that is idle and finds a kit starts a build at once. A machine that retires mid-build loses the kit.

State ``(b, i, k)``: machines building, machines idle, kits in stock, with ``i * k == 0`` (an idle machine
and a kit never wait together). Extinction is ``b + i == 0``. All quantities below are solved exactly (to
iteration tolerance) on a truncated state space, not by simulation.
"""


def _settle(b, i, k, kmax):
    """Idle machines grab kits until one of them runs out; clip stock at ``kmax`` (truncation)."""
    t = min(i, k)
    return b + t, i - t, min(k - t, kmax)


def transitions(state, a, w, l, nmax, kmax):
    """Outgoing rates of ``state`` as a list of ``(rate, next_state)``. Births stop at ``nmax`` machines."""
    b, i, k = state
    out = [(a, _settle(b, i, k + 1, kmax))]  # a kit arrives
    if b:
        r = b / w  # a build finishes: the builder goes idle and a new machine (also idle) appears
        out.append((r, _settle(b - 1, i + (2 if b + i < nmax else 1), k, kmax)))
    if b:
        out.append((b / l, (b - 1, i, k)))  # a builder retires; its kit is lost
    if i:
        out.append((i / l, (b, i - 1, k)))  # an idle machine retires
    return out


def _states(nmax, kmax):
    s = []
    for b in range(nmax + 1):
        for i in range(nmax + 1 - b):
            if i == 0:
                s += [(b, 0, k) for k in range(kmax + 1)]
            else:
                s.append((b, i, 0))
    return s


def solve(a, w, l, nmax=30, kmax=12, safe=None, tol=1e-12, max_sweeps=200000):
    """Gauss-Seidel solution of the embedded jump chain.

    Returns a dict with ``p_extinct_first`` and ``mean_time`` from the start state ``(0, 1, 0)`` (one new machine, empty stock):

    * ``p_extinct_first`` -- probability that the fleet reaches 0 before it reaches ``safe`` machines (only if ``safe`` is given);
    * ``mean_time`` -- expected hours to extinction (``safe=None`` runs to extinction; the state space is truncated at ``nmax`` machines and ``kmax`` kits, so check by raising both).
    """
    states = [s for s in _states(nmax, kmax)]
    idx = {s: n for n, s in enumerate(states)}
    trans = {}
    for s in states:
        n = s[0] + s[1]
        if n == 0 or (safe is not None and n >= safe):
            continue
        tr = transitions(s, a, w, l, nmax, kmax)
        q = sum(r for r, _ in tr)
        trans[s] = (q, [(r / q, idx[t]) for r, t in tr])
    h = [0.0] * len(states)
    if safe is not None:
        # probability of hitting extinction before `safe`
        for s in states:
            if s[0] + s[1] == 0:
                h[idx[s]] = 1.0
        for _ in range(max_sweeps):
            d = 0.0
            for s, (q, tr) in trans.items():
                v = sum(p * h[j] for p, j in tr)
                d = max(d, abs(v - h[idx[s]]))
                h[idx[s]] = v
            if d < tol:
                break
        p0 = h[idx[(0, 1, 0)]]
        return {"p_extinct_first": p0}
    for _ in range(max_sweeps):  # expected time to absorption
        d = 0.0
        for s, (q, tr) in trans.items():
            v = 1.0 / q + sum(p * h[j] for p, j in tr)
            d = max(d, abs(v - h[idx[s]]))
            h[idx[s]] = v
        if d < tol * max(1.0, max(h)):
            break
    return {"mean_time": h[idx[(0, 1, 0)]]}


def first_generation_extinction(a, w, l):
    """Closed-form probability that the seed machine retires before delivering a single copy.

    The machine is idle until a kit arrives (rate ``a``), then builds (rate ``1/w``); both must finish before
    its exponential life (rate ``1/l``) ends. By memorylessness the two races multiply:
    P(copy) = a/(a + 1/l) * (1/w)/(1/w + 1/l).
    """
    return 1.0 - (a / (a + 1 / l)) * ((1 / w) / (1 / w + 1 / l))
