"""Milestone 93: the exact-power formula equals enumeration over all pilots."""
import itertools
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "experiments" / "theory"))
from pilot_rho_exact import exact_power  # noqa: E402


def test_exact_power_matches_enumeration():
    rng = random.Random(7)
    for _ in range(60):
        n = rng.randint(4, 9)
        m = rng.randint(1, n)
        G = set(rng.sample(range(n), rng.randint(0, n)))
        y = [rng.randint(0, 3) for _ in range(n)]  # many ties
        pils = list(itertools.combinations(range(n), m))
        # ties broken uniformly: average over the orders in which a pilot's tied members could be sorted
        cert = 0.0
        for p in pils:
            lo = min(y[i] for i in p)
            tied = [i for i in p if y[i] == lo]
            cert += sum(i in G for i in tied) / len(tied)
        cert /= len(pils)
        assert abs(cert - exact_power(n, m, G, y)) < 1e-12
