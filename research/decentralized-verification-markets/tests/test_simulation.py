import unittest

from verification_markets.metrics import (
    audit_cost_savings,
    average_payoff_by_strategy,
    average_trust_weight_by_strategy,
    incentive_compatibility_gap,
    majority_vote_error_rate,
    market_brier_score,
    non_honest_fraction,
    scoring_window_market_brier_scores,
    theoretical_manipulation_bound,
)
from verification_markets.simulation import SimulationConfig, run_simulation


class TestSimulationDeterminism(unittest.TestCase):
    def test_same_seed_same_result(self):
        config = SimulationConfig(seed=123, n_tasks=100)
        r1 = run_simulation(config)
        r2 = run_simulation(config)
        self.assertEqual(r1.reports, r2.reports)
        self.assertEqual(r1.market_price, r2.market_price)

    def test_different_seed_different_reports(self):
        r1 = run_simulation(SimulationConfig(seed=1, n_tasks=100))
        r2 = run_simulation(SimulationConfig(seed=2, n_tasks=100))
        self.assertNotEqual(r1.reports, r2.reports)


class TestIncentiveCompatibility(unittest.TestCase):
    def test_honest_beats_deviations_under_pts(self):
        config = SimulationConfig(
            n_tasks=800,
            n_honest=14,
            n_lazy=3,
            n_colluding=3,
            n_adversarial=2,
            corruption_rate=0.15,
            signal_noise=0.1,
            seed=7,
        )
        result = run_simulation(config)
        payoff_by_strategy = average_payoff_by_strategy(result, result.pts_payoff)
        gap = incentive_compatibility_gap(payoff_by_strategy)
        self.assertGreater(gap, 0.0)

    def test_ca_honest_beats_a_single_unilateral_deviator(self):
        # Dasgupta & Ghosh (2013) prove Correlated Agreement is incentive
        # compatible against a *single* agent unilaterally deviating while
        # everyone else reports honestly -- that's the regime this test
        # matches (19 honest, 1 lazy deviator).
        config = SimulationConfig(
            n_tasks=800,
            n_honest=19,
            n_lazy=1,
            n_colluding=0,
            n_adversarial=0,
            corruption_rate=0.15,
            signal_noise=0.1,
            seed=7,
        )
        result = run_simulation(config)
        payoff_by_strategy = average_payoff_by_strategy(result, result.ca_payoff)
        gap = incentive_compatibility_gap(payoff_by_strategy)
        self.assertGreater(gap, 0.0)

    def test_ca_is_vulnerable_to_simultaneous_correlated_deviation(self):
        # This is a documented *limitation*, not a bug: the population-pooled
        # delta matrix used here (see peer_prediction.correlated_agreement_matrix)
        # is estimated across the whole population, including the deviators'
        # own reports. When a large, simultaneously-deviating sub-population
        # all report the (skewed) majority label, the matrix gets dominated
        # by genuine honest-honest correlation and a coordinated "always
        # report the popular answer" block can free-ride on it -- something
        # the original unilateral-deviation theorem never promised to
        # prevent. Peer Truth Serum, which normalizes by the empirical
        # report prior, does not have this failure mode in the same setting
        # (see test_honest_beats_deviations_under_pts).
        config = SimulationConfig(
            n_tasks=800,
            n_honest=14,
            n_lazy=3,
            n_colluding=3,
            n_adversarial=2,
            corruption_rate=0.15,
            signal_noise=0.1,
            seed=7,
        )
        result = run_simulation(config)
        payoff_by_strategy = average_payoff_by_strategy(result, result.ca_payoff)
        gap = incentive_compatibility_gap(payoff_by_strategy)
        self.assertLess(gap, 0.0)


class TestTrustWeightedRepair(unittest.TestCase):
    # Follow-up to TestIncentiveCompatibility.test_ca_is_vulnerable_to_simultaneous_correlated_deviation:
    # bootstrapping trust weights from held-out PTS calibration data (see
    # reputation.py) and using them to both re-estimate the CA delta matrix
    # and discount each agent's own CA payment should repair exactly the
    # simultaneous-collusion vulnerability documented there, in the same
    # verifier-population shape.
    def _scenario_config(self, n_tasks):
        return SimulationConfig(
            n_tasks=n_tasks,
            n_honest=14,
            n_lazy=3,
            n_colluding=3,
            n_adversarial=2,
            corruption_rate=0.15,
            signal_noise=0.1,
            seed=7,
            calibration_fraction=0.3,
            trust_steepness=12.0,
            trust_floor=0.02,
        )

    def test_trust_weighted_ca_restores_incentive_compatibility(self):
        result = run_simulation(self._scenario_config(n_tasks=800))

        # The plain estimator, scored on the same held-out window for a fair
        # comparison, reproduces the documented vulnerability.
        plain_gap = incentive_compatibility_gap(
            average_payoff_by_strategy(result, result.ca_scoring_payoff)
        )
        self.assertLess(plain_gap, 0.0)

        # The trust-weighted estimator + payment discount restores it.
        trust_gap = incentive_compatibility_gap(
            average_payoff_by_strategy(result, result.ca_trust_payoff)
        )
        self.assertGreater(trust_gap, 0.0)

    def test_honest_agents_earn_higher_trust_than_deviators(self):
        result = run_simulation(self._scenario_config(n_tasks=800))
        by_strategy = average_trust_weight_by_strategy(result)
        self.assertGreater(by_strategy["honest"], by_strategy["lazy"])
        self.assertGreater(by_strategy["honest"], by_strategy["colluding"])
        self.assertGreater(by_strategy["honest"], by_strategy["adversarial"])

    def test_reputation_weighted_market_improves_calibration(self):
        result = run_simulation(self._scenario_config(n_tasks=1600))
        brier = scoring_window_market_brier_scores(result)
        self.assertLess(brier["trust_weighted"], brier["plain"])


class TestAggregateAccuracy(unittest.TestCase):
    def test_market_beats_uninformed_baseline(self):
        config = SimulationConfig(n_tasks=500, corruption_rate=0.15, seed=11)
        result = run_simulation(config)
        brier = market_brier_score(result)
        # An uninformative p=0.5 market scores 0.25 regardless of outcome.
        self.assertLess(brier, 0.25)

    def test_majority_vote_reasonably_accurate_with_mostly_honest(self):
        config = SimulationConfig(
            n_tasks=500,
            n_honest=16,
            n_lazy=1,
            n_colluding=1,
            n_adversarial=1,
            corruption_rate=0.15,
            signal_noise=0.1,
            seed=5,
        )
        result = run_simulation(config)
        err = majority_vote_error_rate(result)
        self.assertLess(err, 0.15)


class TestManipulationVulnerability(unittest.TestCase):
    def test_error_rate_grows_with_non_honest_fraction(self):
        low_adversarial = SimulationConfig(
            n_tasks=600,
            n_honest=18,
            n_lazy=1,
            n_colluding=0,
            n_adversarial=1,
            corruption_rate=0.2,
            signal_noise=0.1,
            seed=21,
        )
        high_adversarial = SimulationConfig(
            n_tasks=600,
            n_honest=10,
            n_lazy=3,
            n_colluding=3,
            n_adversarial=4,
            corruption_rate=0.2,
            signal_noise=0.1,
            seed=21,
        )
        low_result = run_simulation(low_adversarial)
        high_result = run_simulation(high_adversarial)
        self.assertLess(
            majority_vote_error_rate(low_result), majority_vote_error_rate(high_result)
        )
        self.assertLess(
            non_honest_fraction(low_result), non_honest_fraction(high_result)
        )

    def test_theoretical_bound_shape(self):
        # eps(1-eps) is 0 at the endpoints and maximized at eps=0.5.
        self.assertEqual(theoretical_manipulation_bound(0.0), 0.0)
        self.assertEqual(theoretical_manipulation_bound(1.0), 0.0)
        self.assertAlmostEqual(theoretical_manipulation_bound(0.5), 0.25)


class TestAuditCostSavings(unittest.TestCase):
    def test_savings_matches_audit_fraction(self):
        config = SimulationConfig(n_tasks=200, audit_fraction=0.1, seed=3)
        result = run_simulation(config)
        savings = audit_cost_savings(result)
        self.assertAlmostEqual(savings, 0.9, delta=0.01)


if __name__ == "__main__":
    unittest.main()
