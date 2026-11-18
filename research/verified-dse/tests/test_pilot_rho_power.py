"""Milestone 92: hit probability formula is exact (brute force) and bounds P(T<1)."""
import itertools
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "experiments" / "theory"))
from pilot_rho_power import hit_prob, m_for  # noqa: E402


def test_hit_prob_matches_enumeration_and_bounds_certificate():
    rng = random.Random(3)
    for _ in range(40):
        n = rng.randint(5, 9)
        m = rng.randint(1, n)
        G = set(rng.sample(range(n), rng.randint(0, 3)))
        y = [rng.random() for _ in range(n)]
        pils = list(itertools.combinations(range(n), m))
        hit = sum(bool(G & set(p)) for p in pils) / len(pils)
        cert = sum(min(p, key=lambda i: y[i]) in G for p in pils) / len(pils)
        assert abs(hit - hit_prob(n, len(G), m)) < 1e-12
        assert cert <= hit + 1e-12


def test_m_for_monotone():
    assert m_for(50, 5) <= m_for(50, 2)
