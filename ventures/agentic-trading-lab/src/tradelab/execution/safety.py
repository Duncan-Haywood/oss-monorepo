"""Guard rails between a target portfolio and a broker.

Live trading is off unless every one of these holds:

1. the caller passes live=True (the CLI's `--live` flag);
2. the environment variable TRADELAB_LIVE_CONFIRM equals LIVE_PHRASE exactly;
3. no kill-switch file exists (default `.tradelab-kill`, or $TRADELAB_KILL_FILE);
4. the strategy's research report says it is promotable through the gate,
   unless the operator explicitly sets allow_unpromoted.

Every order, live or not, must also pass the limits in `Limits`. Orders
that fail are dropped and reported, never resized silently into something the
operator did not ask for.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

LIVE_PHRASE = "I accept that live trading can lose money"


@dataclass
class Limits:
    max_order_notional: float = 1000.0     # dollars per order
    max_orders_per_run: int = 20
    max_gross_exposure: float = 1.0        # sum |weights|; 1.0 = no leverage
    max_weight_per_symbol: float = 0.5
    min_order_notional: float = 1.0        # brokers reject dust orders
    allowed_symbols: set[str] | None = None


@dataclass
class Order:
    symbol: str
    side: str            # "buy" or "sell"
    notional: float      # dollars, positive
    qty: float | None = None
    reason: str = ""


@dataclass
class Verdict:
    accepted: list[Order] = field(default_factory=list)
    rejected: list[tuple[Order, str]] = field(default_factory=list)


class LiveTradingRefused(RuntimeError):
    pass


def kill_file() -> Path:
    return Path(os.environ.get("TRADELAB_KILL_FILE", ".tradelab-kill"))


def assert_live_allowed(live: bool, report: dict | None, allow_unpromoted: bool = False) -> None:
    """Raise LiveTradingRefused with every unmet condition named."""
    if not live:
        return
    problems = []
    if os.environ.get("TRADELAB_LIVE_CONFIRM") != LIVE_PHRASE:
        problems.append(f"set TRADELAB_LIVE_CONFIRM to exactly: {LIVE_PHRASE!r}")
    if kill_file().exists():
        problems.append(f"kill switch present at {kill_file()}; delete it to resume")
    promotable = bool(report and report.get("gate", {}).get("promotable"))
    if not promotable and not allow_unpromoted:
        problems.append("strategy did not pass the research gate (pass --allow-unpromoted to override)")
    if problems:
        raise LiveTradingRefused("live trading refused: " + "; ".join(problems))


def check_targets(weights: dict[str, float], limits: Limits) -> list[str]:
    errs = []
    gross = sum(abs(w) for w in weights.values())
    if gross > limits.max_gross_exposure + 1e-9:
        errs.append(f"gross exposure {gross:.2f} exceeds limit {limits.max_gross_exposure:.2f}")
    for s, w in weights.items():
        if w < 0:
            errs.append(f"{s}: short weight {w:.3f}; cash accounts cannot short")
        if abs(w) > limits.max_weight_per_symbol + 1e-9:
            errs.append(f"{s}: weight {w:.3f} exceeds per-symbol limit {limits.max_weight_per_symbol:.2f}")
        if limits.allowed_symbols is not None and s not in limits.allowed_symbols and w != 0:
            errs.append(f"{s}: not in allowed symbols")
    return errs


def check_orders(orders: list[Order], limits: Limits) -> Verdict:
    v = Verdict()
    for o in orders:
        if o.side not in ("buy", "sell"):
            v.rejected.append((o, f"bad side {o.side!r}"))
        elif o.notional > limits.max_order_notional:
            v.rejected.append((o, f"notional {o.notional:.2f} over per-order limit {limits.max_order_notional:.2f}"))
        elif o.notional < limits.min_order_notional:
            v.rejected.append((o, f"notional {o.notional:.2f} under minimum {limits.min_order_notional:.2f}"))
        elif limits.allowed_symbols is not None and o.symbol not in limits.allowed_symbols:
            v.rejected.append((o, "symbol not allowed"))
        elif len(v.accepted) >= limits.max_orders_per_run:
            v.rejected.append((o, f"over {limits.max_orders_per_run} orders this run"))
        else:
            v.accepted.append(o)
    return v
