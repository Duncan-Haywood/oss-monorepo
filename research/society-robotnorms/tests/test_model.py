import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from society_norms import (binom_tail, critical_share, low_fixed_point, mean_field_map,  # noqa: E402
                           partner_l_prob, placement, simulate)


class MeanField(unittest.TestCase):
    def test_binom_tail_edges_and_symmetry(self):
        self.assertAlmostEqual(binom_tail(9, 0.3, 0), 1.0)
        self.assertAlmostEqual(binom_tail(9, 0.5, 5), 0.5)
        self.assertAlmostEqual(binom_tail(9, 0.3, 5) + binom_tail(9, 0.7, 5), 1.0)

    def test_partner_probability_mixes_robots_and_noisy_humans(self):
        self.assertAlmostEqual(partner_l_prob(0, 0, 0.02), 0.01)
        self.assertAlmostEqual(partner_l_prob(1, 0.3, 0), 1.0)
        self.assertAlmostEqual(partner_l_prob(0, 0.3, 0), 0.3)

    def test_map_is_increasing_in_state_and_share(self):
        xs = [mean_field_map(x / 10, 0.2, 9, 0.02) for x in range(11)]
        self.assertTrue(all(b > a for a, b in zip(xs, xs[1:])))
        self.assertLess(mean_field_map(0, 0.1, 9, 0.02), mean_field_map(0, 0.2, 9, 0.02))

    def test_tipping_share_grows_with_memory_toward_one_half(self):
        cs = [critical_share(m, 0.0) for m in (3, 5, 9, 17, 33)]
        self.assertTrue(all(b > a for a, b in zip(cs, cs[1:])))
        self.assertTrue(cs[-1] < critical_share(101, 0.0) < critical_share(201, 0.0) < 0.5)

    def test_copying_the_last_partner_tips_at_any_share(self):
        self.assertLess(critical_share(1, 0.0), 1e-5)

    def test_status_quo_basin_jumps_at_the_tipping_share(self):
        c = critical_share(9, 0.02)
        self.assertLess(low_fixed_point(c - 1e-3, 9, 0.02), 0.2)
        self.assertGreater(low_fixed_point(c + 1e-3, 9, 0.02), 0.9)

    def test_noise_lowers_the_tipping_share(self):
        self.assertLess(critical_share(9, 0.05), critical_share(9, 0.0))


class Simulation(unittest.TestCase):
    def test_placements_have_the_right_size(self):
        rng = random.Random(0)
        for how in ("spread", "cluster", "random"):
            self.assertEqual(len(placement(100, 23, how, rng)), 23)
        self.assertEqual(placement(10, 0, "spread", rng), set())

    def test_no_robots_no_noise_means_no_conflicts(self):
        r = simulate(n=60, rho=0, eps=0, rounds=50)
        self.assertEqual(r["final_share_l"], 0.0)
        self.assertEqual(r["human_conflict_rate"], 0.0)

    def test_adaptive_robots_never_shift_the_norm(self):
        r = simulate(n=100, rho=0.45, eps=0, rounds=200, robots="adaptive")
        self.assertEqual(r["final_share_l"], 0.0)
        self.assertEqual(r["human_conflict_rate"], 0.0)

    def test_large_committed_share_flips_the_crowd(self):
        r = simulate(n=100, rho=0.4, m=9, rounds=200, seed=3)
        self.assertGreater(r["final_share_l"], 0.95)
        self.assertIsNotNone(r["flip_round"])

    def test_below_tipping_humans_collide_with_robots_at_about_the_robot_share(self):
        rates = [simulate(n=200, rho=0.1, m=25, eps=0, rounds=200, seed=s)["human_conflict_rate"]
                 for s in range(5)]
        self.assertAlmostEqual(sum(rates) / len(rates), 0.1, delta=0.015)

    def test_seeded_runs_are_reproducible(self):
        a = simulate(rho=0.2, seed=7, rounds=100, space="ring")
        b = simulate(rho=0.2, seed=7, rounds=100, space="ring")
        self.assertEqual(a, b)

    def test_a_clustered_block_converts_its_ring_neighbours_first(self):
        r = simulate(n=100, rho=0.1, m=3, eps=0, rounds=30, space="ring", k=1, place="cluster", seed=1)
        self.assertGreater(r["final_share_l"], 0.0)


if __name__ == "__main__":
    unittest.main()
