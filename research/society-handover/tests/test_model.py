import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from society_handover import simulate, tipped  # noqa: E402

K = dict(n=100, rounds=300)


class Handover(unittest.TestCase):
    def test_seeded_runs_repeat(self):
        self.assertEqual(simulate(seed=3, c=0.05, h=0.5, **K), simulate(seed=3, c=0.05, h=0.5, **K))

    def test_h0_no_robots_stays_zero_robots(self):
        r = simulate(sl=0.3, c=0.1, h=0.0, seed=1, **K)
        self.assertEqual(r["robot_share"], 0.0)

    def test_full_handover_turns_every_ally_into_a_robot(self):
        r = simulate(sl=0.3, c=1.0, h=1.0, seed=1, **K)
        self.assertEqual(r["allies_left"], 0)
        self.assertAlmostEqual(r["robot_share"], 0.3)

    def test_no_fade_keeps_allies(self):
        r = simulate(sl=0.3, c=0.0, h=1.0, seed=1, **K)
        self.assertEqual(r["allies_left"], 30)
        self.assertEqual(r["robot_share"], 0.0)

    def test_handover_rescues_a_fast_fade(self):
        # without hand-over the tip is lost (society-allyfade); with it, 30 robots remain and the crowd tips
        lost = simulate(sl=0.3, c=1.0, h=0.0, seed=1, **K)
        kept = simulate(sl=0.3, c=1.0, h=1.0, seed=1, **K)
        self.assertFalse(tipped(lost))
        self.assertTrue(tipped(kept))

    def test_h0_matches_allyfade(self):
        sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "society-allyfade" / "src"))
        from society_allyfade import simulate as old
        # same model, different random stream: compare tipped counts over seeds
        ka = sum(tipped(simulate(n=100, rho0=0.05, sl=0.2, c=0.02, rounds=300, seed=s)) for s in range(8))
        kb = sum(old(n=100, rho=0.05, sl=0.2, c_l=0.02, rounds=300, seed=s)["final_share_l"] > 0.5 for s in range(8))
        self.assertLessEqual(abs(ka - kb), 2)


if __name__ == "__main__":
    unittest.main()
