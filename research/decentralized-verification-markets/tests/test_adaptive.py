import random
import unittest

from verification_markets.adaptive import brier, defection_lag, rolling_trust_market
from verification_markets.agents import Verifier
from verification_markets.metrics import (
    average_trust_weight_by_strategy,
    scoring_window_market_brier_scores,
)
from verification_markets.simulation import SimulationConfig, run_simulation


def _cfg(seed=1):
    return SimulationConfig(
        n_tasks=1500, n_honest=14, n_lazy=0, n_colluding=0,
        n_adversarial=0, n_sleeper=7, seed=seed,
    )


class TestSleeper(unittest.TestCase):
    def test_sleeper_honest_then_constant(self):
        v = Verifier(0, "sleeper", signal_noise=0.0, switch_task=5)
        rng = random.Random(0)
        self.assertEqual([v.report(0, rng, t) for t in range(5)], [0] * 5)
        self.assertEqual([v.report(0, rng, t) for t in range(5, 10)], [1] * 5)

    def test_sleeper_farms_static_trust(self):
        r = run_simulation(_cfg())
        w = average_trust_weight_by_strategy(r)
        self.assertGreater(w["sleeper"], 0.9)  # fooled by frozen calibration

    def test_rolling_trust_beats_frozen_trust(self):
        for seed in (1, 2):
            r = run_simulation(_cfg(seed))
            frozen = scoring_window_market_brier_scores(r)["trust_weighted"]
            rr = rolling_trust_market(r, block_size=50, decay=0.5, seed=seed)
            self.assertLess(brier(rr.market_price, r, r.scoring_tasks), frozen)

    def test_sleeper_eventually_loses_trust(self):
        r = run_simulation(_cfg())
        rr = rolling_trust_market(r, block_size=50, decay=0.5)
        sleeper_id = next(v.id for v in r.verifiers if v.strategy == "sleeper")
        self.assertGreater(defection_lag(rr, sleeper_id, r.scoring_tasks[0]), 0)
        self.assertGreater(rr.trust_history[sleeper_id][0], 0.9)
        # Uninformative reporters settle near the logistic midpoint (PTS ~ 0).
        self.assertLess(rr.trust_history[sleeper_id][-1], 0.6)

    def test_bad_decay_rejected(self):
        r = run_simulation(_cfg())
        with self.assertRaises(ValueError):
            rolling_trust_market(r, decay=1.5)


def _icfg(seed=1, frac=0.5):
    return SimulationConfig(
        n_tasks=1500, n_honest=12, n_lazy=0, n_colluding=0, n_adversarial=0,
        n_intermittent=10, intermittent_period=100,
        intermittent_defect_fraction=frac, seed=seed,
    )


class TestIntermittent(unittest.TestCase):
    def test_schedule(self):
        v = Verifier(0, "intermittent", signal_noise=0.0, switch_task=10, period=10, defect_fraction=0.3)
        rng = random.Random(0)
        out = [v.report(0, rng, t) for t in range(10, 20)]
        self.assertEqual(out, [0] * 7 + [1] * 3)
        self.assertEqual([v.report(0, rng, t) for t in range(0, 10)], [0] * 10)

    def test_bad_params_rejected(self):
        with self.assertRaises(ValueError):
            Verifier(0, "intermittent", period=0)
        with self.assertRaises(ValueError):
            Verifier(0, "intermittent", defect_fraction=1.5)

    def test_asymmetric_trust_beats_symmetric(self):
        for seed in (1, 2):
            r = run_simulation(_icfg(seed, 0.5))
            sym = brier(rolling_trust_market(r, 50, 0.5, seed).market_price, r, r.scoring_tasks)
            asym = brier(
                rolling_trust_market(r, 50, 0.2, seed, recovery_decay=0.9).market_price,
                r, r.scoring_tasks,
            )
            self.assertLess(asym, sym)

    def test_bad_recovery_decay_rejected(self):
        r = run_simulation(_icfg())
        with self.assertRaises(ValueError):
            rolling_trust_market(r, recovery_decay=-0.1)


if __name__ == "__main__":
    unittest.main()
