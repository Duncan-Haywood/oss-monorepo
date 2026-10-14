import random
import unittest
from collections import defaultdict

from verification_markets.peer_prediction import (
    ca_payment,
    correlated_agreement_matrix,
    empirical_prior,
    peer_truth_serum,
)


def _simulate_reports(strategy, n_tasks, noise, seed):
    """hidden state H ~ Bernoulli(0.5) per task; each of 2 agents privately
    observes H flipped w.p. `noise`. `strategy` controls what they report."""
    rng = random.Random(seed)
    reports_a, reports_b = {}, {}
    for t in range(n_tasks):
        h = rng.randint(0, 1)
        signal_a = h if rng.random() > noise else 1 - h
        signal_b = h if rng.random() > noise else 1 - h
        if strategy == "truthful":
            reports_a[t] = signal_a
            reports_b[t] = signal_b
        elif strategy == "uninformative":
            # Reports a fixed marginal distribution uncorrelated with the
            # signal -- e.g. always report 1.
            reports_a[t] = 1
            reports_b[t] = 1
        else:
            raise ValueError(strategy)
    return reports_a, reports_b


class TestPeerTruthSerum(unittest.TestCase):
    def test_truthful_beats_uninformative_in_expectation(self):
        n_tasks = 3000
        truthful_a, truthful_b = _simulate_reports("truthful", n_tasks, noise=0.15, seed=1)
        prior = empirical_prior(list(truthful_a.values()) + list(truthful_b.values()))

        truthful_payoff = sum(
            peer_truth_serum(truthful_a[t], truthful_b[t], prior) for t in range(n_tasks)
        ) / n_tasks

        uninformative_a, uninformative_b = _simulate_reports(
            "uninformative", n_tasks, noise=0.15, seed=2
        )
        uninformative_prior = empirical_prior(
            list(uninformative_a.values()) + list(uninformative_b.values())
        )
        uninformative_payoff = sum(
            peer_truth_serum(uninformative_a[t], uninformative_b[t], uninformative_prior)
            for t in range(n_tasks)
        ) / n_tasks

        self.assertGreater(truthful_payoff, uninformative_payoff)
        # PTS is constructed so uninformative strategies earn ~0 in expectation.
        self.assertAlmostEqual(uninformative_payoff, 0.0, delta=0.05)
        self.assertGreater(truthful_payoff, 0.05)

    def test_perfect_match_scores_above_mismatch(self):
        prior = 0.5
        self.assertGreater(
            peer_truth_serum(1, 1, prior), peer_truth_serum(1, 0, prior)
        )


class TestCorrelatedAgreement(unittest.TestCase):
    def test_same_task_agreement_exceeds_baseline(self):
        n_tasks = 2000
        reports_a, reports_b = _simulate_reports("truthful", n_tasks, noise=0.1, seed=3)
        reports_by_agent = {0: reports_a, 1: reports_b}
        rng = random.Random(42)
        delta = correlated_agreement_matrix(reports_by_agent, rng, n_shuffles=500)

        # Agreement on matching reports should be favored over mismatches.
        self.assertGreater(delta[(1, 1)], delta[(1, 0)])
        self.assertGreater(delta[(0, 0)], delta[(0, 1)])
        self.assertGreater(ca_payment(1, 1, delta), ca_payment(1, 0, delta))

    def test_independent_agents_have_near_zero_delta(self):
        n_tasks = 1500
        rng_gen = random.Random(7)
        # Two agents with reports independent of each other (different
        # random seeds, no shared hidden state).
        reports_a = {t: rng_gen.randint(0, 1) for t in range(n_tasks)}
        rng_gen2 = random.Random(8)
        reports_b = {t: rng_gen2.randint(0, 1) for t in range(n_tasks)}
        reports_by_agent = {0: reports_a, 1: reports_b}
        rng = random.Random(99)
        delta = correlated_agreement_matrix(reports_by_agent, rng, n_shuffles=500)
        for entry in delta.values():
            self.assertAlmostEqual(entry, 0.0, delta=0.08)


if __name__ == "__main__":
    unittest.main()
