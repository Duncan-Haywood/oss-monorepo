"""Variance-based sensitivity of the selfrep-growth fluid model (standard library only).

Inputs are sampled independently over ranges around a baseline (log-uniform for positive
scale inputs, uniform for the failure probability). First-order and total Sobol indices use
the Saltelli (2010) estimator (output centred) for S1 and the Jansen estimator for ST.
"""
import math
import pathlib
import random
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[3] / "selfrep-growth" / "src"))
from selfrep_growth.model import Params, time_to_reach_ode  # noqa: E402

NAMES = ("print_rate", "assembly_h", "vit_cost", "budget", "fail")


def build(x, printed_g, n0=1, target=64):
    """Effective doubling time (h) of the fluid model for input vector x.

    x = (print rate g/h, assembly h, vitamin cost, budget per h, fail prob). Work per copy is
    printed_g / print rate + assembly, as in selfrep_growth.params.printer_copy.
    """
    rate, asm, vit, bud, fail = x
    p = Params(printed_g / rate + asm, vit, bud, fail)
    return time_to_reach_ode(p, n0, target) / math.log2(target / n0)


def sample(rng, base, spread, fail_max):
    """One input vector: log-uniform within x/spread..x*spread, fail uniform on 0..fail_max."""
    out = []
    for name, b in zip(NAMES, base):
        if name == "fail":
            out.append(rng.uniform(0, fail_max))
        else:
            s = spread[name]
            out.append(b * math.exp(rng.uniform(-math.log(s), math.log(s))))
    return out


def sobol(base, spread, printed_g, fail_max=0.5, n=4000, seed=0, log_output=False):
    """Return {name: (S1, ST)} for the doubling time (or its log)."""
    rng = random.Random(seed)
    k = len(NAMES)
    A = [sample(rng, base, spread, fail_max) for _ in range(n)]
    B = [sample(rng, base, spread, fail_max) for _ in range(n)]
    f = (lambda x: math.log(build(x, printed_g))) if log_output else (lambda x: build(x, printed_g))
    fA = [f(a) for a in A]
    fB = [f(b) for b in B]
    mean = sum(fA + fB) / (2 * n)
    var = sum((y - mean) ** 2 for y in fA + fB) / (2 * n - 1)
    res = {}
    for i, name in enumerate(NAMES):
        fAB = [f(a[:i] + [b[i]] + a[i + 1:]) for a, b in zip(A, B)]
        s1 = sum((fb - mean) * (fab - fa) for fa, fb, fab in zip(fA, fB, fAB)) / n / var
        st = sum((fa - fab) ** 2 for fa, fab in zip(fA, fAB)) / (2 * n) / var
        res[name] = (s1, st)
    return res


def elasticity(base, printed_g, i, h=0.01):
    """d ln(doubling time) / d ln(x_i) by central difference on the fluid model (fail: per unit of ln(1-fail))."""
    up, dn = list(base), list(base)
    if NAMES[i] == "fail":
        up[i], dn[i] = base[i] + h, base[i] - h
        return (math.log(build(up, printed_g)) - math.log(build(dn, printed_g))) / (
            math.log(1 - up[i]) - math.log(1 - dn[i]))
    up[i], dn[i] = base[i] * (1 + h), base[i] * (1 - h)
    return (math.log(build(up, printed_g)) - math.log(build(dn, printed_g))) / (math.log(1 + h) - math.log(1 - h))
