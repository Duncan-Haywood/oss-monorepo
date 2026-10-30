"""Execution: guard rails, order planning, broker request shapes. Offline."""
import base64
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import numpy as np

from tradelab import cli
from tradelab.data import Panel
from tradelab.execution import brokers, planner, safety
from tradelab.execution.safety import LIVE_PHRASE, Limits, Order


class Guard(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.env = mock.patch.dict(os.environ, {"TRADELAB_KILL_FILE": str(Path(self.tmp.name) / "kill")}, clear=False)
        self.env.start()
        os.environ.pop("TRADELAB_LIVE_CONFIRM", None)

    def tearDown(self):
        self.env.stop()
        self.tmp.cleanup()

    def test_dry_and_paper_need_nothing(self):
        safety.assert_live_allowed(False, None)

    def test_live_refused_without_phrase(self):
        with self.assertRaises(safety.LiveTradingRefused) as e:
            safety.assert_live_allowed(True, {"gate": {"promotable": True}})
        self.assertIn("TRADELAB_LIVE_CONFIRM", str(e.exception))

    def test_live_refused_when_unpromoted_or_killed(self):
        os.environ["TRADELAB_LIVE_CONFIRM"] = LIVE_PHRASE
        with self.assertRaises(safety.LiveTradingRefused):
            safety.assert_live_allowed(True, {"gate": {"promotable": False}})
        safety.assert_live_allowed(True, {"gate": {"promotable": False}}, allow_unpromoted=True)
        Path(os.environ["TRADELAB_KILL_FILE"]).write_text("stop")
        with self.assertRaises(safety.LiveTradingRefused) as e:
            safety.assert_live_allowed(True, {"gate": {"promotable": True}})
        self.assertIn("kill switch", str(e.exception))

    def test_live_allowed_when_everything_holds(self):
        os.environ["TRADELAB_LIVE_CONFIRM"] = LIVE_PHRASE
        safety.assert_live_allowed(True, {"gate": {"promotable": True}})

    def test_order_limits(self):
        lim = Limits(max_order_notional=500, max_orders_per_run=2, allowed_symbols={"XLK", "XLE", "XLV"})
        v = safety.check_orders([Order("XLK", "buy", 600), Order("XLE", "buy", 100), Order("SPY", "buy", 100),
                                 Order("XLV", "sell", 100), Order("XLK", "buy", 50), Order("XLE", "buy", 0.5)], lim)
        self.assertEqual([o.symbol for o in v.accepted], ["XLE", "XLV"])
        self.assertEqual(len(v.rejected), 4)

    def test_target_limits(self):
        errs = safety.check_targets({"A": 0.7, "B": 0.6, "C": -0.1}, Limits())
        self.assertTrue(any("gross" in e for e in errs))
        self.assertTrue(any("short" in e for e in errs))
        self.assertTrue(any("per-symbol" in e for e in errs))


class Planner(unittest.TestCase):
    def test_orders_reach_target_and_sell_first(self):
        orders = planner.plan_orders({"A": 0.5, "B": 0.5}, 10_000, {"A": 2_000, "C": 3_000},
                                     {"A": 10, "B": 20, "C": 30})
        self.assertEqual([(o.symbol, o.side) for o in orders], [("C", "sell"), ("A", "buy"), ("B", "buy")])
        self.assertEqual([o.notional for o in orders], [3000, 3000, 5000])
        self.assertAlmostEqual(orders[2].qty, 250)

    def test_small_trades_skipped(self):
        self.assertEqual(planner.plan_orders({"A": 0.5}, 10_000, {"A": 4_950}, {"A": 1}), [])

    def test_etf_mapping_covers_ten_industries(self):
        self.assertEqual(len(set(planner.INDUSTRY10_TO_ETF.values())), 10)
        self.assertEqual(planner.map_weights({"HiTec": 0.3, "Other": 0.2}, planner.INDUSTRY10_TO_ETF),
                         {"XLK": 0.3, "XLF": 0.2})


class Brokers(unittest.TestCase):
    def test_paper_broker_round_trip(self):
        with tempfile.TemporaryDirectory() as d:
            b = brokers.PaperBroker(Path(d) / "s.json", cash=1000, cost_bps=0)
            b.set_prices({"X": 10.0})
            b.submit(Order("X", "buy", 500))
            self.assertAlmostEqual(b.positions()["X"], 500)
            self.assertAlmostEqual(b.equity(), 1000)
            b2 = brokers.PaperBroker(Path(d) / "s.json")
            b2.set_prices({"X": 20.0})
            self.assertAlmostEqual(b2.equity(), 1500)

    def test_alpaca_defaults_to_paper_and_sends_notional(self):
        calls = []
        b = brokers.AlpacaBroker(transport=lambda m, u, h, body=None: calls.append((m, u, body)) or {})
        b.submit(Order("XLK", "buy", 123.456))
        m, url, body = calls[0]
        self.assertEqual((m, url), ("POST", "https://paper-api.alpaca.markets/v2/orders"))
        self.assertEqual(body["notional"], "123.46")
        self.assertEqual(body["type"], "market")
        live = brokers.AlpacaBroker(live=True, transport=lambda *a, **k: {})
        self.assertEqual(live.base, "https://api.alpaca.markets")

    def test_robinhood_signs_key_timestamp_path_method_body(self):
        signed, calls = [], []
        with mock.patch.dict(os.environ, {"ROBINHOOD_API_KEY": "k123"}):
            b = brokers.RobinhoodCryptoBroker(transport=lambda m, u, h, body=None: calls.append((m, u, h, body)) or {},
                                              signer=lambda msg: signed.append(msg) or "sig")
            with mock.patch("time.time", return_value=1700000000):
                b.submit(Order("BTC-USD", "buy", 100.0, qty=0.0015))
        m, url, headers, body = calls[0]
        self.assertEqual(url, "https://trading.robinhood.com/api/v1/crypto/trading/orders/")
        self.assertEqual(headers["x-timestamp"], "1700000000")
        self.assertEqual(headers["x-signature"], "sig")
        expected = "k1231700000000/api/v1/crypto/trading/orders/POST" + json.dumps(body, separators=(",", ":"))
        self.assertEqual(signed[0], expected)
        self.assertEqual(body["market_order_config"], {"asset_quantity": "0.00150000"})

    def test_robinhood_ed25519_signature_verifies(self):
        try:
            from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
        except ImportError:
            self.skipTest("cryptography not installed")
        pk = Ed25519PrivateKey.generate()
        from cryptography.hazmat.primitives import serialization
        raw = pk.private_bytes(serialization.Encoding.Raw, serialization.PrivateFormat.Raw,
                               serialization.NoEncryption())
        sign = brokers.RobinhoodCryptoBroker._ed25519_signer(base64.b64encode(raw).decode())
        pk.public_key().verify(base64.b64decode(sign("hello")), b"hello")


class CliRebalance(unittest.TestCase):
    def _panel(self):
        rng = np.random.default_rng(0)
        r = rng.normal(0.01, 0.03, size=(80, 10))
        return Panel(r, np.full(80, 0.001), [f"{2000 + i // 12}{i % 12 + 1:02d}" for i in range(80)],
                     list(planner.INDUSTRY10_TO_ETF), 12)

    def test_dry_run_sends_nothing_and_live_is_refused(self):
        with tempfile.TemporaryDirectory() as d, mock.patch.object(cli, "_universe", return_value=self._panel()), \
                mock.patch.dict(os.environ, {"TRADELAB_KILL_FILE": str(Path(d) / "k")}):
            os.environ.pop("TRADELAB_LIVE_CONFIRM", None)
            state = Path(d) / "paper.json"
            self.assertEqual(cli.main(["rebalance", "--paper-state", str(state)]), 0)
            self.assertFalse(state.exists())  # dry run: no fills written
            self.assertEqual(cli.main(["rebalance", "--paper-state", str(state), "--execute", "--max-order", "5000"]), 0)
            self.assertTrue(json.loads(state.read_text())["fills"])
            self.assertEqual(cli.main(["rebalance", "--broker", "alpaca", "--live", "--execute"]), 3)


if __name__ == "__main__":
    unittest.main()
