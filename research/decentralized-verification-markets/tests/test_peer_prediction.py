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


class TestMultiTaskCorrelatedAgreement(unittest.TestCase):
    def setUp(self):
        from verification_markets.peer_prediction import ca_score_matrix, multi_task_ca_payment
        self.score = ca_score_matrix
        self.pay = multi_task_ca_payment

    def test_sign_score_matrix(self):
        delta = {(0, 0): 0.1, (0, 1): -0.05, (1, 0): -0.05, (1, 1): 0.0}
        s = self.score(delta, "sign")
        self.assertEqual(s, {(0, 0): 1.0, (0, 1): 0.0, (1, 0): 0.0, (1, 1): 0.0})
        self.assertEqual(self.score(delta, "delta"), delta)
        with self.assertRaises(ValueError):
            self.score(delta, "bogus")

    def test_payment_is_bonus_minus_penalty(self):
        # Hand case: identity score (agreement pays 1).
        s = {(0, 0): 1.0, (1, 1): 1.0, (0, 1): 0.0, (1, 0): 0.0}
        ri = {0: 1, 1: 0, 2: 1}
        rj = {0: 1, 1: 1, 2: 0}
        # bonus task 0 agrees (1); penalty pair (ri[1]=0, rj[2]=0) agrees (1).
        self.assertEqual(self.pay(ri, rj, 0, 1, 2, s), 0.0)
        # bonus task 0 agrees (1); penalty pair (ri[2]=1, rj[1]=1) agrees (1).
        self.assertEqual(self.pay(ri, rj, 0, 2, 1, s), 0.0)
        # bonus task 1 disagrees (0); penalty (ri[0]=1, rj[2]=0) disagrees (0).
        self.assertEqual(self.pay(ri, rj, 1, 0, 2, s), 0.0)
        # bonus task 2 disagrees; penalty (ri[0]=1, rj[1]=1) agrees -> -1.
        self.assertEqual(self.pay(ri, rj, 2, 0, 1, s), -1.0)
        with self.assertRaises(ValueError):
            self.pay(ri, rj, 0, 0, 1, s)

    def test_constant_reporter_earns_zero_in_expectation(self):
        # Peer's reports iid Bernoulli(0.8); a constant "1" reporter's bonus
        # and penalty agreement have the same distribution, so the mean
        # payment over many draws is ~0 (closed form: 0).
        rng = random.Random(3)
        n = 4000
        peer = {t: 1 if rng.random() < 0.8 else 0 for t in range(n)}
        const = {t: 1 for t in range(n)}
        s = {(0, 0): 1.0, (1, 1): 1.0, (0, 1): 0.0, (1, 0): 0.0}
        total = 0.0
        for b in range(n):
            while True:
                p, q = rng.randrange(n), rng.randrange(n)
                if len({b, p, q}) == 3:
                    break
            total += self.pay(const, peer, b, p, q, s)
        self.assertLess(abs(total / n), 0.03)


if __name__ == "__main__":
    unittest.main()
