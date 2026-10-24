"""Milestone 6: the coalition game (H4)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from vtm.coalition import min_stake, stake_closed, strong_equilibrium, utilities  # noqa: E402


class CoalitionTests(unittest.TestCase):
    def test_majority_coalition_escapes_replication(self):
        u = utilities((1, 1, 0), 0.3, 0.0, 5.0)
        self.assertAlmostEqual(u[0], 1 - 0.7)
        self.assertAlmostEqual(u[2], -5.0 - 1.0)

    def test_single_worker_is_the_audit_game(self):
        for g, p in [(0.3, 0.2), (0.6, 0.5)]:
            self.assertAlmostEqual(min_stake(1, g, p), stake_closed(1, g, p), places=6)

    def test_brute_force_matches_closed_form(self):
        for m in (2, 3, 4, 5):
            for g, p in [(0.3, 0.2), (0.5, 0.9), (0.9, 0.1)]:
                self.assertAlmostEqual(min_stake(m, g, p), stake_closed(m, g, p), places=5, msg=(m, g, p))

    def test_not_an_equilibrium_just_below(self):
        s = stake_closed(3, 0.5, 0.25)
        self.assertFalse(strong_equilibrium(3, 0.5, 0.25, s - 0.01))
        self.assertTrue(strong_equilibrium(3, 0.5, 0.25, s + 0.01))


if __name__ == "__main__":
    unittest.main()
