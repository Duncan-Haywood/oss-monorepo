"""Milestone 6: the coalition game (H4)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from vtm.coalition import (bond_closed, min_bond, min_stake, stake_closed, stake_closed_het,  # noqa: E402
                           strong_equilibrium, utilities)


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

class HeterogeneousTests(unittest.TestCase):
    def test_het_closed_forms_match_brute_force(self):
        from vtm.coalition import stake_closed_het
        for gs in [(0.2, 0.9, 0.5), (0.1, 0.4, 0.8, 0.6), (0.9, 0.9, 0.3, 0.2, 0.1)]:
            for tr in (False, True):
                self.assertAlmostEqual(min_stake(len(gs), list(gs), 0.2, transfers=tr),
                                       stake_closed_het(gs, 0.2, transfers=tr), places=5, msg=(gs, tr))

    def test_transfers_never_cheaper(self):
        self.assertGreater(min_stake(3, [0.2, 0.9, 0.5], 0.2, transfers=True), min_stake(3, [0.2, 0.9, 0.5], 0.2))


class AuditorTests(unittest.TestCase):
    def test_bond_matches_closed_form(self):
        for gs, q in [([0.5, 0.3, 0.2], 0.02), ([0.4], 0.05), ([0.9, 0.1, 0.6, 0.2], 0.03)]:
            S = stake_closed_het(gs, 0.1, transfers=True) + 0.5
            self.assertAlmostEqual(min_bond(len(gs), gs, 0.1, S, q), bond_closed(gs, S, q), places=5, msg=gs)

    def test_extra_worker_joins_when_saving_exceeds_meta_audit_take(self):
        # g = (0.5, 0.3, 0.2), S = 3, q = 0.02: the third worker adds 0.2 - 0.08 = 0.12, so B = 38 not 32
        self.assertAlmostEqual(bond_closed([0.5, 0.3, 0.2], 3.0, 0.02), 38.0)

    def test_no_bond_helps_below_the_worker_stake(self):
        self.assertEqual(min_bond(3, [0.5, 0.3, 0.2], 0.1, 1.0, 0.02), float("inf"))

    def test_meta_audit_as_strong_as_audit_needs_no_bond(self):
        gs = [0.5, 0.3, 0.2]
        self.assertAlmostEqual(min_bond(3, gs, 0.1, stake_closed_het(gs, 0.1, transfers=True) + 1e-6, 0.1), 0.0, places=6)

    def test_partial_copying_lowers_stake(self):
        # g = 0.5, p = 0.1, kappa = 0.75: 0.5 / (1 - 0.75 * 0.9) - 1
        self.assertAlmostEqual(stake_closed(3, 0.5, 0.1, kappa=0.75), 0.5 / 0.325 - 1)
        self.assertAlmostEqual(min_stake(3, 0.5, 0.1, kappa=0.75), stake_closed(3, 0.5, 0.1, kappa=0.75), places=6)
        self.assertEqual(stake_closed(3, 0.5, 0.1, kappa=0.0), 0.0)
        self.assertAlmostEqual(min_stake(1, 0.5, 0.1, kappa=0.0), 4.0, places=6)  # lone cheater always coincides


if __name__ == "__main__":
    unittest.main()


class PartialCopyTests(unittest.TestCase):
    def test_partial_copy_closed_form_matches_brute_force(self):
        from vtm.coalition import min_stake_partial, stake_closed_partial
        for m in (1, 2, 3, 4, 5):
            for g, k in [(0.9, 0.35), (0.9, 0.65), (0.5, 0.8)]:
                self.assertAlmostEqual(min_stake_partial(m, g, 0.1, k), stake_closed_partial(m, g, 0.1, k), places=5, msg=(m, g, k))

    def test_kappa_one_is_the_audit_stake(self):
        from vtm.coalition import stake_closed_partial
        for m in (1, 4, 9):
            self.assertAlmostEqual(stake_closed_partial(m, 0.5, 0.1, 1.0), stake_closed(m, 0.5, 0.1))

    def test_replication_deters_when_copying_is_rare(self):
        from vtm.coalition import stake_closed_partial
        self.assertEqual(stake_closed_partial(51, 0.9, 0.1, 0.35), 0.0)


class ReplicationCostTests(unittest.TestCase):
    def test_replication_never_pays_at_kappa_one(self):
        import importlib.util, os
        spec = importlib.util.spec_from_file_location("rc", os.path.join(os.path.dirname(__file__), "..", "experiments", "replication_cost", "run.py"))
        rc = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(rc)
        self.assertEqual(rc.breakeven(0.9, 1.0)[0], float("inf"))
        self.assertGreater(rc.breakeven(0.9, 0.2)[0], 16.0)
