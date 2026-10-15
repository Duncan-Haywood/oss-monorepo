import unittest
import numpy as np
from robofab_insert.env import LEVELS, NAIVE, PARAM_HI, PARAM_LO, Scenario, rollout, sample_scenario, randomise_fidelity
from robofab_insert.train import cem, success_rate


class EnvTests(unittest.TestCase):
    def test_deterministic(self):
        sc = Scenario(0.0004, 0.001, 0.02, 0.0)
        a = rollout(NAIVE, LEVELS["L1"], sc)
        b = rollout(NAIVE, LEVELS["L1"], sc)
        self.assertEqual(a, b)

    def test_aligned_peg_inserts_at_every_level(self):
        sc = Scenario(0.0005, 0.0, 0.0, 0.0)
        for name, f in LEVELS.items():
            self.assertTrue(rollout(NAIVE, f, sc)["success"], name)

    def test_blocked_hole_fails(self):
        # peg centred 3 mm off with a 0.2 mm clearance and a hole estimate 3 mm wrong: zero lateral search
        sc = Scenario(0.0002, 0.003, 0.0, 0.003)
        p = NAIVE.copy(); p[2] = 0.0
        self.assertFalse(rollout(p, LEVELS["L1"], sc)["success"])

    def test_scenarios_in_range(self):
        rng = np.random.default_rng(0)
        for _ in range(50):
            s = sample_scenario(rng)
            self.assertTrue(0.0002 <= s.clearance <= 0.0006)
            f = randomise_fidelity(rng)
            self.assertTrue(0.0 <= f.friction <= 0.9)

    def test_success_rate_in_unit_interval_and_reproducible(self):
        a = success_rate(NAIVE, LEVELS["L0"], n=10)
        self.assertEqual(a, success_rate(NAIVE, LEVELS["L0"], n=10))
        self.assertTrue(0.0 <= a <= 1.0)

    def test_cem_returns_params_in_bounds(self):
        p = cem("L1", 0, pop=4, iters=1, n_eps=2)
        self.assertTrue(np.all(p >= PARAM_LO) and np.all(p <= PARAM_HI))


if __name__ == "__main__":
    unittest.main()
