"""Milestone 81: the exact miss chance of the mixed protocol matches brute-force enumeration on small grids."""
import importlib.util
import itertools
import os
from fractions import Fraction

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location(
    "m81_analyze", os.path.join(HERE, "..", "experiments", "mixed_protocol", "analyze.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def brute(n, a, fl, k, m):
    """Arbiter segments are 0..a-1 convicted; referee catches only 0..fl-1 (flagged and convicted, a subset)."""
    hits = total = 0
    for picks in itertools.permutations(range(n), k + m):
        arb, ref = picks[:m], picks[m:]
        total += 1
        if any(j < a for j in arb) or any(j < fl for j in ref):
            continue
        hits += 1
    return Fraction(hits, total)


def test_miss_matches_enumeration():
    for n in (5, 6):
        for a in range(n + 1):
            for fl in range(a + 1):
                for k in range(n + 1):
                    for m in range(n + 1 - k):
                        if k + m == 0:
                            continue
                        assert abs(mod.miss(a, fl, k, m, n) - float(brute(n, a, fl, k, m))) < 1e-12
