"""Event simulation of the lone replicating shop with switchable assumptions (stylised).

Same shop as ``chain.py``. Three switches let each Markov assumption be relaxed one at a time:

* ``kits``: ``"poisson"`` (rate ``a``, as in the chain) or ``"regular"`` (one kit every ``1/a`` h, which is a continuous vitamin stream used in whole kits);
* ``build``: ``"exp"`` (chain), ``"lognormal"`` (CV 0.2, as in ``selfrep-wearout``) or ``"fixed"``;
* ``life_shape``: Weibull shape of the machine life, 1 = exponential (chain).

``run`` stops at extinction or when the fleet first reaches ``safe`` machines.
"""
import heapq
import math
import random


def run(a, w, l, seed, kits="poisson", build="exp", life_shape=1.0, safe=None, horizon=1e7, nmax=None):
    """Return ``(outcome, time)``; outcome is ``"extinct"``, ``"safe"`` or ``"horizon"``."""
    rng = random.Random(seed)
    sig = math.sqrt(math.log(1 + 0.2 ** 2))
    mu = math.log(w) - sig ** 2 / 2
    scale = l / math.gamma(1 + 1 / life_shape)

    def dur():
        if build == "exp":
            return rng.expovariate(1 / w)
        if build == "lognormal":
            return rng.lognormvariate(mu, sig)
        return w

    ev, mid = [], 0
    alive, idle = set(), []
    kits_in = 0

    def new_machine(t):
        nonlocal mid
        mid += 1
        alive.add(mid)
        idle.append(mid)
        heapq.heappush(ev, (t + rng.weibullvariate(scale, life_shape), 1, mid))

    new_machine(0.0)
    heapq.heappush(ev, (rng.expovariate(a) if kits == "poisson" else 1 / a, 2, 0))
    building = set()
    t = 0.0
    while ev:
        t, kind, m = heapq.heappop(ev)
        if t > horizon:
            return "horizon", horizon
        if kind == 2:  # kit arrives
            kits_in += 1
            gap = rng.expovariate(a) if kits == "poisson" else 1 / a
            heapq.heappush(ev, (t + gap, 2, 0))
        elif kind == 0 and m in alive:  # build done
            building.discard(m)
            idle.append(m)
            if nmax is None or len(alive) < nmax:
                new_machine(t)
        elif kind == 1 and m in alive:  # retire
            alive.discard(m)
            building.discard(m)
            if m in idle:
                idle.remove(m)
        while idle and kits_in:
            mm = idle.pop()
            kits_in -= 1
            building.add(mm)
            heapq.heappush(ev, (t + dur(), 0, mm))
        if not alive:
            return "extinct", t
        if safe is not None and len(alive) >= safe:
            return "safe", t
    return "horizon", t
