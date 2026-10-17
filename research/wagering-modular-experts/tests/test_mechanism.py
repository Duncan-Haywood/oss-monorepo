import random
import unittest

from wagering_experts import WageringMechanism, brier_score
from wagering_experts.scoring import brier_loss


class TestWSWM(unittest.TestCase):
    def test_budget_balance_and_conserved_wealth(self):
        rng = random.Random(1)
        for alpha in (0.0, 0.05):
            m = WageringMechanism(5, fraction=0.7, alpha=alpha)
            for _ in range(200):
                reps = [rng.random() for _ in range(5)]
                r = m.settle(reps, rng.randint(0, 1))
                self.assertAlmostEqual(sum(r.payoffs), 0.0, places=12)
                self.assertAlmostEqual(sum(m.wealth), 5.0, places=9)

    def test_wealth_never_negative(self):
        rng = random.Random(2)
        m = WageringMechanism(4, fraction=1.0)
        for _ in range(500):
            m.settle([rng.choice([0.0, 1.0]) for _ in range(4)], rng.randint(0, 1))
            self.assertTrue(all(w >= 0 for w in m.wealth))

    def test_sybil_proof(self):
        # Splitting one participant into two identical-report identities
        # (same total wealth) leaves aggregate and total net payoff unchanged.
        a = WageringMechanism(2, fraction=0.5)
        a.wealth = [2.0, 1.0]
        b = WageringMechanism(3, fraction=0.5)
        b.wealth = [0.7, 1.3, 1.0]
        reps_a, reps_b = [0.9, 0.3], [0.9, 0.9, 0.3]
        self.assertAlmostEqual(a.aggregate(reps_a), b.aggregate(reps_b))
        ra, rb = a.settle(reps_a, 1), b.settle(reps_b, 1)
        self.assertAlmostEqual(ra.payoffs[0], rb.payoffs[0] + rb.payoffs[1])

    def test_truthful_in_expectation(self):
        # Others fixed; participant 0 holds belief q. Expected net payoff is
        # maximised by reporting q (grid check).
        q = 0.7
        others = [0.4, 0.6]
        best, best_r = -1e9, None
        for i in range(0, 101):
            r = i / 100
            ev = 0.0
            for y, p in ((1, q), (0, 1 - q)):
                m = WageringMechanism(3, fraction=1.0)
                ev += p * m.settle([r] + others, y).payoffs[0]
            if ev > best:
                best, best_r = ev, r
        self.assertAlmostEqual(best_r, q, places=2)

    def test_uninformative_reporter_loses_wealth_share(self):
        rng = random.Random(3)
        m = WageringMechanism(2, fraction=0.5)
        for _ in range(500):
            q = rng.uniform(0.1, 0.9)
            y = int(rng.random() < q)
            m.settle([q, 0.5], y)
        self.assertGreater(m.wealth[0], 3 * m.wealth[1])

    def test_fixed_share_floors_wealth(self):
        m = WageringMechanism(2, fraction=1.0, alpha=0.05)
        for _ in range(300):
            m.settle([1.0, 0.0], 1)
        self.assertGreaterEqual(min(m.wealth), 0.05 * 2 / 2 - 1e-9)

    def test_invalid_params(self):
        with self.assertRaises(ValueError):
            WageringMechanism(2, fraction=0)
        with self.assertRaises(ValueError):
            WageringMechanism(2, alpha=1.0)

    def test_scores_bounded(self):
        for p in (0, 0.3, 1):
            for y in (0, 1):
                self.assertTrue(0 <= brier_score(p, y) <= 1)
                self.assertAlmostEqual(brier_score(p, y) + brier_loss(p, y), 1)
