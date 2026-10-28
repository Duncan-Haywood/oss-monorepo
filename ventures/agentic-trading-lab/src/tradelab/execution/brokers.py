"""Broker adapters. Every key comes from the environment of whoever runs the
tool; nothing is stored, logged or sent anywhere but the broker's own API.

* `PaperBroker`: a local simulated account in a JSON file. The default.
* `AlpacaBroker`: Alpaca's official Trading API for US stocks and ETFs.
  Points at the paper endpoint unless live is requested and allowed.
  Docs: https://docs.alpaca.markets/reference
* `RobinhoodCryptoBroker`: Robinhood's official Crypto Trading API
  (crypto only; Robinhood offers no official API for stock trading). Requests
  are signed with an Ed25519 key the account holder registers with Robinhood.
  Needs the optional `cryptography` package.

Not supported, on purpose: unofficial Robinhood stock endpoints (the
`robin_stocks`-style libraries that log in as the app). They are not a
published API, and automating them may breach Robinhood's customer
agreement. See LEGAL.md.

The Alpaca and Robinhood adapters are written against those providers'
published documentation and tested here against recorded request shapes with
a fake transport. They have not been exercised against a live account from
this repository.
"""
from __future__ import annotations

import base64
import json
import os
import time
import urllib.request
import uuid
from pathlib import Path

from .safety import Order


class Broker:
    name = "base"
    live = False

    def equity(self) -> float: ...
    def positions(self) -> dict[str, float]: ...      # symbol -> market value in dollars
    def prices(self, symbols: list[str]) -> dict[str, float]: ...
    def submit(self, order: Order) -> dict: ...


def _http(method: str, url: str, headers: dict, body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={**headers, "content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read()
    return json.loads(raw) if raw else {}


class PaperBroker(Broker):
    """Fills every order at the given price with a fixed cost in basis points."""

    name = "paper"

    def __init__(self, path: str | Path = "paper-state.json", cash: float = 10_000.0,
                 price_source: dict[str, float] | None = None, cost_bps: float = 5.0):
        self.path = Path(path)
        self.cost_bps = cost_bps
        self._prices = dict(price_source or {})
        if self.path.exists():
            self.state = json.loads(self.path.read_text())
        else:
            self.state = {"cash": cash, "qty": {}, "fills": []}

    def set_prices(self, prices: dict[str, float]) -> None:
        self._prices.update(prices)

    def prices(self, symbols):
        missing = [s for s in symbols if s not in self._prices]
        if missing:
            raise KeyError(f"no paper price for {missing}; pass prices with set_prices()")
        return {s: self._prices[s] for s in symbols}

    def positions(self):
        return {s: q * self._prices[s] for s, q in self.state["qty"].items() if q and s in self._prices}

    def equity(self):
        return self.state["cash"] + sum(self.positions().values())

    def submit(self, order: Order) -> dict:
        px = self._prices[order.symbol]
        qty = order.qty if order.qty is not None else order.notional / px
        cost = order.notional * self.cost_bps / 1e4
        held = self.state["qty"].get(order.symbol, 0.0)
        if order.side == "buy":
            self.state["cash"] -= qty * px + cost
            self.state["qty"][order.symbol] = held + qty
        else:
            qty = min(qty, held)
            self.state["cash"] += qty * px - cost
            self.state["qty"][order.symbol] = held - qty
        fill = {"symbol": order.symbol, "side": order.side, "qty": qty, "price": px, "cost": cost,
                "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
        self.state["fills"].append(fill)
        self.path.write_text(json.dumps(self.state, indent=1))
        return fill


class AlpacaBroker(Broker):
    name = "alpaca"
    PAPER = "https://paper-api.alpaca.markets"
    LIVE = "https://api.alpaca.markets"
    DATA = "https://data.alpaca.markets"

    def __init__(self, live: bool = False, transport=None):
        self.live = live
        self.base = self.LIVE if live else self.PAPER
        key, secret = os.environ.get("APCA_API_KEY_ID"), os.environ.get("APCA_API_SECRET_KEY")
        if transport is None and not (key and secret):
            raise RuntimeError("set APCA_API_KEY_ID and APCA_API_SECRET_KEY (your own Alpaca keys)")
        self._headers = {"APCA-API-KEY-ID": key or "", "APCA-API-SECRET-KEY": secret or ""}
        self._t = transport or _http

    def equity(self):
        return float(self._t("GET", f"{self.base}/v2/account", self._headers)["equity"])

    def positions(self):
        rows = self._t("GET", f"{self.base}/v2/positions", self._headers)
        return {r["symbol"]: float(r["market_value"]) for r in rows}

    def prices(self, symbols):
        q = ",".join(symbols)
        rows = self._t("GET", f"{self.DATA}/v2/stocks/trades/latest?symbols={q}", self._headers)
        return {s: float(v["p"]) for s, v in rows.get("trades", {}).items()}

    def submit(self, order: Order) -> dict:
        body = {"symbol": order.symbol, "side": order.side, "type": "market", "time_in_force": "day",
                "notional": f"{order.notional:.2f}", "client_order_id": f"tradelab-{uuid.uuid4()}"}
        return self._t("POST", f"{self.base}/v2/orders", self._headers, body)


class RobinhoodCryptoBroker(Broker):
    name = "robinhood-crypto"
    BASE = "https://trading.robinhood.com"

    def __init__(self, transport=None, signer=None):
        # The Crypto Trading API has no paper endpoint: anything it does is live.
        self.live = True
        self.key = os.environ.get("ROBINHOOD_API_KEY", "")
        priv = os.environ.get("ROBINHOOD_PRIVATE_KEY_B64", "")
        if transport is None and not (self.key and priv):
            raise RuntimeError("set ROBINHOOD_API_KEY and ROBINHOOD_PRIVATE_KEY_B64 (your own Robinhood "
                               "Crypto Trading API credentials)")
        self._sign = signer or (self._ed25519_signer(priv) if priv else (lambda m: "unsigned"))
        self._t = transport or _http

    @staticmethod
    def _ed25519_signer(private_key_b64: str):
        try:
            from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
        except ImportError as e:  # optional dependency
            raise RuntimeError("pip install cryptography to sign Robinhood requests") from e
        seed = base64.b64decode(private_key_b64)[:32]
        pk = Ed25519PrivateKey.from_private_bytes(seed)
        return lambda message: base64.b64encode(pk.sign(message.encode())).decode()

    def _headers(self, method: str, path: str, body: dict | None) -> dict:
        ts = str(int(time.time()))
        body_s = json.dumps(body, separators=(",", ":")) if body is not None else ""
        message = f"{self.key}{ts}{path}{method}{body_s}"
        return {"x-api-key": self.key, "x-timestamp": ts, "x-signature": self._sign(message)}

    def _call(self, method, path, body=None):
        return self._t(method, self.BASE + path, self._headers(method, path, body), body)

    def equity(self):
        acct = self._call("GET", "/api/v1/crypto/trading/accounts/")
        cash = float(acct.get("buying_power", 0.0))
        return cash + sum(self.positions().values())

    def positions(self):
        rows = self._call("GET", "/api/v1/crypto/trading/holdings/").get("results", [])
        qty = {f"{r['asset_code']}-USD": float(r["total_quantity"]) for r in rows}
        px = self.prices(list(qty)) if qty else {}
        return {s: q * px.get(s, 0.0) for s, q in qty.items()}

    def prices(self, symbols):
        qs = "&".join(f"symbol={s}" for s in symbols)
        rows = self._call("GET", f"/api/v1/crypto/marketdata/best_bid_ask/?{qs}").get("results", [])
        out = {}
        for r in rows:
            bid, ask = float(r.get("bid_inclusive_of_sell_spread", r.get("price", 0))), \
                float(r.get("ask_inclusive_of_buy_spread", r.get("price", 0)))
            out[r["symbol"]] = (bid + ask) / 2
        return out

    def submit(self, order: Order) -> dict:
        if order.qty is None:
            raise ValueError("Robinhood crypto market orders are sized in asset quantity; plan with prices")
        body = {"client_order_id": str(uuid.uuid4()), "side": order.side, "type": "market",
                "symbol": order.symbol, "market_order_config": {"asset_quantity": f"{order.qty:.8f}"}}
        return self._call("POST", "/api/v1/crypto/trading/orders/", body)
