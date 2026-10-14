"""Emulated IEEE float32 arithmetic with selectable reduction order (stdlib only).

Each product and each addition is rounded to float32. Products of two float32
values are exact in float64, so ``exact_dot`` (fsum) is the correctly rounded
reference. ``canonical`` is the single fixed order a RepOps-style library
commits to: bitwise identical on every machine, because the order (not the
hardware) defines the result.
"""
import struct

_S = struct.Struct("f")


def f32(x):
    return _S.unpack(_S.pack(x))[0]


def _sequential(p, rng=None):
    a = 0.0
    for v in p:
        a = f32(a + v)
    return a


def _pairwise(p, rng=None):
    n = len(p)
    if n == 1:
        return p[0]
    if n == 0:
        return 0.0
    m = n // 2
    return f32(_pairwise(p[:m]) + _pairwise(p[m:]))


def _lanes(w):
    def go(p, rng=None):
        acc = [0.0] * w
        for i, v in enumerate(p):
            acc[i % w] = f32(acc[i % w] + v)
        return _sequential(acc)
    return go


def _shuffled(p, rng):
    q = list(p)
    rng.shuffle(q)
    return _sequential(q)


ORDERS = {
    "canonical": _sequential,   # RepOps: fixed left-to-right order
    "pairwise": _pairwise,      # tree reduction
    "lanes4": _lanes(4),        # 4-way SIMD accumulators
    "lanes32": _lanes(32),      # warp-like accumulators
    "shuffled": _shuffled,      # nondeterministic (atomics): random order
}


def dot(x, y, order="canonical", rng=None):
    p = [f32(a * b) for a, b in zip(x, y)]
    return ORDERS[order](p, rng)


def exact_dot(x, y):
    import math
    return f32(math.fsum(a * b for a, b in zip(x, y)))
