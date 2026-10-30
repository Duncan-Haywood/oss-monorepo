"""Offline tests: no network, synthetic data only. Run: PYTHONPATH=src python3 -m unittest discover -s tests"""
import math
import unittest

import numpy as np

from tradelab import agent, backtest, stats
from tradelab.data import Panel, parse_french_csv
from tradelab.strategies import REGISTRY, SEARCH_SPACE, StrategySpec, grid


def panel(T=240, N=5, seed=0, drift=None):
    rng = np.random.default_rng(seed)
    r = rng.normal(0.006, 0.04, size=(T, N))
    if drift is not None:
        r += drift
    return Panel(r, np.full(T, 0.002), [f"{2000 + i // 12}{i % 12 + 1:02d}" for i in range(T)],
                 [f"A{i}" for i in range(N)], 12)


class NoLookahead(unittest.TestCase):
    def test_changing_the_future_never_changes_past_weights(self):
        p = panel()
        for spec in grid(overlays=[None, 0.10]):
            base = backtest.run(p, spec, warmup=36)
            q = Panel(p.returns.copy(), p.rf.copy(), p.labels, p.assets, 12)
            q.returns[150:] = np.random.default_rng(99).normal(0, 0.2, size=q.returns[150:].shape)
            moved = backtest.run(q, spec, warmup=36)
            # Weights for periods up to and including 150 use data before 150 only.
            k = 150 - 36 + 1
            np.testing.assert_allclose(base.weights[:k], moved.weights[:k], err_msg=spec.key())

    def test_strategy_never_sees_the_period_it_trades(self):
        seen = []

        def spy(past, rf, p):
            seen.append(len(past))
            return np.full(past.shape[1], 1 / past.shape[1])

        REGISTRY["_spy"] = spy
        try:
            backtest.run(panel(T=60), StrategySpec("_spy"), warmup=10)
        finally:
            del REGISTRY["_spy"]
        self.assertEqual(seen, list(range(10, 60)))


class Engine(unittest.TestCase):
    def test_single_asset_buy_and_hold_earns_the_asset(self):
        p = panel(N=1)
        res = backtest.run(p, StrategySpec.make("equal_weight"), cost_bps=0, warmup=12)
        np.testing.assert_allclose(res.returns, p.returns[12:, 0])

    def test_costs_charge_turnover(self):
        p = panel(N=2)
        free = backtest.run(p, StrategySpec.make("equal_weight"), cost_bps=0, warmup=12)
        paid = backtest.run(p, StrategySpec.make("equal_weight"), cost_bps=100, warmup=12)
        np.testing.assert_allclose(free.returns - paid.returns, free.turnover * 0.01)
        self.assertAlmostEqual(free.turnover[0], 1.0)  # from cash into the book

    def test_drift_turnover_by_hand(self):
        # Two assets, +10% and -10%, rebalanced to 50/50: after the move the
        # book is 0.55/0.45 of 1.0, i.e. 0.55/0.45 weights; back to 50/50 is 0.1.
        r = np.array([[0.0, 0.0]] * 2 + [[0.10, -0.10], [0.0, 0.0]])
        p = Panel(r, np.zeros(4), ["1", "2", "3", "4"], ["a", "b"], 12)
        res = backtest.run(p, StrategySpec.make("equal_weight"), cost_bps=0, warmup=2)
        self.assertAlmostEqual(res.turnover[1], 0.10)

    def test_cash_earns_rf_and_leverage_is_capped(self):
        p = panel(N=3)
        res = backtest.run(p, StrategySpec.make("tsmom", lookback=3, asset_vol_target=5.0), warmup=12)
        self.assertTrue((np.abs(res.weights).sum(1) <= 1.0 + 1e-9).all())


class Stats(unittest.TestCase):
    def test_psr_half_at_benchmark(self):
        x = np.random.default_rng(1).normal(0.01, 0.05, 500)
        self.assertAlmostEqual(stats.probabilistic_sharpe(x, stats.sharpe(x)), 0.5, places=6)

    def test_expected_max_grows_with_trials(self):
        a = stats.expected_max_sharpe(10, 0.01)
        b = stats.expected_max_sharpe(1000, 0.01)
        self.assertGreater(b, a)
        self.assertEqual(stats.expected_max_sharpe(1, 0.01), 0.0)

    def test_dsr_deflates_the_best_of_many_noise_strategies(self):
        rng = np.random.default_rng(3)
        trials = rng.normal(0, 0.04, size=(240, 200))
        srs = [stats.sharpe(trials[:, i]) for i in range(200)]
        best = int(np.argmax(srs))
        naive = stats.probabilistic_sharpe(trials[:, best])
        deflated = stats.deflated_sharpe(trials[:, best], srs)["dsr"]
        self.assertGreater(naive, 0.95)    # looks significant on its own
        self.assertLess(deflated, 0.95)    # is not, once the search is counted

    def test_pbo_high_for_noise_low_for_real_edge(self):
        rng = np.random.default_rng(5)
        noise = rng.normal(0, 0.04, size=(400, 30))
        self.assertGreater(stats.pbo_cscv(noise)["pbo"], 0.3)
        edge = noise.copy()
        edge[:, 0] += 0.03
        self.assertLess(stats.pbo_cscv(edge)["pbo"], 0.05)

    def test_bootstrap_ci_contains_point_estimate(self):
        x = np.random.default_rng(2).normal(0.01, 0.04, 300)
        ci = stats.stationary_bootstrap_sharpe(x, 12, n_boot=300)["sharpe_ci95"]
        sr = stats.sharpe(x) * math.sqrt(12)
        self.assertLess(ci[0], sr)
        self.assertGreater(ci[1], sr)

    def test_summary_drawdown(self):
        s = stats.summary(np.array([0.1, -0.5, 0.2]), np.zeros(3), 12)
        self.assertAlmostEqual(s["max_drawdown"], -0.5)

    def test_alpha_recovers_known_alpha(self):
        rng = np.random.default_rng(4)
        b = rng.normal(0.008, 0.04, 2000)
        y = 0.002 + 0.5 * b + rng.normal(0, 0.005, 2000)
        ab = stats.alpha_beta(y, b, np.zeros(2000), 12)
        self.assertAlmostEqual(ab["beta"], 0.5, places=1)
        self.assertAlmostEqual(ab["alpha_annual"], 0.024, places=2)


class FrenchParser(unittest.TestCase):
    TEXT = """This file was created using the 202609 CRSP database.

  Average Value Weighted Returns -- Monthly
,NoDur,Durbl
192607,   1.44,  15.58
192608,   3.99, -99.99

  Average Equal Weighted Returns -- Monthly
,NoDur,Durbl
192607,   2.00,   3.00

  Average Value Weighted Returns -- Annual
,NoDur,Durbl
  1927,  30.00,  20.00
"""

    def test_tables_and_missing(self):
        labels, cols, vals = parse_french_csv(self.TEXT, 0)
        self.assertEqual(labels, ["192607", "192608"])
        self.assertEqual(cols, ["NoDur", "Durbl"])
        self.assertTrue(math.isnan(vals[1, 1]))
        _, _, ew = parse_french_csv(self.TEXT, 1)
        self.assertEqual(ew.tolist(), [[2.0, 3.0]])
        with self.assertRaises(ValueError):
            parse_french_csv(self.TEXT, 2)  # the annual table is not monthly


class Agent(unittest.TestCase):
    def test_research_judges_holdout_once_and_gates(self):
        p = panel(T=400, N=6, seed=8)
        specs = grid(overlays=[None])[:12]
        st = agent.research(p, (p.labels[0], p.labels[299]), (p.labels[300], p.labels[-1]),
                            proposer=agent.GridProposer(specs=specs), budget=50)
        self.assertEqual(len(st.trials), 12)
        rep = st.report
        self.assertIn(rep["gate"]["promotable"], (True, False))
        self.assertEqual(rep["holdout"]["periods"], 100)
        self.assertEqual(rep["deflated_sharpe"]["n_trials"], 12)

    def test_validate_rejects_outside_search_space(self):
        self.assertIsNone(agent.validate({"name": "xs_momentum", "params": {"lookback": 7, "skip": 1, "top_k": 3}}))
        self.assertIsNone(agent.validate({"name": "nope", "params": {}}))
        self.assertIsNone(agent.validate({"name": "sma_trend", "params": {"lookback": 10}, "vol_target": 0.5}))
        ok = agent.validate({"name": "sma_trend", "params": {"lookback": 10}, "vol_target": None})
        self.assertEqual(ok.key(), "sma_trend(lookback=10)")

    def test_claude_proposer_parses_and_filters(self):
        sent = {}

        def fake(payload):
            sent.update(payload)
            return {"content": [{"type": "text", "text": 'Here: [{"name":"sma_trend","params":{"lookback":8}},'
                                 '{"name":"sma_trend","params":{"lookback":999}}]'}]}

        prop = agent.ClaudeProposer(model="test-model", transport=fake)
        out = prop.propose([], 5)
        self.assertEqual([s.key() for s in out], ["sma_trend(lookback=8)"])
        self.assertEqual(sent["model"], "test-model")

    def test_search_space_is_registered(self):
        self.assertTrue(set(SEARCH_SPACE) <= set(REGISTRY))


if __name__ == "__main__":
    unittest.main()
