"""Turn target weights into orders, and research assets into tradeable symbols.

The backtests run on the Fama-French industry portfolios, which are not
tradeable. `INDUSTRY10_TO_ETF` maps each of the ten industries to a liquid
sector ETF that covers a similar slice of the market. The match is loose
(index methodology, weighting and membership all differ, and the Fama-French
"Other" bucket is mostly financials), so live results will track the backtest
only approximately. Treat the mapping as a starting point you check, not a
replication.
"""
from __future__ import annotations

from .safety import Order

INDUSTRY10_TO_ETF = {
    "NoDur": "XLP",   # consumer non-durables -> consumer staples
    "Durbl": "XLY",   # durables (autos, appliances) -> consumer discretionary
    "Manuf": "XLI",   # manufacturing -> industrials
    "Enrgy": "XLE",   # oil, gas, coal -> energy
    "HiTec": "XLK",   # business equipment, software -> technology
    "Telcm": "XLC",   # telephone and television -> communication services
    "Shops": "XRT",   # wholesale, retail -> retail
    "Hlth": "XLV",    # healthcare -> health care
    "Utils": "XLU",   # utilities -> utilities
    "Other": "XLF",   # mostly finance -> financials
}


def map_weights(weights: dict[str, float], mapping: dict[str, str]) -> dict[str, float]:
    out: dict[str, float] = {}
    for asset, w in weights.items():
        sym = mapping.get(asset, asset)
        out[sym] = out.get(sym, 0.0) + w
    return out


def plan_orders(target: dict[str, float], equity: float, positions: dict[str, float],
                prices: dict[str, float], min_trade_frac: float = 0.01, fractional: bool = True) -> list[Order]:
    """Orders that move current holdings (market values in dollars) to target
    weights of equity. Trades smaller than min_trade_frac of equity are skipped
    to avoid paying costs for noise. Sells come first so they fund the buys."""
    symbols = sorted(set(target) | set(positions))
    sells, buys = [], []
    for s in symbols:
        want = target.get(s, 0.0) * equity
        have = positions.get(s, 0.0)
        diff = want - have
        if abs(diff) < min_trade_frac * equity:
            continue
        price = prices.get(s)
        qty = None
        if price:
            qty = abs(diff) / price
            if not fractional:
                qty = float(int(qty))
                if qty == 0:
                    continue
        notional = qty * price if (qty is not None and not fractional) else abs(diff)
        o = Order(s, "buy" if diff > 0 else "sell", round(notional, 2), qty,
                  f"{have:,.2f} -> {want:,.2f}")
        (buys if diff > 0 else sells).append(o)
    return sells + buys
