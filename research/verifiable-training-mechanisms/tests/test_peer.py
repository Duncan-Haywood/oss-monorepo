"""Milestone 5: the peer-agreement LP (H3) and the one-sided lower bound (H5)."""
import json
import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from vtm.audit import threshold  # noqa: E402
from vtm.contract import optimal_contract  # noqa: E402
from vtm.peer import peer_cost  # noqa: E402

J = os.path.join(os.path.dirname(__file__), "..", "experiments", "joint")


class PeerTests(unittest.TestCase):
    def test_audit_only_equals_closed_form(self):
        for g, p, S in [(0.3, 0.2, 0.0), (0.6, 0.5, 1.0), (0.9, 0.05, 2.0)]:
            self.assertAlmostEqual(peer_cost(g, p, S, use_peer=False), max(1.0, g / p - S), places=6)

    def test_extra_signal_never_costs_more(self):
        rng = np.random.default_rng(0)
        for _ in range(100):
            g, p, S = rng.uniform(0.05, 0.95), rng.uniform(0.05, 1), float(rng.choice([0, 1]))
            d = 0.05
            a = rng.uniform(0, 1 - d)
            self.assertLessEqual(peer_cost(g, p, S, d, a, 0.5), peer_cost(g, p, S, d, a, 0.5, use_peer=False) + 1e-6)

    def test_copying_exclusion_leaves_agreement_worthless(self):
        rng = np.random.default_rng(1)
        for _ in range(60):
            g, p, S, d = rng.uniform(0.05, 0.95), rng.uniform(0.05, 1), float(rng.choice([0, 1])), 0.05
            a = rng.uniform(0, 1 - d)
            self.assertAlmostEqual(peer_cost(g, p, S, d, a, 1.0, exclude_copying=True),
                                   peer_cost(g, p, S, d, a, 1.0, use_peer=False, exclude_copying=True), delta=1e-4)

    def test_agreement_helps_when_cheats_do_not_coordinate(self):
        self.assertLess(peer_cost(0.5, 0.1, 0.0, 0.0, 0.0, 0.0), peer_cost(0.5, 0.1, 0.0, use_peer=False) - 1.0)


class BoundTests(unittest.TestCase):
    def test_lp_never_below_one_sided_bound(self):
        sys.path.insert(0, os.path.join(J))
        sys.path.insert(0, os.path.join(J, "..", "frontier"))
        from h5 import bound
        rng = np.random.default_rng(3)
        for _ in range(200):
            k, m = int(rng.integers(2, 5)), int(rng.integers(2, 6))
            P = rng.dirichlet(np.ones(m), size=k)
            c = np.sort(rng.uniform(0.1, 1.0, k))[::-1]
            c[0] = 1.0
            S = float(rng.choice([0.0, 2.0]))
            lp, _ = optimal_contract(P, c, 0, stake=S)
            if np.isfinite(lp):
                self.assertGreaterEqual(lp, bound(P, c, S) - 1e-7)

    @unittest.skipUnless(os.path.exists(os.path.join(J, "h3.json")), "h3.json missing")
    def test_committed_h3_result(self):
        r = json.load(open(os.path.join(J, "h3.json")))
        self.assertEqual(r["B. ... kappa=1.0"]["cheaper"], 0)
        self.assertEqual(r["A. honest-honest only: peer vs audit"]["dearer"], 0)

    def test_threshold_matches_binary_bound(self):
        g, S = 0.4, 1.0
        self.assertAlmostEqual(threshold(g, S), g / (g + S))


if __name__ == "__main__":
    unittest.main()
