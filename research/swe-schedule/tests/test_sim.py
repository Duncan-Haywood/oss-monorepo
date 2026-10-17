import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from swe_schedule import sim


class T(unittest.TestCase):
    def test_birthday_closed_form(self):
        self.assertAlmostEqual(sim.p_any_collision(2, 10), 0.1)
        self.assertAlmostEqual(sim.birthday_distinct(1, 11), 1.0)
        self.assertAlmostEqual(sim.p_any_collision(4, 11), 1 - (10 * 9 * 8) / 11 ** 3, places=12)

    def test_blind_start_matches_closed_form(self):
        # reading before anyone's claim is visible: zero jitter spread, huge latency
        mu, se = sim.waste(20000, 1, n=4, pool=11, policy="uniform", latency=1e9, latency_exp=False)
        want = 1 - sim.birthday_distinct(4, 11) / 4
        self.assertLess(abs(mu - want), 4 * se + 1e-9)

    def test_slots_never_collide(self):
        self.assertEqual(sim.waste(2000, 2, n=4, pool=11, policy="slots")[0], 0.0)
        self.assertGreater(sim.waste(2000, 2, n=12, pool=11, policy="slots")[0], 0.0)  # more runs than items

    def test_stagger_beyond_latency_is_clean(self):
        mu, _ = sim.waste(2000, 3, n=4, pool=11, policy="stagger", gap=10.0, latency=3.0, latency_exp=False, jitter=0.5)
        self.assertEqual(mu, 0.0)

    def test_stagger_helps_monotonically(self):
        w = [sim.waste(6000, 4, policy="stagger", gap=g)[0] for g in (0.0, 1.0, 3.0, 10.0)]
        self.assertTrue(all(a >= b - 0.01 for a, b in zip(w, w[1:])), w)

    def test_bigger_pool_fewer_collisions(self):
        a = sim.waste(6000, 5, pool=5, policy="uniform")[0]
        b = sim.waste(6000, 5, pool=40, policy="uniform")[0]
        self.assertGreater(a, b)


if __name__ == "__main__":
    unittest.main()
