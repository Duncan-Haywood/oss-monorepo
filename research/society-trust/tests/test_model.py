import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from society_trust import experience_step, gossip_step, simulate, steady_trust, summarise  # noqa: E402


class Model(unittest.TestCase):
    def test_steady_trust_edges_and_transparency(self):
        self.assertAlmostEqual(steady_trust(0.0), 1.0)
        self.assertAlmostEqual(steady_trust(1.0), 0.0)
        self.assertAlmostEqual(steady_trust(0.5), 0.5)
        self.assertGreater(steady_trust(0.3, 0.3), steady_trust(0.3, 1.0))

    def test_symmetric_gossip_conserves_total_trust(self):
        rng = random.Random(1)
        t = [rng.random() for _ in range(40)]
        s = sum(t)
        for _ in range(20):
            gossip_step(t, 0.2, 1.0, rng)
        self.assertAlmostEqual(sum(t), s)

    def test_negativity_bias_lowers_total_trust(self):
        rng = random.Random(1)
        t = [rng.random() for _ in range(40)]
        s = sum(t)
        gossip_step(t, 0.2, 3.0, rng)
        self.assertLess(sum(t), s)

    def test_gossip_keeps_trust_in_unit_interval(self):
        rng = random.Random(2)
        t = [rng.random() for _ in range(41)]
        for _ in range(50):
            gossip_step(t, 0.3, 3.0, rng)
        self.assertTrue(all(0 <= x <= 1 for x in t))

    def test_experience_moves_trust_in_the_right_direction(self):
        rng = random.Random(3)
        up, down = [0.5] * 200, [0.5] * 200
        experience_step(up, 0.0, 0.1, 1.0, rng)
        experience_step(down, 1.0, 0.1, 1.0, rng)
        self.assertGreaterEqual(min(up), 0.5)
        self.assertLessEqual(max(down), 0.5)

    def test_no_gossip_sim_matches_fixed_point(self):
        for e in (0.1, 0.3):
            tr = simulate(n=300, rounds=600, e0=e, e_bad=e, g=0.0, t_init=0.5, seed=4, tau=1.0)
            self.assertAlmostEqual(sum(tr[-100:]) / 100, steady_trust(e), delta=0.04)

    def test_avoiders_learn_nothing_first_hand(self):
        rng = random.Random(8)
        t = [0.2] * 50
        experience_step(t, 0.0, 0.1, 1.0, rng, theta=0.3)
        self.assertEqual(t, [0.2] * 50)

    def test_deterministic_per_seed(self):
        self.assertEqual(simulate(seed=5, rounds=200), simulate(seed=5, rounds=200))

    def test_no_incident_stays_at_baseline_and_summary(self):
        tr = simulate(n=100, rounds=300, e_bad=0.05, seed=6)
        low, final, back = summarise(tr, 100, 50, tr[0])
        self.assertGreater(low, tr[0] - 0.06)
        self.assertEqual(back, 0)

    def test_incident_hurts_then_transparency_helps(self):
        kw = dict(n=100, rounds=500, e_bad=0.8, g=0.05, beta=1.0, seed=7)
        a = min(simulate(tau=1.0, **kw)[100:])
        b = min(simulate(tau=0.3, **kw)[100:])
        self.assertLess(a, b)


if __name__ == "__main__":
    unittest.main()
