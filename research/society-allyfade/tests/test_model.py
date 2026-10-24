import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from society_allyfade import simulate, tipped  # noqa: E402

K = dict(n=100, rounds=300)


class Fade(unittest.TestCase):
    def test_seeded_runs_repeat(self):
        self.assertEqual(simulate(seed=3, **K), simulate(seed=3, **K))

    def test_no_robots_no_allies_stays_on_status_quo(self):
        r = simulate(rho=0.0, sl=0.0, seed=1, **K)
        self.assertLess(r["final_share_l"], 0.1)
        self.assertIsNone(r["first_majority_round"])

    def test_permanent_allies_tip_without_robots(self):
        r = simulate(rho=0.0, sl=0.4, c_l=0.0, seed=1, **K)
        self.assertTrue(tipped(r))
        self.assertEqual(r["stubborn_left"], round(0.4 * 100))

    def test_fast_fade_with_no_robots_leaves_the_status_quo(self):
        # allies vanish in a couple of rounds, before memories turn: nothing holds the tip
        r = simulate(rho=0.0, sl=0.3, c_l=1.0, seed=1, n=100, rounds=300)
        self.assertEqual(r["stubborn_left"], 0)
        self.assertFalse(tipped(r))

    def test_all_convert_eventually(self):
        r = simulate(sl=0.2, sr=0.2, c_l=0.2, c_r=0.2, seed=2, **K)
        self.assertEqual(r["stubborn_left"], 0)

    def test_tip_survives_fading_with_robots(self):
        r = simulate(rho=0.1, sl=0.3, c_l=0.02, seed=4, n=100, rounds=600)
        self.assertTrue(tipped(r))


if __name__ == "__main__":
    unittest.main()
