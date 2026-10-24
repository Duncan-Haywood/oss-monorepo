import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from society_enforcers import critical_share, enforcer_stop, human_cut_share, min_enforcers, simulate, success_prob  # noqa: E402


class Model(unittest.TestCase):
    def test_stop_probability(self):
        self.assertAlmostEqual(enforcer_stop(0.0, 0.5, 10), 0.0)
        self.assertAlmostEqual(enforcer_stop(0.2, 0.5, 1), 0.1)  # one viewer: q*e
        self.assertAlmostEqual(enforcer_stop(1.0, 1.0, 3), 1.0)

    def test_reduces_to_lineup_without_enforcers(self):
        # society-lineup reports rho_c = 0.127 at M=9, p0=0.9, k=1 and 0.214 at p0=1
        self.assertAlmostEqual(critical_share(9, 0.9), 0.127, places=3)
        self.assertAlmostEqual(critical_share(9, 1.0), 0.214, places=3)
        self.assertAlmostEqual(success_prob(0.3, 0.9), 1 - 0.9 * 0.7)

    def test_enforcers_raise_threshold(self):
        cs = [critical_share(9, 0.9, e=e) for e in (0.0, 0.02, 0.05)]
        self.assertTrue(all(b > a for a, b in zip(cs, cs[1:])), cs)

    def test_min_enforcers_holds_and_is_minimal(self):
        rho = 0.30
        e = min_enforcers(rho, 9, 0.9)
        self.assertGreater(e, 0.0)
        self.assertLess(human_cut_share(rho, 9, 0.9, e=e + 1e-3), 0.5)
        self.assertGreaterEqual(human_cut_share(rho, 9, 0.9, e=max(e - 1e-3, 0)), 0.5)

    def test_no_enforcers_needed_below_threshold(self):
        self.assertEqual(min_enforcers(0.05, 9, 0.9), 0.0)

    def test_sim_agrees_far_from_threshold(self):
        e = min_enforcers(0.30, 9, 0.9)
        held = sum(simulate(200, 0.30, 9, 0.9, e=e + 0.03, seed=s) for s in range(4)) / 4
        lost = sum(simulate(200, 0.30, 9, 0.9, e=0.0, seed=s) for s in range(4)) / 4
        self.assertLess(held, 0.3)
        self.assertGreater(lost, 0.7)


if __name__ == "__main__":
    unittest.main()
