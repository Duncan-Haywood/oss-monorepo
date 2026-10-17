import random
import unittest

from verification_markets.agents import Verifier, generate_tasks


class TestGenerateTasks(unittest.TestCase):
    def test_corruption_rate_approximate(self):
        rng = random.Random(0)
        tasks = generate_tasks(5000, corruption_rate=0.2, rng=rng)
        faulty_fraction = 1 - sum(tasks) / len(tasks)
        self.assertAlmostEqual(faulty_fraction, 0.2, delta=0.02)


class TestVerifierStrategies(unittest.TestCase):
    def test_honest_matches_truth_most_of_the_time(self):
        rng = random.Random(1)
        v = Verifier(0, "honest", signal_noise=0.1)
        matches = sum(1 for _ in range(2000) if v.report(1, rng) == 1)
        self.assertGreater(matches / 2000, 0.85)

    def test_adversarial_flips_truth_most_of_the_time(self):
        rng = random.Random(2)
        v = Verifier(0, "adversarial", signal_noise=0.1)
        matches = sum(1 for _ in range(2000) if v.report(1, rng) == 0)
        self.assertGreater(matches / 2000, 0.85)

    def test_lazy_always_reports_correct(self):
        rng = random.Random(3)
        v = Verifier(0, "lazy")
        self.assertTrue(all(v.report(0, rng) == 1 for _ in range(100)))

    def test_colluding_always_reports_correct(self):
        rng = random.Random(4)
        v = Verifier(0, "colluding")
        self.assertTrue(all(v.report(0, rng) == 1 for _ in range(100)))

    def test_unknown_strategy_rejected(self):
        with self.assertRaises(ValueError):
            Verifier(0, "bogus")

    def test_signal_noise_bounds(self):
        with self.assertRaises(ValueError):
            Verifier(0, "honest", signal_noise=0.5)


if __name__ == "__main__":
    unittest.main()
