import random
import unittest

from verification_markets.adaptive import brier
from verification_markets.agents import Verifier
from verification_markets.simulation import SimulationConfig, run_simulation
from verification_markets.stealth import (
    minority_pts_scores,
    minority_trust_market,
    minority_trust_weights,
    rolling_minority_trust_market,
)


def _cfg(seed=1, prob=0.5, nw=8, nh=14):
    return SimulationConfig(
        n_tasks=1500, n_honest=nh, n_lazy=0, n_colluding=0, n_adversarial=0,
        n_whitewash=nw, whitewash_prob=prob, seed=seed,
    )


class TestWhitewashAgent(unittest.TestCase):
    def test_only_lies_on_faulty_signal(self):
        v = Verifier(0, "whitewash", signal_noise=0.0, whitewash_prob=1.0)
        rng = random.Random(0)
        self.assertEqual(v.report(0, rng), 1)
        self.assertEqual(v.report(1, rng), 1)
        v0 = Verifier(0, "whitewash", signal_noise=0.0, whitewash_prob=0.0)
        self.assertEqual(v0.report(0, rng), 0)

    def test_bad_prob_rejected(self):
        with self.assertRaises(ValueError):
            Verifier(0, "whitewash", whitewash_prob=1.2)


class TestMinorityTrust(unittest.TestCase):
    def test_whitewashers_keep_averaged_trust_but_lose_minority_trust(self):
        r = run_simulation(_cfg())
        wids = [v.id for v in r.verifiers if v.strategy == "whitewash"]
        hids = [v.id for v in r.verifiers if v.strategy == "honest"]
        mw = minority_trust_weights(minority_pts_scores(r, r.calibration_tasks))
        avg = lambda d, ids: sum(d[i] for i in ids) / len(ids)
        self.assertGreater(avg(r.trust_weight, wids), 0.8)
        self.assertLess(avg(mw, wids), 0.4)
        self.assertGreater(avg(mw, hids), 0.9)

    def test_market_improves_under_whitewash(self):
        for seed in (1, 2):
            r = run_simulation(_cfg(seed))
            self.assertLess(brier(minority_trust_market(r), r, r.scoring_tasks),
                            r.market_price_scoring and brier(r.market_price_scoring, r, r.scoring_tasks))

    def test_no_harm_when_all_honest(self):
        r = run_simulation(_cfg(1, nw=0, nh=22))
        plain = brier(r.market_price_scoring, r, r.scoring_tasks)
        self.assertLess(abs(brier(minority_trust_market(r), r, r.scoring_tasks) - plain), 5e-4)

    def test_fixed_liquidity_is_underconfident(self):
        r = run_simulation(_cfg(1))
        fixed = brier(minority_trust_market(r, scale_liquidity=False), r, r.scoring_tasks)
        scaled = brier(minority_trust_market(r, scale_liquidity=True), r, r.scoring_tasks)
        self.assertLess(scaled, fixed)


def _late_cfg(seed=1, prob=1.0, nl=8, nh=14):
    return SimulationConfig(
        n_tasks=1500, n_honest=nh, n_lazy=0, n_colluding=0, n_adversarial=0,
        n_late_whitewash=nl, whitewash_prob=prob, seed=seed,
    )


class TestLateWhitewash(unittest.TestCase):
    def test_honest_before_switch_then_stealth(self):
        v = Verifier(0, "late_whitewash", signal_noise=0.0, switch_task=10, whitewash_prob=1.0)
        rng = random.Random(0)
        self.assertEqual(v.report(0, rng, 5), 0)
        self.assertEqual(v.report(0, rng, 10), 1)
        self.assertEqual(v.report(1, rng, 10), 1)

    def test_frozen_minority_trust_is_fooled(self):
        r = run_simulation(_late_cfg())
        ids = [v.id for v in r.verifiers if v.strategy == "late_whitewash"]
        mw = minority_trust_weights(minority_pts_scores(r, r.calibration_tasks))
        self.assertGreater(sum(mw[i] for i in ids) / len(ids), 0.8)

    def test_rolling_minority_trust_beats_frozen(self):
        for seed in (1, 2, 3):
            r = run_simulation(_late_cfg(seed))
            frozen = brier(minority_trust_market(r), r, r.scoring_tasks)
            rolling = brier(rolling_minority_trust_market(r, 100, 0.5), r, r.scoring_tasks)
            self.assertLess(rolling, 0.5 * frozen)

    def test_rolling_no_harm_when_all_honest(self):
        r = run_simulation(_late_cfg(1, nl=0, nh=22))
        plain = brier(r.market_price_scoring, r, r.scoring_tasks)
        rolling = brier(rolling_minority_trust_market(r, 100, 0.5), r, r.scoring_tasks)
        self.assertLess(abs(rolling - plain), 5e-4)


def _iw_cfg(seed=1, frac=0.5, period=100, n=8, nh=14):
    return SimulationConfig(
        n_tasks=1500, n_honest=nh, n_lazy=0, n_colluding=0, n_adversarial=0,
        n_intermittent_whitewash=n, whitewash_prob=1.0,
        intermittent_period=period, intermittent_defect_fraction=frac, seed=seed,
    )


class TestIntermittentWhitewash(unittest.TestCase):
    def test_schedule(self):
        v = Verifier(0, "intermittent_whitewash", signal_noise=0.0, switch_task=10,
                     period=100, defect_fraction=0.5, whitewash_prob=1.0)
        rng = random.Random(0)
        self.assertEqual(v.report(0, rng, 5), 0)     # before switch: honest
        self.assertEqual(v.report(0, rng, 20), 0)    # honest half of cycle
        self.assertEqual(v.report(0, rng, 70), 1)    # burst: lies on faulty
        self.assertEqual(v.report(1, rng, 70), 1)
        self.assertEqual(v.report(0, rng, 120), 0)   # next cycle, honest again

    def test_frozen_trust_blind_rolling_helps(self):
        for seed in (1, 2, 3):
            r = run_simulation(_iw_cfg(seed))
            S = r.scoring_tasks
            frozen = brier(minority_trust_market(r), r, S)
            rolling = brier(rolling_minority_trust_market(r, 50, 0.5), r, S)
            self.assertLess(rolling, 0.6 * frozen)

    def test_rolling_no_harm_when_all_honest(self):
        r = run_simulation(_iw_cfg(1, n=0, nh=22))
        plain = brier(r.market_price_scoring, r, r.scoring_tasks)
        self.assertLess(abs(brier(rolling_minority_trust_market(r, 50, 0.5), r, r.scoring_tasks) - plain), 5e-4)


if __name__ == "__main__":
    unittest.main()
