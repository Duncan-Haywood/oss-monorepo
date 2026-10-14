import random
import unittest

from verification_markets.peer_prediction import correlated_agreement_matrix
from verification_markets.reputation import (
    reputation_weighted_payment,
    reputation_weighted_trade_size,
    trust_weighted_correlated_agreement_matrix,
    trust_weights,
)


class TestTrustWeights(unittest.TestCase):
    def test_positive_score_outweighs_near_zero_score(self):
        # Modeled on this package's own calibration-window PTS scores: honest
        # reporting earns a clearly positive average payoff, an uninformative
        # fixed/random strategy earns ~0 (see peer_prediction.py docstring).
        scores = {"honest": 0.3, "uninformative": 0.02, "adversarial": -0.4}
        weights = trust_weights(scores, steepness=12.0, floor=0.02)
        self.assertGreater(weights["honest"], weights["uninformative"])
        self.assertGreater(weights["uninformative"], weights["adversarial"])

    def test_floor_is_respected(self):
        weights = trust_weights({"a": -10.0}, steepness=12.0, floor=0.05)
        self.assertEqual(weights["a"], 0.05)

    def test_weight_bounded_in_unit_interval(self):
        weights = trust_weights({"a": 10.0, "b": -10.0}, steepness=12.0, floor=0.02)
        self.assertLessEqual(weights["a"], 1.0)
        self.assertGreaterEqual(weights["b"], 0.02)


class TestTrustWeightedCorrelatedAgreementMatrix(unittest.TestCase):
    def test_zero_weight_pair_is_fully_excluded(self):
        # Two "honest-like" agents whose reports genuinely correlate with a
        # shared hidden state, plus a constant-reporting pair that agrees
        # with itself 100% of the time regardless of task (the exact
        # colluding-block shape that makes the *unweighted* estimator
        # vulnerable -- see peer_prediction.py's module docstring). Giving
        # the constant pair zero trust weight should reproduce the delta
        # matrix as if they were never in the population at all.
        rng_gen = random.Random(1)
        n_tasks = 1000
        hidden = [rng_gen.randint(0, 1) for _ in range(n_tasks)]
        reports_honest_a = {t: h for t, h in enumerate(hidden)}
        reports_honest_b = {
            t: (h if rng_gen.random() > 0.1 else 1 - h) for t, h in enumerate(hidden)
        }
        reports_const_a = {t: 1 for t in range(n_tasks)}
        reports_const_b = {t: 1 for t in range(n_tasks)}

        reports_by_agent = {
            "honest_a": reports_honest_a,
            "honest_b": reports_honest_b,
            "const_a": reports_const_a,
            "const_b": reports_const_b,
        }
        weights = {"honest_a": 1.0, "honest_b": 1.0, "const_a": 0.0, "const_b": 0.0}

        rng = random.Random(42)
        trust_delta = trust_weighted_correlated_agreement_matrix(
            reports_by_agent, weights, rng, n_shuffles=300
        )
        rng2 = random.Random(42)
        honest_only_delta = correlated_agreement_matrix(
            {"honest_a": reports_honest_a, "honest_b": reports_honest_b},
            rng2,
            n_shuffles=300,
        )
        for key in trust_delta:
            self.assertAlmostEqual(trust_delta[key], honest_only_delta[key], places=6)

    def test_full_weight_matches_unweighted_estimator(self):
        rng_gen = random.Random(2)
        n_tasks = 500
        reports_a = {t: rng_gen.randint(0, 1) for t in range(n_tasks)}
        reports_b = {t: rng_gen.randint(0, 1) for t in range(n_tasks)}
        reports_by_agent = {"a": reports_a, "b": reports_b}
        weights = {"a": 1.0, "b": 1.0}

        rng = random.Random(7)
        trust_delta = trust_weighted_correlated_agreement_matrix(
            reports_by_agent, weights, rng, n_shuffles=200
        )
        rng2 = random.Random(7)
        plain_delta = correlated_agreement_matrix(reports_by_agent, rng2, n_shuffles=200)
        for key in trust_delta:
            self.assertAlmostEqual(trust_delta[key], plain_delta[key], places=6)


class TestReputationScaling(unittest.TestCase):
    def test_trade_size_scales_linearly_with_weight(self):
        self.assertAlmostEqual(reputation_weighted_trade_size(2.0, 0.5), 1.0)
        self.assertAlmostEqual(reputation_weighted_trade_size(2.0, 1.0), 2.0)
        self.assertAlmostEqual(reputation_weighted_trade_size(2.0, 0.0), 0.0)

    def test_payment_scales_linearly_with_own_weight(self):
        self.assertAlmostEqual(reputation_weighted_payment(4.0, 0.25), 1.0)
        self.assertAlmostEqual(reputation_weighted_payment(-4.0, 0.25), -1.0)
        self.assertAlmostEqual(reputation_weighted_payment(4.0, 1.0), 4.0)


if __name__ == "__main__":
    unittest.main()
