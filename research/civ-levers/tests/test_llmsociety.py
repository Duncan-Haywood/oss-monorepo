import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from civ_levers.llmsociety import outcome, stub_policy  # noqa: E402


def test_stub_policy_moves_toward_and_away():
    p = stub_policy(eps=0.3, tau=0.7)
    rng = np.random.default_rng(0)
    own = np.array([3, 3, 0, 3])
    partner = np.array([4, 3, 6, 3])   # 1 level = 0.17 < eps; same; 6 levels = 1.0 > tau
    assert list(p(own, partner, rng)) == [1, 0, 1, 0] or list(p(own, partner, rng)) == [1, 0, -1, 0]
    assert p(np.array([0]), np.array([6]), rng)[0] == -1   # rejected: step away
    assert p(np.array([3]), np.array([4]), rng)[0] == 1    # accepted: step toward


def test_deterministic_and_zealots_fixed():
    a = outcome("ladder", 0.1, 0.3, 0.9, seed=2, n=100, sweeps=30)
    b = outcome("ladder", 0.1, 0.3, 0.9, seed=2, n=100, sweeps=30)
    assert a == b
